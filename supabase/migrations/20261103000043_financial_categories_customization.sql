-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 4.4: Categorias Financeiras Personalizadas por Tenant
-- Arquivo: supabase/migrations/20261103000043_financial_categories_customization.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Homologação & Blindagem Multi-Tenant (Prompt 186/187):
-- 1. Unicidade Insensível a Maiúsculas e Espaços (case-insensitive + trim):
--    - Índice único funcional em (tenant_id, type, lower(trim(name))) para categorias do tenant.
--    - Índice único funcional em (type, lower(trim(name))) WHERE tenant_id IS NULL para categorias globais.
-- 2. Integridade e Imutabilidade das Categorias Globais / Sistema:
--    - Trigger no PostgreSQL impedindo UPDATE ou DELETE onde is_system = true.
--    - Bloqueio estrito no trigger contra mutação de tenant_id ou promoção de is_system para true em UPDATE.
-- 3. Blindagem de Inserção:
--    - RLS WITH CHECK força is_system = false e tenant_id NOT NULL para usuários do tenant.
-- 4. RLS de Menor Privilégio:
--    - Leitura aberta para membros ativos do tenant (e categorias globais).
--    - Inserção liberada para 'owner', 'admin' e 'receptionist'.
--    - Alteração/Exclusão restrita a 'owner' e 'admin' para suas próprias categorias.
-- ==============================================================================

-- 1. ENUMS E TIPOS
DO $$ BEGIN
    CREATE TYPE financial_category_type AS ENUM ('supply', 'bleed', 'expense', 'operating_expense');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: financial_categories
CREATE TABLE IF NOT EXISTS public.financial_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type financial_category_type NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. ÍNDICES DE UNICIDADE INSENSÍVEIS A MAIÚSCULAS/MINÚSCULAS E ESPAÇOS
-- 3.1 Unicidade para Categorias Personalizadas por Tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_categories_tenant_type_ci_name
    ON public.financial_categories (tenant_id, type, lower(trim(name)))
    WHERE tenant_id IS NOT NULL;

-- 3.2 Unicidade para Categorias Globais do Sistema (tenant_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_categories_global_type_ci_name
    ON public.financial_categories (type, lower(trim(name)))
    WHERE tenant_id IS NULL;

-- 3.3 Índices de Alta Eficiência para Consultas
CREATE INDEX IF NOT EXISTS idx_financial_categories_tenant_type ON public.financial_categories(tenant_id, type, status);
CREATE INDEX IF NOT EXISTS idx_financial_categories_type_system ON public.financial_categories(type, is_system);

-- 4. TRIGGER DE ATUALIZAÇÃO AUTOMÁTICA (updated_at)
DROP TRIGGER IF EXISTS set_financial_categories_updated_at ON public.financial_categories;
CREATE TRIGGER set_financial_categories_updated_at
    BEFORE UPDATE ON public.financial_categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. TRIGGER DE PROTEÇÃO CONTRA ALTERAÇÃO DE IDENTIDADE E CATEGORIAS DO SISTEMA
CREATE OR REPLACE FUNCTION public.protect_system_financial_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Bloqueia exclusão de categorias padrão do sistema
    IF (TG_OP = 'DELETE' AND OLD.is_system = true) THEN
        RAISE EXCEPTION 'Operação inválida: categorias padrão do sistema não podem ser excluídas.';
    END IF;

    -- Bloqueia alteração de categorias padrão do sistema
    IF (TG_OP = 'UPDATE' AND OLD.is_system = true) THEN
        RAISE EXCEPTION 'Operação inválida: categorias padrão do sistema são imutáveis.';
    END IF;

    -- Em caso de UPDATE de categoria personalizada, impede promoção para sistema ou transferência entre tenants
    IF (TG_OP = 'UPDATE') THEN
        IF (NEW.is_system = true AND OLD.is_system = false) THEN
            RAISE EXCEPTION 'Operação inválida: não é permitido promover categorias personalizadas para o status de sistema.';
        END IF;

        IF (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id) THEN
            RAISE EXCEPTION 'Operação inválida: não é permitido transferir categorias entre estabelecimentos (tenant_id imutável).';
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_protect_system_financial_categories ON public.financial_categories;
CREATE TRIGGER trigger_protect_system_financial_categories
    BEFORE UPDATE OR DELETE ON public.financial_categories
    FOR EACH ROW EXECUTE FUNCTION public.protect_system_financial_categories();

-- 6. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

-- 6.1 Política de Leitura: Usuários do tenant podem ver categorias do seu tenant E categorias globais do sistema
DROP POLICY IF EXISTS "Users can view financial categories of their tenant or system" ON public.financial_categories;
CREATE POLICY "Users can view financial categories of their tenant or system" ON public.financial_categories
    FOR SELECT
    USING (
        is_system = true 
        OR tenant_id IS NULL
        OR EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = financial_categories.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.status = 'active'
        )
    );

-- 6.2 Política de Inserção: Apenas 'owner', 'admin' ou 'receptionist' do tenant, forçando is_system = false
DROP POLICY IF EXISTS "Management can insert financial categories for their tenant" ON public.financial_categories;
CREATE POLICY "Management can insert financial categories for their tenant" ON public.financial_categories
    FOR INSERT
    WITH CHECK (
        tenant_id IS NOT NULL
        AND is_system = false
        AND EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = financial_categories.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin', 'receptionist')
              AND staff.status = 'active'
        )
    );

-- 6.3 Política de Atualização: Apenas 'owner' e 'admin' para categorias customizadas do seu próprio tenant
DROP POLICY IF EXISTS "Management can update custom financial categories" ON public.financial_categories;
CREATE POLICY "Management can update custom financial categories" ON public.financial_categories
    FOR UPDATE
    USING (
        tenant_id IS NOT NULL
        AND is_system = false
        AND EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = financial_categories.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IS NOT NULL
        AND is_system = false
        AND EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = financial_categories.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

-- 6.4 Política de Exclusão: Apenas 'owner' e 'admin' para categorias customizadas do seu próprio tenant
DROP POLICY IF EXISTS "Management can delete custom financial categories" ON public.financial_categories;
CREATE POLICY "Management can delete custom financial categories" ON public.financial_categories
    FOR DELETE
    USING (
        tenant_id IS NOT NULL
        AND is_system = false
        AND EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = financial_categories.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

-- 7. CARGA INICIAL DE CATEGORIAS PADRÃO DO SISTEMA (is_system = true, tenant_id = NULL)
INSERT INTO public.financial_categories (tenant_id, name, type, is_system, status)
VALUES
    -- Suprimento de Caixa (supply)
    (NULL, 'Reforço de Troco', 'supply', true, 'active'),
    (NULL, 'Aporte Inicial / Fundo de Caixa', 'supply', true, 'active'),
    (NULL, 'Outro Suprimento', 'supply', true, 'active'),

    -- Sangria de Caixa (bleed)
    (NULL, 'Recolhimento para Cofre', 'bleed', true, 'active'),
    (NULL, 'Depósito Bancário', 'bleed', true, 'active'),
    (NULL, 'Retirada de Pró-labore', 'bleed', true, 'active'),
    (NULL, 'Outra Retirada', 'bleed', true, 'active'),

    -- Despesa em Dinheiro (expense - Gaveta do Caixa)
    (NULL, 'Insumos de Consumo / Café / Limpeza', 'expense', true, 'active'),
    (NULL, 'Frete / Transporte / Correios', 'expense', true, 'active'),
    (NULL, 'Manutenção Rápida', 'expense', true, 'active'),
    (NULL, 'Alimentação / Lanche Equipe', 'expense', true, 'active'),
    (NULL, 'Outras Despesas em Espécie', 'expense', true, 'active'),

    -- Despesas Operacionais Gerais / Contas a Pagar (operating_expense)
    (NULL, 'Insumos & Descartáveis', 'operating_expense', true, 'active'),
    (NULL, 'Aluguel & Condomínio', 'operating_expense', true, 'active'),
    (NULL, 'Energia & Água', 'operating_expense', true, 'active'),
    (NULL, 'Software & TI', 'operating_expense', true, 'active'),
    (NULL, 'Marketing & Publicidade', 'operating_expense', true, 'active'),
    (NULL, 'Folha & Pró-labore', 'operating_expense', true, 'active'),
    (NULL, 'Manutenção & Limpeza', 'operating_expense', true, 'active'),
    (NULL, 'Tributos & Taxas', 'operating_expense', true, 'active'),
    (NULL, 'Outras Despesas Operacionais', 'operating_expense', true, 'active')
ON CONFLICT DO NOTHING;
