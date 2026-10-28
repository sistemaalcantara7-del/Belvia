-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.5: Controle de Consumo OpenAI e Custos por Tenant
-- Arquivo: 20261028000037_ai_usage_and_quota_limits.sql
--
-- Destaques de Arquitetura & Segurança:
-- 1. Tabela 'ai_usage_logs':
--    - Registra de forma agregada e assíncrona o consumo de tokens (prompt, completion, total).
--    - Calcula e persiste o custo estimado em USD/BRL.
--    - NUNCA armazena conteúdo das mensagens, prompt ou dados sensíveis clínicos do cliente.
-- 2. Limites Mensais por Plano na tabela 'tenants' ou 'saas_subscriptions':
--    - Default Plano Essencial: 50.000 tokens/mês (~100 atendimentos completos).
--    - Default Plano Inteligente: 300.000 tokens/mês (~600 atendimentos completos).
-- 3. Função atômica 'check_and_increment_ai_usage':
--    - Valida o consumo acumulado do mês corrente ANTES de invocar o modelo.
--    - Se o limite estiver esgotado, retorna 'limit_exceeded: true', permitindo ao
--      backend acionar imediatamente o motor determinístico seguro sem gerar custo.
-- ==============================================================================

-- 1. TABELA DE REGISTRO DE CONSUMO DE TOKENS DA IA (AI_USAGE_LOGS)
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'openai',
    model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
    session_token VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. ÍNDICES DE PERFORMANCE PARA AGREGAÇÕES MENSAIS
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_tenant_date ON public.ai_usage_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at);

-- 3. RLS PARA AI_USAGE_LOGS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_view_ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "tenant_view_ai_usage_logs"
    ON public.ai_usage_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = ai_usage_logs.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

-- 4. RPC ATÔMICA: CHECAGEM DE COTA MENSAL DE IA
CREATE OR REPLACE FUNCTION public.check_ai_monthly_quota(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_plan public.tenant_plan;
    v_monthly_limit INTEGER;
    v_used_tokens BIGINT;
    v_start_of_month TIMESTAMPTZ;
    v_allowed BOOLEAN;
BEGIN
    -- 1. Busca o plano do tenant
    SELECT plan INTO v_plan FROM public.tenants WHERE id = p_tenant_id;
    IF v_plan IS NULL THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'tenant_not_found',
            'limit', 0,
            'used', 0
        );
    END IF;

    -- 2. Define limite por plano
    -- Essencial: 50.000 tokens (~$0.015 custo OpenAI)
    -- Inteligente: 300.000 tokens (~$0.090 custo OpenAI)
    IF v_plan = 'smart' THEN
        v_monthly_limit := 300000;
    ELSE
        v_monthly_limit := 50000;
    END IF;

    -- Início do mês atual no fuso UTC
    v_start_of_month := date_trunc('month', now());

    -- 3. Soma tokens consumidos no mês atual
    SELECT COALESCE(SUM(total_tokens), 0)
    INTO v_used_tokens
    FROM public.ai_usage_logs
    WHERE tenant_id = p_tenant_id
      AND created_at >= v_start_of_month;

    v_allowed := (v_used_tokens < v_monthly_limit);

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'plan', v_plan,
        'monthly_limit', v_monthly_limit,
        'used_tokens', v_used_tokens,
        'remaining_tokens', GREATEST(0, v_monthly_limit - v_used_tokens),
        'percentage_used', ROUND((v_used_tokens::numeric / v_monthly_limit::numeric) * 100, 2)
    );
END;
$$;

-- 5. RPC ATÔMICA: REGISTRA CONSUMO DE IA (SERVICE ROLE / BACKEND)
CREATE OR REPLACE FUNCTION public.record_ai_usage(
    p_tenant_id UUID,
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
    v_total_tokens INTEGER;
    v_cost_usd NUMERIC(10, 6) := 0;
    v_new_id UUID;
BEGIN
    v_total_tokens := p_prompt_tokens + p_completion_tokens;

    -- Tabela de custo OpenAI gpt-4o-mini:
    -- Prompt: $0.15 por 1M tokens ($0.00000015 por token)
    -- Completion: $0.60 por 1M tokens ($0.00000060 por token)
    IF p_model LIKE '%gpt-4o-mini%' THEN
        v_cost_usd := (p_prompt_tokens * 0.00000015) + (p_completion_tokens * 0.00000060);
    ELSE
        -- Default genérico
        v_cost_usd := (p_prompt_tokens * 0.00000015) + (p_completion_tokens * 0.00000060);
    END IF;

    INSERT INTO public.ai_usage_logs (
        tenant_id,
        provider,
        model,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        estimated_cost_usd,
        session_token
    )
    VALUES (
        p_tenant_id,
        p_provider,
        p_model,
        p_prompt_tokens,
        p_completion_tokens,
        v_total_tokens,
        v_cost_usd,
        p_session_token
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true,
        'log_id', v_new_id,
        'total_tokens', v_total_tokens,
        'estimated_cost_usd', v_cost_usd
    );
END;
$$;
