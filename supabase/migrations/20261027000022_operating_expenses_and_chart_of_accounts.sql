-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 4.3.3: Despesas Operacionais e Contas a Pagar
-- Arquivo: supabase/migrations/20261027000022_operating_expenses_and_chart_of_accounts.sql
-- 
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança Contábil:
-- 1. Segregação Contábil Plena:
--    - due_date: data de vencimento.
--    - competence_date: mês/data da competência contábil (ex: consumo do mês).
--    - paid_at: data exata de liquidação financeira (Regime de Caixa).
-- 2. Controle de Situação:
--    - status: 'pending', 'paid', 'canceled'.
-- 3. Prevenção de Duplicidade Caixa vs. Banco:
--    - payment_source: 'bank_account', 'cash_register', 'credit_card', 'other'.
--    - cash_movement_id: vínculo com a gaveta de caixa se paga em espécie.
--    - Em caso de pagamento em dinheiro com baixa automática, vincula ao cash_movement
--      para garantir que o DRE ou relatório nunca some a despesa duas vezes.
-- 4. RLS & Menor Privilégio:
--    - Apenas 'owner' e 'admin' ativos do tenant têm alçada de visualização e gestão.
-- 5. Imutabilidade e Trilha Auditável:
--    - Bloqueio de DELETE físico por trigger; despesas canceladas recebem status = 'canceled'.
-- ==============================================================================

-- 1. ENUMS CONTÁBEIS
DO $$ BEGIN
    CREATE TYPE expense_payment_source AS ENUM ('bank_account', 'cash_register', 'credit_card', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE operating_expense_status AS ENUM ('pending', 'paid', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: operating_expenses (Contas a Pagar e Despesas Operacionais)
CREATE TABLE IF NOT EXISTS public.operating_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    category VARCHAR(100) NOT NULL, -- Ex: 'Aluguel & Condomínio', 'Insumos Clínicos', 'Energia & Água', 'Software & TI', 'Marketing', 'Tributos', 'Folha & Pró-labore', 'Outras Despesas'
    description TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
    payment_source expense_payment_source NOT NULL DEFAULT 'bank_account',
    status operating_expense_status NOT NULL DEFAULT 'pending',
    due_date DATE NOT NULL, -- Vencimento da obrigação
    competence_date DATE NOT NULL DEFAULT CURRENT_DATE, -- Mês/competência contábil
    paid_at TIMESTAMPTZ, -- Data efetiva de liquidação financeira
    payment_method VARCHAR(50), -- Forma (pix, boleto, debito, transferencia, dinheiro)
    recipient VARCHAR(150), -- Favorecido / Fornecedor
    cash_movement_id UUID, -- Vinculado se saiu do Caixa Diário
    notes TEXT,
    registered_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints Multi-Tenant Compostas
    CONSTRAINT uq_operating_expenses_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_expenses_cash_movement FOREIGN KEY (cash_movement_id)
        REFERENCES public.cash_movements(id) ON DELETE SET NULL
);

-- Índices de Alta Eficiência
CREATE INDEX IF NOT EXISTS idx_operating_expenses_tenant_status ON public.operating_expenses(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_tenant_due ON public.operating_expenses(tenant_id, due_date DESC);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_tenant_comp ON public.operating_expenses(tenant_id, competence_date DESC);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_tenant_paid ON public.operating_expenses(tenant_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_category ON public.operating_expenses(tenant_id, category);

-- 3. TRIGGER DE ATUALIZAÇÃO DE DATA (updated_at)
DROP TRIGGER IF EXISTS set_operating_expenses_updated_at ON public.operating_expenses;
CREATE TRIGGER set_operating_expenses_updated_at
    BEFORE UPDATE ON public.operating_expenses
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. BLOQUEIO DE EXCLUSÃO FÍSICA (Princípio Contábil de Auditoria)
CREATE OR REPLACE FUNCTION public.prevent_operating_expenses_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Proibida a exclusão física de registros contábeis de despesas. Utilize cancelamento ou lançamento compensatório.';
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_operating_expenses_delete ON public.operating_expenses;
CREATE TRIGGER trigger_prevent_operating_expenses_delete
    BEFORE DELETE ON public.operating_expenses
    FOR EACH ROW EXECUTE FUNCTION public.prevent_operating_expenses_deletion();

-- 5. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.operating_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management can view operating expenses" ON public.operating_expenses
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = operating_expenses.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Management can insert operating expenses" ON public.operating_expenses
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = operating_expenses.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Management can update operating expenses" ON public.operating_expenses
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = operating_expenses.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    )
    WITH CHECK (
        tenant_id = operating_expenses.tenant_id
    );

GRANT SELECT, INSERT, UPDATE ON public.operating_expenses TO authenticated, service_role;
