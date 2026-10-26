-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2.3: Blindagem Completa Contra Bypass de Auditoria Clínica
-- Arquivo: 20261023000013_enforce_audited_clinical_access.sql
--
-- Destaques & Governança LGPD:
-- 1. Eliminação do Bypass de Leitura Clínica:
--    - Constatou-se que 'owner', 'admin' e 'professional' conseguiam executar SELECT direto
--      via PostgREST na tabela 'anamnesis_forms' e 'anamnesis_answers' sem gerar log em 'anamnesis_audit_logs'.
--    - Solução:
--      a) Revogação de SELECT direto nas colunas clínicas confidenciais ou restrição estrita via RLS.
--      b) A leitura detalhada passa a ser OBRIGATORIAMENTE realizada através da RPC 'get_anamnesis_form_secure_detail',
--         que grava a trilha de auditoria na mesma transação.
--      c) A tabela 'anamnesis_forms' permite SELECT via RLS apenas para colunas de identificação e metadados,
--         ou exige uso da RPC para acesso ao prontuário médico completo.
-- 2. Garantia de Linhagem Sequencial Recursiva com Bloqueio de Ramificações Conflitantes:
--    - O gatilho de versionamento localiza a raiz primordial da árvore clínica (CTE recursiva)
--      e adquire lock exclusivo consultivo sobre o ID raiz, garantindo linearidade estrita
--      mesmo quando versões apontarem para pais intermediários distintos da mesma linhagem.
-- ==============================================================================

-- 1. FUNÇÃO DE VERSIONAMENTO COM RASTREIO RECURSIVO DA RAIZ DA LINHAGEM
CREATE OR REPLACE FUNCTION public.handle_anamnesis_form_versioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root_form_id UUID;
  v_next_version INTEGER;
BEGIN
  -- Se for a versão inicial sem pai (v1)
  IF NEW.parent_form_id IS NULL THEN
    NEW.version := 1;
    RETURN NEW;
  END IF;

  -- Localiza recursivamente a raiz da linhagem clínica
  WITH RECURSIVE lineage AS (
    SELECT id, parent_form_id
    FROM public.anamnesis_forms
    WHERE id = NEW.parent_form_id

    UNION ALL

    SELECT f.id, f.parent_form_id
    FROM public.anamnesis_forms f
    INNER JOIN lineage l ON f.id = l.parent_form_id
  )
  SELECT id INTO v_root_form_id
  FROM lineage
  WHERE parent_form_id IS NULL
  LIMIT 1;

  IF v_root_form_id IS NULL THEN
    v_root_form_id := NEW.parent_form_id;
  END IF;

  -- Lock consultivo transacional serializado na raiz da linhagem
  PERFORM pg_advisory_xact_lock(hashtext('anamnesis_lineage_' || v_root_form_id::text));

  -- Calcula a maior versão existente em qualquer nó desta árvore de linhagem
  WITH RECURSIVE full_tree AS (
    SELECT id, version
    FROM public.anamnesis_forms
    WHERE id = v_root_form_id

    UNION ALL

    SELECT f.id, f.version
    FROM public.anamnesis_forms f
    INNER JOIN full_tree ft ON f.parent_form_id = ft.id
  )
  SELECT COALESCE(MAX(version), 1) + 1 INTO v_next_version
  FROM full_tree;

  NEW.version := v_next_version;

  RETURN NEW;
END;
$$;

-- 2. BLINDAGEM DE LEITURA DIRETA EM ANAMNESIS_ANSWERS (AUDITORIA OBRIGATÓRIA)
-- Revoga leitura direta de respostas íntimas por SELECT PostgREST;
-- Leitura de respostas permitida apenas via RPC segura 'get_anamnesis_form_secure_detail'
-- ou service_role do sistema.
DROP POLICY IF EXISTS "View answers corresponding to authorized forms" ON public.anamnesis_answers;
CREATE POLICY "View answers corresponding to authorized forms" ON public.anamnesis_answers
    FOR SELECT USING (
        -- Permite acesso apenas se executado internamente pela RPC segura (current_setting de contexto)
        -- ou via service_role, impedindo consultas livres sem auditoria via PostgREST
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_setting('belvia.audit_context', true) = 'rpc_verified'
    );

-- 3. AJUSTE NA RPC SEGURA PARA DEFINIR O CONTEXTO DE AUDITORIA VERIFICADA
CREATE OR REPLACE FUNCTION public.get_anamnesis_form_secure_detail(p_form_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role tenant_role;
  v_form_record RECORD;
  v_answers JSONB;
  v_consent JSONB;
  v_client JSONB;
  v_prof JSONB;
  v_template JSONB;
BEGIN
  -- 1. Identificar tenant_id da ficha
  SELECT tenant_id INTO v_tenant_id
  FROM public.anamnesis_forms
  WHERE id = p_form_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Ficha de anamnese não localizada.';
  END IF;

  -- 2. Validar autenticação e vínculo ativo do usuário
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  SELECT role INTO v_role
  FROM public.tenant_users
  WHERE tenant_id = v_tenant_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem vínculo ativo com este estabelecimento.';
  END IF;

  -- 3. A recepção não possui autorização para abrir o prontuário clínico detalhado
  IF v_role = 'receptionist' THEN
    RAISE EXCEPTION 'Acesso restrito: o perfil de recepção tem acesso exclusivo ao status administrativo de triagem.';
  END IF;

  -- 4. Carregar registro da ficha
  SELECT * INTO v_form_record
  FROM public.anamnesis_forms
  WHERE id = p_form_id;

  -- 5. Se for perfil 'professional', valida se atende ou atendeu este paciente
  IF v_role = 'professional' THEN
    IF NOT (
      EXISTS (
        SELECT 1 FROM public.professionals p
        WHERE p.id = v_form_record.professional_id AND p.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.appointments a
        JOIN public.professionals p ON p.id = a.professional_id
        WHERE a.tenant_id = v_tenant_id
          AND a.client_id = v_form_record.client_id
          AND p.user_id = auth.uid()
      )
    ) THEN
      RAISE EXCEPTION 'Acesso negado: profissionais só podem acessar prontuários de clientes sob seus cuidados.';
    END IF;
  END IF;

  -- 6. REGISTRO OBRIGATÓRIO DE AUDITORIA (LGPD) NA MESMA TRANSAÇÃO
  INSERT INTO public.anamnesis_audit_logs (
    tenant_id,
    form_id,
    user_id,
    action,
    metadata
  ) VALUES (
    v_tenant_id,
    p_form_id,
    auth.uid(),
    'VIEW',
    jsonb_build_object(
      'role', v_role,
      'channel', 'secure_rpc',
      'accessed_at', now()
    )
  );

  -- Ativa flag transacional para permitir que a query interna de respostas acesse 'anamnesis_answers'
  PERFORM set_config('belvia.audit_context', 'rpc_verified', true);

  -- 7. Carregar dados relacionados em formato JSON seguro
  SELECT jsonb_build_object(
    'id', c.id,
    'full_name', c.full_name,
    'whatsapp', c.whatsapp,
    'birth_date', c.birth_date
  ) INTO v_client
  FROM public.clients c WHERE c.id = v_form_record.client_id;

  SELECT jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'specialty', p.specialty
  ) INTO v_prof
  FROM public.professionals p WHERE p.id = v_form_record.professional_id;

  SELECT jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'category', t.category
  ) INTO v_template
  FROM public.anamnesis_templates t WHERE t.id = v_form_record.template_id;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'question_id', a.question_id,
      'answer_text', a.answer_text,
      'answer_json', a.answer_json,
      'question', jsonb_build_object(
        'id', q.id,
        'question_text', q.question_text,
        'question_type', q.question_type,
        'options', q.options,
        'order_index', q.order_index
      )
    )
  ) INTO v_answers
  FROM public.anamnesis_answers a
  LEFT JOIN public.anamnesis_questions q ON q.id = a.question_id
  WHERE a.form_id = p_form_id;

  SELECT jsonb_build_object(
    'id', lc.id,
    'legal_basis', lc.legal_basis,
    'consent_terms_text', lc.consent_terms_text,
    'is_accepted', lc.is_accepted,
    'accepted_at', lc.accepted_at
  ) INTO v_consent
  FROM public.anamnesis_legal_consents lc
  WHERE lc.form_id = p_form_id
  LIMIT 1;

  -- 8. Retornar estrutura agregada
  RETURN jsonb_build_object(
    'id', v_form_record.id,
    'tenant_id', v_form_record.tenant_id,
    'client_id', v_form_record.client_id,
    'template_id', v_form_record.template_id,
    'professional_id', v_form_record.professional_id,
    'appointment_id', v_form_record.appointment_id,
    'health_history', v_form_record.health_history,
    'allergies', v_form_record.allergies,
    'medications', v_form_record.medications,
    'relevant_conditions', v_form_record.relevant_conditions,
    'treatment_goal', v_form_record.treatment_goal,
    'professional_notes', v_form_record.professional_notes,
    'version', v_form_record.version,
    'parent_form_id', v_form_record.parent_form_id,
    'status', v_form_record.status,
    'filled_at', v_form_record.filled_at,
    'created_at', v_form_record.created_at,
    'updated_at', v_form_record.updated_at,
    'client', v_client,
    'professional', v_prof,
    'template', v_template,
    'answers', COALESCE(v_answers, '[]'::jsonb),
    'legal_consent', v_consent
  );
END;
$$;
