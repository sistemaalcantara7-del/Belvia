-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase: Restauração da Versão Original da Migration 000048
-- Arquivo: supabase/migrations/20261105000048_fix_public_catalog_trial_and_active_access.sql
--
-- Destaque:
-- Este arquivo representa o estado EXATO da migration 000048 como foi aplicada
-- manualmente no Supabase pelo operador antes das correções do Prompt 227.
-- As correções estritas e auditoria de segurança são aplicadas incrementalmente
-- na migration seguinte: 20261105000049_harden_public_catalog_trial_and_settings.sql
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_public_tenant_catalog(p_slug VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
    v_sub RECORD;
    v_is_valid BOOLEAN := false;
    v_services JSONB;
    v_professionals JSONB;
    v_portfolio JSONB;
    v_bsettings JSONB;
    v_srv_filter UUID[];
    v_prof_filter UUID[];
    v_is_enabled BOOLEAN;
BEGIN
    -- 1. Localiza o tenant pelo slug
    SELECT id, name, slug, status, settings, created_at
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não encontrado.');
    END IF;

    -- 2. Validação rigorosa de vigência da assinatura ou período de testes (Trial)
    IF v_tenant.status NOT IN ('active', 'trial') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível.');
    END IF;

    -- Busca assinatura oficial associada na tabela saas_subscriptions
    SELECT status, trial_ends_at, current_period_end, grace_period_days
    INTO v_sub
    FROM public.saas_subscriptions
    WHERE tenant_id = v_tenant.id;

    IF v_sub IS NOT NULL THEN
        IF v_sub.status = 'active' THEN
            v_is_valid := true;
        ELSIF v_sub.status = 'trial' THEN
            -- Se for trial, valida se a data limite de testes ainda é futura
            IF COALESCE(v_sub.trial_ends_at, v_tenant.created_at + INTERVAL '7 days') >= now() THEN
                v_is_valid := true;
            END IF;
        ELSIF v_sub.status = 'overdue' THEN
            -- Período de tolerância (grace period)
            IF COALESCE(v_sub.current_period_end + (COALESCE(v_sub.grace_period_days, 5) || ' days')::INTERVAL, now()) >= now() THEN
                v_is_valid := true;
            END IF;
        END IF;
    ELSE
        -- Fallback seguro caso não haja registro em saas_subscriptions:
        IF v_tenant.status = 'active' THEN
            v_is_valid := true;
        ELSIF v_tenant.status = 'trial' THEN
            IF v_tenant.created_at + INTERVAL '7 days' >= now() THEN
                v_is_valid := true;
            END IF;
        END IF;
    END IF;

    -- Se não estiver válido (ex: trial expirado, assinatura cancelada ou vencida), bloqueia
    IF NOT v_is_valid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível.');
    END IF;

    -- 3. Verifica se o agendamento público está habilitado pelo próprio estabelecimento
    v_bsettings := COALESCE(v_tenant.settings->'booking_settings', '{}'::jsonb);
    v_is_enabled := COALESCE((v_bsettings->>'enabled')::BOOLEAN, true);

    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'O agendamento online está temporariamente desativado por este estabelecimento.');
    END IF;

    -- 4. Filtros opcionais de Serviços e Profissionais permitidos publicamente
    IF v_bsettings ? 'public_services_filter' AND jsonb_array_length(v_bsettings->'public_services_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_srv_filter
        FROM jsonb_array_elements_text(v_bsettings->'public_services_filter');
    END IF;

    IF v_bsettings ? 'public_professionals_filter' AND jsonb_array_length(v_bsettings->'public_professionals_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_prof_filter
        FROM jsonb_array_elements_text(v_bsettings->'public_professionals_filter');
    END IF;

    -- 5. Catálogo de Serviços Ativos (filtrado) - Incluindo image_url
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'description', s.description,
            'category', s.category,
            'duration_minutes', s.duration_minutes,
            'break_minutes', s.break_minutes,
            'price', s.price,
            'image_url', s.image_url
        ) ORDER BY s.category ASC, s.name ASC
    ), '[]'::jsonb)
    INTO v_services
    FROM public.services s
    WHERE s.tenant_id = v_tenant.id
      AND s.status = 'active'
      AND (v_srv_filter IS NULL OR s.id = ANY(v_srv_filter));

    -- 6. Catálogo de Profissionais Ativos (filtrado)
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

    -- 7. Catálogo de Portfólio / Galeria Ativa com Consentimento LGPD e Enquadramento 4:5
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', port.id,
            'title', port.title,
            'description', port.description,
            'image_url', port.image_url,
            'category', port.category,
            'service_id', port.service_id,
            'service_name', srv.name,
            'client_consent', port.client_consent,
            'sort_order', port.sort_order,
            'crop_x', COALESCE(port.crop_x, 50.00),
            'crop_y', COALESCE(port.crop_y, 50.00),
            'crop_zoom', COALESCE(port.crop_zoom, 1.00)
        ) ORDER BY port.sort_order ASC, port.created_at DESC
    ), '[]'::jsonb)
    INTO v_portfolio
    FROM public.tenant_portfolio port
    LEFT JOIN public.services srv ON srv.id = port.service_id
    WHERE port.tenant_id = v_tenant.id
      AND port.is_active = true
      AND port.client_consent = true;

    -- 8. Retorno Estruturado Seguro
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

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;
