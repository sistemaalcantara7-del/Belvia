-- ==============================================================================
-- ZELUNIA SaaS - Migration: Enquadramento e Zoom de Fotografias do Portfólio (Prompt 219)
-- Arquivo: supabase/migrations/20261104000047_portfolio_crop_and_focal_position.sql
--
-- Destaques de Homologação e Segurança:
-- 1. Idempotência estrita: colunas crop_x, crop_y e crop_zoom adicionadas apenas se inexistentes.
-- 2. Constraints seguras de integridade:
--    - crop_x CHECK (crop_x >= 0 AND crop_x <= 100) DEFAULT 50.00
--    - crop_y CHECK (crop_y >= 0 AND crop_y <= 100) DEFAULT 50.00
--    - crop_zoom CHECK (crop_zoom >= 1.00 AND crop_zoom <= 3.00) DEFAULT 1.00
-- 3. Correção na RPC get_public_tenant_catalog:
--    - Preserva o contrato exato do retorno anterior (Prompt 208/211):
--      SELECT id, name, slug, status, settings INTO v_tenant FROM public.tenants
--      Retorno: id, name, slug, settings (sem referenciar colunas ausentes).
--    - Acrescenta EXCLUSIVAMENTE crop_x, crop_y e crop_zoom ao objeto de portfolio.
-- 4. Permissões explícitas: GRANT EXECUTE aos roles anon, authenticated e service_role.
-- ==============================================================================

-- 1. Adicionar colunas com limites seguros se não existirem
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_portfolio' 
          AND column_name = 'crop_x'
    ) THEN
        ALTER TABLE public.tenant_portfolio 
            ADD COLUMN crop_x NUMERIC(5,2) DEFAULT 50.00;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_portfolio' 
          AND column_name = 'crop_y'
    ) THEN
        ALTER TABLE public.tenant_portfolio 
            ADD COLUMN crop_y NUMERIC(5,2) DEFAULT 50.00;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_portfolio' 
          AND column_name = 'crop_zoom'
    ) THEN
        ALTER TABLE public.tenant_portfolio 
            ADD COLUMN crop_zoom NUMERIC(4,2) DEFAULT 1.00;
    END IF;
END $$;

-- 2. Adicionar constraints de validação de limites seguros (caso ainda não existam)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_tenant_portfolio_crop_x'
    ) THEN
        ALTER TABLE public.tenant_portfolio
            ADD CONSTRAINT chk_tenant_portfolio_crop_x 
            CHECK (crop_x IS NULL OR (crop_x >= 0 AND crop_x <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_tenant_portfolio_crop_y'
    ) THEN
        ALTER TABLE public.tenant_portfolio
            ADD CONSTRAINT chk_tenant_portfolio_crop_y 
            CHECK (crop_y IS NULL OR (crop_y >= 0 AND crop_y <= 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_tenant_portfolio_crop_zoom'
    ) THEN
        ALTER TABLE public.tenant_portfolio
            ADD CONSTRAINT chk_tenant_portfolio_crop_zoom 
            CHECK (crop_zoom IS NULL OR (crop_zoom >= 1.00 AND crop_zoom <= 3.00));
    END IF;
END $$;

-- 3. Atualizar RPC get_public_tenant_catalog preservando o contrato original com acréscimo exclusivo de crop_x, crop_y e crop_zoom
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

    -- Catálogo de Portfólio / Galeria Ativa com Consentimento Específico e Enquadramento 4:5
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

-- 4. Garantir permissões de execução para os roles anon, authenticated e service_role
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;
