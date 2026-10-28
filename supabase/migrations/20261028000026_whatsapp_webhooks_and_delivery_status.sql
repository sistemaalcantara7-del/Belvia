-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.3: Processamento e Webhooks Meta Cloud API
-- Arquivo: supabase/migrations/20261028000026_whatsapp_webhooks_and_delivery_status.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança de Comunicação:
-- 1. Status Avançado de Entrega (Meta Webhooks DLR):
--    - delivery_status: 'enqueued', 'sent', 'delivered', 'read', 'failed'.
--    - delivered_at: Carimbo de entrega no aparelho do destinatário.
--    - read_at: Carimbo de confirmação de leitura pelo destinatário (duplo tick azul).
-- 2. Modo de Homologação / Simulação por Estabelecimento:
--    - dry_run_mode: BOOLEAN NOT NULL DEFAULT true na tabela tenant_whatsapp_configs.
--    - Garante que novos estabelecimentos operem em modo seguro sem disparar custos
--      ou mensagens reais até confirmação explícita de ativação.
-- 3. App Secret para Validação de Assinatura HMAC-SHA256:
--    - app_secret: Chave secreta do aplicativo Meta para validação do cabeçalho X-Hub-Signature-256.
-- 4. Função Atômica para Atualização de Status via Webhook:
--    - update_notification_delivery_status: Atualiza com segurança e idempotência
--      pelo provider_message_id retornado pela Meta (wamid.HBgL...).
-- ==============================================================================

-- 1. ADICIONA CAMPOS DE ENTREGA E AUDITORIA NA FILA DE NOTIFICAÇÕES
DO $$ BEGIN
    CREATE TYPE whatsapp_delivery_status AS ENUM ('enqueued', 'sent', 'delivered', 'read', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.notification_queue
    ADD COLUMN IF NOT EXISTS delivery_status whatsapp_delivery_status NOT NULL DEFAULT 'enqueued',
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS meta_response JSONB DEFAULT '{}'::jsonb;

-- Índice para busca rápida de eventos de webhook por provider_message_id (wamid)
CREATE INDEX IF NOT EXISTS idx_notification_queue_provider_msg_id
    ON public.notification_queue(provider_message_id)
    WHERE provider_message_id IS NOT NULL;

-- 2. ADICIONA MODO DE HOMOLOGAÇÃO E CHAVE DE ASSINATURA EM tenant_whatsapp_configs
ALTER TABLE public.tenant_whatsapp_configs
    ADD COLUMN IF NOT EXISTS dry_run_mode BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS meta_app_secret TEXT;

COMMENT ON COLUMN public.tenant_whatsapp_configs.dry_run_mode IS 'Modo de simulação segura: quando true, processa a fila e registra sucesso sem realizar requisição HTTP real à Meta.';
COMMENT ON COLUMN public.tenant_whatsapp_configs.meta_app_secret IS 'Meta App Secret utilizado para verificar a assinatura HMAC-SHA256 no header X-Hub-Signature-256.';

-- 3. RPC ATÔMICA: Atualização de Status de Entrega por Webhook (update_notification_delivery_status)
CREATE OR REPLACE FUNCTION public.update_notification_delivery_status(
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

GRANT EXECUTE ON FUNCTION public.update_notification_delivery_status TO authenticated, service_role;
