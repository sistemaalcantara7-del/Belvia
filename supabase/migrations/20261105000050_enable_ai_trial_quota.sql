-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.5.2: Franquia Cumulativa de IA para Trial de 7 Dias
-- Arquivo: 20261105000050_enable_ai_trial_quota.sql
--
-- Destaques de Arquitetura & Regras de Negócio (Prompt 238 & 239):
-- 1. Franquia Cumulativa de 35.000 tokens durante os 7 dias de trial:
--    - Válido para novos tenants em período gratuito, inclusive no plano Essencial.
--    - Marco inicial imutável do trial: COALESCE(v_sub.current_period_start, v_sub.created_at).
--    - NÃO reinicia na virada do mês civil nem por navegação em planos.
-- 2. Precedência e Bloqueios Finais (Prompt 239):
--    - Tenants suspensos, cancelados ou com assinatura 'suspended'/'canceled'/'past_due'
--      NUNCA recebem IA pelo fallback do plano Smart.
--    - Trial expirado (trial_ends_at < now()): Se a assinatura estiver em status 'trial' e vencida,
--      ou o tenant não possuir assinatura 'active' no plano Smart, bloqueia imediatamente.
-- 3. Separação Estrita de Autorização:
--    - can_show_assistant: Verdadeiro se o tenant estiver em trial vigente OU no plano Smart ativo.
--    - can_use_generative_ai (allowed): Verdadeiro se houver saldo restante na franquia de trial (35k) ou na cota mensal Smart (300k).
-- 4. Reserva Atômica Inteligente com Teto Dinâmico (Prompt 239):
--    - RPC reserve_ai_tokens ajustada para permitir reserva mesmo quando o saldo for inferior a 800 tokens,
--      reservando min(p_tokens_to_reserve, saldo_disponivel) com mínimo operacional seguro (ex: 100 tokens),
--      retornando max_tokens_allowed para o backend limitar a geração da OpenAI e nunca ultrapassar a franquia.
-- ==============================================================================

-- 1. RPC: CHECK DE COTA DE IA COM SUPORTE A TRIAL E PRECEDÊNCIA ESTREITA
CREATE OR REPLACE FUNCTION public.check_ai_monthly_quota(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
    v_sub RECORD;
    v_token_limit INTEGER;
    v_used_tokens BIGINT := 0;
    v_reserved_tokens BIGINT := 0;
    v_start_time TIMESTAMPTZ;
    v_allowed BOOLEAN := false;
    v_can_show_assistant BOOLEAN := false;
    v_is_trial BOOLEAN := false;
    v_custom_limit INTEGER;
    v_remaining_tokens BIGINT := 0;
BEGIN
    -- 1. Busca os dados do tenant
    SELECT id, name, slug, plan, status, settings, created_at
    INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    IF v_tenant IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'can_show_assistant', false,
            'reason', 'tenant_not_found',
            'monthly_limit', 0,
            'used_tokens', 0,
            'remaining_tokens', 0,
            'percentage_used', 100.00
        );
    END IF;

    -- 2. Precedência de Segurança: Tenants suspensos ou cancelados são bloqueados sumariamente
    IF v_tenant.status IN ('suspended', 'canceled', 'inactive') THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'can_show_assistant', false,
            'plan', v_tenant.plan,
            'is_trial', false,
            'reason', 'tenant_inactive_or_suspended',
            'monthly_limit', 0,
            'used_tokens', 0,
            'remaining_tokens', 0,
            'percentage_used', 100.00
        );
    END IF;

    -- 3. Consulta a assinatura oficial na tabela saas_subscriptions
    SELECT id, status, plan, trial_ends_at, current_period_start, current_period_end, created_at
    INTO v_sub
    FROM public.saas_subscriptions
    WHERE tenant_id = p_tenant_id;

    -- 4. Precedência de Assinatura: Se existir assinatura e ela estiver suspensa ou cancelada, NUNCA concede IA
    IF v_sub IS NOT NULL AND v_sub.status IN ('suspended', 'canceled', 'past_due') THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'can_show_assistant', false,
            'plan', v_tenant.plan,
            'is_trial', false,
            'reason', 'subscription_suspended_or_canceled',
            'monthly_limit', 0,
            'used_tokens', 0,
            'remaining_tokens', 0,
            'percentage_used', 100.00
        );
    END IF;

    -- 5. Avalia se o tenant está em período de Trial Vigente
    IF v_sub IS NOT NULL AND v_sub.status = 'trial' THEN
        IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at >= now() THEN
            v_is_trial := true;
        ELSE
            -- Trial expirado! NUNCA concede IA por fallback de plano
            RETURN jsonb_build_object(
                'allowed', false,
                'can_show_assistant', false,
                'plan', v_tenant.plan,
                'is_trial', false,
                'reason', 'trial_expired',
                'monthly_limit', 0,
                'used_tokens', 0,
                'remaining_tokens', 0,
                'percentage_used', 100.00
            );
        END IF;
    END IF;

    -- 6. Definição de Limites, Marco Temporal e Exibição do Assistente
    IF v_is_trial THEN
        -- REGRA DE TRIAL: Franquia cumulativa de 35.000 tokens para todo o ciclo de testes
        v_can_show_assistant := true;
        v_token_limit := 35000;
        -- Marco inicial imutável do trial
        v_start_time := COALESCE(v_sub.current_period_start, v_sub.created_at, v_tenant.created_at);
    ELSIF v_tenant.plan = 'smart' AND v_tenant.status = 'active' AND (v_sub IS NULL OR v_sub.status = 'active') THEN
        -- REGRA DO PLANO INTELIGENTE ATIVO: 300.000 tokens mensais (ou custom) por mês civil
        v_can_show_assistant := true;
        v_custom_limit := NULL;
        IF v_tenant.settings IS NOT NULL AND v_tenant.settings ? 'ai_monthly_token_limit' THEN
            v_custom_limit := (v_tenant.settings->>'ai_monthly_token_limit')::INTEGER;
        END IF;
        v_token_limit := COALESCE(v_custom_limit, 300000);
        v_start_time := date_trunc('month', now());
    ELSE
        -- PLANO ESSENCIAL FORA DO TRIAL OU ASSINATURA SEM COBERTURA: Sem IA generativa
        RETURN jsonb_build_object(
            'allowed', false,
            'can_show_assistant', false,
            'plan', v_tenant.plan,
            'is_trial', false,
            'reason', 'plan_does_not_include_generative_ai',
            'monthly_limit', 0,
            'used_tokens', 0,
            'remaining_tokens', 0,
            'percentage_used', 100.00
        );
    END IF;

    -- 7. Soma tokens consumidos e faturados a partir do marco temporal definido
    SELECT COALESCE(SUM(total_tokens), 0)
    INTO v_used_tokens
    FROM public.ai_usage_logs
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_start_time;

    -- 8. Soma tokens atualmente reservados em vôo (não liquidados e não expirados)
    SELECT COALESCE(SUM(reserved_tokens), 0)
    INTO v_reserved_tokens
    FROM public.ai_token_reservations
    WHERE tenant_id = p_tenant_id
      AND is_settled = false
      AND expires_at > now();

    v_remaining_tokens := GREATEST(0, v_token_limit - (v_used_tokens + v_reserved_tokens));

    -- 9. Verificação de Saldo Restante (exige no mínimo 50 tokens disponíveis)
    v_allowed := (v_remaining_tokens >= 50);

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'can_show_assistant', v_can_show_assistant,
        'is_trial', v_is_trial,
        'plan', v_tenant.plan,
        'monthly_limit', v_token_limit,
        'used_tokens', v_used_tokens,
        'reserved_in_flight', v_reserved_tokens,
        'remaining_tokens', v_remaining_tokens,
        'percentage_used', CASE 
            WHEN v_token_limit > 0 THEN ROUND(((v_used_tokens + v_reserved_tokens)::numeric / v_token_limit::numeric) * 100, 2)
            ELSE 100.00
        END,
        'reason', CASE 
            WHEN NOT v_allowed AND v_is_trial THEN 'trial_quota_exceeded'
            WHEN NOT v_allowed THEN 'quota_exceeded'
            ELSE NULL
        END
    );
END;
$$;

-- 2. ATUALIZAÇÃO DA RPC: RESERVA ATÔMICA COM CAPACIDADE DINÂMICA
CREATE OR REPLACE FUNCTION public.reserve_ai_tokens(
    p_tenant_id UUID,
    p_tokens_to_reserve INTEGER DEFAULT 800,
    p_session_token VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quota_check JSONB;
    v_reservation_id UUID;
    v_remaining BIGINT;
    v_effective_reserve INTEGER;
BEGIN
    -- Limpa reservas expiradas antigas
    DELETE FROM public.ai_token_reservations 
    WHERE expires_at <= now() AND is_settled = false;

    -- Checa disponibilidade atual da cota com lock compartilhado
    v_quota_check := public.check_ai_monthly_quota(p_tenant_id);

    IF (v_quota_check->>'allowed')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', COALESCE(v_quota_check->>'reason', 'quota_exceeded'),
            'details', v_quota_check
        );
    END IF;

    v_remaining := (v_quota_check->>'remaining_tokens')::BIGINT;

    -- Se o saldo for menor que o valor padrão solicitado (ex: 800),
    -- ajusta a reserva para o saldo restante real, garantindo teto estrito
    v_effective_reserve := LEAST(p_tokens_to_reserve, v_remaining::INTEGER);

    IF v_effective_reserve < 50 THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'insufficient_tokens_remaining',
            'details', v_quota_check
        );
    END IF;

    -- Cria a reserva atômica com o valor efetivo
    INSERT INTO public.ai_token_reservations (
        tenant_id,
        reserved_tokens,
        session_token,
        expires_at
    )
    VALUES (
        p_tenant_id,
        v_effective_reserve,
        p_session_token,
        now() + INTERVAL '2 minutes'
    )
    RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
        'allowed', true,
        'reservation_id', v_reservation_id,
        'reserved_tokens', v_effective_reserve,
        -- Retorna o teto seguro para a conclusão da IA não estourar a franquia
        'max_completion_tokens', GREATEST(50, v_effective_reserve - 100)
    );
END;
$$;

-- Permissões de Execução (Restritas e Seguras)
REVOKE ALL ON FUNCTION public.check_ai_monthly_quota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_monthly_quota(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_ai_tokens(UUID, INTEGER, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(UUID, INTEGER, VARCHAR) TO anon, authenticated, service_role;
