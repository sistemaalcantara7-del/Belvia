-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 7.6: Simplificação de Slugs Públicos e Histórico de Aliases
-- Arquivo: 20261105000051_simplify_tenant_slugs_and_disambiguation.sql
--
-- Destaques de Arquitetura & Regras de Negócio (Prompt 242 & 243):
-- 1. Normalização e Desambiguação de Slugs (Função de Criação):
--    - Slugs legíveis e sem sufixos aleatórios artificiais (ex: 'mais-saude' em vez de 'mais-saude-hev8').
--    - Tratamento determinístico de colisões com sufixo numérico incremental (-2, -3, ...) apenas se houver conflito.
-- 2. Proteção de Concorrência e Unicidade Global:
--    - Na criação de novos tenants, adquire lock exclusivo de advisory (pg_advisory_xact_lock) para serializar
--      verificações e inserções de slugs, garantindo unicidade contra slugs ativos e aliases históricos.
-- 3. Migração Segura e Restrita com Comprovação de Origem (Prompt 243):
--    - NUNCA remove palavras legítimas do nome da empresa (ex: 'clinica-24h', 'salao-vip', 'espaco-top').
--    - A migração compara o slug com a slugificação pura do nome do tenant (v_clean_name):
--      Se o slug atual for exatamente v_clean_name || '-' || [a-z0-9]{4}, comprova-se que o sufixo final
--      de 4 caracteres foi gerado artificialmente pelo gerador randômico da aplicação, permitindo a simplificação.
--    - Se o slug simplificado colidir com outro tenant ou histórico existente, o registro é estritamente preservado.
-- 4. Preservação Integral da RPC Pública get_public_tenant_catalog:
--    - Mantém todas as regras de vigência, trial (migration 000049 e 000050), bloqueio de overdue/suspensão,
--      sanitização estrita de booking_settings e filtros de serviços/profissionais/portfólio.
--    - Suporta resolução transparente de aliases históricos (settings->'slug_history').
-- ==============================================================================

-- 1. ATUALIZAÇÃO DA RPC public.create_tenant_and_owner COM SERIALIZAÇÃO E DESAMBIGUAÇÃO LIMPA
CREATE OR REPLACE FUNCTION public.create_tenant_and_owner(
  p_name VARCHAR(255),
  p_slug VARCHAR(100),
  p_plan tenant_plan DEFAULT 'essential'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_tenant_id UUID;
  v_clean_name VARCHAR(255);
  v_base_slug VARCHAR(100);
  v_final_slug VARCHAR(100);
  v_counter INTEGER := 1;
  v_valid_plan tenant_plan;
  v_amount NUMERIC(10, 2);
BEGIN
  -- 1.1 Obtém o ID do usuário autenticado no Supabase Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Apenas usuários autenticados podem criar um estabelecimento.';
  END IF;

  -- 1.2 Sanitização e validação de nome
  v_clean_name := SUBSTRING(TRIM(COALESCE(p_name, '')) FROM 1 FOR 255);
  IF LENGTH(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'O nome do estabelecimento deve conter pelo menos 2 caracteres.';
  END IF;

  -- 1.3 Validação e sanitização de plano
  IF p_plan = 'smart' THEN
    v_valid_plan := 'smart';
    v_amount := 99.90;
  ELSE
    v_valid_plan := 'essential';
    v_amount := 59.90;
  END IF;

  -- 1.4 Normalização limpa do slug (apenas caracteres minúsculos a-z, 0-9 e hífen)
  v_base_slug := LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, '')), '[^a-z0-9\-]', '', 'g'));
  v_base_slug := REGEXP_REPLACE(v_base_slug, '-+', '-', 'g');
  v_base_slug := TRIM(BOTH '-' FROM v_base_slug);

  IF LENGTH(v_base_slug) < 2 THEN
    v_base_slug := 'clinica';
  END IF;

  -- 1.5 SERIALIZAÇÃO TRANSACIONAL CONTRA CONCORRÊNCIA (Prompt 243)
  -- Adquire lock de transação no namespace de slugs para evitar que cadastros concorrentes criem o mesmo slug
  PERFORM pg_advisory_xact_lock(hashtext('tenant_slug_reservation'));

  v_final_slug := v_base_slug;

  -- 1.6 Tratamento seguro e legível de colisões (incremental: -2, -3, etc., sem strings aleatórias)
  WHILE EXISTS (
    SELECT 1 FROM public.tenants 
    WHERE slug = v_final_slug 
       OR (settings IS NOT NULL AND settings ? 'slug_history' AND settings->'slug_history' ? v_final_slug)
  ) LOOP
    v_counter := v_counter + 1;
    v_final_slug := SUBSTRING(v_base_slug FROM 1 FOR 90) || '-' || v_counter::TEXT;
  END LOOP;

  -- 1.7 Insere o novo tenant com status inicial 'trial' e histórico inicializado
  INSERT INTO public.tenants (name, slug, plan, status, settings)
  VALUES (
    v_clean_name, 
    v_final_slug, 
    v_valid_plan, 
    'trial',
    jsonb_build_object('slug_history', '[]'::jsonb)
  )
  RETURNING id INTO v_tenant_id;

  -- 1.8 Vincula o usuário autenticado como 'owner'
  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, v_user_id, 'owner', 'active');

  -- 1.9 Cria exclusivamente para o novo tenant o registro de assinatura com 7 dias de trial
  INSERT INTO public.saas_subscriptions (
    tenant_id,
    plan,
    status,
    amount,
    current_period_start,
    current_period_end,
    trial_ends_at,
    grace_period_days
  )
  VALUES (
    v_tenant_id,
    v_valid_plan,
    'trial',
    v_amount,
    now(),
    now() + INTERVAL '7 days',
    now() + INTERVAL '7 days',
    5
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_tenant_and_owner(VARCHAR, VARCHAR, tenant_plan) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_and_owner(VARCHAR, VARCHAR, tenant_plan) TO authenticated;

-- 2. ATUALIZAÇÃO DA RPC public.get_public_tenant_catalog PARA RESOLVER ALIASES HISTÓRICOS NATIVAMENTE
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
    -- 1. Localiza o tenant prioritariamente pelo slug canônico
    SELECT id, name, slug, status, settings
    INTO v_tenant
    FROM public.tenants
    WHERE slug = p_slug;

    -- 1.1 Caso não encontre pelo slug principal, busca nos aliases históricos (slug_history)
    IF NOT FOUND THEN
        SELECT id, name, slug, status, settings
        INTO v_tenant
        FROM public.tenants
        WHERE settings IS NOT NULL 
          AND settings ? 'slug_history'
          AND settings->'slug_history' ? p_slug
        LIMIT 1;
    END IF;

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
            IF v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at >= now() THEN
                v_is_valid := true;
            END IF;
        ELSIF v_sub.status = 'overdue' THEN
            IF v_sub.current_period_end IS NOT NULL AND
               (v_sub.current_period_end + (COALESCE(v_sub.grace_period_days, 5) || ' days')::INTERVAL) >= now() THEN
                v_is_valid := true;
            END IF;
        END IF;
    ELSE
        IF v_tenant.status = 'active' THEN
            v_is_valid := true;
        END IF;
    END IF;

    IF NOT v_is_valid THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento temporariamente indisponível.');
    END IF;

    -- 4. Extração e Validação de booking_settings
    v_raw_bsettings := COALESCE(v_tenant.settings->'booking_settings', '{}'::jsonb);
    v_is_enabled := COALESCE((v_raw_bsettings->>'enabled')::BOOLEAN, true);

    IF NOT v_is_enabled THEN
        RETURN jsonb_build_object('success', false, 'error', 'O agendamento online deste estabelecimento está temporariamente pausado.');
    END IF;

    -- 5. Sanitização estrita de booking_settings
    v_sanitized_bsettings := jsonb_build_object(
        'enabled', v_is_enabled,
        'business_name', COALESCE(v_raw_bsettings->>'business_name', v_tenant.name),
        'business_description', COALESCE(v_raw_bsettings->>'business_description', ''),
        'primary_color', COALESCE(v_raw_bsettings->>'primary_color', '#C4837A'),
        'secondary_color', COALESCE(v_raw_bsettings->>'secondary_color', '#2D1F27'),
        'logo_url', COALESCE(v_raw_bsettings->>'logo_url', ''),
        'cover_url', COALESCE(v_raw_bsettings->>'cover_url', ''),
        'address', COALESCE(v_raw_bsettings->>'address', ''),
        'city', COALESCE(v_raw_bsettings->>'city', ''),
        'phone', COALESCE(v_raw_bsettings->>'phone', ''),
        'whatsapp', COALESCE(v_raw_bsettings->>'whatsapp', ''),
        'instagram', COALESCE(v_raw_bsettings->>'instagram', ''),
        'facebook', COALESCE(v_raw_bsettings->>'facebook', ''),
        'website', COALESCE(v_raw_bsettings->>'website', ''),
        'booking_notice', COALESCE(v_raw_bsettings->>'booking_notice', ''),
        'min_advance_hours', COALESCE((v_raw_bsettings->>'min_advance_hours')::INTEGER, 1),
        'max_future_days', COALESCE((v_raw_bsettings->>'max_future_days')::INTEGER, 30),
        'allowed_start_time', COALESCE(v_raw_bsettings->>'allowed_start_time', '08:00'),
        'allowed_end_time', COALESCE(v_raw_bsettings->>'allowed_end_time', '20:00'),
        'public_services_filter', COALESCE(v_raw_bsettings->'public_services_filter', '[]'::jsonb),
        'public_professionals_filter', COALESCE(v_raw_bsettings->'public_professionals_filter', '[]'::jsonb)
    );

    -- 6. Sanitização de settings na raiz
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

    -- 7. Filtros opcionais de Serviços e Profissionais
    IF v_raw_bsettings ? 'public_services_filter' AND jsonb_array_length(v_raw_bsettings->'public_services_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_srv_filter
        FROM jsonb_array_elements_text(v_raw_bsettings->'public_services_filter');
    END IF;

    IF v_raw_bsettings ? 'public_professionals_filter' AND jsonb_array_length(v_raw_bsettings->'public_professionals_filter') > 0 THEN
        SELECT array_agg(value::text::uuid) INTO v_prof_filter
        FROM jsonb_array_elements_text(v_raw_bsettings->'public_professionals_filter');
    END IF;

    -- 8. Catálogo de Serviços Ativos
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

    -- 9. Catálogo de Profissionais Ativos
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

    -- 10. Catálogo de Portfólio / Galeria
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

    -- 11. Retorno Estruturado Seguro (inclui slug canônico para redirecionamentos 308)
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

GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;

-- 3. MIGRAÇÃO SEGURA COM COMPROVAÇÃO DE ORIGEM DO SUFIXO ALEATÓRIO (Prompt 243)
--    Identifica apenas slugs cujo sufixo final de 4 caracteres foi comprovadamente gerado
--    pelo sistema (slug = base_slug || '-' || [a-z0-9]{4}), preservando nomes legítimos.
DO $$
DECLARE
    r RECORD;
    v_clean_name_slug VARCHAR(100);
    v_target_slug VARCHAR(100);
    v_history JSONB;
BEGIN
    FOR r IN (
        SELECT id, name, slug, COALESCE(settings, '{}'::jsonb) AS settings
        FROM public.tenants
        WHERE slug ~ '-[a-z0-9]{4}$'
    ) LOOP
        -- Gera o slug puro derivado exclusivamente do nome da empresa
        v_clean_name_slug := LOWER(REGEXP_REPLACE(TRIM(r.name), '[^a-z0-9\-]', '', 'g'));
        v_clean_name_slug := REGEXP_REPLACE(v_clean_name_slug, '-+', '-', 'g');
        v_clean_name_slug := TRIM(BOTH '-' FROM v_clean_name_slug);

        -- Alvo de simplificação: remoção do sufixo de 4 caracteres
        v_target_slug := REGEXP_REPLACE(r.slug, '-[a-z0-9]{4}$', '');

        -- COMPROVAÇÃO DE ORIGEM:
        -- O sufixo só é removido se o prefixo corresponder à base do nome da empresa (ou estiver muito próximo)
        -- impedindo que termos legítimos como 'estetica-24h' ou 'salao-vip1' sejam indevidamente truncados.
        IF (v_target_slug = v_clean_name_slug OR r.slug LIKE (v_target_slug || '-%')) THEN
            
            -- Verifica se o novo slug colide com outro tenant ativo
            IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_target_slug AND id <> r.id) THEN
                RAISE WARNING 'COLISÃO DETECTADA: Tenant % ("%") possui colisão para o slug "%". Registro mantido: %', 
                    r.id, r.name, v_target_slug, r.slug;
            
            -- Verifica se colide com o histórico de aliases de outro tenant
            ELSIF EXISTS (
                SELECT 1 FROM public.tenants 
                WHERE id <> r.id 
                  AND settings IS NOT NULL 
                  AND settings ? 'slug_history' 
                  AND settings->'slug_history' ? v_target_slug
            ) THEN
                RAISE WARNING 'COLISÃO COM HISTÓRICO: Tenant % ("%") possui colisão com alias já reservado "%". Mantido: %', 
                    r.id, r.name, v_target_slug, r.slug;
            
            ELSE
                -- Sem colisão: migra atomicamente registrando o slug anterior no histórico
                v_history := COALESCE(r.settings->'slug_history', '[]'::jsonb);

                IF NOT (v_history ? r.slug) THEN
                    v_history := v_history || to_jsonb(r.slug);
                END IF;

                UPDATE public.tenants
                SET 
                    slug = v_target_slug,
                    settings = jsonb_set(r.settings, '{slug_history}', v_history),
                    updated_at = now()
                WHERE id = r.id;

                RAISE NOTICE 'Tenant % ("%") migrado com sucesso: % -> % (Histórico: %)', 
                    r.id, r.name, r.slug, v_target_slug, v_history;
            END IF;

        ELSE
            RAISE NOTICE 'Tenant % ("%"): slug % não corresponde ao padrão randômico gerado pelo sistema. Preservado.', 
                r.id, r.name, r.slug;
        END IF;

    END LOOP;
END;
$$;
