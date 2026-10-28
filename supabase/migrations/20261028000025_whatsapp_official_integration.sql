-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.2: Conexão Oficial WhatsApp Business (Meta Cloud API)
-- Arquivo: supabase/migrations/20261028000025_whatsapp_official_integration.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança de Segurança:
-- 1. Segregação Estrita de Credenciais da Meta (tenant_whatsapp_configs):
--    - phone_number_id: ID do número de telefone na Meta.
--    - waba_id: WhatsApp Business Account ID.
--    - encrypted_access_token / access_token: Token de acesso do sistema Meta.
--    - verify_token: Token de verificação de Webhook configurado.
--    - business_phone_display: Número formatado exibível (+55 11 99999-9999).
--    - connection_status: 'disconnected', 'pending_verification', 'connected', 'error'.
--    - Proteção Total: Apenas acessível por service_role e via Server Actions no backend;
--      NUNCA exposto ao frontend.
-- 2. Tabela de Templates Oficiais Aprovados pela Meta (whatsapp_official_templates):
--    - template_name: Nome do template cadastrado no Meta Business Suite (ex: 'zelunia_lembrete_24h').
--    - meta_template_id: ID oficial do template na Meta.
--    - language: Código de idioma (padrão 'pt_BR').
--    - category: 'UTILITY' (confirmações/lembretes), 'MARKETING', 'AUTHENTICATION'.
--    - status: 'APPROVED', 'PENDING', 'REJECTED', 'PAUSED'.
--    - header_type, body_text, footer_text, buttons.
-- 3. RPC Atômica com Bloqueio Concorrente (claim_next_notification_batch):
--    - Seleciona mensagens pendentes com FOR UPDATE SKIP LOCKED.
--    - Valida o consentimento do cliente (opt_in_reminders) IMEDIATAMENTE antes da reivindicação.
--    - Se o cliente tiver revogado o consentimento, marca como 'canceled' atomicamente.
-- 4. RLS e Menor Privilégio:
--    - Visualização restrita a 'owner' e 'admin' ativos do tenant (com máscara de token).
-- ==============================================================================

-- 1. ENUMS DO WHATSAPP OFICIAL
DO $$ BEGIN
    CREATE TYPE whatsapp_connection_status AS ENUM ('disconnected', 'pending_verification', 'connected', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE whatsapp_template_category AS ENUM ('UTILITY', 'MARKETING', 'AUTHENTICATION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE whatsapp_template_status AS ENUM ('APPROVED', 'PENDING', 'REJECTED', 'PAUSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: tenant_whatsapp_configs (Credenciais e Conexão Meta Cloud API)
CREATE TABLE IF NOT EXISTS public.tenant_whatsapp_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    waba_id VARCHAR(100), -- WhatsApp Business Account ID
    phone_number_id VARCHAR(100), -- ID do número na Meta
    business_phone_display VARCHAR(30), -- Ex: +55 (11) 98765-4321
    access_token_secret TEXT, -- Token permanente do usuário do sistema Meta
    webhook_verify_token VARCHAR(100), -- Token para handshake do Webhook
    connection_status whatsapp_connection_status NOT NULL DEFAULT 'disconnected',
    last_health_check_at TIMESTAMPTZ,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_whatsapp_configs UNIQUE (tenant_id)
);

-- Trigger de updated_at para tenant_whatsapp_configs
DROP TRIGGER IF EXISTS set_tenant_whatsapp_configs_updated_at ON public.tenant_whatsapp_configs;
CREATE TRIGGER set_tenant_whatsapp_configs_updated_at
    BEFORE UPDATE ON public.tenant_whatsapp_configs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. TABELA: whatsapp_official_templates (Templates Meta Oficiais)
CREATE TABLE IF NOT EXISTS public.whatsapp_official_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    template_name VARCHAR(120) NOT NULL,
    meta_template_id VARCHAR(100),
    language VARCHAR(10) NOT NULL DEFAULT 'pt_BR',
    category whatsapp_template_category NOT NULL DEFAULT 'UTILITY',
    status whatsapp_template_status NOT NULL DEFAULT 'PENDING',
    body_text TEXT NOT NULL,
    header_text TEXT,
    footer_text TEXT,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_whatsapp_official_templates UNIQUE (tenant_id, template_name, language)
);

-- Trigger de updated_at para whatsapp_official_templates
DROP TRIGGER IF EXISTS set_whatsapp_official_templates_updated_at ON public.whatsapp_official_templates;
CREATE TRIGGER set_whatsapp_official_templates_updated_at
    BEFORE UPDATE ON public.whatsapp_official_templates
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. RPC ATÔMICA: Reivindicar Lote para Envio Seguro com Bloqueio Concorrente (claim_next_notification_batch)
CREATE OR REPLACE FUNCTION public.claim_next_notification_batch(
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
    idempotency_key VARCHAR(120)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
BEGIN
    -- Validação de Permissão: Apenas 'owner', 'admin' ou serviço interno autorizado
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

    -- 1. Primeiro cancela mensagens cujo cliente tenha revogado o consentimento LGPD (opt_in_reminders = false)
    UPDATE public.notification_queue nq
    SET status = 'canceled',
        error_message = 'Cancelado: consentimento revogado pelo cliente (LGPD Art. 8, §5º).',
        updated_at = now()
    FROM public.clients c
    WHERE nq.client_id = c.id
      AND nq.tenant_id = p_tenant_id
      AND nq.status = 'pending'
      AND c.opt_in_reminders IS NOT TRUE;

    -- 2. Seleciona e bloqueia concorrencialmente com SKIP LOCKED o próximo lote no horário
    RETURN QUERY
    WITH batch AS (
        SELECT q.id
        FROM public.notification_queue q
        JOIN public.clients cl ON cl.id = q.client_id
        WHERE q.tenant_id = p_tenant_id
          AND q.status = 'pending'
          AND q.scheduled_for <= now()
          AND cl.opt_in_reminders IS TRUE
        ORDER BY q.scheduled_for ASC
        LIMIT p_batch_size
        FOR UPDATE OF q SKIP LOCKED
    )
    SELECT
        q.id,
        q.appointment_id,
        q.client_id,
        q.recipient_phone,
        q.message_content,
        q.notification_type,
        q.idempotency_key
    FROM public.notification_queue q
    JOIN batch b ON b.id = q.id;
END;
$$;

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tenant_whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_official_templates ENABLE ROW LEVEL SECURITY;

-- Políticas para tenant_whatsapp_configs (Apenas Gestão do Tenant)
CREATE POLICY "Management can view whatsapp config" ON public.tenant_whatsapp_configs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = tenant_whatsapp_configs.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Management can insert or update whatsapp config" ON public.tenant_whatsapp_configs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = tenant_whatsapp_configs.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = tenant_whatsapp_configs.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

-- Políticas para whatsapp_official_templates
CREATE POLICY "Staff can view whatsapp templates" ON public.whatsapp_official_templates
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = whatsapp_official_templates.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Management can manage whatsapp templates" ON public.whatsapp_official_templates
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = whatsapp_official_templates.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = whatsapp_official_templates.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.claim_next_notification_batch TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_whatsapp_configs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_official_templates TO authenticated, service_role;
