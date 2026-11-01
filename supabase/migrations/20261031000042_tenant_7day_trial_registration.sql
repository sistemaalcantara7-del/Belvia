-- ==============================================================================
-- MIGRATION: 20261031000042_tenant_7day_trial_registration.sql
-- OBJETIVO:
--   1. Conceder trial de 7 dias exclusivamente durante o cadastro inicial de novos tenants:
--      - public.create_tenant_and_owner cria o tenant com status = 'trial' e insere
--        atomicamente a assinatura em public.saas_subscriptions com trial de 7 dias.
--      - Idempotência estrita: se o usuário já for 'owner' de um tenant existente,
--        apenas retorna o id existente, SEM conceder novo trial nem alterar status.
--   2. Corrigir public.get_or_create_tenant_subscription:
--      - Validar autorização do usuário autenticado (auth.uid()) para o tenant solicitado.
--      - Apenas 'owner' ou 'admin' ativos têm permissão para acessar a assinatura.
--      - Impedir concessão indevida de novos trials a tenants existentes, expirados ou legados.
--      - Caso um tenant existente não possua registro em saas_subscriptions, cria com status
--        espelhado do tenant (ex: 'active', 'inactive', 'suspended'), com trial_ends_at = NULL
--        se não estiver em trial, preservando integralmente o ciclo de vida e sem reabrir trial.
--   3. Restringir EXECUTE com REVOKE FROM PUBLIC e GRANT explícito para authenticated.
--   4. Preservar isolamento multi-tenant, RLS, regras de negócio e planos.
-- ==============================================================================

-- 1. FUNÇÃO CONTROLADA DE REGISTRO DE NOVO TENANT COM TRIAL DE 7 DIAS
CREATE OR REPLACE FUNCTION public.create_tenant_and_owner(
  p_name VARCHAR(255),
  p_slug VARCHAR(100),
  p_plan tenant_plan DEFAULT 'essential'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_existing_tenant_id UUID;
  v_clean_name VARCHAR(255);
  v_final_slug VARCHAR(100);
  v_valid_plan tenant_plan;
  v_amount NUMERIC(10, 2);
BEGIN
  -- 1.1 Autenticação obrigatória
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Apenas usuários autenticados com sessão ativa podem registrar estabelecimentos.';
  END IF;

  -- 1.2 Sanitização básica de entrada
  v_clean_name := SUBSTRING(TRIM(COALESCE(p_name, '')) FROM 1 FOR 255);
  IF LENGTH(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Nome do estabelecimento inválido ou muito curto.';
  END IF;

  -- 1.3 Idempotência estrita: se o usuário já possuir tenant ativo/trial como 'owner', retorna sem criar outro
  SELECT tu.tenant_id INTO v_existing_tenant_id
  FROM public.tenant_users tu
  WHERE tu.user_id = v_user_id
    AND tu.role = 'owner'
    AND tu.status = 'active'
  LIMIT 1;

  IF v_existing_tenant_id IS NOT NULL THEN
    -- Preserva integralmente o tenant existente sem reiniciar trial
    RETURN v_existing_tenant_id;
  END IF;

  -- 1.4 Validação e sanitização de plano no servidor (anti-tampering)
  IF p_plan = 'smart' THEN
    v_valid_plan := 'smart';
    v_amount := 99.90;
  ELSE
    v_valid_plan := 'essential';
    v_amount := 59.90;
  END IF;

  -- 1.5 Sanitização e desambiguação de slug
  v_final_slug := LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, '')), '[^a-z0-9\-]', '', 'g'));
  IF LENGTH(v_final_slug) < 2 THEN
    v_final_slug := 'clinica-' || SUBSTR(md5(random()::text), 1, 6);
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_final_slug) THEN
    v_final_slug := SUBSTRING(v_final_slug FROM 1 FOR 90) || '-' || SUBSTR(md5(random()::text), 1, 4);
  END IF;

  -- 1.6 Insere o novo tenant com status inicial 'trial'
  INSERT INTO public.tenants (name, slug, plan, status)
  VALUES (v_clean_name, v_final_slug, v_valid_plan, 'trial')
  RETURNING id INTO v_tenant_id;

  -- 1.7 Vincula o usuário autenticado como 'owner'
  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, v_user_id, 'owner', 'active');

  -- 1.8 Cria exclusivamente para o novo tenant o registro de assinatura com 7 dias de trial
  INSERT INTO public.saas_subscriptions (
    tenant_id,
    plan,
    status,
    amount,
    current_period_start,
    current_period_end,
    trial_ends_at,
    grace_period_days
  )
  VALUES (
    v_tenant_id,
    v_valid_plan,
    'trial',
    v_amount,
    now(),
    now() + INTERVAL '7 days',
    now() + INTERVAL '7 days',
    5
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

-- Restringe privilégios de execução
REVOKE EXECUTE ON FUNCTION public.create_tenant_and_owner(VARCHAR, VARCHAR, tenant_plan) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_and_owner(VARCHAR, VARCHAR, tenant_plan) TO authenticated;

-- 2. RPC SEGURA: OBTÉM OU SINCRONIZA ASSINATURA DO TENANT COM VALIDAÇÃO DE AUTORIZAÇÃO
CREATE OR REPLACE FUNCTION public.get_or_create_tenant_subscription(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_calling_user_id UUID;
    v_has_access BOOLEAN;
    v_tenant RECORD;
    v_sub RECORD;
    v_amount NUMERIC(10, 2);
    v_target_status public.saas_subscription_status;
    v_trial_end TIMESTAMPTZ;
BEGIN
    -- 2.1 Validação de identidade do chamador autenticado
    v_calling_user_id := auth.uid();
    IF v_calling_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Apenas usuários autenticados podem consultar assinaturas.'
        );
    END IF;

    -- 2.2 Validação de autorização no tenant (apenas 'owner' ou 'admin' ativos evitam acesso cruzado)
    SELECT EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        WHERE tu.tenant_id = p_tenant_id
          AND tu.user_id = v_calling_user_id
          AND tu.role IN ('owner', 'admin')
          AND tu.status = 'active'
    ) INTO v_has_access;

    IF NOT COALESCE(v_has_access, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acesso negado: permissões insuficientes para este estabelecimento.'
        );
    END IF;

    -- 2.3 Busca dados do tenant
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Estabelecimento não encontrado.'
        );
    END IF;

    -- 2.4 Busca assinatura existente (se já existir, retorna imediatamente preservando seus dados e status)
    SELECT * INTO v_sub FROM public.saas_subscriptions WHERE tenant_id = p_tenant_id;
    IF v_sub IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'subscription', to_jsonb(v_sub)
        );
    END IF;

    -- 2.5 Se NÃO existir assinatura prévia (ex: tenant legado):
    -- NUNCA concede trial novo arbitrariamente. Espelha o status real do tenant.
    IF v_tenant.plan = 'smart' THEN
        v_amount := 99.90;
    ELSE
        v_amount := 59.90;
    END IF;

    IF v_tenant.status = 'trial' THEN
        -- Se o tenant já estava registrado em trial no cadastro inicial, respeita o término previsto
        v_target_status := 'trial';
        v_trial_end := v_tenant.created_at + INTERVAL '7 days';
    ELSIF v_tenant.status = 'active' THEN
        v_target_status := 'active';
        v_trial_end := NULL;
    ELSE
        v_target_status := 'past_due';
        v_trial_end := NULL;
    END IF;

    INSERT INTO public.saas_subscriptions (
        tenant_id,
        plan,
        status,
        amount,
        current_period_start,
        current_period_end,
        trial_ends_at,
        grace_period_days
    )
    VALUES (
        p_tenant_id,
        v_tenant.plan,
        v_target_status,
        v_amount,
        COALESCE(v_tenant.created_at, now()),
        COALESCE(v_trial_end, now() + INTERVAL '30 days'),
        v_trial_end,
        5
    )
    ON CONFLICT (tenant_id) DO UPDATE
    SET updated_at = now()
    RETURNING * INTO v_sub;

    RETURN jsonb_build_object(
        'success', true,
        'subscription', to_jsonb(v_sub)
    );
END;
$$;

-- Restringe privilégios de execução
REVOKE EXECUTE ON FUNCTION public.get_or_create_tenant_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_tenant_subscription(UUID) TO authenticated;
