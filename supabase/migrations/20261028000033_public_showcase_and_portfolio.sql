-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 6.3: Vitrine Digital Pública, Portfólio & Gestão de Slug
-- Arquivo: supabase/migrations/20261028000033_public_showcase_and_portfolio.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Segurança:
-- 1. Tabela public.tenant_portfolio:
--    - Armazena as fotos e trabalhos do portfólio de cada estabelecimento.
--    - Campos: id, tenant_id, title, description, image_url, category, sort_order, is_active, created_at, updated_at.
--    - RLS estrito: leitura pública (is_active = true) e gestão exclusiva por owner/admin ativos do tenant.
-- 2. RPC update_tenant_slug:
--    - Validação atômica de alteração de slug por proprietário/administrador.
--    - Proteção contra palavras reservadas do sistema:
--      'login', 'register', 'auth', 'api', 'agendar', 'agenda', 'dashboard', 'admin', 'superadmin',
--      'configuracoes', 'clientes', 'profissionais', 'servicos', 'caixa', 'comissoes', 'relatorios', 'anamnese'.
--    - Garantia de formato válido (apenas letras minúsculas, números e hífens: '^[a-z0-9]+(-[a-z0-9]+)*$').
--    - Unicidade garantida em transação atômica.
-- 3. Atualização da RPC get_public_tenant_catalog:
--    - Inclui a lista de itens ativos de portfólio ordenados por sort_order ASC e created_at DESC.
-- ==============================================================================

-- 1. TABELA: public.tenant_portfolio (Galeria / Portfólio de Trabalhos)
CREATE TABLE IF NOT EXISTS public.tenant_portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    category VARCHAR(80) NOT NULL DEFAULT 'Geral',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de consulta rápida da vitrine pública
CREATE INDEX IF NOT EXISTS idx_tenant_portfolio_public
    ON public.tenant_portfolio(tenant_id, sort_order, created_at)
    WHERE is_active = true;

-- Trigger de updated_at
DROP TRIGGER IF EXISTS set_tenant_portfolio_updated_at ON public.tenant_portfolio;
CREATE TRIGGER set_tenant_portfolio_updated_at
    BEFORE UPDATE ON public.tenant_portfolio
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Habilitação de RLS
ALTER TABLE public.tenant_portfolio ENABLE ROW LEVEL SECURITY;

-- Política de Leitura: Pública para fotos ativas, ou membros do tenant
DROP POLICY IF EXISTS "tenant_portfolio_read_public" ON public.tenant_portfolio;
CREATE POLICY "tenant_portfolio_read_public" ON public.tenant_portfolio
    FOR SELECT
    USING (
        is_active = true
        OR EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_portfolio.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
        )
    );

-- Política de Escrita (INSERT, UPDATE, DELETE): Exclusiva para 'owner' e 'admin' ativos
DROP POLICY IF EXISTS "tenant_portfolio_manage_admins" ON public.tenant_portfolio;
CREATE POLICY "tenant_portfolio_manage_admins" ON public.tenant_portfolio
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_portfolio.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_portfolio.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

-- 2. RPC: Alteração Segura de Slug do Estabelecimento
CREATE OR REPLACE FUNCTION public.update_tenant_slug(
    p_tenant_id UUID,
    p_new_slug VARCHAR(100)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_slug VARCHAR(100);
    v_reserved_slugs TEXT[] := ARRAY[
        'login', 'register', 'auth', 'api', 'agendar', 'agenda', 'dashboard', 'admin',
        'superadmin', 'configuracoes', 'clientes', 'profissionais', 'servicos', 'caixa',
        'comissoes', 'relatorios', 'anamnese', 'terms', 'privacy', 'suporte', 'zelunia', 'belvia'
    ];
BEGIN
    -- 1. Validar autorização do chamador (owner ou admin ativo)
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND status = 'active'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Permissão negada para alterar a URL do estabelecimento.');
    END IF;

    -- 2. Sanitizar slug (minúsculas, trim)
    v_clean_slug := lower(trim(p_new_slug));

    -- 3. Validação de formato (apenas letras minúsculas, números e hífens)
    IF length(v_clean_slug) < 3 OR length(v_clean_slug) > 60 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A URL personalizada deve conter entre 3 e 60 caracteres.');
    END IF;

    IF v_clean_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'A URL deve conter apenas letras minúsculas, números e hífens, sem espaços ou caracteres especiais.');
    END IF;

    -- 4. Validação de palavras reservadas do sistema
    IF v_clean_slug = ANY(v_reserved_slugs) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta URL é reservada pelo sistema. Por favor, escolha outro termo.');
    END IF;

    -- 5. Validação de conflito com outros tenants
    IF EXISTS (
        SELECT 1 FROM public.tenants
        WHERE slug = v_clean_slug
          AND id <> p_tenant_id
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Esta URL já está em uso por outro estabelecimento.');
    END IF;

    -- 6. Atualização atômica
    UPDATE public.tenants
    SET
        slug = v_clean_slug,
        updated_at = now()
    WHERE id = p_tenant_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_slug', v_clean_slug,
        'message', 'URL personalizada atualizada com sucesso!'
    );
END;
$$;

-- 3. Atualizar RPC get_public_tenant_catalog para retornar itens de portfólio ativos
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

-- 4. Permissões de Execução
REVOKE ALL ON FUNCTION public.update_tenant_slug(UUID, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_slug(UUID, VARCHAR) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_public_tenant_catalog(VARCHAR) TO anon, authenticated, service_role;
