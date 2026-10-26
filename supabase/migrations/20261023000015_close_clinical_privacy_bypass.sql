-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2.5: Fechamento Estrutural da Privacidade Clínica
-- Arquivo: 20261023000015_close_clinical_privacy_bypass.sql
--
-- Destaques & Governança LGPD:
-- 1. Segregação Absoluta de Conteúdo Clínico vs Metadados Administrativos:
--    - A tabela 'anamnesis_forms' contém dados de saúde de alta sensibilidade:
--      (health_history, allergies, medications, relevant_conditions, treatment_goal, professional_notes).
--    - Para eliminar qualquer bypass de leitura desauditada via PostgREST direto:
--      a) Criada a VIEW segura 'anamnesis_forms_summary' com metadados para listagem/gestão:
--         (id, tenant_id, client_id, template_id, professional_id, appointment_id,
--          version, parent_form_id, status, filled_at, created_at, updated_at, has_allergies_alert).
--         NENHUM campo com texto clínico sensível está presente nesta view.
--      b) A leitura do prontuário clínico detalhado (alergias, medicamentos, histórico e respostas)
--         é EXCLUSIVA da RPC auditada 'get_anamnesis_form_secure_detail', que grava a auditoria na mesma transação.
-- 2. Revogação Estrutural de SELECT Direto em anamnesis_forms para Usuários Comuns:
--    - REVOKE SELECT ON public.anamnesis_forms FROM authenticated;
--    - Permissão de SELECT concedida à VIEW 'anamnesis_forms_summary' e a 'service_role'.
--    - Permissões de INSERT e UPDATE mantidas para permitir cadastro de novas fichas, reavaliações e arquivamento.
-- 3. Blindagem Completa contra Bypass:
--    - É impossível para qualquer usuário (inclusive owner, admin ou professional) extrair dados clínicos
--      completos por chamadas PostgREST sem que a leitura seja auditada no banco.
-- ==============================================================================

-- 1. CRIAÇÃO DA VIEW DE METADADOS CLÍNICOS E GESTÃO (SEM DADOS SENSÍVEIS DETALHADOS)
DROP VIEW IF EXISTS public.anamnesis_forms_summary;

CREATE OR REPLACE VIEW public.anamnesis_forms_summary
WITH (security_invoker = false)
AS
SELECT 
    f.id,
    f.tenant_id,
    f.client_id,
    f.template_id,
    f.professional_id,
    f.appointment_id,
    f.version,
    f.parent_form_id,
    f.status,
    f.filled_at,
    (f.allergies IS NOT NULL AND TRIM(f.allergies) <> '') AS has_allergies_alert,
    f.created_at,
    f.updated_at
FROM public.anamnesis_forms f
WHERE EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = f.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
      AND (
          tu.role IN ('owner', 'admin', 'receptionist')
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
);

GRANT SELECT ON public.anamnesis_forms_summary TO authenticated, service_role;

-- 2. REVOGAÇÃO ESTRUTURAL DE SELECT DIRETO NA TABELA BASE 'anamnesis_forms'
REVOKE SELECT ON public.anamnesis_forms FROM authenticated;
GRANT SELECT ON public.anamnesis_forms TO service_role;

-- Assegura permissões de escrita para a role authenticated (necessárias para Server Actions)
GRANT INSERT, UPDATE ON public.anamnesis_forms TO authenticated, service_role;

-- 3. RPC DE CRIAÇÃO SEGURA (GARANTE RETORNO DO ID E VERSÃO APÓS INSERT SEM SELECT DIRETO)
CREATE OR REPLACE FUNCTION public.create_anamnesis_form_secure(
    p_client_id UUID,
    p_template_id UUID,
    p_professional_id UUID DEFAULT NULL,
    p_appointment_id UUID DEFAULT NULL,
    p_health_history TEXT DEFAULT NULL,
    p_allergies TEXT DEFAULT NULL,
    p_medications TEXT DEFAULT NULL,
    p_relevant_conditions TEXT DEFAULT NULL,
    p_treatment_goal TEXT DEFAULT NULL,
    p_professional_notes TEXT DEFAULT NULL,
    p_parent_form_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_role tenant_role;
  v_new_form RECORD;
BEGIN
  -- 1. Validar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  -- 2. Obter tenant_id do cliente
  SELECT tenant_id INTO v_tenant_id
  FROM public.clients
  WHERE id = p_client_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não localizado.';
  END IF;

  -- 3. Validar papel ativo do usuário no tenant
  SELECT role INTO v_role
  FROM public.tenant_users
  WHERE tenant_id = v_tenant_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem vínculo ativo com este estabelecimento.';
  END IF;

  -- 4. Inserir a ficha com acionamento do gatilho de versionamento com advisory lock
  INSERT INTO public.anamnesis_forms (
    tenant_id,
    client_id,
    template_id,
    professional_id,
    appointment_id,
    health_history,
    allergies,
    medications,
    relevant_conditions,
    treatment_goal,
    professional_notes,
    parent_form_id,
    status,
    filled_at
  ) VALUES (
    v_tenant_id,
    p_client_id,
    p_template_id,
    p_professional_id,
    p_appointment_id,
    NULLIF(TRIM(p_health_history), ''),
    NULLIF(TRIM(p_allergies), ''),
    NULLIF(TRIM(p_medications), ''),
    NULLIF(TRIM(p_relevant_conditions), ''),
    NULLIF(TRIM(p_treatment_goal), ''),
    NULLIF(TRIM(p_professional_notes), ''),
    p_parent_form_id,
    'completed',
    now()
  )
  RETURNING id, tenant_id, client_id, template_id, version, status, filled_at, created_at
  INTO v_new_form;

  -- 5. Registrar auditoria de criação
  INSERT INTO public.anamnesis_audit_logs (
    tenant_id,
    form_id,
    user_id,
    action,
    metadata
  ) VALUES (
    v_tenant_id,
    v_new_form.id,
    auth.uid(),
    CASE WHEN p_parent_form_id IS NOT NULL THEN 'UPDATE_VERSION' ELSE 'CREATE' END,
    jsonb_build_object(
      'version', v_new_form.version,
      'channel', 'secure_create_rpc'
    )
  );

  RETURN jsonb_build_object(
    'id', v_new_form.id,
    'tenant_id', v_new_form.tenant_id,
    'client_id', v_new_form.client_id,
    'template_id', v_new_form.template_id,
    'version', v_new_form.version,
    'status', v_new_form.status,
    'filled_at', v_new_form.filled_at,
    'created_at', v_new_form.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_anamnesis_form_secure FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_anamnesis_form_secure TO authenticated, service_role;
