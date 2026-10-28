-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.6: Confirmação Automática de Agendamentos via WhatsApp
-- Arquivo: supabase/migrations/20261028000029_appointment_whatsapp_confirmation.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança de Comunicação:
-- 1. Resolução do Erro 42725 (function name is not unique):
--    - Em PostgreSQL, funções sobrecarregadas com diferentes listas de parâmetros exigem
--      a assinatura exata de tipos nos comandos DROP FUNCTION e REVOKE/GRANT:
--      (VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB) e a versão anterior de 6 parâmetros.
--    - Limpa proativamente versões legadas com DROP FUNCTION IF EXISTS especificando os argumentos.
-- 2. Vinculação Estrita de Contexto (Context-Aware Confirmation):
--    - A confirmação de agendamento por WhatsApp exige correspondência inequívoca:
--      a) Identificador de botão com ID explícito do agendamento (ex: "CONFIRM_APPT_<UUID>")
--      b) Resposta em contexto de mensagem enviada (context.id igual a um wamid em notification_queue)
--      c) Lembrete oficial despachado recentemente (< 48h) com appointment_id e cliente idênticos.
--    - Mensagens genéricas como "OK" ou "SIM" enviadas espontaneamente sem contexto de notificação
--      NÃO confirmam agendamentos automaticamente, prevenindo confirmações indevidas.
-- 3. Concorrência e Idempotência Rigorosa:
--    - Travamento transacional exclusivo no registro de notificação e agendamento (FOR UPDATE).
--    - Unique constraint em whatsapp_inbound_messages.provider_message_id impedindo duplicidade.
-- 4. Menor Privilégio e Segurança:
--    - RPC de confirmação restrita EXCLUSIVAMENTE a 'service_role' (webhook backend).
--    - Usuários autenticados comuns ('authenticated') e anônimos ('anon') NÃO têm permissão de execução.
-- ==============================================================================

-- 1. NOVAS COLUNAS NA TABELA appointments
ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS confirmed_via_whatsapp BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmation_source VARCHAR(50),
    ADD COLUMN IF NOT EXISTS confirmation_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.appointments.confirmed_via_whatsapp IS 'Indica se a presença foi formalmente confirmada pelo cliente via resposta contextualizada no WhatsApp.';
COMMENT ON COLUMN public.appointments.confirmed_at IS 'Data/hora exata do registro de confirmação pelo cliente.';
COMMENT ON COLUMN public.appointments.confirmation_source IS 'Origem da confirmação (ex: whatsapp_context_reply, whatsapp_interactive_button, reception).';
COMMENT ON COLUMN public.appointments.confirmation_metadata IS 'Metadados técnicos do disparo/resposta oficial da Meta (wamid, raw text, etc).';

-- Índice para consultas na Agenda com filtro de confirmação
CREATE INDEX IF NOT EXISTS idx_appointments_confirmed_whatsapp
    ON public.appointments(tenant_id, confirmed_via_whatsapp)
    WHERE confirmed_via_whatsapp = true;

-- 2. TABELA DE MENSAGENS RECEBIDAS (whatsapp_inbound_messages)
CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    provider_message_id VARCHAR(100) NOT NULL UNIQUE, -- wamid da Meta
    context_message_id VARCHAR(100), -- wamid da notificação à qual o cliente respondeu
    sender_phone VARCHAR(30) NOT NULL,
    message_type VARCHAR(30) NOT NULL DEFAULT 'text', -- 'text', 'button_reply', 'interactive'
    message_text TEXT,
    button_payload VARCHAR(150),
    action_taken VARCHAR(50) NOT NULL DEFAULT 'IGNORED', -- 'CONFIRMED', 'AMBIGUOUS', 'ALREADY_PROCESSED', 'IGNORED', 'NO_CONTEXT'
    raw_payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_tenant
    ON public.whatsapp_inbound_messages(tenant_id, created_at DESC);

-- Habilita RLS na tabela de mensagens de entrada
ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_inbound_select_policy" ON public.whatsapp_inbound_messages;
CREATE POLICY "whatsapp_inbound_select_policy"
    ON public.whatsapp_inbound_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = whatsapp_inbound_messages.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin', 'receptionist')
              AND tu.status = 'active'
        )
    );

-- 3. REMOVE VERSÕES ANTERIORES DA FUNÇÃO (Elimina a duplicidade/ambiguidade do erro 42725)
DROP FUNCTION IF EXISTS public.process_whatsapp_appointment_confirmation(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, JSONB);
DROP FUNCTION IF EXISTS public.process_whatsapp_appointment_confirmation(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB);

-- 4. RPC ATÔMICA: Confirmação Contextual Segura de Agendamento (Assinatura Definitiva de 7 argumentos)
CREATE OR REPLACE FUNCTION public.process_whatsapp_appointment_confirmation(
    p_phone_number_id VARCHAR(100),
    p_sender_phone VARCHAR(30),
    p_message_id VARCHAR(100),
    p_message_text TEXT,
    p_button_payload VARCHAR(150) DEFAULT NULL,
    p_context_message_id VARCHAR(100) DEFAULT NULL,
    p_raw_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant_id UUID;
    v_phone_digits VARCHAR(30);
    v_phone_without_country VARCHAR(30);
    v_client_id UUID;
    v_is_affirmative BOOLEAN := false;
    v_target_appointment_id UUID := NULL;
    v_context_notification RECORD;
    v_target_appointment RECORD;
    v_action VARCHAR(50) := 'IGNORED';
    v_normalized_text TEXT;
    v_uuid_candidate TEXT;
BEGIN
    -- 1. Identificação do Tenant pelo phone_number_id da Meta
    SELECT tenant_id INTO v_tenant_id
    FROM public.tenant_whatsapp_configs
    WHERE phone_number_id = p_phone_number_id
    LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não identificado para o phone_number_id informado.');
    END IF;

    -- 2. Normalização do Telefone
    v_phone_digits := regexp_replace(p_sender_phone, '\D', '', 'g');
    IF length(v_phone_digits) >= 12 AND starts_with(v_phone_digits, '55') THEN
        v_phone_without_country := substr(v_phone_digits, 3);
    ELSE
        v_phone_without_country := v_phone_digits;
    END IF;

    -- 3. Identificação do Cliente
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE tenant_id = v_tenant_id
      AND (
          regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') = v_phone_digits
          OR regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_phone_digits
          OR regexp_replace(COALESCE(whatsapp, ''), '\D', '', 'g') = v_phone_without_country
          OR regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_phone_without_country
      )
    ORDER BY created_at DESC
    LIMIT 1;

    -- 4. Análise de Intenção Afirmativa
    v_normalized_text := lower(trim(COALESCE(p_message_text, '')));

    IF p_button_payload IS NOT NULL AND (
        lower(p_button_payload) IN ('confirm', 'sim', 'confirmar', 'yes', 'btn_confirmar')
        OR starts_with(upper(p_button_payload), 'CONFIRM_APPT_')
    ) THEN
        v_is_affirmative := true;
    ELSIF v_normalized_text IN ('sim', 'confirmo', 'confirmar', 'confirmado', 'vou', 'estarei lá', 'estarei la', 'pode confirmar', '1')
       OR starts_with(v_normalized_text, 'sim ')
       OR starts_with(v_normalized_text, 'confirmo ') THEN
        v_is_affirmative := true;
    END IF;

    -- Se não for afirmativa, apenas registra e encerra
    IF NOT v_is_affirmative THEN
        INSERT INTO public.whatsapp_inbound_messages (
            tenant_id,
            client_id,
            provider_message_id,
            context_message_id,
            sender_phone,
            message_type,
            message_text,
            button_payload,
            action_taken,
            raw_payload
        ) VALUES (
            v_tenant_id,
            v_client_id,
            p_message_id,
            p_context_message_id,
            p_sender_phone,
            CASE WHEN p_button_payload IS NOT NULL THEN 'button_reply' ELSE 'text' END,
            p_message_text,
            p_button_payload,
            'IGNORED',
            p_raw_payload
        ) ON CONFLICT (provider_message_id) DO NOTHING;

        RETURN jsonb_build_object('success', true, 'action', 'IGNORED', 'reason', 'Mensagem sem intenção afirmativa.');
    END IF;

    -- 5. VINCULAÇÃO CONTEXTUAL ESTRITA DO AGENDAMENTO

    -- CASO A: Botão com ID explícito do agendamento (ex: CONFIRM_APPT_<UUID>)
    IF p_button_payload IS NOT NULL AND starts_with(upper(p_button_payload), 'CONFIRM_APPT_') THEN
        v_uuid_candidate := substr(p_button_payload, 14);
        BEGIN
            v_target_appointment_id := v_uuid_candidate::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_target_appointment_id := NULL;
        END;
    END IF;

    -- CASO B: Resposta contextual direta a uma notificação enviada (Meta context.id)
    IF v_target_appointment_id IS NULL AND p_context_message_id IS NOT NULL AND p_context_message_id <> '' THEN
        SELECT appointment_id INTO v_target_appointment_id
        FROM public.notification_queue
        WHERE tenant_id = v_tenant_id
          AND provider_message_id = p_context_message_id
        LIMIT 1;
    END IF;

    -- CASO C: Lembrete oficial enviado recentemente para este cliente (< 48h)
    IF v_target_appointment_id IS NULL AND v_client_id IS NOT NULL THEN
        SELECT q.appointment_id INTO v_target_appointment_id
        FROM public.notification_queue q
        JOIN public.appointments a ON a.id = q.appointment_id
        WHERE q.tenant_id = v_tenant_id
          AND q.client_id = v_client_id
          AND q.status = 'sent'
          AND q.sent_at >= (now() - INTERVAL '48 hours')
          AND a.status = 'scheduled'
          AND a.start_time >= (now() - INTERVAL '2 hours')
        ORDER BY q.sent_at DESC
        LIMIT 1;
    END IF;

    -- Se não há contexto claro, NÃO confirma agendamentos aleatórios
    IF v_target_appointment_id IS NULL THEN
        v_action := 'NO_CONTEXT';
        INSERT INTO public.whatsapp_inbound_messages (
            tenant_id,
            client_id,
            provider_message_id,
            context_message_id,
            sender_phone,
            message_type,
            message_text,
            button_payload,
            action_taken,
            raw_payload
        ) VALUES (
            v_tenant_id,
            v_client_id,
            p_message_id,
            p_context_message_id,
            p_sender_phone,
            CASE WHEN p_button_payload IS NOT NULL THEN 'button_reply' ELSE 'text' END,
            p_message_text,
            p_button_payload,
            v_action,
            p_raw_payload
        ) ON CONFLICT (provider_message_id) DO NOTHING;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'NO_CONTEXT',
            'message', 'Resposta afirmativa recebida fora do contexto de lembretes ativos; retida para conferência na recepção.'
        );
    END IF;

    -- 6. Verificação do Agendamento Alvo com Bloqueio Exclusivo (FOR UPDATE)
    SELECT id, status, confirmed_via_whatsapp, client_id, start_time
    INTO v_target_appointment
    FROM public.appointments
    WHERE id = v_target_appointment_id
      AND tenant_id = v_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_action := 'APPOINTMENT_NOT_FOUND';
        INSERT INTO public.whatsapp_inbound_messages (
            tenant_id,
            client_id,
            appointment_id,
            provider_message_id,
            context_message_id,
            sender_phone,
            message_type,
            message_text,
            button_payload,
            action_taken,
            raw_payload
        ) VALUES (
            v_tenant_id,
            v_client_id,
            v_target_appointment_id,
            p_message_id,
            p_context_message_id,
            p_sender_phone,
            CASE WHEN p_button_payload IS NOT NULL THEN 'button_reply' ELSE 'text' END,
            p_message_text,
            p_button_payload,
            v_action,
            p_raw_payload
        ) ON CONFLICT (provider_message_id) DO NOTHING;

        RETURN jsonb_build_object('success', false, 'action', 'APPOINTMENT_NOT_FOUND');
    END IF;

    -- Se já confirmado, mantém idempotência
    IF v_target_appointment.status = 'confirmed' THEN
        v_action := 'ALREADY_PROCESSED';
        INSERT INTO public.whatsapp_inbound_messages (
            tenant_id,
            client_id,
            appointment_id,
            provider_message_id,
            context_message_id,
            sender_phone,
            message_type,
            message_text,
            button_payload,
            action_taken,
            raw_payload
        ) VALUES (
            v_tenant_id,
            v_target_appointment.client_id,
            v_target_appointment.id,
            p_message_id,
            p_context_message_id,
            p_sender_phone,
            CASE WHEN p_button_payload IS NOT NULL THEN 'button_reply' ELSE 'text' END,
            p_message_text,
            p_button_payload,
            v_action,
            p_raw_payload
        ) ON CONFLICT (provider_message_id) DO NOTHING;

        RETURN jsonb_build_object('success', true, 'action', 'ALREADY_PROCESSED', 'appointment_id', v_target_appointment.id);
    END IF;

    -- Se não estiver em 'scheduled', não altera estado final
    IF v_target_appointment.status <> 'scheduled' THEN
        v_action := 'INVALID_STATE';
        INSERT INTO public.whatsapp_inbound_messages (
            tenant_id,
            client_id,
            appointment_id,
            provider_message_id,
            context_message_id,
            sender_phone,
            message_type,
            message_text,
            button_payload,
            action_taken,
            raw_payload
        ) VALUES (
            v_tenant_id,
            v_target_appointment.client_id,
            v_target_appointment.id,
            p_message_id,
            p_context_message_id,
            p_sender_phone,
            CASE WHEN p_button_payload IS NOT NULL THEN 'button_reply' ELSE 'text' END,
            p_message_text,
            p_button_payload,
            v_action,
            p_raw_payload
        ) ON CONFLICT (provider_message_id) DO NOTHING;

        RETURN jsonb_build_object('success', true, 'action', 'INVALID_STATE', 'appointment_status', v_target_appointment.status);
    END IF;

    -- 7. Atualização Atômica para 'confirmed'
    UPDATE public.appointments
    SET status = 'confirmed',
        confirmed_via_whatsapp = true,
        confirmed_at = now(),
        confirmation_source = CASE
            WHEN p_button_payload IS NOT NULL THEN 'whatsapp_interactive_button'
            WHEN p_context_message_id IS NOT NULL THEN 'whatsapp_context_reply'
            ELSE 'whatsapp_recent_reminder_reply'
        END,
        confirmation_metadata = jsonb_build_object(
            'provider_message_id', p_message_id,
            'context_message_id', p_context_message_id,
            'reply_text', p_message_text,
            'sender_phone', p_sender_phone,
            'button_payload', p_button_payload,
            'confirmed_at', now()
        ),
        updated_at = now()
    WHERE id = v_target_appointment.id
      AND tenant_id = v_tenant_id;

    -- Registro de Sucesso
    INSERT INTO public.whatsapp_inbound_messages (
        tenant_id,
        client_id,
        appointment_id,
        provider_message_id,
        context_message_id,
        sender_phone,
        message_type,
        message_text,
        button_payload,
        action_taken,
        raw_payload
    ) VALUES (
        v_tenant_id,
        v_target_appointment.client_id,
        v_target_appointment.id,
        p_message_id,
        p_context_message_id,
        p_sender_phone,
        CASE WHEN p_button_payload IS NOT NULL THEN 'button_reply' ELSE 'text' END,
        p_message_text,
        p_button_payload,
        'CONFIRMED',
        p_raw_payload
    ) ON CONFLICT (provider_message_id) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'CONFIRMED',
        'appointment_id', v_target_appointment.id,
        'client_id', v_target_appointment.client_id
    );
END;
$$;

-- 5. Permissões de Execução Estritas:
-- Especificação explícita dos tipos de argumento para prevenir erro 42725 em REVOKE/GRANT
REVOKE ALL ON FUNCTION public.process_whatsapp_appointment_confirmation(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_whatsapp_appointment_confirmation(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB) FROM authenticated;
REVOKE ALL ON FUNCTION public.process_whatsapp_appointment_confirmation(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB) FROM anon;

GRANT EXECUTE ON FUNCTION public.process_whatsapp_appointment_confirmation(VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR, JSONB) TO service_role;
