-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.5.4: Correção e Blindagem Definitiva da RPC de Agendamento Online
-- Arquivo: supabase/migrations/20261030000040_fix_public_booking_rpc_persistence.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Revisões Realizadas (Prompt 132):
-- 1. Remoção do campo inexistente 'created_by' no comando INSERT INTO public.appointments:
--    - A tabela public.appointments (definida na migration 07) não possui a coluna 'created_by'.
--    - O INSERT utiliza estritamente as colunas existentes:
--      (tenant_id, client_id, service_id, professional_id, start_time, end_time, price, status, notes).
-- 2. Eliminação total de classificação de CONFLICT por inspeção de texto/substring de mensagem:
--    - Verificação estrita e explícita de disponibilidade da agenda do profissional no banco antes do INSERT.
--    - Checagem atômica de expediente (professional_schedules), bloqueios (professional_time_blocks)
--      e conflitos de horários com agendamentos existentes (appointments).
--    - Tratamento de exceção baseado exclusivamente em SQLSTATEs canônicos do PostgreSQL:
--      * 23P01 (exclusion_violation)
--      * 23505 (unique_violation)
--      * 40P01 (deadlock_detected)
--      * 40001 (serialization_failure)
-- 3. Preservação de advisory locks, isolamento multi-tenant estrito e segurança SECURITY DEFINER.
-- 4. Blindagem de erros internos: qualquer falha técnica inesperada retorna PERSISTENCE_ERROR
--    com mensagem amigável sem vazar detalhes internos de schema ou banco.
-- 5. Total paridade de assinatura e tipos com publicBooking.ts e o fluxo conversacional do chat.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_public_online_appointment(
    p_tenant_slug VARCHAR,
    p_service_id UUID,
    p_professional_id UUID,
    p_start_time TIMESTAMPTZ,
    p_client_name VARCHAR(255),
    p_client_whatsapp VARCHAR(50),
    p_client_email VARCHAR(255) DEFAULT NULL,
    p_client_notes TEXT DEFAULT NULL,
    p_client_ip VARCHAR(100) DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
    v_bsettings JSONB;
    v_is_enabled BOOLEAN;
    v_min_advance_hours INTEGER;
    v_max_future_days INTEGER;
    v_allowed_start TIME;
    v_allowed_end TIME;
    v_srv_filter UUID[];
    v_prof_filter UUID[];
    v_service RECORD;
    v_professional RECORD;
    v_client_id UUID;
    v_clean_whatsapp VARCHAR(20);
    v_clean_name VARCHAR(255);
    v_total_minutes INTEGER;
    v_end_time TIMESTAMPTZ;
    v_new_appointment_id UUID;
    v_lock_id BIGINT;
    v_rate_count INTEGER;
    v_slot_local_time TIME;
    v_slot_local_date DATE;
    v_now_sp TIMESTAMPTZ;
    v_dow INTEGER;
    v_sched RECORD;
    v_is_occupied BOOLEAN;
    v_is_blocked BOOLEAN;
    v_err_sqlstate TEXT;
BEGIN
    -- 1. Validar e obter Tenant ativo
    SELECT id, name, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_tenant_slug;

    IF NOT FOUND OR v_tenant.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TENANT', 'message', 'Estabelecimento indisponível.');
    END IF;

    -- 2. Validar configurações públicas de agendamento do estabelecimento
    v_bsettings := COALESCE(v_tenant.settings->'booking_settings', '{}'::jsonb);
    v_is_enabled := COALESCE((v_bsettings->>'enabled')::BOOLEAN, true);
    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('success', false, 'code', 'BOOKING_DISABLED', 'message', 'O agendamento online deste estabelecimento está temporariamente suspenso.');
    END IF;

    v_min_advance_hours := COALESCE((v_bsettings->>'min_advance_hours')::INTEGER, 1);
    v_max_future_days := COALESCE((v_bsettings->>'max_future_days')::INTEGER, 30);
    v_allowed_start := COALESCE((v_bsettings->>'allowed_start_time')::TIME, '07:00:00'::TIME);
    v_allowed_end := COALESCE((v_bsettings->>'allowed_end_time')::TIME, '22:00:00'::TIME);

    -- Validação de antecedência mínima
    IF p_start_time < (now() + (v_min_advance_hours || ' hours')::interval) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MIN_ADVANCE_REQUIRED',
            'message', 'Antecedência mínima exigida para agendamentos: ' || v_min_advance_hours || ' hora(s).'
        );
    END IF;

    v_now_sp := now() AT TIME ZONE 'America/Sao_Paulo';
    v_slot_local_date := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_slot_local_time := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::TIME;

    -- Validação de limite de dias futuros
    IF v_slot_local_date > (v_now_sp::DATE + (v_max_future_days || ' days')::interval)::DATE THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'FUTURE_LIMIT_EXCEEDED',
            'message', 'Agendamentos são permitidos para no máximo ' || v_max_future_days || ' dias no futuro.'
        );
    END IF;

    -- Validação de faixa de horário comercial permitido nas configurações da clínica
    IF v_slot_local_time < v_allowed_start OR v_slot_local_time > v_allowed_end THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TIME_OUT_OF_RANGE',
            'message', 'Horário fora da faixa de agendamento online permitida pelo estabelecimento.'
        );
    END IF;

    -- Validação de filtros de visibilidade pública
    IF v_bsettings ? 'public_services_filter' AND jsonb_array_length(v_bsettings->'public_services_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_srv_filter
        FROM jsonb_array_elements_text(v_bsettings->'public_services_filter');

        IF NOT (p_service_id = ANY(v_srv_filter)) THEN
            RETURN jsonb_build_object('success', false, 'code', 'SERVICE_NOT_PUBLIC', 'message', 'Este serviço não está disponível para reserva online.');
        END IF;
    END IF;

    IF v_bsettings ? 'public_professionals_filter' AND jsonb_array_length(v_bsettings->'public_professionals_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_prof_filter
        FROM jsonb_array_elements_text(v_bsettings->'public_professionals_filter');

        IF NOT (p_professional_id = ANY(v_prof_filter)) THEN
            RETURN jsonb_build_object('success', false, 'code', 'PROFESSIONAL_NOT_PUBLIC', 'message', 'Este profissional não está disponível para reserva online.');
        END IF;
    END IF;

    -- 3. Sanitização e Validação de Dados de Entrada
    v_clean_whatsapp := regexp_replace(COALESCE(p_client_whatsapp, ''), '\D', '', 'g');
    v_clean_name := trim(COALESCE(p_client_name, ''));

    IF length(v_clean_name) < 3 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_NAME', 'message', 'Por favor, informe seu nome completo com pelo menos 3 caracteres.');
    END IF;

    IF length(v_clean_whatsapp) < 10 OR length(v_clean_whatsapp) > 11 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_WHATSAPP', 'message', 'WhatsApp inválido. Informe o DDD e o número com 10 ou 11 dígitos.');
    END IF;

    -- Rate Limit por IP ou Telefone (máximo 12 tentativas a cada 10 minutos)
    SELECT count(*)
    INTO v_rate_count
    FROM public.public_booking_rate_limits
    WHERE tenant_id = v_tenant.id
      AND (client_identifier = p_client_ip OR client_identifier = v_clean_whatsapp)
      AND created_at > (now() - INTERVAL '10 minutes');

    IF v_rate_count >= 12 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED', 'message', 'Muitas tentativas em curto período. Por favor, aguarde alguns minutos antes de tentar novamente.');
    END IF;

    INSERT INTO public.public_booking_rate_limits (tenant_id, client_identifier, action_type)
    VALUES (v_tenant.id, v_clean_whatsapp, 'booking_attempt');

    -- 4. Validar Serviço
    SELECT id, name, price, duration_minutes, COALESCE(break_minutes, 0) as break_minutes
    INTO v_service
    FROM public.services
    WHERE id = p_service_id
      AND tenant_id = v_tenant.id
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_SERVICE', 'message', 'Serviço não encontrado ou inativo.');
    END IF;

    v_total_minutes := v_service.duration_minutes + v_service.break_minutes;
    v_end_time := p_start_time + (v_total_minutes || ' minutes')::interval;

    -- 5. Validar Profissional
    SELECT id, full_name
    INTO v_professional
    FROM public.professionals
    WHERE id = p_professional_id
      AND tenant_id = v_tenant.id
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PROFESSIONAL', 'message', 'Profissional não disponível.');
    END IF;

    -- 6. Adquirir Advisory Lock Determinístico por Profissional (Evita Race Condition / Double-booking)
    v_lock_id := ('x' || substr(md5('prof_lock_' || v_professional.id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_id);

    -- 7. Validação Explícita da Agenda do Profissional (Paridade com get_public_available_slots)
    v_dow := EXTRACT(DOW FROM v_slot_local_date)::INTEGER;

    -- 7.1 Expediente semanal ativo do profissional
    SELECT start_time, end_time, break_start, break_end, is_active
    INTO v_sched
    FROM public.professional_schedules
    WHERE tenant_id = v_tenant.id
      AND professional_id = v_professional.id
      AND day_of_week = v_dow
      AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SCHEDULE_UNAVAILABLE',
            'message', 'O profissional não realiza atendimentos neste dia da semana.'
        );
    END IF;

    -- 7.2 Dentro da janela de expediente
    IF (v_slot_local_time < v_sched.start_time) OR ((v_slot_local_time + (v_total_minutes || ' minutes')::interval)::TIME > v_sched.end_time) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'OUTSIDE_WORKING_HOURS',
            'message', 'O horário solicitado está fora do expediente de trabalho do profissional.'
        );
    END IF;

    -- 7.3 Conflito com intervalo de almoço/descanso
    IF v_sched.break_start IS NOT NULL AND v_sched.break_end IS NOT NULL THEN
        IF (v_slot_local_time < v_sched.break_end) AND ((v_slot_local_time + (v_total_minutes || ' minutes')::interval)::TIME > v_sched.break_start) THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'BREAK_TIME_CONFLICT',
                'message', 'O horário solicitado coincide com o intervalo de descanso do profissional.'
            );
        END IF;
    END IF;

    -- 7.4 Conflito com bloqueio eventual de agenda (professional_time_blocks)
    SELECT EXISTS (
        SELECT 1
        FROM public.professional_time_blocks tb
        WHERE tb.tenant_id = v_tenant.id
          AND tb.professional_id = v_professional.id
          AND tb.start_time < v_end_time
          AND tb.end_time > p_start_time
    ) INTO v_is_blocked;

    IF v_is_blocked THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'SLOT_BLOCKED',
            'message', 'O horário selecionado está temporariamente bloqueado para agendamentos.'
        );
    END IF;

    -- 7.5 Conflito com agendamento ativo concorrente (appointments)
    SELECT EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.tenant_id = v_tenant.id
          AND a.professional_id = v_professional.id
          AND a.status IN ('scheduled', 'confirmed', 'in_progress', 'completed')
          AND a.start_time < v_end_time
          AND a.end_time > p_start_time
    ) INTO v_is_occupied;

    IF v_is_occupied THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'CONFLICT',
            'message', 'O horário selecionado não está mais disponível. Por favor, escolha outro horário.'
        );
    END IF;

    -- 8. Localizar ou Cadastrar Cliente no Tenant (Evita duplicidade de cadastro)
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE tenant_id = v_tenant.id
      AND (whatsapp = v_clean_whatsapp OR phone = v_clean_whatsapp)
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_client_id IS NULL THEN
        INSERT INTO public.clients (
            tenant_id,
            full_name,
            whatsapp,
            phone,
            email,
            status,
            notes
        ) VALUES (
            v_tenant.id,
            v_clean_name,
            v_clean_whatsapp,
            v_clean_whatsapp,
            nullif(trim(p_client_email), ''),
            'active',
            'Cadastrado via Agendamento Online Público'
        )
        RETURNING id INTO v_client_id;
    ELSE
        UPDATE public.clients
        SET
            full_name = COALESCE(full_name, v_clean_name),
            email = COALESCE(email, nullif(trim(p_client_email), ''))
        WHERE id = v_client_id;
    END IF;

    -- 9. Inserir Agendamento Oficial (Apenas colunas existentes na tabela appointments)
    BEGIN
        INSERT INTO public.appointments (
            tenant_id,
            client_id,
            service_id,
            professional_id,
            start_time,
            end_time,
            price,
            status,
            notes
        ) VALUES (
            v_tenant.id,
            v_client_id,
            v_service.id,
            v_professional.id,
            p_start_time,
            v_end_time,
            v_service.price,
            'scheduled',
            COALESCE(p_client_notes, 'Agendado pelo próprio cliente via link público.')
        )
        RETURNING id INTO v_new_appointment_id;

    EXCEPTION
        WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_err_sqlstate = RETURNED_SQLSTATE;

            -- Classificação estrita por SQLSTATE do PostgreSQL:
            -- 23P01: exclusion_violation (conflito de exclusão/sobreposição)
            -- 23505: unique_violation (chave única duplicada)
            -- 40P01: deadlock_detected (concorrência de lock de transação)
            -- 40001: serialization_failure (conflito de serialização)
            IF v_err_sqlstate IN ('23P01', '23505', '40P01', '40001') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'CONFLICT',
                    'message', 'O horário selecionado não está mais disponível. Por favor, escolha outro horário.'
                );
            ELSE
                -- Erro interno sem expor detalhes técnicos ao cliente visitante
                RETURN jsonb_build_object(
                    'success', false,
                    'code', 'PERSISTENCE_ERROR',
                    'message', 'Não foi possível confirmar o agendamento no momento. Por favor, tente novamente em instantes.'
                );
            END IF;
    END;

    -- 10. Sucesso: retorna dados estruturados para tela/chat de confirmação
    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_new_appointment_id,
        'tenant_name', v_tenant.name,
        'service_name', v_service.name,
        'professional_name', v_professional.full_name,
        'start_time', p_start_time,
        'end_time', v_end_time,
        'price', v_service.price,
        'client_name', v_clean_name,
        'client_whatsapp', v_clean_whatsapp,
        'message', 'Agendamento realizado com sucesso!'
    );
END;
$$;

-- Permissões de execução pública
GRANT EXECUTE ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
