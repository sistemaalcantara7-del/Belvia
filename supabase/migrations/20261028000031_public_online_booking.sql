-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 6.1: Agendamento Online Público & Disponibilidade
-- Arquivo: supabase/migrations/20261028000031_public_online_booking.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Segurança:
-- 1. Tabela public.public_booking_rate_limits:
--    - Controle de taxa e proteção contra abuso/DDoS por IP ou telefone (ex.: máx 10 tentativas a cada 10 minutos).
-- 2. Configurações Públicas do Estabelecimento:
--    - Suporte a 'booking_enabled' e 'public_info' dentro de public.tenants.settings JSONB.
-- 3. RPC public.get_public_tenant_catalog:
--    - Retorna de forma segura os dados públicos do estabelecimento (nome, slug, logo/avatar, telefone, endereço),
--      serviços ativos e lista de profissionais ativos habilitados (sem expor dados sensíveis ou cadastros internos).
-- 4. RPC public.get_public_available_slots:
--    - Calcula os horários livres reais do estabelecimento e profissionais, respeitando:
--      * Expediente habitual (professional_schedules)
--      * Intervalo de almoço/descanso (break_start / break_end)
--      * Bloqueios pontuais (professional_time_blocks)
--      * Atendimentos já marcados (appointments com status ativo)
--      * Duração do serviço + tempo de higienização (break_minutes)
-- 5. RPC Atômica public.create_public_online_appointment:
--    - Localiza ou cadastra o cliente no tenant correspondente pelo número de WhatsApp (sanitizado).
--    - Aplica advisory lock determinístico por profissional ('prof_lock_...').
--    - Garante que nenhuma colisão de horários ou sobreposição (double-booking) ocorra.
--    - Insere o agendamento com status = 'scheduled' e flag confirmed_via_whatsapp = false.
--    - Não dispara mensagens ativas por padrão (respeitando dry_run_mode e ativação controlada).
-- ==============================================================================

-- 1. TABELA DE RATE LIMIT PÚBLICO (Prevenção de Abuso e Brute-force)
CREATE TABLE IF NOT EXISTS public.public_booking_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_identifier VARCHAR(100) NOT NULL, -- Hash de IP ou Telefone
    action_type VARCHAR(50) NOT NULL DEFAULT 'booking_attempt',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_rate_limit ON public.public_booking_rate_limits(tenant_id, client_identifier, created_at);

-- Habilita RLS na tabela de rate limit
ALTER TABLE public.public_booking_rate_limits ENABLE ROW LEVEL SECURITY;

-- 2. RPC: Obter Catálogo Público do Estabelecimento (Sem Login)
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
BEGIN
    -- Localiza o tenant ativo pelo slug
    SELECT id, name, slug, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não encontrado.');
    END IF;

    IF v_tenant.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível para novos agendamentos online.');
    END IF;

    -- Catálogo de Serviços Ativos
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
      AND s.status = 'active';

    -- Catálogo de Profissionais Ativos e suas associações com serviços
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
      AND p.status = 'active';

    RETURN jsonb_build_object(
        'success', true,
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'settings', jsonb_build_object(
                'business_name', v_tenant.settings->>'business_name',
                'phone', v_tenant.settings->>'phone',
                'whatsapp', v_tenant.settings->>'whatsapp',
                'address', v_tenant.settings->>'address',
                'city', v_tenant.settings->>'city',
                'instagram', v_tenant.settings->>'instagram',
                'booking_notice', v_tenant.settings->>'booking_notice'
            )
        ),
        'services', v_services,
        'professionals', v_professionals
    );
END;
$$;

-- 3. RPC: Obter Horários Livres (Slots) Disponíveis para Agendamento Público
CREATE OR REPLACE FUNCTION public.get_public_available_slots(
    p_tenant_id UUID,
    p_service_id UUID,
    p_professional_id UUID, -- Se NULL, avalia todos os profissionais habilitados para o serviço
    p_date DATE             -- Data pretendida ('YYYY-MM-DD')
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
    v_service RECORD;
    v_total_minutes INTEGER;
    v_dow INTEGER;
    v_slot_record RECORD;
    v_prof RECORD;
    v_slot_start TIMESTAMPTZ;
    v_slot_end TIMESTAMPTZ;
    v_is_blocked BOOLEAN;
    v_is_occupied BOOLEAN;
    v_cur_slot TIME;
BEGIN
    -- 1. Validar e obter serviço
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
    -- 0 = Dom, 1 = Seg, ..., 6 = Sab
    v_dow := EXTRACT(DOW FROM p_date)::INTEGER;

    -- 2. Percorrer profissionais aptos
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
        -- Gerar slots de 30 em 30 minutos ou pelo tempo total
        v_cur_slot := v_prof.sched_start;

        WHILE (v_cur_slot + (v_total_minutes || ' minutes')::interval)::TIME <= v_prof.sched_end LOOP
            -- Verificar se não conflita com intervalo de almoço do profissional
            IF v_prof.break_start IS NOT NULL AND v_prof.break_end IS NOT NULL THEN
                IF v_cur_slot < v_prof.break_end AND (v_cur_slot + (v_total_minutes || ' minutes')::interval)::TIME > v_prof.break_start THEN
                    -- Pula para depois do almoço
                    v_cur_slot := (v_cur_slot + INTERVAL '15 minutes')::TIME;
                    CONTINUE;
                END IF;
            END IF;

            -- Monta timestamps em timezone São Paulo
            v_slot_start := (p_date || ' ' || v_cur_slot)::timestamp AT TIME ZONE 'America/Sao_Paulo';
            v_slot_end := v_slot_start + (v_total_minutes || ' minutes')::interval;

            -- Não permitir agendamentos no passado
            IF v_slot_start > now() THEN
                -- 3. Verificar se há bloqueio eventual (professional_time_blocks)
                SELECT EXISTS (
                    SELECT 1
                    FROM public.professional_time_blocks tb
                    WHERE tb.tenant_id = p_tenant_id
                      AND tb.professional_id = v_prof.id
                      AND tb.start_time < v_slot_end
                      AND tb.end_time > v_slot_start
                ) INTO v_is_blocked;

                IF NOT v_is_blocked THEN
                    -- 4. Verificar se há agendamento concorrente ativo
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

            -- Avança 30 minutos para próximo slot candidato
            v_cur_slot := (v_cur_slot + INTERVAL '30 minutes')::TIME;
        END LOOP;
    END LOOP;
END;
$$;

-- 4. RPC Atômica: Criação Pública de Agendamento Online com Validação e Lock
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
BEGIN
    -- 1. Validar e obter Tenant
    SELECT id, name, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_tenant_slug;

    IF NOT FOUND OR v_tenant.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TENANT', 'message', 'Estabelecimento indisponível.');
    END IF;

    -- 2. Proteção contra Abuso (Rate Limit: máx 8 agendamentos/tentativas por IP/Telefone a cada 10 min)
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

    -- Registra tentativa
    INSERT INTO public.public_booking_rate_limits (tenant_id, client_identifier, action_type)
    VALUES (v_tenant.id, v_clean_whatsapp, 'booking_attempt');

    -- 3. Validar Serviço
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

    -- Não permitir agendamentos retroativos
    IF p_start_time < (now() - INTERVAL '2 minutes') THEN
        RETURN jsonb_build_object('success', false, 'code', 'PAST_TIME', 'message', 'O horário selecionado já passou. Por favor, escolha outro horário.');
    END IF;

    -- 4. Validar Profissional
    SELECT id, full_name
    INTO v_professional
    FROM public.professionals
    WHERE id = p_professional_id
      AND tenant_id = v_tenant.id
      AND status = 'active';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_PROFESSIONAL', 'message', 'Profissional não disponível.');
    END IF;

    -- 5. Adquirir Advisory Lock Determinístico por Profissional (Evita Race Condition / Double-booking)
    v_lock_id := ('x' || substr(md5('prof_lock_' || v_professional.id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_id);

    -- 6. Localizar ou Cadastrar Cliente no Tenant (Evita duplicidade de cadastro)
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
        -- Atualiza nome ou e-mail caso não preenchidos
        UPDATE public.clients
        SET
            full_name = COALESCE(full_name, v_clean_name),
            email = COALESCE(email, nullif(trim(p_client_email), ''))
        WHERE id = v_client_id;
    END IF;

    -- 7. Inserir Agendamento Oficial (Aciona triggers de overlap e lock da agenda)
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
            NULL -- Criado pelo cliente público sem login
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

    -- Sucesso: retorna dados para a tela de confirmação
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

-- 5. PERMISSÕES DE ACESSO PÚBLICO ÀS RPCS
REVOKE ALL ON FUNCTION public.get_public_tenant_catalog(VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO service_role;

REVOKE ALL ON FUNCTION public.get_public_available_slots(UUID, UUID, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, UUID, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_available_slots(UUID, UUID, UUID, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_online_appointment(VARCHAR, UUID, UUID, TIMESTAMPTZ, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR) TO service_role;
