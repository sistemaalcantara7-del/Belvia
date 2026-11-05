-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase: Blindagem e Auditoria de Segurança da RPC Pública
-- Arquivo: supabase/migrations/20261105000049_harden_public_catalog_trial_and_settings.sql
--
-- Destaques de Arquitetura & Segurança (Prompt 228):
-- 1. Fonte Oficial de Vigência de Trial:
--    - Consulta estritamente a tabela 'saas_subscriptions' (campo 'trial_ends_at').
--    - Elimina qualquer fallback arbitrário baseado em created_at. Se não houver trial_ends_at válido e futuro, o trial NÃO é liberado.
-- 2. Correção de Inadimplência ('overdue'):
--    - Exige explicitamente que 'current_period_end' NÃO seja nulo.
--    - Aplica o cálculo estrito com 'grace_period_days' (padrão 5 dias). Se vencido ou se current_period_end for NULL, bloqueia sumariamente.
-- 3. Sanitização Rigorosa de 'tenants.settings' e 'booking_settings':
--    - Exposição pública restrita estritamente às propriedades necessárias de apresentação e agendamento.
--    - Bloqueia totalmente o vazamento de configurações internas (onboarding, histórico de slugs, identificadores internos).
--    - Constrói o objeto 'booking_settings' contendo apenas atributos públicos oficiais.
-- 4. Precedência e Cardinalidade de Assinatura:
--    - A relação de saas_subscriptions é 1:1 por tenant (uq_saas_subscriptions_tenant).
--    - Se o tenant estiver inativo, suspenso ou cancelado, bloqueia imediatamente antes de avaliar a assinatura.
-- 5. Preservação Total de Contrato:
--    - Mantém serviços (com image_url), profissionais, portfólio (com crop_x, crop_y, crop_zoom e consentimento LGPD).
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
    v_raw_bsettings JSONB;
    v_sanitized_bsettings JSONB;
    v_public_settings JSONB;
    v_srv_filter UUID[];
    v_prof_filter UUID[];
    v_is_enabled BOOLEAN;
BEGIN
    -- 1. Localiza o tenant pelo slug
    SELECT id, name, slug, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_slug;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não encontrado.');
    END IF;

    -- 2. Precedência: Se o tenant estiver inativo, suspenso ou cancelado, bloqueia imediatamente
    IF v_tenant.status NOT IN ('active', 'trial') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível.');
    END IF;

    -- 3. Validação rigorosa de vigência com base na fonte oficial 'saas_subscriptions'
    SELECT status, trial_ends_at, current_period_end, grace_period_days
    INTO v_sub
    FROM public.saas_subscriptions
    WHERE tenant_id = v_tenant.id;

    IF v_sub IS NOT NULL THEN
        IF v_sub.status = 'active' THEN
            v_is_valid := true;
        ELSIF v_sub.status = 'trial' THEN
            -- Fonte oficial de trial: exige trial_ends_at válido e futuro
            IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at >= now() THEN
                v_is_valid := true;
            END IF;
        ELSIF v_sub.status = 'overdue' THEN
            -- Exige current_period_end não-nulo e soma dos dias de carência maior ou igual a now()
            IF v_sub.current_period_end IS NOT NULL AND
               (v_sub.current_period_end + (COALESCE(v_sub.grace_period_days, 5) || ' days')::INTERVAL) >= now() THEN
                v_is_valid := true;
            END IF;
        END IF;
    ELSE
        -- Caso não exista registro em saas_subscriptions:
        -- Apenas tenants com status 'active' explícito na tabela tenants são permitidos
        IF v_tenant.status = 'active' THEN
            v_is_valid := true;
        END IF;
    END IF;

    -- Se não atender aos critérios de vigência oficial, bloqueia
    IF NOT v_is_valid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível.');
    END IF;

    -- 4. Extrai configurações e verifica se o agendamento público está habilitado
    v_raw_bsettings := COALESCE(v_tenant.settings->'booking_settings', '{}'::jsonb);
    v_is_enabled := COALESCE((v_raw_bsettings->>'enabled')::BOOLEAN, true);

    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'O agendamento online está temporariamente desativado por este estabelecimento.');
    END IF;

    -- 5. Sanitização estrita do objeto 'booking_settings' (Apenas propriedades públicas autorizadas)
    v_sanitized_bsettings := jsonb_build_object(
        'enabled', v_is_enabled,
        'min_advance_hours', COALESCE((v_raw_bsettings->>'min_advance_hours')::INTEGER, 1),
        'max_future_days', COALESCE((v_raw_bsettings->>'max_future_days')::INTEGER, 30),
        'allowed_start_time', COALESCE(v_raw_bsettings->>'allowed_start_time', '08:00'),
        'allowed_end_time', COALESCE(v_raw_bsettings->>'allowed_end_time', '20:00'),
        'primary_color', COALESCE(v_raw_bsettings->>'primary_color', '#C4837A'),
        'secondary_color', COALESCE(v_raw_bsettings->>'secondary_color', '#2D1F27'),
        'cover_url', COALESCE(v_raw_bsettings->>'cover_url', ''),
        'logo_url', COALESCE(v_raw_bsettings->>'logo_url', ''),
        'business_name', COALESCE(v_raw_bsettings->>'business_name', v_tenant.settings->>'business_name', ''),
        'business_description', COALESCE(v_raw_bsettings->>'business_description', ''),
        'address', COALESCE(v_raw_bsettings->>'address', v_tenant.settings->>'address', ''),
        'city', COALESCE(v_raw_bsettings->>'city', v_tenant.settings->>'city', ''),
        'phone', COALESCE(v_raw_bsettings->>'phone', v_tenant.settings->>'phone', ''),
        'whatsapp', COALESCE(v_raw_bsettings->>'whatsapp', v_tenant.settings->>'whatsapp', ''),
        'instagram', COALESCE(v_raw_bsettings->>'instagram', v_tenant.settings->>'instagram', ''),
        'facebook', COALESCE(v_raw_bsettings->>'facebook', ''),
        'website', COALESCE(v_raw_bsettings->>'website', ''),
        'booking_notice', COALESCE(v_raw_bsettings->>'booking_notice', v_tenant.settings->>'booking_notice', ''),
        'public_services_filter', COALESCE(v_raw_bsettings->'public_services_filter', '[]'::jsonb),
        'public_professionals_filter', COALESCE(v_raw_bsettings->'public_professionals_filter', '[]'::jsonb)
    );

    -- 6. Sanitização estrita do objeto 'settings' retornado na raiz do tenant (Blindagem contra vazamento de dados internos)
    v_public_settings := jsonb_build_object(
        'booking_settings', v_sanitized_bsettings,
        'business_name', COALESCE(v_raw_bsettings->>'business_name', v_tenant.settings->>'business_name'),
        'phone', COALESCE(v_raw_bsettings->>'phone', v_tenant.settings->>'phone'),
        'whatsapp', COALESCE(v_raw_bsettings->>'whatsapp', v_tenant.settings->>'whatsapp'),
        'address', COALESCE(v_raw_bsettings->>'address', v_tenant.settings->>'address'),
        'city', COALESCE(v_raw_bsettings->>'city', v_tenant.settings->>'city'),
        'instagram', COALESCE(v_raw_bsettings->>'instagram', v_tenant.settings->>'instagram'),
        'booking_notice', COALESCE(v_raw_bsettings->>'booking_notice', v_tenant.settings->>'booking_notice')
    );

    -- 7. Filtros opcionais de Serviços e Profissionais permitidos publicamente
    IF v_raw_bsettings ? 'public_services_filter' AND jsonb_array_length(v_raw_bsettings->'public_services_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_srv_filter
        FROM jsonb_array_elements_text(v_raw_bsettings->'public_services_filter');
    END IF;

    IF v_raw_bsettings ? 'public_professionals_filter' AND jsonb_array_length(v_raw_bsettings->'public_professionals_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_prof_filter
        FROM jsonb_array_elements_text(v_raw_bsettings->'public_professionals_filter');
    END IF;

    -- 8. Catálogo de Serviços Ativos (filtrado) - Incluindo image_url
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

    -- 9. Catálogo de Profissionais Ativos (filtrado)
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

    -- 10. Catálogo de Portfólio / Galeria Ativa com Consentimento LGPD e Enquadramento 4:5
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

    -- 11. Retorno Estruturado Seguro (apenas campos estritamente autorizados)
    RETURN jsonb_build_object(
        'success', true,
        'tenant', jsonb_build_object(
            'id', v_tenant.id,
            'name', v_tenant.name,
            'slug', v_tenant.slug,
            'settings', v_public_settings
        ),
        'services', v_services,
        'professionals', v_professionals,
        'portfolio', v_portfolio
    );
END;
$$;

-- Permissões de Execução
GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;
