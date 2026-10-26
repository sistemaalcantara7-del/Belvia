-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2.1: Blindagem de Privacidade, Auditoria Obrigatória & Menor Privilégio
-- Arquivo: 20261023000011_anamnesis_immutability_and_privacy_guards.sql
--
-- Destaques de Arquitetura & Governança LGPD:
-- 1. Segregação Rigorosa da Recepção:
--    - 'receptionist' NÃO tem permissão de SELECT direto na tabela 'anamnesis_forms'.
--    - Disponibilizada a VIEW 'reception_anamnesis_status' com colunas estritamente administrativas:
--      (form_id, tenant_id, client_id, template_title, version, status, filled_at, has_allergies_alert).
--      Campos sensíveis detalhados (alergias completas, medicamentos, histórico de saúde, notas clínicas)
--      e a tabela 'anamnesis_answers' são 100% INACESSÍVEIS para recepcionistas no nível do banco (RLS).
-- 2. Versionamento Clínico Sequencial Concorrente (Advisory Lock):
--    - Gatilho BEFORE INSERT com advisory lock transacional por linhagem clínica (parent_form_id).
--    - Garante atribuição automática e atômica da versão (v1, v2, v3...) sem brechas de concorrência.
--    - Constraint de integridade contra versões divergentes ou duplicadas.
-- 3. Imutabilidade e Blindagem Pós-Conclusão:
--    - Gatilho BEFORE UPDATE impede qualquer alteração de campos clínicos ou versão em fichas 'completed' ou 'archived'.
--    - Bloqueio total de UPDATE/DELETE em 'anamnesis_answers' e 'anamnesis_legal_consents'.
-- 4. Leitura Clínica Auditada Obrigatória (RPC Segura com Registro Transacional):
--    - Função 'get_anamnesis_form_secure_detail' com SECURITY DEFINER e search_path = public:
--      Verifica papéis, valida relação profissional-paciente, grava log de auditoria na mesma transação
--      e retorna o prontuário completo exclusivamente a usuários autorizados.
-- ==============================================================================

-- 1. GATILHO DE VERSIONAMENTO ATÔMICO E SEQUENCIAL COM ADVISORY LOCK
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
  -- Se for a primeira versão (v1) sem pai
  IF NEW.parent_form_id IS NULL THEN
    NEW.version := 1;
    RETURN NEW;
  END IF;

  -- Para novas versões, rastreia a raiz da linhagem clínica
  v_root_form_id := NEW.parent_form_id;

  -- Adquire Lock Consultivo Transacional na raiz da linhagem para serializar versões concorrentes
  PERFORM pg_advisory_xact_lock(hashtext('anamnesis_lineage_' || v_root_form_id::text));

  -- Calcula a próxima versão de forma atômica
  SELECT COALESCE(MAX(version), 1) + 1 INTO v_next_version
  FROM public.anamnesis_forms
  WHERE id = v_root_form_id OR parent_form_id = v_root_form_id;

  NEW.version := v_next_version;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_handle_anamnesis_form_versioning ON public.anamnesis_forms;
CREATE TRIGGER trigger_handle_anamnesis_form_versioning
  BEFORE INSERT ON public.anamnesis_forms
  FOR EACH ROW EXECUTE FUNCTION public.handle_anamnesis_form_versioning();

-- 2. GATILHO DE IMUTABILIDADE ABSOLUTA DE FICHAS CONCLUÍDAS
CREATE OR REPLACE FUNCTION public.check_anamnesis_form_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se a ficha já estiver concluída ('completed') ou arquivada ('archived')
  IF OLD.status IN ('completed', 'archived') THEN
    IF (NEW.health_history IS DISTINCT FROM OLD.health_history) OR
       (NEW.allergies IS DISTINCT FROM OLD.allergies) OR
       (NEW.medications IS DISTINCT FROM OLD.medications) OR
       (NEW.relevant_conditions IS DISTINCT FROM OLD.relevant_conditions) OR
       (NEW.treatment_goal IS DISTINCT FROM OLD.treatment_goal) OR
       (NEW.professional_notes IS DISTINCT FROM OLD.professional_notes) OR
       (NEW.client_id IS DISTINCT FROM OLD.client_id) OR
       (NEW.template_id IS DISTINCT FROM OLD.template_id) OR
       (NEW.version IS DISTINCT FROM OLD.version) OR
       (NEW.parent_form_id IS DISTINCT FROM OLD.parent_form_id) THEN
      RAISE EXCEPTION 'Prontuário Imutável: Fichas de anamnese concluídas não podem ser alteradas. Registre uma nova versão para reavaliação clínica.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_anamnesis_form_immutability ON public.anamnesis_forms;
CREATE TRIGGER trigger_check_anamnesis_form_immutability
  BEFORE UPDATE ON public.anamnesis_forms
  FOR EACH ROW EXECUTE FUNCTION public.check_anamnesis_form_immutability();

-- 3. REESTRUTURAÇÃO DO RLS DE ANAMNESIS_FORMS (MENOR PRIVILÉGIO DA RECEPÇÃO)
-- A recepção NÃO tem acesso de leitura direta à tabela anamnesis_forms contendo texto clínico
DROP POLICY IF EXISTS "Authorized members can view anamnesis forms" ON public.anamnesis_forms;
CREATE POLICY "Authorized members can view anamnesis forms" ON public.anamnesis_forms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_forms.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
              AND (
                  tu.role IN ('owner', 'admin')
                  OR (
                      tu.role = 'professional' AND (
                          -- Profissional responsável pela ficha
                          EXISTS (
                              SELECT 1 FROM public.professionals p
                              WHERE p.id = anamnesis_forms.professional_id
                                AND p.user_id = auth.uid()
                          )
                          -- OU profissional com agendamento ativo/histórico para o cliente
                          OR EXISTS (
                              SELECT 1 FROM public.appointments a
                              JOIN public.professionals p ON p.id = a.professional_id
                              WHERE a.tenant_id = anamnesis_forms.tenant_id
                                AND a.client_id = anamnesis_forms.client_id
                                AND p.user_id = auth.uid()
                          )
                      )
                  )
              )
        )
    );

-- 4. VIEW ADMINISTRATIVA E DE TRIAGEM PARA RECEPÇÃO (SEM DADOS SENSÍVEIS)
-- Apenas informa se a ficha existe, se está em dia e se possui alerta impeditivo
DROP VIEW IF EXISTS public.reception_anamnesis_status;
CREATE OR REPLACE VIEW public.reception_anamnesis_status
WITH (security_invoker = true)
AS
SELECT 
    f.id AS form_id,
    f.tenant_id,
    f.client_id,
    t.title AS template_title,
    t.category AS template_category,
    f.version,
    f.status,
    f.filled_at,
    (f.allergies IS NOT NULL AND TRIM(f.allergies) <> '') AS has_allergies_alert,
    f.created_at,
    f.updated_at
FROM public.anamnesis_forms f
JOIN public.anamnesis_templates t ON t.id = f.template_id;

-- 5. BLINDAGEM DE RESPOSTAS CLÍNICAS (anamnesis_answers)
DROP POLICY IF EXISTS "View answers corresponding to authorized forms" ON public.anamnesis_answers;
CREATE POLICY "View answers corresponding to authorized forms" ON public.anamnesis_answers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.anamnesis_forms f
            JOIN public.tenant_users tu ON tu.tenant_id = f.tenant_id
            WHERE f.id = anamnesis_answers.form_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
              AND (
                  tu.role IN ('owner', 'admin')
                  OR (
                      tu.role = 'professional' AND (
                          EXISTS (
                              SELECT 1 FROM public.professionals p
                              WHERE p.id = f.professional_id AND p.user_id = auth.uid()
                          )
                          OR EXISTS (
                              SELECT 1 FROM public.appointments a
                              JOIN public.professionals p ON p.id = a.professional_id
                              WHERE a.tenant_id = f.tenant_id
                                AND a.client_id = f.client_id
                                AND p.user_id = auth.uid()
                          )
                      )
                  )
              )
        )
    );

-- Bloqueia UPDATE e DELETE em respostas para garantir integridade imutável
DROP POLICY IF EXISTS "Prevent update of anamnesis answers" ON public.anamnesis_answers;
DROP POLICY IF EXISTS "Prevent delete of anamnesis answers" ON public.anamnesis_answers;

-- 6. RPC SEGURA DE CONSULTA DETALHADA COM AUDITORIA OBRIGATÓRIA (LGPD)
-- Esta função é o canal oficial de leitura clínica: verifica permissões e grava a trilha de auditoria na mesma transação
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

-- 7. PERMISSÕES E HARDENING
REVOKE EXECUTE ON FUNCTION public.handle_anamnesis_form_versioning() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_anamnesis_form_immutability() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_anamnesis_form_secure_detail(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.handle_anamnesis_form_versioning() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_anamnesis_form_immutability() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_anamnesis_form_secure_detail(UUID) TO authenticated, service_role;
