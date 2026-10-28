-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 4.2.3: Estornos Contábeis e Lançamentos Compensatórios
-- Arquivo: 20261027000021_payment_refunds_and_compensation.sql
--
-- Destaques de Arquitetura & Governança Contábil:
-- 1. Lançamentos Compensatórios Imutáveis (payment_refunds):
--    - Cada estorno (seja parcial ou integral) gera um registro auditado próprio.
--    - Bloqueio estrito de UPDATE e DELETE físico (princípio de trilha imutável).
--    - Vínculos com ON DELETE RESTRICT (proibido cascata em dados financeiros).
-- 2. Integridade Multi-Tenant Composta:
--    - FKs compostas (id, tenant_id) impedindo vazamento entre tenants.
-- 3. Idempotência Persistente:
--    - Coluna idempotency_key com restrição UNIQUE (tenant_id, idempotency_key).
-- 4. Função Transacional Atômica (RPC: process_payment_refund):
--    - Bloqueio concorrente pessimista (FOR UPDATE) na transação de pagamento.
--    - Validação de alçada estrita (apenas 'owner' e 'admin' ativos do tenant).
--    - Teto intransponível: soma dos estornos não pode ultrapassar amount original.
--    - Se devolução for em dinheiro (espécie): exige caixa aberto e gera 'bleed' auditado.
--    - Tratamento explícito de saldo devedor: reabre balance_due somente se solicitado.
--    - Comissões: se o agendamento possuir comissão pendente (forecast/payable), cancela se estorno total.
-- 5. RLS com Menor Privilégio:
--    - Leitura: owner, admin e receptionist.
--    - Inserção direta: restrita a owner e admin via RLS e via RPC SECURITY DEFINER.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABELA: payment_refunds
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    payment_transaction_id UUID NOT NULL,
    payment_order_id UUID NOT NULL,
    cash_register_id UUID,
    idempotency_key VARCHAR(100) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0.00),
    method payment_method_type NOT NULL,
    reason TEXT NOT NULL,
    reopen_balance_due BOOLEAN NOT NULL DEFAULT false,
    refunded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    refunded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints Compostas Multi-Tenant
    CONSTRAINT uq_payment_refunds_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT fk_payment_refunds_tx FOREIGN KEY (payment_transaction_id, tenant_id)
        REFERENCES public.payment_transactions(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_refunds_order FOREIGN KEY (payment_order_id, tenant_id)
        REFERENCES public.payment_orders(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT fk_payment_refunds_register FOREIGN KEY (cash_register_id, tenant_id)
        REFERENCES public.cash_registers(id, tenant_id) ON DELETE RESTRICT,
    CONSTRAINT uq_payment_refunds_id_tenant_id UNIQUE (id, tenant_id)
);

-- Índices de Alta Eficiência
CREATE INDEX IF NOT EXISTS idx_payment_refunds_tenant_date ON public.payment_refunds(tenant_id, refunded_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_tx ON public.payment_refunds(payment_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_order ON public.payment_refunds(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_register ON public.payment_refunds(cash_register_id);

-- -----------------------------------------------------------------------------
-- 2. BLOQUEIO DE MUTAÇÃO: Imutabilidade Absoluta (Sem UPDATE ou DELETE)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_payment_refunds_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Operação ilegal: Lançamentos de estorno e reembolso são imutáveis e auditados. Não é permitido alterar ou excluir este registro.';
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_payment_refunds_mutation ON public.payment_refunds;
CREATE TRIGGER trigger_prevent_payment_refunds_mutation
    BEFORE UPDATE OR DELETE ON public.payment_refunds
    FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_refunds_mutation();

-- -----------------------------------------------------------------------------
-- 3. FUNÇÃO RPC TRANSACIONAL ATÔMICA: process_payment_refund
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment_refund(
    p_tenant_id UUID,
    p_transaction_id UUID,
    p_amount NUMERIC(10, 2),
    p_reason TEXT,
    p_method payment_method_type,
    p_reopen_balance_due BOOLEAN,
    p_idempotency_key VARCHAR(100),
    p_cash_register_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role tenant_role;
    v_tx RECORD;
    v_order RECORD;
    v_total_refunded NUMERIC(10, 2);
    v_new_refund_id UUID;
    v_existing_refund RECORD;
    v_appt_id UUID;
    v_commission RECORD;
BEGIN
    -- 1. Idempotência Persistente: se já processado com a mesma chave no tenant, retorna existente
    SELECT id, amount, refunded_at INTO v_existing_refund
    FROM public.payment_refunds
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key;

    IF v_existing_refund.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'refund_id', v_existing_refund.id,
            'amount_refunded', v_existing_refund.amount,
            'message', 'Estorno já registrado anteriormente com esta chave de idempotência.'
        );
    END IF;

    -- 2. Validação de Alçada e Autorização
    SELECT tu.role INTO v_caller_role
    FROM public.tenant_users tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active';

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas proprietários e administradores possuem alçada para emitir estornos.';
    END IF;

    -- 3. Bloqueio Pessimista da Transação Original (Anti-Concorrência)
    SELECT * INTO v_tx
    FROM public.payment_transactions
    WHERE id = p_transaction_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF v_tx.id IS NULL THEN
        RAISE EXCEPTION 'Transação original não localizada no estabelecimento.';
    END IF;

    -- 4. Cálculo do Total Já Estornado e Limite Disponível
    SELECT COALESCE(SUM(amount), 0.00) INTO v_total_refunded
    FROM public.payment_refunds
    WHERE payment_transaction_id = p_transaction_id AND tenant_id = p_tenant_id;

    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'Valor do estorno deve ser maior que zero.';
    END IF;

    IF (v_total_refunded + p_amount) > v_tx.amount THEN
        RAISE EXCEPTION 'Estorno recusado: Valor solicitado (R$ %) excede o saldo remanescente disponível para devolução (R$ %).',
            p_amount, (v_tx.amount - v_total_refunded);
    END IF;

    -- 5. Validação de Devolução em Dinheiro Físico (Caixa Aberto)
    IF p_method = 'cash' THEN
        IF p_cash_register_id IS NULL THEN
            RAISE EXCEPTION 'Para devoluções em dinheiro (espécie), é obrigatório selecionar o caixa aberto de onde sairá o valor.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.cash_registers
            WHERE id = p_cash_register_id AND tenant_id = p_tenant_id AND status = 'open'
        ) THEN
            RAISE EXCEPTION 'O caixa selecionado para saída da devolução não está com status aberto.';
        END IF;
    END IF;

    -- 6. Inserção do Lançamento Compensatório Imutável
    INSERT INTO public.payment_refunds (
        tenant_id,
        payment_transaction_id,
        payment_order_id,
        cash_register_id,
        idempotency_key,
        amount,
        method,
        reason,
        reopen_balance_due,
        refunded_by,
        refunded_at
    ) VALUES (
        p_tenant_id,
        p_transaction_id,
        v_tx.payment_order_id,
        p_cash_register_id,
        p_idempotency_key,
        p_amount,
        p_method,
        p_reason,
        p_reopen_balance_due,
        auth.uid(),
        now()
    ) RETURNING id INTO v_new_refund_id;

    -- 7. Se devolução em espécie, gera saída física na gaveta (cash_movement)
    IF p_method = 'cash' THEN
        INSERT INTO public.cash_movements (
            tenant_id,
            cash_register_id,
            type,
            amount,
            category,
            description,
            performed_by
        ) VALUES (
            p_tenant_id,
            p_cash_register_id,
            'bleed',
            p_amount,
            'Estorno/Devolução em Espécie',
            CONCAT('Estorno da transação #', p_transaction_id, ': ', p_reason),
            auth.uid()
        );
    END IF;

    -- 8. Atualização Explícita da Ordem de Pagamento
    -- Se solicitado reabrir saldo devedor: balance_due aumenta e status ajusta
    IF p_reopen_balance_due THEN
        UPDATE public.payment_orders
        SET paid_amount = GREATEST(0.00, paid_amount - p_amount),
            balance_due = LEAST(net_amount, balance_due + p_amount),
            status = CASE 
                WHEN (paid_amount - p_amount) <= 0.00 THEN 'pending'::payment_order_status
                ELSE 'partially_paid'::payment_order_status
            END,
            updated_at = now()
        WHERE id = v_tx.payment_order_id;
    END IF;

    -- 9. Atualização de Auditoria da Transação Pai se Totalmente Estornada
    IF (v_total_refunded + p_amount) >= v_tx.amount THEN
        UPDATE public.payment_transactions
        SET status = 'refunded',
            refunded_at = now(),
            refund_reason = p_reason
        WHERE id = p_transaction_id;
    END IF;

    -- 10. Ajuste Seguro de Comissões Pendentes (Sem inventar compensações)
    -- Preserva comissões já pagas ('paid'); atua somente em 'forecast' ou 'payable'
    SELECT appointment_id INTO v_appt_id
    FROM public.payment_orders
    WHERE id = v_tx.payment_order_id AND tenant_id = p_tenant_id;

    IF v_appt_id IS NOT NULL THEN
        SELECT id, status, commission_amount INTO v_commission
        FROM public.professional_commissions
        WHERE appointment_id = v_appt_id AND tenant_id = p_tenant_id;

        IF v_commission.id IS NOT NULL AND v_commission.status IN ('forecast', 'payable') THEN
            -- Se estorno for total, cancela a comissão pendente
            IF (v_total_refunded + p_amount) >= v_tx.amount THEN
                UPDATE public.professional_commissions
                SET status = 'canceled',
                    notes = COALESCE(notes, '') || ' [Comissão cancelada devido a estorno integral do procedimento.]',
                    updated_at = now()
                WHERE id = v_commission.id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'refund_id', v_new_refund_id,
        'amount_refunded', p_amount,
        'remaining_refundable', (v_tx.amount - (v_total_refunded + p_amount))
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. POLÍTICAS RLS (Row Level Security)
-- -----------------------------------------------------------------------------
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Management and reception can view payment refunds" ON public.payment_refunds
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = payment_refunds.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin', 'receptionist')
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Only owner and admin can insert payment refunds" ON public.payment_refunds
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = payment_refunds.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );
