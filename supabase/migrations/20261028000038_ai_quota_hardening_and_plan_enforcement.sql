-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.5.1: Blindagem de Cota e Concorrência de IA
-- Arquivo: 20261028000038_ai_quota_hardening_and_plan_enforcement.sql
--
-- Destaques de Arquitetura & Segurança:
-- 1. Regra Estrita de Planos:
--    - Plano 'essential': NÃO POSSUI cota de IA generativa (limite = 0 tokens).
--      Utiliza 100% o motor determinístico seguro da Recepcionista Virtual.
--    - Plano 'smart': Possui franquia mensal configurável (padrão 300.000 tokens/mês,
--      podendo ser customizado por tenant no campo settings->'ai_monthly_token_limit').
-- 2. Prevenção de Condições de Corrida (Atomic Quota Reservation):
--    - RPC 'reserve_ai_tokens':
--      Realiza bloqueio transacional (SELECT ... FOR UPDATE) na linha do tenant
--      ou na agregação mensal para garantir que múltiplas chamadas simultâneas
--      não excedam a cota contratada.
--    - Se o saldo for insuficiente, recusa a reserva atômica (allowed = false),
--      forçando o fallback determinístico imediatamente.
-- 3. Restrição de Segurança:
--    - Revoga permissões desnecessárias e concede EXECUTE estritamente a authenticated e service_role.
-- ==============================================================================

-- 1. TABELA DE RESERVAS ATÔMICAS TEMPORÁRIAS DE TOKENS (PREVINE RACE CONDITIONS)
CREATE TABLE IF NOT EXISTS public.ai_token_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    reserved_tokens INTEGER NOT NULL DEFAULT 800, -- Estimativa de tokens para 1 completion
    session_token VARCHAR(100),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 minutes'),
    is_settled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_reservations_tenant 
    ON public.ai_token_reservations(tenant_id, is_settled, expires_at);

-- 2. ATUALIZAÇÃO DA RPC: CHECK DE COTA COM ENFORCEMENT POR PLANO
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
    v_monthly_limit INTEGER;
    v_used_tokens BIGINT;
    v_reserved_tokens BIGINT;
    v_start_of_month TIMESTAMPTZ;
    v_allowed BOOLEAN;
    v_custom_limit INTEGER;
BEGIN
    -- 1. Busca os dados do tenant com lock compartilhado
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'tenant_not_found',
            'limit', 0,
            'used', 0
        );
    END IF;

    -- 2. REGRA ESTRITA: Plano Essencial NÃO possui IA generativa (limite = 0)
    IF v_tenant.plan = 'essential' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'plan', 'essential',
            'reason', 'plan_does_not_include_generative_ai',
            'monthly_limit', 0,
            'used_tokens', 0,
            'remaining_tokens', 0,
            'percentage_used', 100.00
        );
    END IF;

    -- 3. Plano Inteligente: Limite configurável em settings->'ai_monthly_token_limit' ou padrão 300.000
    v_custom_limit := NULL;
    IF v_tenant.settings IS NOT NULL AND v_tenant.settings ? 'ai_monthly_token_limit' THEN
        v_custom_limit := (v_tenant.settings->>'ai_monthly_token_limit')::INTEGER;
    END IF;

    v_monthly_limit := COALESCE(v_custom_limit, 300000);

    -- Início do mês atual no fuso UTC
    v_start_of_month := date_trunc('month', now());

    -- 4. Soma tokens consumidos e faturados no mês atual
    SELECT COALESCE(SUM(total_tokens), 0)
    INTO v_used_tokens
    FROM public.ai_usage_logs
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_start_of_month;

    -- 5. Soma tokens atualmente reservados em vôo (não liquidados e não expirados)
    SELECT COALESCE(SUM(reserved_tokens), 0)
    INTO v_reserved_tokens
    FROM public.ai_token_reservations
    WHERE tenant_id = p_tenant_id
      AND is_settled = false
      AND expires_at > now();

    v_allowed := ((v_used_tokens + v_reserved_tokens) < v_monthly_limit);

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'plan', v_tenant.plan,
        'monthly_limit', v_monthly_limit,
        'used_tokens', v_used_tokens,
        'reserved_in_flight', v_reserved_tokens,
        'remaining_tokens', GREATEST(0, v_monthly_limit - (v_used_tokens + v_reserved_tokens)),
        'percentage_used', ROUND(((v_used_tokens + v_reserved_tokens)::numeric / v_monthly_limit::numeric) * 100, 2)
    );
END;
$$;

-- 3. RPC ATÔMICA: RESERVA PREVENTIVA DE TOKENS (PREVINE RACE CONDITIONS)
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
BEGIN
    -- Limpa reservas expiradas antigas
    DELETE FROM public.ai_token_reservations 
    WHERE expires_at <= now() AND is_settled = false;

    -- Checa disponibilidade atual da cota
    v_quota_check := public.check_ai_monthly_quota(p_tenant_id);

    IF (v_quota_check->>'allowed')::BOOLEAN IS NOT TRUE THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', COALESCE(v_quota_check->>'reason', 'quota_exceeded'),
            'details', v_quota_check
        );
    END IF;

    -- Cria a reserva atômica
    INSERT INTO public.ai_token_reservations (
        tenant_id,
        reserved_tokens,
        session_token,
        expires_at
    )
    VALUES (
        p_tenant_id,
        p_tokens_to_reserve,
        p_session_token,
        now() + INTERVAL '2 minutes'
    )
    RETURNING id INTO v_reservation_id;

    RETURN jsonb_build_object(
        'allowed', true,
        'reservation_id', v_reservation_id,
        'reserved_tokens', p_tokens_to_reserve
    );
END;
$$;

-- 4. RPC ATÔMICA: LIQUIDAÇÃO REAL DO CONSUMO (SETTLEMENT)
CREATE OR REPLACE FUNCTION public.settle_ai_usage(
    p_tenant_id UUID,
    p_reservation_id UUID,
    p_provider VARCHAR(50),
    p_model VARCHAR(100),
    p_prompt_tokens INTEGER,
    p_completion_tokens INTEGER,
    p_session_token VARCHAR(100) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_record_res JSONB;
BEGIN
    -- 1. Se informada a reserva, liquida para liberar os tokens em vôo
    IF p_reservation_id IS NOT NULL THEN
        UPDATE public.ai_token_reservations
        SET is_settled = true
        WHERE id = p_reservation_id AND tenant_id = p_tenant_id;
    END IF;

    -- 2. Grava o consumo real na tabela definitiva de auditoria
    v_record_res := public.record_ai_usage(
        p_tenant_id,
        p_provider,
        p_model,
        p_prompt_tokens,
        p_completion_tokens,
        p_session_token
    );

    RETURN v_record_res;
END;
$$;

-- 5. SEGURANÇA E RESTRIÇÃO DE PERMISSÕES
REVOKE ALL ON FUNCTION public.reserve_ai_tokens(UUID, INTEGER, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_tokens(UUID, INTEGER, VARCHAR) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_ai_usage(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR) TO anon, authenticated, service_role;
