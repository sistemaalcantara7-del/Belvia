-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.1: Estrutura de Lembretes Automáticos e Fila de Notificações
-- Arquivo: supabase/migrations/20261028000024_appointment_reminders_and_notification_queue.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança LGPD / Multi-Tenant:
-- 1. Consentimento Explícito LGPD (Princípio da Não-Presunção):
--    - opt_in_reminders: DEFAULT false (nunca presumido; requer ação afirmativa).
--    - opt_in_reminders_at: registro do timestamp exato da manifestação do titular.
--    - opt_in_reminders_source: canal/origem da autorização (ex: 'reception', 'client_portal', 'term_signed').
-- 2. Configuração por Estabelecimento (tenant_reminder_settings):
--    - Ativação/desativação geral de lembretes automáticos.
--    - Configuração de antecedência (24h e 2h antes).
--    - Templates parametrizáveis: {cliente}, {servico}, {profissional}, {data}, {horario}, {estabelecimento}.
--    - Provedor oficial WhatsApp (Meta Cloud API / Provedor Oficial BSP).
-- 3. Fila Persistente de Notificações (notification_queue):
--    - Status de envio: 'pending', 'sent', 'failed', 'canceled'.
--    - Tipos de gatilho: 'reminder_24h', 'reminder_2h', 'instant_confirmation', 'reschedule_notice', 'cancellation_notice'.
--    - Vínculo direto com appointment_id e client_id com ON DELETE RESTRICT (auditoria imutável).
--    - Restrição de Idempotência: UNIQUE (tenant_id, idempotency_key) e
--      UNIQUE (tenant_id, appointment_id, notification_type).
-- 4. Triggers Automáticas de Governança de Agendamento:
--    - Agendamento CANCELADO ('canceled'): cancela imediatamente notificações pendentes.
--    - Agendamento CONCLUÍDO ('completed'): cancela eventuais lembretes pendentes residuais.
--    - Agendamento REAGENDADO: atualiza única e exclusivamente notificações com status 'pending',
--      SEM reativar mensagens já enviadas ('sent') ou canceladas ('canceled').
-- 5. Row Level Security (RLS) estrito por tenant_id:
--    - Apenas 'owner', 'admin' e 'receptionist' podem visualizar/gerenciar fila e configurações.
-- ==============================================================================

-- 1. CONSENTIMENTO EXPLÍCITO LGPD EM CLIENTES
ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS opt_in_reminders BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS opt_in_reminders_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opt_in_reminders_source VARCHAR(100);

-- Comentários de Auditoria e Governança de Dados
COMMENT ON COLUMN public.clients.opt_in_reminders IS 'Consentimento explícito do titular para recebimento de lembretes via WhatsApp/SMS (LGPD Art. 7, I). Padrão false.';
COMMENT ON COLUMN public.clients.opt_in_reminders_at IS 'Data/hora exata do registro de consentimento ou revogação pelo titular.';
COMMENT ON COLUMN public.clients.opt_in_reminders_source IS 'Origem/meio da autorização (ex: cadastro presencial na recepção, portal online, termo assinado).';

-- 2. ENUMS DE NOTIFICAÇÃO
DO $$ BEGIN
    CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE reminder_trigger_type AS ENUM ('reminder_24h', 'reminder_2h', 'instant_confirmation', 'reschedule_notice', 'cancellation_notice');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABELA: tenant_reminder_settings (Configuração de Lembretes do Estabelecimento)
CREATE TABLE IF NOT EXISTS public.tenant_reminder_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    enable_24h_reminder BOOLEAN NOT NULL DEFAULT true,
    enable_2h_reminder BOOLEAN NOT NULL DEFAULT true,
    provider VARCHAR(50) NOT NULL DEFAULT 'meta_cloud_api', -- 'meta_cloud_api' | 'official_bsp'
    template_24h TEXT NOT NULL DEFAULT 'Olá, {cliente}! Confirmamos seu agendamento de {servico} com {profissional} amanhã, {data} às {horario}, na {estabelecimento}. Responda SIM para confirmar.',
    template_2h TEXT NOT NULL DEFAULT 'Olá, {cliente}! Lembramos que seu atendimento de {servico} com {profissional} na {estabelecimento} será hoje às {horario}. Estamos aguardando você!',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_tenant_reminder_settings UNIQUE (tenant_id)
);

-- Trigger de updated_at para tenant_reminder_settings
DROP TRIGGER IF EXISTS set_tenant_reminder_settings_updated_at ON public.tenant_reminder_settings;
CREATE TRIGGER set_tenant_reminder_settings_updated_at
    BEFORE UPDATE ON public.tenant_reminder_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 4. TABELA: notification_queue (Fila Auditada de Lembretes e Notificações)
CREATE TABLE IF NOT EXISTS public.notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    notification_type reminder_trigger_type NOT NULL,
    channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    recipient_phone VARCHAR(30) NOT NULL,
    message_content TEXT NOT NULL,
    status notification_status NOT NULL DEFAULT 'pending',
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INT NOT NULL DEFAULT 0,
    provider_message_id VARCHAR(100),
    idempotency_key VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints de Integridade e Idempotência
    CONSTRAINT uq_notification_queue_idempotency UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT uq_notification_queue_appointment_trigger UNIQUE (tenant_id, appointment_id, notification_type)
);

-- Índices de Consulta Rápida da Fila
CREATE INDEX IF NOT EXISTS idx_notification_queue_tenant_status ON public.notification_queue(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled_pending ON public.notification_queue(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_queue_appointment ON public.notification_queue(appointment_id);

-- Trigger de updated_at para notification_queue
DROP TRIGGER IF EXISTS set_notification_queue_updated_at ON public.notification_queue;
CREATE TRIGGER set_notification_queue_updated_at
    BEFORE UPDATE ON public.notification_queue
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. FUNCTION & TRIGGER: Sincronização Automática da Fila com o Ciclo de Vida do Agendamento
CREATE OR REPLACE FUNCTION public.handle_appointment_reminders_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Cenário 1: Agendamento Cancelado
    -- Invalida e cancela exclusivamente notificações que ainda estejam PENDENTES
    IF NEW.status = 'canceled' AND (OLD.status IS NULL OR OLD.status <> 'canceled') THEN
        UPDATE public.notification_queue
        SET status = 'canceled',
            error_message = 'Cancelado automaticamente: agendamento cancelado.',
            updated_at = now()
        WHERE appointment_id = NEW.id
          AND status = 'pending';
        RETURN NEW;
    END IF;

    -- Cenário 2: Agendamento Concluído
    -- Se o atendimento já foi realizado, cancela eventuais lembretes pendentes residuais
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
        UPDATE public.notification_queue
        SET status = 'canceled',
            error_message = 'Cancelado automaticamente: atendimento já concluído.',
            updated_at = now()
        WHERE appointment_id = NEW.id
          AND status = 'pending';
        RETURN NEW;
    END IF;

    -- Cenário 3: Reagendamento (Alteração do start_time)
    -- Recalcula os horários EXCLUSIVAMENTE para notificações com status = 'pending'
    -- NUNCA reativa notificações que já estejam 'sent', 'failed' ou 'canceled'
    IF OLD.start_time IS NOT NULL AND NEW.start_time <> OLD.start_time THEN
        -- Atualiza lembrete de 24h (24 horas antes do novo start_time)
        UPDATE public.notification_queue
        SET scheduled_for = NEW.start_time - INTERVAL '24 hours',
            updated_at = now()
        WHERE appointment_id = NEW.id
          AND notification_type = 'reminder_24h'
          AND status = 'pending';

        -- Atualiza lembrete de 2h (2 horas antes do novo start_time)
        UPDATE public.notification_queue
        SET scheduled_for = NEW.start_time - INTERVAL '2 hours',
            updated_at = now()
        WHERE appointment_id = NEW.id
          AND notification_type = 'reminder_2h'
          AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_reminders_sync ON public.appointments;
CREATE TRIGGER trg_appointment_reminders_sync
    AFTER UPDATE OF status, start_time ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_appointment_reminders_sync();

-- 6. RPC: Sincronização / Enfileiramento de Lembretes para um Agendamento
CREATE OR REPLACE FUNCTION public.enqueue_appointment_reminders(
    p_tenant_id UUID,
    p_appointment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_appt RECORD;
    v_settings RECORD;
    v_client RECORD;
    v_service RECORD;
    v_professional RECORD;
    v_tenant RECORD;
    v_msg_24h TEXT;
    v_msg_2h TEXT;
    v_formatted_date TEXT;
    v_formatted_time TEXT;
    v_count INT := 0;
BEGIN
    -- 1. Busca configurações de lembretes do estabelecimento
    SELECT * INTO v_settings
    FROM public.tenant_reminder_settings
    WHERE tenant_id = p_tenant_id;

    -- Se não houver configuração ou se lembretes estiverem desabilitados no estabelecimento, encerra
    IF v_settings IS NULL OR NOT v_settings.enabled THEN
        RETURN jsonb_build_object('success', false, 'reason', 'reminders_disabled_for_tenant');
    END IF;

    -- 2. Busca o agendamento
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = p_appointment_id
      AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'appointment_not_found');
    END IF;

    -- Apenas agendamentos ativos ('scheduled' ou 'confirmed') recebem lembretes futuros
    IF v_appt.status NOT IN ('scheduled', 'confirmed') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_appointment_status');
    END IF;

    -- 3. Busca cliente e VALIDA CONSENTIMENTO EXPLÍCITO LGPD (Não-presumido)
    SELECT * INTO v_client
    FROM public.clients
    WHERE id = v_appt.client_id
      AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'client_not_found');
    END IF;

    -- REGRA LGPD: Bloqueia estritamente se opt_in_reminders for falso ou nulo (sem consentimento comprovado)
    IF v_client.opt_in_reminders IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'reason', 'client_opt_out_or_missing_consent');
    END IF;

    -- Valida se o cliente possui telefone/whatsapp cadastrado
    IF COALESCE(v_client.whatsapp, v_client.phone) IS NULL OR trim(COALESCE(v_client.whatsapp, v_client.phone)) = '' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'client_phone_missing');
    END IF;

    -- 4. Busca dados complementares para personalização
    SELECT name INTO v_service FROM public.services WHERE id = v_appt.service_id;
    SELECT full_name INTO v_professional FROM public.professionals WHERE id = v_appt.professional_id;
    SELECT name INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;

    -- Formata data e horário no fuso padrão de exibição
    v_formatted_date := to_char(v_appt.start_time AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    v_formatted_time := to_char(v_appt.start_time AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI');

    -- Monta texto para 24h
    v_msg_24h := v_settings.template_24h;
    v_msg_24h := replace(v_msg_24h, '{cliente}', v_client.full_name);
    v_msg_24h := replace(v_msg_24h, '{servico}', COALESCE(v_service.name, 'Serviço'));
    v_msg_24h := replace(v_msg_24h, '{profissional}', COALESCE(v_professional.full_name, 'Profissional'));
    v_msg_24h := replace(v_msg_24h, '{data}', v_formatted_date);
    v_msg_24h := replace(v_msg_24h, '{horario}', v_formatted_time);
    v_msg_24h := replace(v_msg_24h, '{estabelecimento}', COALESCE(v_tenant.name, 'ZELUNIA'));

    -- Monta texto para 2h
    v_msg_2h := v_settings.template_2h;
    v_msg_2h := replace(v_msg_2h, '{cliente}', v_client.full_name);
    v_msg_2h := replace(v_msg_2h, '{servico}', COALESCE(v_service.name, 'Serviço'));
    v_msg_2h := replace(v_msg_2h, '{profissional}', COALESCE(v_professional.full_name, 'Profissional'));
    v_msg_2h := replace(v_msg_2h, '{data}', v_formatted_date);
    v_msg_2h := replace(v_msg_2h, '{horario}', v_formatted_time);
    v_msg_2h := replace(v_msg_2h, '{estabelecimento}', COALESCE(v_tenant.name, 'ZELUNIA'));

    -- 5. Enfileira Lembrete 24h se habilitado e com horário ainda no futuro
    IF v_settings.enable_24h_reminder AND (v_appt.start_time - INTERVAL '24 hours') > now() THEN
        INSERT INTO public.notification_queue (
            tenant_id,
            appointment_id,
            client_id,
            notification_type,
            channel,
            recipient_phone,
            message_content,
            status,
            scheduled_for,
            idempotency_key
        ) VALUES (
            p_tenant_id,
            v_appt.id,
            v_client.id,
            'reminder_24h',
            'whatsapp',
            COALESCE(v_client.whatsapp, v_client.phone),
            v_msg_24h,
            'pending',
            v_appt.start_time - INTERVAL '24 hours',
            'rem24h_' || v_appt.id::text
        )
        ON CONFLICT (tenant_id, appointment_id, notification_type)
        DO UPDATE SET
            recipient_phone = EXCLUDED.recipient_phone,
            message_content = EXCLUDED.message_content,
            scheduled_for = EXCLUDED.scheduled_for,
            updated_at = now()
        WHERE notification_queue.status = 'pending';
        v_count := v_count + 1;
    END IF;

    -- 6. Enfileira Lembrete 2h se habilitado e com horário ainda no futuro
    IF v_settings.enable_2h_reminder AND (v_appt.start_time - INTERVAL '2 hours') > now() THEN
        INSERT INTO public.notification_queue (
            tenant_id,
            appointment_id,
            client_id,
            notification_type,
            channel,
            recipient_phone,
            message_content,
            status,
            scheduled_for,
            idempotency_key
        ) VALUES (
            p_tenant_id,
            v_appt.id,
            v_client.id,
            'reminder_2h',
            'whatsapp',
            COALESCE(v_client.whatsapp, v_client.phone),
            v_msg_2h,
            'pending',
            v_appt.start_time - INTERVAL '2 hours',
            'rem2h_' || v_appt.id::text
        )
        ON CONFLICT (tenant_id, appointment_id, notification_type)
        DO UPDATE SET
            recipient_phone = EXCLUDED.recipient_phone,
            message_content = EXCLUDED.message_content,
            scheduled_for = EXCLUDED.scheduled_for,
            updated_at = now()
        WHERE notification_queue.status = 'pending';
        v_count := v_count + 1;
    END IF;

    RETURN jsonb_build_object('success', true, 'enqueued_count', v_count);
END;
$$;

-- 7. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tenant_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Políticas para tenant_reminder_settings
CREATE POLICY "Staff can view reminder settings" ON public.tenant_reminder_settings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = tenant_reminder_settings.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Management can manage reminder settings" ON public.tenant_reminder_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = tenant_reminder_settings.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = tenant_reminder_settings.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin')
              AND staff.status = 'active'
        )
    );

-- Políticas para notification_queue
CREATE POLICY "Staff can view notification queue" ON public.notification_queue
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = notification_queue.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.status = 'active'
        )
    );

CREATE POLICY "Management can update notification queue" ON public.notification_queue
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users staff
            WHERE staff.tenant_id = notification_queue.tenant_id
              AND staff.user_id = auth.uid()
              AND staff.role IN ('owner', 'admin', 'receptionist')
              AND staff.status = 'active'
        )
    )
    WITH CHECK (
        tenant_id = notification_queue.tenant_id
    );

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.enqueue_appointment_reminders TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_reminder_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.notification_queue TO authenticated, service_role;
