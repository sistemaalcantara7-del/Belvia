-- ==============================================================================
-- BELVIA SaaS - Migration Fase: Adicionar image_url de Serviços na RPC get_public_tenant_catalog
-- Arquivo: 20261104000045_include_services_image_url_in_public_catalog.sql
--
-- Destaques:
-- 1. Atualiza public.get_public_tenant_catalog(VARCHAR) para incluir o campo
--    'image_url', s.image_url na montagem do JSONB do catálogo de serviços.
-- 2. Mantém RLS, segurança SECURITY DEFINER e permissões para anon, authenticated e service_role.
-- ==============================================================================

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

    -- Catálogo de Serviços Ativos (filtrado) - Incluindo image_url
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

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;
