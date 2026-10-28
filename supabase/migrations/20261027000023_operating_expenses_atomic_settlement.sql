-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 4.3.3 (Complemento de Integridade Transacional)
-- Arquivo: supabase/migrations/20261027000023_operating_expenses_atomic_settlement.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança Contábil:
-- 1. Atomicidade Estrita (All-or-Nothing):
--    - Elimina o risco de criar um cash_movement desvinculado caso a gravação da despesa falhe.
--    - Realiza o débito na gaveta e a baixa da despesa na mesma transação PostgreSQL.
-- 2. Proteção Concorrente Pessimista (FOR UPDATE):
--    - Bloqueia a linha da despesa (SELECT ... FOR UPDATE) na baixa.
--    - Impede que duas requisições simultâneas liquidem a mesma despesa ou gerem débitos duplicados.
-- 3. Validação de Caixa Aberto & Alçada de Acesso:
--    - Valida permissão 'owner' ou 'admin' ativo do tenant via auth.uid().
--    - Garante que o cash_register_id informado esteja com status = 'open'.
-- ==============================================================================

-- 1. RPC: Baixa Transacional de Despesa (settle_operating_expense)
CREATE OR REPLACE FUNCTION public.settle_operating_expense(
    p_tenant_id UUID,
    p_expense_id UUID,
    p_payment_source expense_payment_source,
    p_payment_method VARCHAR(50) DEFAULT NULL,
    p_paid_at TIMESTAMPTZ DEFAULT now(),
    p_cash_register_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
    v_exp RECORD;
    v_reg RECORD;
    v_movement_id UUID := NULL;
    v_paid_time TIMESTAMPTZ := COALESCE(p_paid_at, now());
BEGIN
    -- 1. Validação de Autenticação e Perfil de Acesso (owner / admin)
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id
      AND status = 'active';

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas proprietários e administradores podem liquidar despesas.';
    END IF;

    -- 2. Bloqueio Concorrente Pessimista (FOR UPDATE) na Despesa
    SELECT * INTO v_exp
    FROM public.operating_expenses
    WHERE id = p_expense_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Despesa não localizada no estabelecimento.';
    END IF;

    IF v_exp.status = 'paid' THEN
        RAISE EXCEPTION 'Esta despesa já foi liquidada anteriormente.';
    END IF;

    IF v_exp.status = 'canceled' THEN
        RAISE EXCEPTION 'Não é possível liquidar uma despesa cancelada.';
    END IF;

    -- 3. Liquidação em Espécie (Caixa Diário)
    IF p_payment_source = 'cash_register' THEN
        IF p_cash_register_id IS NULL THEN
            RAISE EXCEPTION 'Para pagamento em espécie, é obrigatório selecionar o Caixa Diário aberto.';
        END IF;

        -- Valida se o caixa diário pertence ao tenant e está ABERTO (com lock)
        SELECT * INTO v_reg
        FROM public.cash_registers
        WHERE id = p_cash_register_id
          AND tenant_id = p_tenant_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caixa Diário não localizado no estabelecimento.';
        END IF;

        IF v_reg.status <> 'open' THEN
            RAISE EXCEPTION 'O Caixa Diário selecionado está fechado. Abra um novo caixa para lançar saídas em dinheiro.';
        END IF;

        -- Insere a saída na gaveta física atomicamente
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
            'expense',
            v_exp.amount,
            v_exp.category,
            'Pagamento de despesa #' || substring(v_exp.id::text, 1, 8) || ': ' || v_exp.description,
            v_user_id
        )
        RETURNING id INTO v_movement_id;
    END IF;

    -- 4. Atualização Atômica da Despesa
    UPDATE public.operating_expenses
    SET status = 'paid',
        paid_at = v_paid_time,
        payment_source = p_payment_source,
        payment_method = COALESCE(p_payment_method, v_exp.payment_method),
        cash_movement_id = COALESCE(v_movement_id, v_exp.cash_movement_id),
        updated_at = now()
    WHERE id = p_expense_id
      AND tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', p_expense_id,
        'cash_movement_id', v_movement_id,
        'paid_at', v_paid_time
    );
END;
$$;

-- 2. RPC: Criação Transacional de Despesa Paga (create_paid_operating_expense)
CREATE OR REPLACE FUNCTION public.create_paid_operating_expense(
    p_tenant_id UUID,
    p_category VARCHAR(100),
    p_description TEXT,
    p_amount NUMERIC(10, 2),
    p_payment_source expense_payment_source,
    p_due_date DATE,
    p_competence_date DATE DEFAULT NULL,
    p_payment_method VARCHAR(50) DEFAULT NULL,
    p_recipient TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_cash_register_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
    v_reg RECORD;
    v_expense_id UUID;
    v_movement_id UUID := NULL;
    v_comp_date DATE := COALESCE(p_competence_date, p_due_date);
BEGIN
    -- 1. Validação de Autenticação e Perfil de Acesso
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    SELECT role INTO v_user_role
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = v_user_id
      AND status = 'active';

    IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas proprietários e administradores podem cadastrar despesas.';
    END IF;

    IF p_amount <= 0.00 THEN
        RAISE EXCEPTION 'O valor da despesa deve ser maior que zero.';
    END IF;

    -- 2. Se paga em dinheiro da gaveta, valida caixa e debita atomicamente
    IF p_payment_source = 'cash_register' THEN
        IF p_cash_register_id IS NULL THEN
            RAISE EXCEPTION 'Para despesas pagas em espécie, é obrigatório selecionar o Caixa Diário aberto.';
        END IF;

        SELECT * INTO v_reg
        FROM public.cash_registers
        WHERE id = p_cash_register_id
          AND tenant_id = p_tenant_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caixa Diário não localizado no estabelecimento.';
        END IF;

        IF v_reg.status <> 'open' THEN
            RAISE EXCEPTION 'O Caixa Diário selecionado está fechado. Abra um novo caixa para registrar saídas em dinheiro.';
        END IF;

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
            'expense',
            p_amount,
            p_category,
            trim(p_description),
            v_user_id
        )
        RETURNING id INTO v_movement_id;
    END IF;

    -- 3. Insere a despesa vinculando o movimento
    INSERT INTO public.operating_expenses (
        tenant_id,
        category,
        description,
        amount,
        payment_source,
        status,
        due_date,
        competence_date,
        paid_at,
        payment_method,
        recipient,
        cash_movement_id,
        notes,
        registered_by
    ) VALUES (
        p_tenant_id,
        p_category,
        trim(p_description),
        p_amount,
        p_payment_source,
        'paid',
        p_due_date,
        v_comp_date,
        now(),
        p_payment_method,
        nullif(trim(p_recipient), ''),
        v_movement_id,
        nullif(trim(p_notes), ''),
        v_user_id
    )
    RETURNING id INTO v_expense_id;

    RETURN jsonb_build_object(
        'success', true,
        'expense_id', v_expense_id,
        'cash_movement_id', v_movement_id
    );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.settle_operating_expense TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_paid_operating_expense TO authenticated, service_role;
