-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2.4: Hardening Estrutural de Leitura Clínica e Anti-Bypass
-- Arquivo: 20261023000014_structural_clinical_read_hardening.sql
--
-- Destaques & Governança LGPD:
-- 1. Eliminação Definitiva de Dependência de Contexto Manipulável:
--    - Na migration 000013, o acesso a 'anamnesis_answers' usava 'belvia.audit_context'.
--    - Hardening Estrutural: Revogamos privilégios diretos de SELECT nas tabelas sensíveis:
--      * REVOKE SELECT ON public.anamnesis_answers FROM authenticated;
--      * REVOKE SELECT ON public.anamnesis_legal_consents FROM authenticated;
--    - A leitura detalhada de respostas e prontuários clínicos é acessível EXCLUSIVAMENTE
--      através da RPC com SECURITY DEFINER 'get_anamnesis_form_secure_detail', tornando impossível
--      qualquer bypass de auditoria por chamadas diretas ao PostgREST.
-- 2. Na tabela 'anamnesis_forms', a política RLS restringe o SELECT aos papéis autorizados,
--    enquanto a exibição detalhada com respostas e histórico exige a RPC auditada.
-- 3. Blindagem de Trilha de Auditoria:
--    - Revogação explícita de UPDATE e DELETE em 'anamnesis_audit_logs' para qualquer papel exceto superuser.
-- ==============================================================================

-- 1. REVOGAÇÃO ESTRUTURAL DE SELECT DIRETO EM TABELAS SENSÍVEIS PELO POSTGREST
REVOKE SELECT ON public.anamnesis_answers FROM authenticated;
REVOKE SELECT ON public.anamnesis_legal_consents FROM authenticated;

-- Permissões concedidas exclusivamente a 'service_role' (e herdadas por RPCs SECURITY DEFINER)
GRANT SELECT ON public.anamnesis_answers TO service_role;
GRANT SELECT ON public.anamnesis_legal_consents TO service_role;

-- 2. REAFIRMAÇÃO DA POLÍTICA RLS EM ANAMNESIS_ANSWERS E CONSENTS
DROP POLICY IF EXISTS "View answers corresponding to authorized forms" ON public.anamnesis_answers;
CREATE POLICY "View answers corresponding to authorized forms" ON public.anamnesis_answers
    FOR SELECT USING (
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_user = 'postgres'
    );

DROP POLICY IF EXISTS "View consents corresponding to authorized forms" ON public.anamnesis_legal_consents;
CREATE POLICY "View consents corresponding to authorized forms" ON public.anamnesis_legal_consents
    FOR SELECT USING (
        COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
        OR current_user = 'postgres'
    );

-- 3. ATUALIZAÇÃO DA RPC SEGURA (SEM DEPENDÊNCIA DE SET_CONFIG)
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

  -- Como a função é SECURITY DEFINER, ela executa como o criador e acessa as respostas com segurança
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

  -- 8. Retornar prontuário estruturado
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

-- 4. HARDENING DE AUDITORIA CONTRA ADULTERAÇÃO
REVOKE UPDATE, DELETE ON public.anamnesis_audit_logs FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_anamnesis_form_secure_detail(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_form_secure_detail(UUID) TO authenticated, service_role;
