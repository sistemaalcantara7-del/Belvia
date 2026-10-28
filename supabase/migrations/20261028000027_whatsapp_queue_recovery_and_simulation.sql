-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.4: Homologação Operacional e Resiliência da Fila
-- Arquivo: supabase/migrations/20261028000027_whatsapp_queue_recovery_and_simulation.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança de Resiliência:
-- 1. Resolução do Erro 55P04 do PostgreSQL:
--    - Em PostgreSQL, novos valores de ENUM (ALTER TYPE ... ADD VALUE) não podem ser
--      utilizados em predicados WHERE de CREATE INDEX dentro do mesmo bloco transacional.
--    - Para máxima compatibilidade e execução em lote no Supabase SQL Editor:
--      Utiliza-se campos de controle dedicados:
--      * is_processing BOOLEAN NOT NULL DEFAULT false
--      * processing_started_at TIMESTAMPTZ
--      * is_simulation BOOLEAN NOT NULL DEFAULT false
--      * simulated_at TIMESTAMPTZ
--    - Desta forma, o índice condicional opera sobre is_processing = true, sendo 100%
--      compatível e executável em um único passo.
-- 2. Recuperação de Mensagens Travadas (Stuck / Timeout):
--    - Mensagens com is_processing = true há mais de 5 minutos são recuperadas.
--    - Limite estrito de tentativas: max_retries = 3 (após 3 tentativas, marca como 'failed').
-- 3. Prevenção de Regressão de Status no Webhook (Anti-Out-of-Order):
--    - A função update_notification_delivery_status_v2 garante que eventos fora de ordem
--      nunca regridam mensagens já entregues ou lidas.
-- ==============================================================================

-- 1. CAMPOS DE CONTROLE OPERACIONAL E RESILIÊNCIA
ALTER TABLE public.notification_queue
    ADD COLUMN IF NOT EXISTS is_processing BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_simulation BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS simulated_at TIMESTAMPTZ;

-- Comentários de Auditoria
COMMENT ON COLUMN public.notification_queue.is_processing IS 'Flag atômica indicando que a mensagem está sendo despachada por um worker ativo.';
COMMENT ON COLUMN public.notification_queue.processing_started_at IS 'Timestamp do início do processamento para auto-recuperação de timeouts (> 5 min).';
COMMENT ON COLUMN public.notification_queue.is_simulation IS 'Indica que a mensagem foi processada em modo homologação (dry-run) sem envio à Meta.';
COMMENT ON COLUMN public.notification_queue.simulated_at IS 'Data/hora exata em que o teste simulado foi concluído.';

-- 2. ÍNDICE CONDICIONAL PARA RECUPERAÇÃO DE TIMEOUTS (100% seguro em transação única)
CREATE INDEX IF NOT EXISTS idx_notification_queue_stuck_recovery
    ON public.notification_queue(is_processing, processing_started_at)
    WHERE is_processing = true;

-- 3. RPC ATÔMICA: Reivindicar Lote com Recuperação de Travamentos e Validação de Consentimento
CREATE OR REPLACE FUNCTION public.claim_next_notification_batch_v2(
    p_tenant_id UUID,
    p_batch_size INT DEFAULT 10
)
RETURNS TABLE (
    notification_id UUID,
    appointment_id UUID,
    client_id UUID,
    recipient_phone VARCHAR(30),
    message_content TEXT,
    notification_type reminder_trigger_type,
    idempotency_key VARCHAR(120),
    retry_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
BEGIN
    -- Validação de Permissão: Apenas 'owner', 'admin' ou serviço autorizado
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_user_role
        FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id
          AND status = 'active';

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Acesso negado: permissão insuficiente para processar fila de notificações.';
        END IF;
    END IF;

    -- 1. Recuperação de Mensagens Travadas (is_processing = true há mais de 5 minutos)
    -- Se retry_count >= 3, marca como 'failed' definitivo para evitar loops infinitos
    UPDATE public.notification_queue
    SET status = 'failed',
        is_processing = false,
        error_message = 'Falha definitiva: limite de 3 tentativas excedido por timeout de processamento.',
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND is_processing = true
      AND processing_started_at < (now() - INTERVAL '5 minutes')
      AND retry_count >= 3;

    -- Caso ainda tenha tentativas disponíveis, devolve para 'pending'
    UPDATE public.notification_queue
    SET status = 'pending',
        is_processing = false,
        retry_count = retry_count + 1,
        processing_started_at = NULL,
        error_message = 'Recuperado automaticamente: timeout anterior detectado no worker.',
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND is_processing = true
      AND processing_started_at < (now() - INTERVAL '5 minutes')
      AND retry_count < 3;

    -- 2. Invalidação imediata de clientes que revogaram o opt-in
    UPDATE public.notification_queue nq
    SET status = 'canceled',
        is_processing = false,
        error_message = 'Cancelado: consentimento revogado pelo titular (LGPD Art. 8, §5º).',
        updated_at = now()
    FROM public.clients c
    WHERE nq.client_id = c.id
      AND nq.tenant_id = p_tenant_id
      AND nq.status = 'pending'
      AND c.opt_in_reminders IS NOT TRUE;

    -- 3. Invalidação de agendamentos que já foram cancelados ou finalizados
    UPDATE public.notification_queue nq
    SET status = 'canceled',
        is_processing = false,
        error_message = 'Cancelado: agendamento já finalizado ou cancelado no sistema.',
        updated_at = now()
    FROM public.appointments ap
    WHERE nq.appointment_id = ap.id
      AND nq.tenant_id = p_tenant_id
      AND nq.status = 'pending'
      AND ap.status IN ('canceled', 'completed');

    -- 4. Reivindica e marca com is_processing = true atomicamente com SKIP LOCKED
    RETURN QUERY
    WITH batch AS (
        SELECT q.id
        FROM public.notification_queue q
        JOIN public.clients cl ON cl.id = q.client_id
        JOIN public.appointments a ON a.id = q.appointment_id
        WHERE q.tenant_id = p_tenant_id
          AND q.status = 'pending'
          AND q.is_processing = false
          AND q.scheduled_for <= now()
          AND cl.opt_in_reminders IS TRUE
          AND a.status IN ('scheduled', 'confirmed')
        ORDER BY q.scheduled_for ASC
        LIMIT p_batch_size
        FOR UPDATE OF q SKIP LOCKED
    ),
    marked AS (
        UPDATE public.notification_queue q
        SET is_processing = true,
            processing_started_at = now(),
            updated_at = now()
        FROM batch b
        WHERE q.id = b.id
        RETURNING q.id, q.appointment_id, q.client_id, q.recipient_phone, q.message_content, q.notification_type, q.idempotency_key, q.retry_count
    )
    SELECT
        m.id,
        m.appointment_id,
        m.client_id,
        m.recipient_phone,
        m.message_content,
        m.notification_type,
        m.idempotency_key,
        m.retry_count
    FROM marked m;
END;
$$;

-- 4. RPC ATÔMICA: Atualização de Status de Entrega por Webhook com Proteção Anti-Regressão
CREATE OR REPLACE FUNCTION public.update_notification_delivery_status_v2(
    p_provider_message_id VARCHAR(100),
    p_status whatsapp_delivery_status,
    p_timestamp TIMESTAMPTZ,
    p_error_details TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_target RECORD;
BEGIN
    SELECT id, status, delivery_status INTO v_target
    FROM public.notification_queue
    WHERE provider_message_id = p_provider_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- NUNCA regride se já estiver lido ('read')
    IF v_target.delivery_status = 'read' THEN
        RETURN true;
    END IF;

    -- NUNCA regride de 'delivered' para 'sent' se evento chegar fora de ordem
    IF v_target.delivery_status = 'delivered' AND p_status = 'sent' THEN
        RETURN true;
    END IF;

    -- Atualiza status de entrega de acordo com a progressão da Meta
    IF p_status = 'delivered' THEN
        UPDATE public.notification_queue
        SET delivery_status = 'delivered',
            delivered_at = COALESCE(delivered_at, p_timestamp),
            updated_at = now()
        WHERE id = v_target.id;
    ELSIF p_status = 'read' THEN
        UPDATE public.notification_queue
        SET delivery_status = 'read',
            delivered_at = COALESCE(delivered_at, p_timestamp),
            read_at = COALESCE(read_at, p_timestamp),
            updated_at = now()
        WHERE id = v_target.id;
    ELSIF p_status = 'failed' THEN
        UPDATE public.notification_queue
        SET status = 'failed',
            delivery_status = 'failed',
            error_message = COALESCE(p_error_details, 'Falha reportada pelo webhook da Meta.'),
            updated_at = now()
        WHERE id = v_target.id;
    ELSIF p_status = 'sent' THEN
        UPDATE public.notification_queue
        SET delivery_status = 'sent',
            sent_at = COALESCE(sent_at, p_timestamp),
            updated_at = now()
        WHERE id = v_target.id;
    END IF;

    RETURN true;
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.claim_next_notification_batch_v2 TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_notification_delivery_status_v2 TO authenticated, service_role;
