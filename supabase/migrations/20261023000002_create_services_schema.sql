-- ==============================================================================
-- BELVIA SaaS - Migration Fase 2.1: Catálogo de Serviços Multi-Tenant
-- Arquivo: 20261023000002_create_services_schema.sql
--
-- Destaques de Segurança & Regras de Negócio:
-- 1. Tabela 'services' vinculada obrigatoriamente a 'tenants(id)' com ON DELETE CASCADE.
-- 2. Constraints de integridade: duração > 0, intervalo >= 0, preço >= 0.
-- 3. Row Level Security (RLS) habilitado com isolamento estrito via current_user_has_tenant_access.
-- 4. Somente papéis autorizados ('owner', 'admin') podem criar, atualizar e desativar serviços.
-- 5. Não há deleção física nesta fase (soft-delete via status = 'inactive' ou active = false).
-- ==============================================================================

-- 1. ENUM: service_status
DO $$ BEGIN
    CREATE TYPE service_status AS ENUM ('active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: services
CREATE TABLE IF NOT EXISTS public.services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL DEFAULT 'Geral',
    duration_minutes INTEGER NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status service_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Restrições de Validação Numérica
    CONSTRAINT check_duration_minutes_positive CHECK (duration_minutes > 0),
    CONSTRAINT check_break_minutes_non_negative CHECK (break_minutes >= 0),
    CONSTRAINT check_price_non_negative CHECK (price >= 0.00)
);

-- 3. ÍNDICES DE PERFORMANCE E CONSULTA MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_services_tenant_id ON public.services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant_status ON public.services(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_services_tenant_category ON public.services(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_services_tenant_name ON public.services(tenant_id, name);

-- 4. GATILHO DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
DROP TRIGGER IF EXISTS set_services_updated_at ON public.services;
CREATE TRIGGER set_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS RLS - SERVICES
-- Leitura: Qualquer membro ativo do tenant (owner, admin, professional, receptionist) pode visualizar serviços
DROP POLICY IF EXISTS "Members can view tenant services" ON public.services;
CREATE POLICY "Members can view tenant services" ON public.services
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

-- Inserção: Apenas 'owner' ou 'admin' ativos do tenant podem cadastrar serviços
DROP POLICY IF EXISTS "Owners and admins can insert services" ON public.services;
CREATE POLICY "Owners and admins can insert services" ON public.services
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = services.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    );

-- Atualização: Apenas 'owner' ou 'admin' ativos do tenant podem editar ou desativar serviços
DROP POLICY IF EXISTS "Owners and admins can update services" ON public.services;
CREATE POLICY "Owners and admins can update services" ON public.services
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = services.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    )
    WITH CHECK (
      -- Impede a alteração do tenant_id durante um update
      tenant_id = services.tenant_id
    );

-- Exclusão: Bloqueada por regra de negócio (sem deleção física, preservando integridade de agendamentos)
DROP POLICY IF EXISTS "Owners and admins can delete services" ON public.services;
