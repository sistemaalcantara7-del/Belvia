-- ==============================================================================
-- BELVIA SaaS - Migration Inicial Oficial: Fundação Multi-Tenant & RLS
-- Versão: 1.3.0 (Auditoria Estrita de Integridade & Imutabilidade)
--
-- Destaques de Segurança & Integridade:
-- 1. Criação atômica de Tenant via função controlada (create_tenant_and_owner).
--    - Idempotente: Reaproveita tenant existente se usuário já for owner.
--    - Validação de formato/tamanho para slug e nome.
-- 2. Gatilhos de imutabilidade (check_tenant_users_immutability):
--    - Impede estritamente a alteração de tenant_id e user_id após a criação do vínculo.
--    - Garante que a transferência de propriedade (role = 'owner') só possa ser realizada
--      pelo atual 'owner' legítimo.
-- 3. Sanitização e truncamento de raw_user_meta_data no trigger de perfil.
-- 4. Função current_user_has_tenant_access com SET search_path = public e auth.uid() IS NOT NULL.
-- 5. Nenhuma tabela clínica sensível inclusa nesta fase.
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE tenant_plan AS ENUM ('essential', 'smart');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'trial');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tenant_role AS ENUM ('owner', 'admin', 'professional', 'receptionist');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE membership_status AS ENUM ('active', 'inactive', 'invited');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABELA: tenants (Clínicas / Estabelecimentos)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    plan tenant_plan NOT NULL DEFAULT 'essential',
    status tenant_status NOT NULL DEFAULT 'active',
    custom_domain VARCHAR(255) UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABELA: profiles (Dados complementares vinculados a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABELA: tenant_users (Vínculos e permissões de usuários por Tenant)
CREATE TABLE IF NOT EXISTS public.tenant_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role tenant_role NOT NULL DEFAULT 'professional',
    status membership_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- 6. ÍNDICES DE PERFORMANCE E ISOLAMENTO
CREATE INDEX IF NOT EXISTS idx_tenant_users_user_id ON public.tenant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant_id ON public.tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_composite ON public.tenant_users(tenant_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);

-- 7. FUNÇÃO AUXILIAR DE SEGURANÇA: current_user_has_tenant_access
CREATE OR REPLACE FUNCTION public.current_user_has_tenant_access(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.tenant_users
      WHERE user_id = auth.uid()
        AND tenant_id = target_tenant_id
        AND status = 'active'
    )
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_has_tenant_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_tenant_access(UUID) TO authenticated;

-- 8. FUNÇÕES DE ATUALIZAÇÃO E AUDITORIA
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tenants_updated_at ON public.tenants;
CREATE TRIGGER set_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_tenant_users_updated_at ON public.tenant_users;
CREATE TRIGGER set_tenant_users_updated_at
  BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 9. GATILHO DE IMUTABILIDADE & SEGURANÇA EM tenant_users
-- Impede que tenant_id ou user_id sejam modificados após inserção.
-- Impede transferência ilegítima do papel de 'owner'.
CREATE OR REPLACE FUNCTION public.check_tenant_users_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_acting_owner BOOLEAN;
BEGIN
  -- 1. Imutabilidade estrutural
  IF (NEW.tenant_id <> OLD.tenant_id) THEN
    RAISE EXCEPTION 'Não é permitido alterar o tenant_id de um vínculo existente.';
  END IF;

  IF (NEW.user_id <> OLD.user_id) THEN
    RAISE EXCEPTION 'Não é permitido alterar o user_id de um vínculo existente.';
  END IF;

  -- 2. Proteção de promoção para 'owner'
  IF (NEW.role = 'owner' AND OLD.role <> 'owner') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE tenant_id = OLD.tenant_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND status = 'active'
    ) INTO v_is_acting_owner;

    IF NOT COALESCE(v_is_acting_owner, false) THEN
      RAISE EXCEPTION 'Somente o atual proprietário (owner) pode conceder este papel.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_tenant_users_immutability ON public.tenant_users;
CREATE TRIGGER trigger_check_tenant_users_immutability
  BEFORE UPDATE ON public.tenant_users
  FOR EACH ROW EXECUTE FUNCTION public.check_tenant_users_immutability();

-- 10. GATILHO DE PERFIL AUTOMÁTICO EM auth.users (Sanitização e Validação)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_name TEXT;
  v_raw_phone TEXT;
BEGIN
  v_raw_name := SUBSTRING(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')) FROM 1 FOR 255);
  v_raw_phone := SUBSTRING(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')) FROM 1 FOR 50);

  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(v_raw_name, ''), 'Usuário'),
    NEW.email,
    NULLIF(v_raw_phone, '')
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      phone = COALESCE(EXCLUDED.phone, profiles.phone),
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. FUNÇÃO CONTROLADA DE REGISTRO DE TENANT (Transação Atômica Anti-Privilege Escalation)
CREATE OR REPLACE FUNCTION public.create_tenant_and_owner(
  p_name VARCHAR(255),
  p_slug VARCHAR(100),
  p_plan tenant_plan DEFAULT 'essential'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
  v_existing_tenant_id UUID;
  v_clean_name VARCHAR(255);
  v_final_slug VARCHAR(100);
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Apenas usuários autenticados com sessão ativa podem registrar estabelecimentos.';
  END IF;

  v_clean_name := SUBSTRING(TRIM(COALESCE(p_name, '')) FROM 1 FOR 255);
  IF LENGTH(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Nome do estabelecimento inválido ou muito curto.';
  END IF;

  -- 1. Idempotência: Se o usuário já possuir um tenant ativo onde é 'owner', retorna o id existente
  SELECT tu.tenant_id INTO v_existing_tenant_id
  FROM public.tenant_users tu
  WHERE tu.user_id = v_user_id
    AND tu.role = 'owner'
    AND tu.status = 'active'
  LIMIT 1;

  IF v_existing_tenant_id IS NOT NULL THEN
    RETURN v_existing_tenant_id;
  END IF;

  -- 2. Sanitização e desambiguação de slug
  v_final_slug := LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_slug, '')), '[^a-z0-9\-]', '', 'g'));
  IF LENGTH(v_final_slug) < 2 THEN
    v_final_slug := 'clinica-' || SUBSTR(md5(random()::text), 1, 6);
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_final_slug) THEN
    v_final_slug := SUBSTRING(v_final_slug FROM 1 FOR 90) || '-' || SUBSTR(md5(random()::text), 1, 4);
  END IF;

  -- 3. Insere o tenant
  INSERT INTO public.tenants (name, slug, plan, status)
  VALUES (v_clean_name, v_final_slug, p_plan, 'active')
  RETURNING id INTO v_tenant_id;

  -- 4. Associa o usuário executor como 'owner'
  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant_id, v_user_id, 'owner', 'active');

  RETURN v_tenant_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_tenant_and_owner(VARCHAR, VARCHAR, tenant_plan) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_and_owner(VARCHAR, VARCHAR, tenant_plan) TO authenticated;

-- 12. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

-- 13. POLÍTICAS RLS - TENANTS
DROP POLICY IF EXISTS "Users can view their tenants" ON public.tenants;
CREATE POLICY "Users can view their tenants" ON public.tenants
    FOR SELECT
    USING (public.current_user_has_tenant_access(id));

DROP POLICY IF EXISTS "Owners can update tenant details" ON public.tenants;
CREATE POLICY "Owners can update tenant details" ON public.tenants
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users
        WHERE tenant_users.tenant_id = tenants.id
          AND tenant_users.user_id = auth.uid()
          AND tenant_users.role = 'owner'
          AND tenant_users.status = 'active'
      )
    );

-- 14. POLÍTICAS RLS - PROFILES
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT
    USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE
    USING (id = auth.uid());

DROP POLICY IF EXISTS "Colleagues in same tenant can view profiles" ON public.profiles;
CREATE POLICY "Colleagues in same tenant can view profiles" ON public.profiles
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users my_membership
        JOIN public.tenant_users peer_membership ON my_membership.tenant_id = peer_membership.tenant_id
        WHERE my_membership.user_id = auth.uid()
          AND my_membership.status = 'active'
          AND peer_membership.user_id = profiles.id
          AND peer_membership.status = 'active'
      )
    );

-- 15. POLÍTICAS RLS - TENANT_USERS
DROP POLICY IF EXISTS "Members can view tenant memberships" ON public.tenant_users;
CREATE POLICY "Members can view tenant memberships" ON public.tenant_users
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Owners and admins can insert memberships" ON public.tenant_users;
CREATE POLICY "Owners and admins can insert memberships" ON public.tenant_users
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = tenant_users.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    );

DROP POLICY IF EXISTS "Owners and admins can update memberships" ON public.tenant_users;
CREATE POLICY "Owners and admins can update memberships" ON public.tenant_users
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = tenant_users.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users acting_user
        WHERE acting_user.tenant_id = tenant_users.tenant_id
          AND acting_user.user_id = auth.uid()
          AND (
            acting_user.role = 'owner'
            OR (acting_user.role = 'admin' AND tenant_users.role <> 'owner')
          )
          AND acting_user.status = 'active'
      )
    );

DROP POLICY IF EXISTS "Owners and admins can delete memberships" ON public.tenant_users;
CREATE POLICY "Owners and admins can delete memberships" ON public.tenant_users
    FOR DELETE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = tenant_users.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
      -- Impede a auto-exclusão acidental do criador / owner
      AND tenant_users.user_id <> auth.uid()
    );
