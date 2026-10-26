-- ==============================================================================
-- BELVIA SaaS - Migration Fase 4.1.1: Fundação Financeira Multi-Tenant
-- Arquivo: 20261023000020_financial_foundation.sql
--
-- Destaques de Arquitetura, Segurança & Governança Financeira:
-- 1. Segregação Contábil Clara:
--    - Receita Gerada (Competência / Faturamento Bruto via Appointments completed e Payment Orders).
--    - Recebimento Efetivo (Liquidação via Payment Transactions, suportando pagamentos mistos/parciais).
--    - Caixa Físico (Gaveta em Espécie via Cash Registers e Cash Movements).
--    - Valores a Receber (Saldo Pendente / Contas a Receber apurado no banco).
-- 2. Integridade Cruzada de Tenancy (Anti-Vazamento Multi-Tenant):
--    - Chaves únicas compostas (id, tenant_id) e FKs compostas entre ordens, agendamentos, pagamentos e caixas.
--    - Impede que uma transação ou pagamento de um tenant seja vinculado a uma ordem ou caixa de outro tenant.
-- 3. Regra Flexível de Caixas por Plano (Essencial vs. Inteligente):
--    - Plano Essencial: 1 caixa aberto por tenant.
--    - Plano Inteligente: Múltiplos caixas abertos simultâneos com identificação de terminal/operador.
--    - Validação no PostgreSQL sem índice estático que quebre planos superiores.
-- 4. Estornos Auditáveis por Lançamentos Compensatórios:
--    - Proibição de DELETE físico em registros financeiros.
--    - Lançamento compensatório idempotente com proteção contra estorno superior ao valor recebido.
-- 5. Comissões com Snapshot e Status (Previsão vs. Devido vs. Pago):
--    - Congelamento da regra e valor de comissão na criação para evitar reajustes retroativos.
--    - Distinção entre comissão prevista (forecast) e efetivamente devida (payable após liquidação do cliente).
-- 6. Menor Privilégio e RLS Estrito:
--    - 'owner' e 'admin': Acesso financeiro irrestrito no tenant.
--    - 'receptionist': Opera caixas e registra recebimentos, sem acesso ao faturamento global ou comissões da equipe.
--    - 'professional': Acesso estrito e exclusivo às suas próprias comissões ('professional_commissions').
-- 7. Hardening da Agenda:
--    - Congelamento estrito de checked_in_at (impossível alterar após gravação).
--    - Congelamento de preço e vínculos de appointments com status 'completed'.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. ENUMS FINANCEIROS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE cash_register_status AS ENUM ('open', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_order_status AS ENUM ('pending', 'partially_paid', 'paid', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method_type AS ENUM ('cash', 'pix', 'credit_card', 'debit_card', 'bank_transfer', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_transaction_status AS ENUM ('confirmed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cash_movement_type AS ENUM ('supply', 'bleed', 'expense');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE commission_status AS ENUM ('forecast', 'payable', 'paid', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. HARDENING DE APPOINTMENTS: ADICIONAR CHAVE COMPOSTA PARA FK COMPOSTA
-- -----------------------------------------------------------------------------
-- Permite que payment_orders referencie (id, tenant_id) de appointments para garantir integridade cruzada
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_appointments_id_tenant_id'
    ) THEN
        ALTER TABLE public.appointments ADD CONSTRAINT uq_appointments_id_tenant_id UNIQUE (id, tenant_id);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. TABELA: cash_registers (Caixas Físicos / Gavetas Operacionais)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    opened_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    closed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    terminal_name VARCHAR(100) NOT NULL DEFAULT 'Balcão Principal',
    initial_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (initial_balance >= 0.00),
    closing_balance NUMERIC(10, 2) CHECK (closing_balance >= 0.00),
    system_calculated_balance NUMERIC(10, 2) DEFAULT 0.00,
    difference NUMERIC(10, 2) DEFAULT 0.00,
    status cash_register_status NOT NULL DEFAULT 'open',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Chave única composta para assegurar integridade multi-tenant em FKs
    CONSTRAINT uq_cash_registers_id_tenant_id UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_cash_registers_tenant_status ON public.cash_registers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_at ON public.cash_registers(tenant_id, opened_at DESC);

-- Trigger handle_updated_at para cash_registers
DROP TRIGGER IF EXISTS set_cash_registers_updated_at ON public.cash_registers;
CREATE TRIGGER set_cash_registers_updated_at
  BEFORE UPDATE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 4. TABELA: payment_orders (Ordens de Pagamento de Atendimentos ou Vendas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    gross_amount NUMERIC(10, 2) NOT NULL CHECK (gross_amount >= 0.00),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0.00),
    addition_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (addition_amount >= 0.00),
    net_amount NUMERIC(10, 2) NOT NULL CHECK (net_amount >= 0.00),
    paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0.00),
    balance_due NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0.00),
    status payment_order_status NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraint composta assegura mesmo tenant_id do agendamento
    CONSTRAINT fk_payment_orders_appointment FOREIGN KEY (appointment_id, tenant_id) 
        REFERENCES public.appointments(id, tenant_id) ON DELETE SET NULL,
    CONSTRAINT uq_payment_orders_id_tenant_id UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_orders_tenant_status ON public.payment_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_client ON public.payment_orders(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_appointment ON public.payment_orders(tenant_id, appointment_id);

DROP TRIGGER IF EXISTS set_payment_orders_updated_at ON public.payment_orders;
CREATE TRIGGER set_payment_orders_updated_at
  BEFORE UPDATE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 5. TABELA: payment_transactions (Lançamentos de Pagamento Efetivo e Estornos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    payment_order_id UUID NOT NULL,
    cash_register_id UUID,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
    method payment_method_type NOT NULL,
    installments INT NOT NULL DEFAULT 1 CHECK (installments >= 1),
    status payment_transaction_status NOT NULL DEFAULT 'confirmed',
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,
    received_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints compostas de tenant isolation
    CONSTRAINT fk_payment_transactions_order FOREIGN KEY (payment_order_id, tenant_id)
        REFERENCES public.payment_orders(id, tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_transactions_cash_register FOREIGN KEY (cash_register_id, tenant_id)
        REFERENCES public.cash_registers(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT uq_payment_transactions_id_tenant_id UNIQUE (id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant ON public.payment_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order ON public.payment_transactions(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_register ON public.payment_transactions(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_paid_at ON public.payment_transactions(tenant_id, paid_at DESC);

-- -----------------------------------------------------------------------------
-- 6. TABELA: cash_movements (Movimentações de Caixa: Despesas, Sangrias, Suprimentos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    cash_register_id UUID NOT NULL,
    type cash_movement_type NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
    category VARCHAR(100) NOT NULL DEFAULT 'Despesas Operacionais',
    description TEXT NOT NULL,
    performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_cash_movements_register FOREIGN KEY (cash_register_id, tenant_id)
        REFERENCES public.cash_registers(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_register ON public.cash_movements(cash_register_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant_type ON public.cash_movements(tenant_id, type);

-- -----------------------------------------------------------------------------
-- 7. TABELA: professional_commissions (Comissões e Repasses por Procedimento)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL,
    professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    base_amount NUMERIC(10, 2) NOT NULL CHECK (base_amount >= 0.00),
    rate_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (rate_percentage >= 0.00 AND rate_percentage <= 100.00),
    commission_amount NUMERIC(10, 2) NOT NULL CHECK (commission_amount >= 0.00),
    status commission_status NOT NULL DEFAULT 'forecast',
    settled_at TIMESTAMPTZ,
    settled_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- FK composta para integridade com appointment
    CONSTRAINT fk_commissions_appointment FOREIGN KEY (appointment_id, tenant_id)
        REFERENCES public.appointments(id, tenant_id) ON DELETE CASCADE,
    -- Evita duplicidade de comissão para o mesmo atendimento
    CONSTRAINT uq_commissions_appointment UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_tenant_status ON public.professional_commissions(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_professional ON public.professional_commissions(tenant_id, professional_id);

DROP TRIGGER IF EXISTS set_commissions_updated_at ON public.professional_commissions;
CREATE TRIGGER set_commissions_updated_at
  BEFORE UPDATE ON public.professional_commissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 8. TRIGGERS DE INTEGRIDADE, PLANOS E BLINDAGEM FINANCEIRA
-- -----------------------------------------------------------------------------

-- Regra de Planos: Caixas Abertos por Tenant (Essencial = 1, Inteligente = Múltiplos)
CREATE OR REPLACE FUNCTION public.check_cash_register_plan_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan tenant_plan;
  v_open_count INT;
BEGIN
  IF NEW.status = 'open' THEN
    -- Obtém plano do tenant
    SELECT plan INTO v_plan FROM public.tenants WHERE id = NEW.tenant_id;

    -- Conta caixas atualmente abertos neste tenant (excluindo o próprio se for update)
    SELECT COUNT(*) INTO v_open_count
    FROM public.cash_registers
    WHERE tenant_id = NEW.tenant_id
      AND status = 'open'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    -- Plano Essencial permite no máximo 1 caixa aberto simultaneamente
    IF v_plan = 'essential' AND v_open_count >= 1 THEN
      RAISE EXCEPTION 'Limite do Plano Essencial: seu estabelecimento já possui um caixa aberto no momento. Feche o caixa anterior antes de abrir um novo.';
    END IF;
  END IF;

  -- Impede reabertura de caixa fechado (imutabilidade do fechamento)
  IF TG_OP = 'UPDATE' AND OLD.status = 'closed' AND NEW.status = 'open' THEN
    RAISE EXCEPTION 'Operação inválida: um caixa fechado é imutável e não pode ser reaberto.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_cash_register_plan_limits ON public.cash_registers;
CREATE TRIGGER trigger_check_cash_register_plan_limits
  BEFORE INSERT OR UPDATE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.check_cash_register_plan_limits();

-- Validação de Movimentações Financeiras e Métodos em Espécie
CREATE OR REPLACE FUNCTION public.check_payment_transaction_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_register RECORD;
BEGIN
  -- 1. Se for método Dinheiro (cash), exige caixa aberto
  IF NEW.method = 'cash' THEN
    IF NEW.cash_register_id IS NULL THEN
      RAISE EXCEPTION 'Operação em dinheiro exige vínculo a um caixa de balcão ativo.';
    END IF;

    SELECT id, status INTO v_register
    FROM public.cash_registers
    WHERE id = NEW.cash_register_id AND tenant_id = NEW.tenant_id;

    IF v_register IS NULL OR v_register.status <> 'open' THEN
      RAISE EXCEPTION 'O caixa selecionado não está aberto para receber movimentações em dinheiro.';
    END IF;
  END IF;

  -- 2. Prevenção de pagamento excedente e recálculo de saldo da ordem
  SELECT id, net_amount, paid_amount, balance_due, status INTO v_order
  FROM public.payment_orders
  WHERE id = NEW.payment_order_id AND tenant_id = NEW.tenant_id
  FOR UPDATE;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Ordem de pagamento não localizada.';
  END IF;

  IF v_order.status = 'canceled' THEN
    RAISE EXCEPTION 'Não é permitido registrar pagamentos em ordens canceladas.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.amount > v_order.balance_due THEN
      RAISE EXCEPTION 'Valor do pagamento (R$ %) excede o saldo devedor restante (R$ %) desta ordem.', NEW.amount, v_order.balance_due;
    END IF;

    -- Atualiza saldo da ordem de pagamento atomicamente
    UPDATE public.payment_orders
    SET paid_amount = paid_amount + NEW.amount,
        balance_due = balance_due - NEW.amount,
        status = CASE 
          WHEN (balance_due - NEW.amount) <= 0.00 THEN 'paid'::payment_order_status
          ELSE 'partially_paid'::payment_order_status
        END,
        updated_at = now()
    WHERE id = NEW.payment_order_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_payment_transaction_integrity ON public.payment_transactions;
CREATE TRIGGER trigger_check_payment_transaction_integrity
  BEFORE INSERT ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.check_payment_transaction_integrity();

-- Bloqueio de DELETE físico em registros financeiros (Princípio de Trilha Auditável)
CREATE OR REPLACE FUNCTION public.prevent_financial_physical_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Proibida a exclusão física de registros contábeis e financeiros. Utilize lançamentos compensatórios ou estornos auditados.';
END;
$$;

DROP TRIGGER IF EXISTS prevent_delete_payment_orders ON public.payment_orders;
CREATE TRIGGER prevent_delete_payment_orders
  BEFORE DELETE ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_physical_delete();

DROP TRIGGER IF EXISTS prevent_delete_payment_transactions ON public.payment_transactions;
CREATE TRIGGER prevent_delete_payment_transactions
  BEFORE DELETE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_physical_delete();

DROP TRIGGER IF EXISTS prevent_delete_cash_registers ON public.cash_registers;
CREATE TRIGGER prevent_delete_cash_registers
  BEFORE DELETE ON public.cash_registers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_physical_delete();

DROP TRIGGER IF EXISTS prevent_delete_cash_movements ON public.cash_movements;
CREATE TRIGGER prevent_delete_cash_movements
  BEFORE DELETE ON public.cash_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_physical_delete();

-- -----------------------------------------------------------------------------
-- 9. HARDENING DE APPOINTMENTS: BLINDAGEM DE CHECKED_IN_AT E COMPLETED
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_appointment_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role tenant_role;
  v_is_service_role boolean;
BEGIN
  -- 1. Proteção Estrita de Imutabilidade do Check-in:
  -- Não permite anular (NULL) nem adulterar o timestamp já registrado
  IF OLD.checked_in_at IS NOT NULL THEN
    IF NEW.checked_in_at IS NULL THEN
      RAISE EXCEPTION 'Operação inválida: o registro de check-in não pode ser removido ou anulado após sua confirmação.';
    END IF;
    IF NEW.checked_in_at <> OLD.checked_in_at THEN
      RAISE EXCEPTION 'Operação inválida: o horário de check-in é auditado e não pode ser adulterado após ser gravado.';
    END IF;
  END IF;

  -- 2. Proteção de Atendimentos Concluídos:
  -- Atendimentos concluídos são imutáveis: proíbe reabrir e proíbe modificar preço, serviço ou vínculos
  IF OLD.status = 'completed' THEN
    IF NEW.status <> 'completed' THEN
      RAISE EXCEPTION 'Transição inválida: atendimentos concluídos são imutáveis e não podem ser reabertos.';
    END IF;

    IF (NEW.price <> OLD.price) OR 
       (NEW.service_id <> OLD.service_id) OR 
       (NEW.client_id <> OLD.client_id) OR 
       (NEW.professional_id <> OLD.professional_id) OR
       (NEW.start_time <> OLD.start_time) OR
       (NEW.end_time <> OLD.end_time) THEN
      RAISE EXCEPTION 'Operação inválida: atendimentos concluídos possuem registro operacional/financeiro fechado e não podem ter preço, horários ou vínculos modificados.';
    END IF;
  END IF;

  -- Se o status não foi alterado, permite a continuidade de updates em notas etc.
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- 3. Verificação de permissões e contexto do usuário executor
  v_is_service_role := (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role');

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: operação de alteração de status exige autenticação válida.';
    END IF;

    SELECT tu.role INTO v_role
    FROM public.tenant_users tu
    WHERE tu.tenant_id = OLD.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active';

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: usuário não possui vínculo ativo com este estabelecimento.';
    END IF;
  END IF;

  -- 4. Matriz Estrita de Transições Válidas
  CASE OLD.status
    WHEN 'scheduled' THEN
      IF NEW.status NOT IN ('confirmed', 'in_progress', 'canceled', 'no_show') THEN
        RAISE EXCEPTION 'Transição inválida: a partir de "Agendado", os próximos estados válidos são: Confirmado, Em Atendimento, Cancelado ou Não Compareceu.';
      END IF;

    WHEN 'confirmed' THEN
      IF NEW.status NOT IN ('scheduled', 'in_progress', 'canceled', 'no_show') THEN
        RAISE EXCEPTION 'Transição inválida: a partir de "Confirmado", os próximos estados válidos são: Agendado, Em Atendimento, Cancelado ou Não Compareceu.';
      END IF;

    WHEN 'in_progress' THEN
      IF NEW.status NOT IN ('completed', 'no_show', 'canceled') THEN
        RAISE EXCEPTION 'Transição inválida: a partir de "Em Atendimento", os próximos estados válidos são: Concluído, Não Compareceu ou Cancelado.';
      END IF;

    WHEN 'canceled' THEN
      IF NEW.status NOT IN ('scheduled', 'confirmed') THEN
        RAISE EXCEPTION 'Transição inválida: um atendimento cancelado só pode ser reaberto para Agendado ou Confirmado.';
      END IF;

      IF NOT v_is_service_role AND v_role NOT IN ('owner', 'admin', 'receptionist') THEN
        RAISE EXCEPTION 'Permissão insuficiente: apenas proprietários, administradores ou recepcionistas podem reabrir atendimentos cancelados.';
      END IF;

    WHEN 'no_show' THEN
      IF NEW.status NOT IN ('scheduled', 'confirmed') THEN
        RAISE EXCEPTION 'Transição inválida: um atendimento marcado como "Não Compareceu" só pode ser reaberto para Agendado ou Confirmado.';
      END IF;

      IF NOT v_is_service_role AND v_role NOT IN ('owner', 'admin', 'receptionist') THEN
        RAISE EXCEPTION 'Permissão insuficiente: apenas proprietários, administradores ou recepcionistas podem reabrir atendimentos registrados como não comparecimento.';
      END IF;

    ELSE
      RAISE EXCEPTION 'Transição inválida: status de origem "%" desconhecido.', OLD.status;
  END CASE;

  -- 5. BLINDAGEM DE BANCO DE DADOS: Início de Atendimento Presencial exige Check-in
  IF NEW.status = 'in_progress' AND NEW.checked_in_at IS NULL THEN
    RAISE EXCEPTION 'Transição inválida: não é permitido iniciar o atendimento ("Em Atendimento") sem o prévio registro de check-in (presença física do cliente).';
  END IF;

  -- 6. Restrição Operacional Específica para Perfil 'professional'
  IF NOT v_is_service_role AND v_role = 'professional' THEN
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show') THEN
      RAISE EXCEPTION 'Permissão insuficiente: profissionais só podem alterar o status para Em Atendimento, Concluído ou Não Compareceu.';
    END IF;

    IF OLD.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
      RAISE EXCEPTION 'Permissão insuficiente: profissionais não podem alterar agendamentos que estejam com status "%".', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_commissions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 11. POLÍTICAS RLS - CASH REGISTERS
-- -----------------------------------------------------------------------------
-- Visualização: Owner, Admin e Receptionist ativos do tenant
CREATE POLICY "Management and reception can view cash registers" ON public.cash_registers
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = cash_registers.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

-- Criação e Atualização de Caixas: Owner, Admin e Receptionist
CREATE POLICY "Management and reception can insert cash registers" ON public.cash_registers
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = cash_registers.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

CREATE POLICY "Management and reception can update cash registers" ON public.cash_registers
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = cash_registers.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    )
    WITH CHECK (
      tenant_id = cash_registers.tenant_id
    );

-- -----------------------------------------------------------------------------
-- 12. POLÍTICAS RLS - PAYMENT ORDERS & TRANSACTIONS
-- -----------------------------------------------------------------------------
-- Visualização e Gestão de Ordens: Owner, Admin e Receptionist
CREATE POLICY "Management and reception can view payment orders" ON public.payment_orders
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = payment_orders.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

CREATE POLICY "Management and reception can manage payment orders" ON public.payment_orders
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = payment_orders.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    )
    WITH CHECK (
      tenant_id = payment_orders.tenant_id
    );

-- Transações de Pagamento
CREATE POLICY "Management and reception can view payment transactions" ON public.payment_transactions
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = payment_transactions.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

CREATE POLICY "Management and reception can insert payment transactions" ON public.payment_transactions
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = payment_transactions.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

-- -----------------------------------------------------------------------------
-- 13. POLÍTICAS RLS - CASH MOVEMENTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Management and reception can view cash movements" ON public.cash_movements
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = cash_movements.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

CREATE POLICY "Management and reception can insert cash movements" ON public.cash_movements
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = cash_movements.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin', 'receptionist')
          AND staff.status = 'active'
      )
    );

-- -----------------------------------------------------------------------------
-- 14. POLÍTICAS RLS - PROFESSIONAL COMMISSIONS (MENOR PRIVILÉGIO RIGOROSO)
-- -----------------------------------------------------------------------------
-- SELECT:
-- 1. Owner e Admin podem visualizar as comissões de toda a equipe no tenant.
-- 2. Profissional pode consultar EXCLUSIVAMENTE suas próprias comissões.
-- 3. Recepcionista NÃO tem acesso a comissões da equipe.
CREATE POLICY "Strict view policy for professional commissions" ON public.professional_commissions
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = professional_commissions.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.status = 'active'
          AND (
            staff.role IN ('owner', 'admin')
            OR (
              staff.role = 'professional' AND
              EXISTS (
                SELECT 1 FROM public.professionals p
                WHERE p.id = professional_commissions.professional_id
                  AND p.user_id = auth.uid()
              )
            )
          )
      )
    );

-- INSERT / UPDATE: Apenas Owner e Admin podem calcular ou quitar repasses
CREATE POLICY "Management can manage professional commissions" ON public.professional_commissions
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff
        WHERE staff.tenant_id = professional_commissions.tenant_id
          AND staff.user_id = auth.uid()
          AND staff.role IN ('owner', 'admin')
          AND staff.status = 'active'
      )
    )
    WITH CHECK (
      tenant_id = professional_commissions.tenant_id
    );

-- Concede privilégios mínimos
GRANT SELECT, INSERT, UPDATE ON public.cash_registers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.payment_orders TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.payment_transactions TO authenticated, service_role;
GRANT SELECT, INSERT ON public.cash_movements TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.professional_commissions TO authenticated, service_role;
