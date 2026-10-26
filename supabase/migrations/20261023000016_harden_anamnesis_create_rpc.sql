-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2.6: Blindagem Final da RPC de Criação Clínica
-- Arquivo: 20261023000016_harden_anamnesis_create_rpc.sql
--
-- Destaques & Governança LGPD:
-- 1. Restrição Estrita de Papéis na Criação de Prontuários:
--    - 'receptionist' NÃO pode criar ou preencher fichas clínicas. Apenas 'owner', 'admin'
--      ou 'professional' com vínculo de atendimento ao paciente podem registrar anamnese.
-- 2. Integridade Referencial Multi-Tenant & Validação de Vínculos Cruzados:
--    - A RPC valida se 'p_template_id' pertence ao mesmo 'tenant_id' do cliente.
--    - Se 'p_professional_id' for informado, valida se o profissional pertence ao mesmo tenant.
--    - Se for invocada por um 'professional', valida obrigatoriamente se ele possui atendimento
--      agendado/realizado com este paciente no tenant.
--    - Se 'p_parent_form_id' for informado, valida se a ficha pai pertence ao mesmo cliente e tenant.
-- ==============================================================================

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
  v_template_tenant_id UUID;
  v_prof_tenant_id UUID;
  v_parent_tenant_id UUID;
  v_parent_client_id UUID;
BEGIN
  -- 1. Validar autenticação
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso não autenticado.';
  END IF;

  -- 2. Obter e validar tenant_id do cliente
  SELECT tenant_id INTO v_tenant_id
  FROM public.clients
  WHERE id = p_client_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Cliente não localizado.';
  END IF;

  -- 3. Validar papel ativo do usuário executor no tenant
  SELECT role INTO v_role
  FROM public.tenant_users
  WHERE tenant_id = v_tenant_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem vínculo ativo com este estabelecimento.';
  END IF;

  -- 4. REQUISITO 1: Recepção bloqueada de criar prontuários clínicos
  IF v_role = 'receptionist' THEN
    RAISE EXCEPTION 'Acesso restrito: o perfil de recepção não possui autorização para criar ou preencher prontuários clínicos.';
  END IF;

  -- 5. Se o executor for 'professional', deve possuir autorização clínica (atendimento) com o cliente
  IF v_role = 'professional' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.professionals p ON p.id = a.professional_id
      WHERE a.tenant_id = v_tenant_id
        AND a.client_id = p_client_id
        AND p.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'Acesso negado: profissionais só podem criar prontuários para clientes sob seus cuidados clínicos.';
    END IF;
  END IF;

  -- 6. REQUISITO 2: Validação de isolamento do template_id (mesmo tenant)
  SELECT tenant_id INTO v_template_tenant_id
  FROM public.anamnesis_templates
  WHERE id = p_template_id;

  IF v_template_tenant_id IS NULL OR v_template_tenant_id <> v_tenant_id THEN
    RAISE EXCEPTION 'Modelo de anamnese inválido ou não pertencente a este estabelecimento.';
  END IF;

  -- 7. Validação de isolamento do professional_id (se informado)
  IF p_professional_id IS NOT NULL THEN
    SELECT tenant_id INTO v_prof_tenant_id
    FROM public.professionals
    WHERE id = p_professional_id;

    IF v_prof_tenant_id IS NULL OR v_prof_tenant_id <> v_tenant_id THEN
      RAISE EXCEPTION 'Profissional informado não pertence a este estabelecimento.';
    END IF;
  END IF;

  -- 8. Validação de integridade do parent_form_id (se for reavaliação)
  IF p_parent_form_id IS NOT NULL THEN
    SELECT tenant_id, client_id INTO v_parent_tenant_id, v_parent_client_id
    FROM public.anamnesis_forms
    WHERE id = p_parent_form_id;

    IF v_parent_tenant_id IS NULL OR v_parent_tenant_id <> v_tenant_id OR v_parent_client_id <> p_client_id THEN
      RAISE EXCEPTION 'Ficha original de reavaliação inválida ou pertencente a outro cliente/estabelecimento.';
    END IF;
  END IF;

  -- 9. Inserir a ficha com acionamento do gatilho de versionamento com advisory lock
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

  -- 10. Registrar auditoria de criação
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
