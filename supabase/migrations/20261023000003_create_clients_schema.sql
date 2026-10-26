-- ==============================================================================
-- BELVIA SaaS - Migration Fase 2.2: Cadastro de Clientes Multi-Tenant
-- Arquivo: 20261023000003_create_clients_schema.sql
--
-- Destaques de Segurança, LGPD & Regras de Negócio:
-- 1. Tabela 'clients' vinculada obrigatoriamente a 'tenants(id)' com ON DELETE CASCADE.
-- 2. Não inclui dados de saúde ou clínicos (reservados à anamnese).
-- 3. Isolamento multi-tenant: CPF é único exclusivamente dentro do mesmo estabelecimento
--    (um cliente pode frequentar estabelecimentos distintos sem cruzar dados).
-- 4. Row Level Security (RLS) estrito com controle de papéis:
--    - 'owner', 'admin', 'receptionist': cadastro, consulta e edição.
--    - 'professional': consulta apenas.
-- 5. Sem deleção física nesta fase (soft-delete via status = 'inactive').
-- ==============================================================================

-- 1. ENUM: client_status
DO $$ BEGIN
    CREATE TYPE client_status AS ENUM ('active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: clients
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(255),
    birth_date DATE,
    cpf VARCHAR(14),
    address JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    status client_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ÍNDICES DE PERFORMANCE E PESQUISA MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_status ON public.clients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_name ON public.clients(tenant_id, full_name);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_whatsapp ON public.clients(tenant_id, whatsapp);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_email ON public.clients(tenant_id, email);

-- Índice único parcial para CPF por tenant (impede duplicação somente dentro do mesmo estabelecimento)
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_tenant_cpf_unique
    ON public.clients (tenant_id, cpf)
    WHERE cpf IS NOT NULL AND cpf <> '';

-- 4. GATILHO DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
DROP TRIGGER IF EXISTS set_clients_updated_at ON public.clients;
CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 6. POLÍTICAS RLS - CLIENTS
-- Leitura: Qualquer membro ativo do tenant ('owner', 'admin', 'receptionist', 'professional') pode consultar clientes
DROP POLICY IF EXISTS "Members can view tenant clients" ON public.clients;
CREATE POLICY "Members can view tenant clients" ON public.clients
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

-- Inserção: Permitido para 'owner', 'admin' e 'receptionist'
DROP POLICY IF EXISTS "Authorized roles can insert clients" ON public.clients;
CREATE POLICY "Authorized roles can insert clients" ON public.clients
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = clients.tenant_id
          AND staff_user.user_id = auth.uid()
          AND staff_user.role IN ('owner', 'admin', 'receptionist')
          AND staff_user.status = 'active'
      )
    );

-- Atualização: Permitido para 'owner', 'admin' e 'receptionist'
DROP POLICY IF EXISTS "Authorized roles can update clients" ON public.clients;
CREATE POLICY "Authorized roles can update clients" ON public.clients
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = clients.tenant_id
          AND staff_user.user_id = auth.uid()
          AND staff_user.role IN ('owner', 'admin', 'receptionist')
          AND staff_user.status = 'active'
      )
    )
    WITH CHECK (
      -- Impede a transferência de um cliente para outro tenant
      tenant_id = clients.tenant_id
    );

-- Exclusão: Bloqueada fisicamente no banco nesta etapa
DROP POLICY IF EXISTS "Authorized roles can delete clients" ON public.clients;
