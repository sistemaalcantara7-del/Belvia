-- ==============================================================================
-- ZELUNIA SaaS - Ajuste de Catálogo Público para Estabelecimentos em Trial e Ativos
-- Arquivo: scripts/fix_public_catalog_trial.sql
--
-- OBJETIVO:
--   Permitir que estabelecimentos cadastrados com status 'trial' válido (período de testes de 7 dias)
--   ou status 'active' exibam normalmente sua vitrine digital (/p/[slug]) e realizem
--   agendamentos online pelo catálogo público.
--
-- APLICAÇÃO MANUAL NO SUPABASE SQL EDITOR:
--   Copie e cole o script abaixo no SQL Editor do Supabase para atualizar as 3 RPCs públicas.
-- ==============================================================================

-- 1. Atualizar RPC get_public_tenant_catalog
CREATE OR REPLACE FUNCTION public.get_public_tenant_catalog(p_slug VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
    v_services JSONB;
    v_professionals JSONB;
    v_portfolio JSONB;
    v_bsettings JSONB;
    v_srv_filter UUID[];
    v_prof_filter UUID[];
    v_is_enabled BOOLEAN;
BEGIN
    SELECT id, name, slug, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não encontrado.');
    END IF;

    -- Permite 'active' e 'trial'
    IF v_tenant.status NOT IN ('active', 'trial') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível.');
    END IF;

    v_bsettings := COALESCE(v_tenant.settings->'booking_settings', '{}'::jsonb);
    v_is_enabled := COALESCE((v_bsettings->>'enabled')::BOOLEAN, true);

    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'O agendamento online está temporariamente desativado por este estabelecimento.');
    END IF;

    -- Filtros de Serviços e Profissionais permitidos publicamente
    IF v_bsettings ? 'public_services_filter' AND jsonb_array_length(v_bsettings->'public_services_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_srv_filter
        FROM jsonb_array_elements_text(v_bsettings->'public_services_filter');
    END IF;

    IF v_bsettings ? 'public_professionals_filter' AND jsonb_array_length(v_bsettings->'public_professionals_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_prof_filter
        FROM jsonb_array_elements_text(v_bsettings->'public_professionals_filter');
    END IF;

    -- Catálogo de Serviços Ativos (filtrado)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'description', s.description,
            'category', s.category,
            'duration_minutes', s.duration_minutes,
            'break_minutes', s.break_minutes,
            'price', s.price
        ) ORDER BY s.category ASC, s.name ASC
    ), '[]'::jsonb)
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_tenant.id
      AND s.status = 'active'
      AND (v_srv_filter IS NULL OR s.id = ANY(v_srv_filter));

    -- Catálogo de Profissionais Ativos (filtrado)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', p.id,
            'full_name', p.full_name,
            'specialty', p.specialty,
            'bio', p.bio,
            'avatar_url', p.avatar_url,
            'service_ids', COALESCE((
                SELECT array_agg(ps.service_id)
                FROM public.professional_services ps
                WHERE ps.professional_id = p.id
            ), ARRAY[]::uuid[])
        ) ORDER BY p.full_name ASC
    ), '[]'::jsonb)
    INTO v_professionals
    FROM public.professionals p
    WHERE p.tenant_id = v_tenant.id
      AND p.status = 'active'
      AND (v_prof_filter IS NULL OR p.id = ANY(v_prof_filter));

    -- Catálogo de Portfólio / Galeria Ativa
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', port.id,
            'title', port.title,
            'description', port.description,
            'image_url', port.image_url,
            'category', port.category,
            'sort_order', port.sort_order
        ) ORDER BY port.sort_order ASC, port.created_at DESC
    ), '[]'::jsonb)
    INTO v_portfolio
    FROM public.tenant_portfolio port
    WHERE port.tenant_id = v_tenant.id
      AND port.is_active = true;

    RETURN jsonb_build_object(
        'success', true,
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'settings', v_tenant.settings
        ),
        'services', v_services,
        'professionals', v_professionals,
        'portfolio', v_portfolio
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;

-- 2. Atualizar RPC get_public_available_slots
CREATE OR REPLACE FUNCTION public.get_public_available_slots(
    p_tenant_id UUID,
    p_service_id UUID,
    p_professional_id UUID,
    p_date DATE
)
RETURNS TABLE (
    slot_time TIME,
    professional_id UUID,
    professional_name VARCHAR(255)
)
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
    v_service RECORD;
    v_total_minutes INTEGER;
    v_dow INTEGER;
    v_prof RECORD;
    v_slot_start TIMESTAMPTZ;
    v_slot_end TIMESTAMPTZ;
    v_is_blocked BOOLEAN;
    v_is_occupied BOOLEAN;
    v_cur_slot TIME;
    v_now_sp TIMESTAMPTZ;
BEGIN
    SELECT id, status, settings INTO v_tenant
    FROM public.tenants
    WHERE id = p_tenant_id;

    -- Permite 'active' e 'trial'
    IF NOT FOUND OR v_tenant.status NOT IN ('active', 'trial') THEN
        RETURN;
    END IF;

    v_bsettings := COALESCE(v_tenant.settings->'booking_settings', '{}'::jsonb);
    v_is_enabled := COALESCE((v_bsettings->>'enabled')::BOOLEAN, true);
    IF NOT v_is_enabled THEN
        RETURN;
    END IF;

    v_min_advance_hours := COALESCE((v_bsettings->>'min_advance_hours')::INTEGER, 1);
    v_max_future_days := COALESCE((v_bsettings->>'max_future_days')::INTEGER, 30);
    v_allowed_start := COALESCE((v_bsettings->>'allowed_start_time')::TIME, '07:00:00'::TIME);
    v_allowed_end := COALESCE((v_bsettings->>'allowed_end_time')::TIME, '22:00:00'::TIME);

    v_now_sp := now() AT TIME ZONE 'America/Sao_Paulo';

    -- Validar se a data está dentro do limite de dias futuros
    IF p_date > (v_now_sp::DATE + (v_max_future_days || ' days')::interval)::DATE THEN
        RETURN;
    END IF;

    IF p_date < v_now_sp::DATE THEN
        RETURN;
    END IF;

    -- Validar e obter serviço
    SELECT id, name, duration_minutes, COALESCE(break_minutes, 0) as break_minutes
    INTO v_service
    FROM public.services
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Validar se serviço é permitido publicamente
    IF v_bsettings ? 'public_services_filter' AND jsonb_array_length(v_bsettings->'public_services_filter') > 0 THEN
        IF NOT (v_bsettings->'public_services_filter' @> to_jsonb(p_service_id::text)) THEN
            RETURN;
        END IF;
    END IF;

    v_total_minutes := v_service.duration_minutes + v_service.break_minutes;
    v_dow := EXTRACT(DOW FROM p_date)::INTEGER;

    -- Iterar sobre profissionais habilitados e ativos
    FOR v_prof IN
        SELECT DISTINCT p.id, p.full_name
        FROM public.professionals p
        JOIN public.professional_services ps ON ps.professional_id = p.id
        WHERE p.tenant_id = p_tenant_id
          AND p.status = 'active'
          AND ps.service_id = p_service_id
          AND (p_professional_id IS NULL OR p.id = p_professional_id)
          AND (
              NOT (v_bsettings ? 'public_professionals_filter')
              OR jsonb_array_length(v_bsettings->'public_professionals_filter') = 0
              OR v_bsettings->'public_professionals_filter' @> to_jsonb(p.id::text)
          )
    LOOP
        -- Buscar expediente do profissional para o dia da semana
        DECLARE
            v_sched RECORD;
        BEGIN
            SELECT start_time, end_time, break_start, break_end, is_active
            INTO v_sched
            FROM public.professional_schedules
            WHERE tenant_id = p_tenant_id
              AND professional_id = v_prof.id
              AND day_of_week = v_dow
              AND is_active = true;

            IF FOUND THEN
                v_cur_slot := GREATEST(v_sched.start_time, v_allowed_start);

                WHILE (v_cur_slot + (v_total_minutes || ' minutes')::interval)::TIME <= LEAST(v_sched.end_time, v_allowed_end) LOOP
                    -- Ignora intervalo de almoço do profissional
                    IF v_sched.break_start IS NOT NULL AND v_sched.break_end IS NOT NULL THEN
                        IF v_cur_slot < v_sched.break_end AND (v_cur_slot + (v_total_minutes || ' minutes')::interval)::TIME > v_sched.break_start THEN
                            v_cur_slot := (v_cur_slot + INTERVAL '30 minutes')::TIME;
                            CONTINUE;
                        END IF;
                    END IF;

                    -- Monta timestamp UTC para checagens
                    v_slot_start := (p_date || ' ' || v_cur_slot)::timestamp AT TIME ZONE 'America/Sao_Paulo';
                    v_slot_end := v_slot_start + (v_total_minutes || ' minutes')::interval;

                    -- Ignora horários passados ou que violem antecedência mínima
                    IF v_slot_start < (now() + (v_min_advance_hours || ' hours')::interval) THEN
                        v_cur_slot := (v_cur_slot + INTERVAL '30 minutes')::TIME;
                        CONTINUE;
                    END IF;

                    -- Checar se há bloqueio pontual
                    SELECT EXISTS (
                        SELECT 1 FROM public.professional_time_blocks tb
                        WHERE tb.tenant_id = p_tenant_id
                          AND tb.professional_id = v_prof.id
                          AND tb.start_time < v_slot_end
                          AND tb.end_time > v_slot_start
                    ) INTO v_is_blocked;

                    IF NOT v_is_blocked THEN
                        -- Checar se há agendamento concorrente ativo
                        SELECT EXISTS (
                            SELECT 1 FROM public.appointments a
                            WHERE a.tenant_id = p_tenant_id
                              AND a.professional_id = v_prof.id
                              AND a.status IN ('scheduled', 'confirmed', 'in_progress', 'completed')
                              AND a.start_time < v_slot_end
                              AND a.end_time > v_slot_start
                        ) INTO v_is_occupied;

                        IF NOT v_is_occupied THEN
                            slot_time := v_cur_slot;
                            professional_id := v_prof.id;
                            professional_name := v_prof.full_name;
                            RETURN NEXT;
                        END IF;
                    END IF;

                    v_cur_slot := (v_cur_slot + INTERVAL '30 minutes')::TIME;
                END LOOP;
            END IF;
        END;
    END LOOP;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, UUID, DATE) TO anon, authenticated, service_role;

-- 3. Atualizar RPC create_public_online_appointment
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
    v_existing_client RECORD;
    v_client_id UUID;
    v_persisted_client_name VARCHAR(255);
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
    -- 1. Validar e obter Tenant ativo ou em trial válido
    SELECT id, name, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_tenant_slug;

    -- Permite 'active' e 'trial'
    IF NOT FOUND OR v_tenant.status NOT IN ('active', 'trial') THEN
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
            'message', 'Antecedência mínima exigida: ' || v_min_advance_hours || ' hora(s).'
        );
    END IF;

    -- Validação de janela máxima de agendamento no futuro
    v_now_sp := now() AT TIME ZONE 'America/Sao_Paulo';
    v_slot_local_date := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_slot_local_time := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::TIME;

    IF v_slot_local_date > (v_now_sp::DATE + (v_max_future_days || ' days')::interval)::DATE THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'MAX_FUTURE_DAYS_EXCEEDED',
            'message', 'Agendamentos são permitidos para no máximo ' || v_max_future_days || ' dias no futuro.'
        );
    END IF;

    -- Validação de faixa horária permitida
    IF v_slot_local_time < v_allowed_start OR v_slot_local_time > v_allowed_end THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'OUTSIDE_ALLOWED_HOURS',
            'message', 'O horário escolhido está fora da faixa de agendamento permitida.'
        );
    END IF;

    -- 3. Proteção contra Abuso (Rate Limit: máx 12 tentativas por IP/Telefone a cada 10 min)
    v_clean_whatsapp := regexp_replace(COALESCE(p_client_whatsapp, ''), '\D', '', 'g');
    v_clean_name := trim(COALESCE(p_client_name, ''));

    IF length(v_clean_name) < 3 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_NAME', 'message', 'Por favor, informe seu nome completo com pelo menos 3 caracteres.');
    END IF;

    IF length(v_clean_whatsapp) < 10 OR length(v_clean_whatsapp) > 11 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_WHATSAPP', 'message', 'Informe um WhatsApp válido com DDD (10 ou 11 dígitos numéricos).');
    END IF;

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
            'code', 'OUTSIDE_WORK_HOURS',
            'message', 'O horário escolhido está fora do expediente de atendimento do profissional.'
        );
    END IF;

    -- 7.3 Não colide com intervalo de almoço/descanso
    IF v_sched.break_start IS NOT NULL AND v_sched.break_end IS NOT NULL THEN
        IF v_slot_local_time < v_sched.break_end AND (v_slot_local_time + (v_total_minutes || ' minutes')::interval)::TIME > v_sched.break_start THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'IN_BREAK_TIME',
                'message', 'O horário coincide com o intervalo de descanso do profissional.'
            );
        END IF;
    END IF;

    -- 7.4 Conflito com bloqueio de horário pontual (time blocks)
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

    -- 8. Resolução Segura de Identidade do Cliente (Blindagem de Titularidade)
    SELECT id, full_name
    INTO v_existing_client
    FROM public.clients
    WHERE tenant_id = v_tenant.id
      AND (whatsapp = v_clean_whatsapp OR phone = v_clean_whatsapp)
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_existing_client.id IS NULL THEN
        -- Cliente totalmente novo: cria cadastro normalmente
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
        RETURNING id, full_name INTO v_client_id, v_persisted_client_name;
    ELSE
        -- Telefone já existe no tenant.
        IF lower(trim(v_existing_client.full_name)) = lower(v_clean_name)
           OR position(lower(v_clean_name) in lower(v_existing_client.full_name)) > 0
           OR position(lower(v_existing_client.full_name) in lower(v_clean_name)) > 0 THEN
            v_client_id := v_existing_client.id;
            v_persisted_client_name := v_existing_client.full_name;
        ELSE
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
                'Cadastrado via Agendamento Online Público (número compartilhado com outro cadastro)'
            )
            RETURNING id, full_name INTO v_client_id, v_persisted_client_name;
        END IF;
    END IF;

    -- 9. Inserir Agendamento Oficial
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
            RETURN jsonb_build_object(
                'success', false,
                'code', 'APPOINTMENT_INSERT_ERROR',
                'message', 'Não foi possível confirmar o agendamento neste momento. Código: ' || v_err_sqlstate
            );
    END;

    -- 10. Sucesso
    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_new_appointment_id,
        'tenant_name', v_tenant.name,
        'service_name', v_service.name,
        'professional_name', v_professional.full_name,
        'start_time', p_start_time,
        'end_time', v_end_time,
        'price', v_service.price,
        'client_name', v_persisted_client_name,
        'client_whatsapp', v_clean_whatsapp,
        'message', 'Agendamento realizado com sucesso!'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
