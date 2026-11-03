-- ==============================================================================
-- ZELUNIA / ALCÂNTARA HUB — TABELAS M2M ADMINISTRATIVAS OBRIGATÓRIAS
-- 1. public.hub_m2m_nonces: Proteção anti-replay distribuída estrita (fail-closed)
-- 2. public.hub_admin_audit_logs: Trilha de auditoria persistente obrigatória
-- 3. public.hub_admin_idempotency_keys: Registro de idempotência por intenção
-- ==============================================================================

-- 1. Tabela de Nonces M2M Anti-Replay
CREATE TABLE IF NOT EXISTS public.hub_m2m_nonces (
  nonce VARCHAR(128) PRIMARY KEY,
  key_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.hub_m2m_nonces ENABLE ROW LEVEL SECURITY;
-- RLS habilitada sem policies públicas: acessível exclusivamente via service_role (bypass RLS)

CREATE INDEX IF NOT EXISTS idx_hub_m2m_nonces_expires_at ON public.hub_m2m_nonces (expires_at);
COMMENT ON TABLE public.hub_m2m_nonces IS 'Armazena nonces M2M anti-replay utilizados pelo Alcântara Hub com expiração de 10 minutos (fail-closed, restrito a service_role).';

-- 2. Tabela de Trilha de Auditoria Obrigatória Sanitizada (LGPD Zero PII)
CREATE TABLE IF NOT EXISTS public.hub_admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(32) NOT NULL DEFAULT 'HUB_ADMIN_M2M',
  action VARCHAR(64) NOT NULL,
  key_id VARCHAR(64) NOT NULL,
  method VARCHAR(16) NOT NULL,
  path VARCHAR(255) NOT NULL,
  status_code INT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.hub_admin_audit_logs ENABLE ROW LEVEL SECURITY;
-- RLS habilitada sem policies públicas: acessível exclusivamente via service_role (bypass RLS)

CREATE INDEX IF NOT EXISTS idx_hub_admin_audit_created ON public.hub_admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hub_admin_audit_tenant ON public.hub_admin_audit_logs (tenant_id);
COMMENT ON TABLE public.hub_admin_audit_logs IS 'Trilha oficial auditável de operações do Alcântara Hub com verificação de conformidade fail-closed (restrito a service_role).';

-- 3. Tabela de Idempotência Distribuída por Intenção
CREATE TABLE IF NOT EXISTS public.hub_admin_idempotency_keys (
  intent_key VARCHAR(128) PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  operation VARCHAR(64) NOT NULL,
  response_payload JSONB NOT NULL,
  status_code INT NOT NULL DEFAULT 200,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.hub_admin_idempotency_keys ENABLE ROW LEVEL SECURITY;
-- RLS habilitada sem policies públicas: acessível exclusivamente via service_role (bypass RLS)
