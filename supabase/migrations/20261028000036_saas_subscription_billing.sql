-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.3: Assinaturas e Cobrança SaaS (Asaas Platform)
-- Arquivo: 20261028000036_saas_subscription_billing.sql
--
-- Destaques de Arquitetura & Segurança:
-- 1. Tabela 'saas_subscriptions':
--    - Gerencia a assinatura do estabelecimento na plataforma ZELUNIA.
--    - Controla id do cliente Asaas (customer_id), id da assinatura Asaas (subscription_id).
--    - Ciclo de vida: 'trial', 'active', 'overdue', 'suspended', 'canceled'.
--    - Período de tolerância (grace period) e data de expiração/vencimento.
-- 2. Tabela 'saas_invoices':
--    - Histórico e espelho de cobranças geradas pelo gateway Asaas.
--    - Evita cobrança duplicada com constraint unique em payment_id do Asaas.
-- 3. RLS e Políticas:
--    - Apenas proprietários ('owner') e administradores ('admin') podem visualizar a assinatura e faturas.
--    - Atualização restrita via triggers/service role dos webhooks.
-- ==============================================================================

-- 1. ENUMS PARA ASSINATURA E FATURAS SAAS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'saas_subscription_status') THEN
        CREATE TYPE public.saas_subscription_status AS ENUM (
            'trial',
            'active',
            'overdue',
            'suspended',
            'canceled'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'saas_invoice_status') THEN
        CREATE TYPE public.saas_invoice_status AS ENUM (
            'pending',
            'paid',
            'overdue',
            'refunded',
            'canceled'
        );
    END IF;
END $$;

-- 2. TABELA DE ASSINATURAS DO TENANT (SAAS_SUBSCRIPTIONS)
CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan public.tenant_plan NOT NULL DEFAULT 'essential',
    status public.saas_subscription_status NOT NULL DEFAULT 'trial',
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly', -- 'monthly'
    amount NUMERIC(10, 2) NOT NULL DEFAULT 59.90,
    asaas_customer_id VARCHAR(100),
    asaas_subscription_id VARCHAR(100) UNIQUE,
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    grace_period_days INTEGER NOT NULL DEFAULT 5,
    trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
    canceled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    last_payment_at TIMESTAMPTZ,
    last_webhook_event VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_saas_subscriptions_tenant UNIQUE (tenant_id)
);

-- 3. TABELA DE HISTÓRICO DE COBRANÇAS / FATURAS (SAAS_INVOICES)
CREATE TABLE IF NOT EXISTS public.saas_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.saas_subscriptions(id) ON DELETE SET NULL,
    asaas_payment_id VARCHAR(100) NOT NULL UNIQUE,
    invoice_number VARCHAR(100),
    amount NUMERIC(10, 2) NOT NULL,
    status public.saas_invoice_status NOT NULL DEFAULT 'pending',
    billing_type VARCHAR(30) NOT NULL DEFAULT 'UNDEFINED', -- 'PIX', 'CREDIT_CARD', 'BOLETO'
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    invoice_url TEXT,
    bank_slip_url TEXT,
    pix_qr_code TEXT,
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. ÍNDICES DE PERFORMANCE E INTEGRIDADE
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_tenant ON public.saas_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON public.saas_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_asaas_sub ON public.saas_subscriptions(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_tenant ON public.saas_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_saas_invoices_asaas_payment ON public.saas_invoices(asaas_payment_id);

-- 5. TRIGGER DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
CREATE OR REPLACE FUNCTION public.trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_saas_subscriptions_updated_at ON public.saas_subscriptions;
CREATE TRIGGER trg_saas_subscriptions_updated_at
    BEFORE UPDATE ON public.saas_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_saas_invoices_updated_at ON public.saas_invoices;
CREATE TRIGGER trg_saas_invoices_updated_at
    BEFORE UPDATE ON public.saas_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_set_updated_at();

-- 6. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_invoices ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS RLS: Apenas Proprietários e Administradores do Tenant Podem Ler
DROP POLICY IF EXISTS "tenant_manage_saas_subscriptions" ON public.saas_subscriptions;
CREATE POLICY "tenant_manage_saas_subscriptions"
    ON public.saas_subscriptions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = saas_subscriptions.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

DROP POLICY IF EXISTS "tenant_view_saas_invoices" ON public.saas_invoices;
CREATE POLICY "tenant_view_saas_invoices"
    ON public.saas_invoices
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = saas_invoices.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

-- 8. RPC ATÔMICA: Inicializa ou Busca Assinatura do Tenant
CREATE OR REPLACE FUNCTION public.get_or_create_tenant_subscription(
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
    v_amount NUMERIC(10, 2);
BEGIN
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não encontrado.');
    END IF;

    -- Valor conforme o plano cadastrado
    IF v_tenant.plan = 'smart' THEN
        v_amount := 99.90;
    ELSE
        v_amount := 59.90;
    END IF;

    -- Busca assinatura existente
    SELECT * INTO v_sub FROM public.saas_subscriptions WHERE tenant_id = p_tenant_id;

    -- Se não existir, inicializa em trial ou com o plano atual
    IF v_sub IS NULL THEN
        INSERT INTO public.saas_subscriptions (
            tenant_id,
            plan,
            status,
            amount,
            current_period_start,
            current_period_end,
            trial_ends_at
        )
        VALUES (
            p_tenant_id,
            v_tenant.plan,
            'trial',
            v_amount,
            now(),
            now() + INTERVAL '14 days',
            now() + INTERVAL '14 days'
        )
        RETURNING * INTO v_sub;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'subscription', to_jsonb(v_sub)
    );
END;
$$;
