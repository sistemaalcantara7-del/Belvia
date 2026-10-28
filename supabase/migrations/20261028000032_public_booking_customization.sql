-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 6.2: Personalização e Governança do Agendamento Público
-- Arquivo: supabase/migrations/20261028000032_public_booking_customization.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança:
-- 1. Estrutura 'booking_settings' dentro de public.tenants.settings (JSONB):
--    - enabled: BOOLEAN (Habilita ou desativa a página pública de agendamentos).
--    - min_advance_hours: INTEGER (Antecedência mínima para agendar, ex.: 2h).
--    - max_future_days: INTEGER (Limite máximo de dias no futuro, ex.: 30 dias).
--    - allowed_start_time: TIME (Horário mínimo de início aceito, ex.: '08:00').
--    - allowed_end_time: TIME (Horário máximo aceito, ex.: '20:00').
--    - primary_color: VARCHAR (Cor primária customizada do estabelecimento).
--    - secondary_color: VARCHAR (Cor secundária customizada).
--    - cover_url: TEXT (URL da imagem de capa ou banner).
--    - logo_url: TEXT (Logomarca do estabelecimento).
--    - public_services_filter: UUID[] (Serviços selecionados para exibição pública; se vazio, exibe todos).
--    - public_professionals_filter: UUID[] (Profissionais selecionados para exibição pública; se vazio, exibe todos).
--    - business_description: TEXT (Descrição/apresentação comercial).
--    - address: TEXT (Endereço físico).
--    - city: TEXT (Cidade e estado).
--    - instagram: TEXT (Perfil do Instagram).
--    - facebook: TEXT (Perfil do Facebook).
--    - website: TEXT (Site institucional).
-- 2. Atualização da RPC get_public_tenant_catalog:
--    - Retorna a identidade visual customizada e filtra serviços e profissionais permitidos.
-- 3. Atualização da RPC get_public_available_slots:
--    - Respeita o status de ativação, antecedência mínima, limite de dias futuros e horários permitidos.
-- 4. Atualização da RPC create_public_online_appointment:
--    - Valida rigorosamente no servidor todas as regras de antecedência mínima, limite de dias
--      e permissão pública do serviço e profissional antes de inserir o agendamento.
-- ==============================================================================

-- 1. Atualizar RPC get_public_tenant_catalog para suportar a personalização completa
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

    IF v_tenant.status <> 'active' THEN
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

    RETURN jsonb_build_object(
        'success', true,
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'settings', v_tenant.settings
        ),
        'services', v_services,
        'professionals', v_professionals
    );
END;
$$;

-- 2. Atualizar RPC get_public_available_slots para respeitar limites de antecedência e dias futuros
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

    IF NOT FOUND OR v_tenant.status <> 'active' THEN
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

    SELECT id, name, duration_minutes, COALESCE(break_minutes, 0) as break_minutes
    INTO v_service
    FROM public.services
    WHERE id = p_service_id
      AND tenant_id = p_tenant_id
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN;
    END IF;

    v_total_minutes := v_service.duration_minutes + v_service.break_minutes;
    v_dow := EXTRACT(DOW FROM p_date)::INTEGER;

    FOR v_prof IN
        SELECT p.id, p.full_name, ps.start_time as sched_start, ps.end_time as sched_end,
               ps.break_start, ps.break_end
        FROM public.professionals p
        INNER JOIN public.professional_services srv_link
            ON srv_link.professional_id = p.id AND srv_link.service_id = p_service_id
        INNER JOIN public.professional_schedules ps
            ON ps.professional_id = p.id AND ps.day_of_week = v_dow AND ps.is_active = true
        WHERE p.tenant_id = p_tenant_id
          AND p.status = 'active'
          AND (p_professional_id IS NULL OR p.id = p_professional_id)
        ORDER BY p.full_name ASC
    LOOP
        v_cur_slot := GREATEST(v_prof.sched_start, v_allowed_start);

        WHILE (v_cur_slot + (v_total_minutes || ' minutes')::interval)::TIME <= LEAST(v_prof.sched_end, v_allowed_end) LOOP
            IF v_prof.break_start IS NOT NULL AND v_prof.break_end IS NOT NULL THEN
                IF v_cur_slot < v_prof.break_end AND (v_cur_slot + (v_total_minutes || ' minutes')::interval)::TIME > v_prof.break_start THEN
                    v_cur_slot := (v_cur_slot + INTERVAL '15 minutes')::TIME;
                    CONTINUE;
                END IF;
            END IF;

            v_slot_start := (p_date || ' ' || v_cur_slot)::timestamp AT TIME ZONE 'America/Sao_Paulo';
            v_slot_end := v_slot_start + (v_total_minutes || ' minutes')::interval;

            -- Valida antecedência mínima
            IF v_slot_start >= (now() + (v_min_advance_hours || ' hours')::interval) THEN
                SELECT EXISTS (
                    SELECT 1
                    FROM public.professional_time_blocks tb
                    WHERE tb.tenant_id = p_tenant_id
                      AND tb.professional_id = v_prof.id
                      AND tb.start_time < v_slot_end
                      AND tb.end_time > v_slot_start
                ) INTO v_is_blocked;

                IF NOT v_is_blocked THEN
                    SELECT EXISTS (
                        SELECT 1
                        FROM public.appointments a
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
            END IF;

            v_cur_slot := (v_cur_slot + INTERVAL '30 minutes')::TIME;
        END LOOP;
    END LOOP;
END;
$$;

-- 3. Atualizar RPC create_public_online_appointment para validar regras customizadas do estabelecimento
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
BEGIN
    SELECT id, name, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_tenant_slug;

    IF NOT FOUND OR v_tenant.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TENANT', 'message', 'Estabelecimento indisponível.');
    END IF;

    -- Validar configurações do agendamento
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
        RETURN jsonb_build_object('success', false, 'code', 'MIN_ADVANCE_REQUIRED', 'message', 'Antecedência mínima exigida para agendamentos: ' || v_min_advance_hours || ' hora(s).');
    END IF;

    v_slot_local_date := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_slot_local_time := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::TIME;

    -- Validação de limite de dias futuros
    IF v_slot_local_date > ((now() AT TIME ZONE 'America/Sao_Paulo')::DATE + (v_max_future_days || ' days')::interval)::DATE THEN
        RETURN jsonb_build_object('success', false, 'code', 'FUTURE_LIMIT_EXCEEDED', 'message', 'Agendamentos permitidos para no máximo ' || v_max_future_days || ' dias no futuro.');
    END IF;

    -- Validação de horário permitido
    IF v_slot_local_time < v_allowed_start OR v_slot_local_time > v_allowed_end THEN
        RETURN jsonb_build_object('success', false, 'code', 'TIME_OUT_OF_RANGE', 'message', 'Horário fora da faixa de agendamento online permitida pelo estabelecimento.');
    END IF;

    -- Validação de filtros de visibilidade
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

    -- Rate Limit
    v_clean_whatsapp := regexp_replace(COALESCE(p_client_whatsapp, ''), '\D', '', 'g');
    v_clean_name := trim(COALESCE(p_client_name, ''));

    IF length(v_clean_name) < 3 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_NAME', 'message', 'Por favor, informe seu nome completo com pelo menos 3 caracteres.');
    END IF;

    IF length(v_clean_whatsapp) < 10 OR length(v_clean_whatsapp) > 11 THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_WHATSAPP', 'message', 'WhatsApp inválido. Informe o DDD e o número com 10 ou 11 dígitos.');
    END IF;

    SELECT count(*)
    INTO v_rate_count
    FROM public.public_booking_rate_limits
    WHERE tenant_id = v_tenant.id
      AND (client_identifier = p_client_ip OR client_identifier = v_clean_whatsapp)
      AND created_at > (now() - INTERVAL '10 minutes');

    IF v_rate_count >= 10 THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED', 'message', 'Muitas tentativas em curto período. Por favor, aguarde alguns minutos antes de tentar novamente.');
    END IF;

    INSERT INTO public.public_booking_rate_limits (tenant_id, client_identifier, action_type)
    VALUES (v_tenant.id, v_clean_whatsapp, 'booking_attempt');

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

    SELECT id, full_name
    INTO v_professional
    FROM public.professionals
    WHERE id = p_professional_id
      AND tenant_id = v_tenant.id
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PROFESSIONAL', 'message', 'Profissional não disponível.');
    END IF;

    v_lock_id := ('x' || substr(md5('prof_lock_' || v_professional.id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_id);

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
            notes,
            created_by
        ) VALUES (
            v_tenant.id,
            v_client_id,
            v_service.id,
            v_professional.id,
            p_start_time,
            v_end_time,
            v_service.price,
            'scheduled',
            COALESCE(p_client_notes, 'Agendado pelo próprio cliente via link público.'),
            NULL
        )
        RETURNING id INTO v_new_appointment_id;

    EXCEPTION
        WHEN OTHERS THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'CONFLICT',
                'message', 'Horário indisponível ou já reservado por outro cliente. Por favor, escolha outro horário.'
            );
    END;

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

-- 4. Reafirmação de permissões de execução
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, UUID, DATE) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
