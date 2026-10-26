-- ==============================================================================
-- BELVIA SaaS - Migration Fase 2.3: Gestão de Profissionais, Serviços & Horários
-- Arquivo: 20261023000004_create_professionals_schema.sql
--
-- Destaques de Segurança & Regras de Negócio:
-- 1. Tabela 'professionals' com tenant_id obrigatório e vínculo opcional a auth.users(id).
-- 2. Tabela associativa 'professional_services' (N:N entre profissionais e serviços).
-- 3. Tabela 'professional_schedules' para disponibilidade habitual por dia da semana (0 = Domingo a 6 = Sábado).
-- 4. Tabela 'professional_time_blocks' para bloqueios pontuais/férias/indisponibilidades.
-- 5. Row Level Security (RLS) rigoroso com separação entre administração (owner/admin)
--    e consulta (receptionist / próprio professional).
-- 6. Trigger de segurança que impede associação de serviços de tenants distintos.
-- ==============================================================================

-- 1. ENUM: professional_status
DO $$ BEGIN
    CREATE TYPE professional_status AS ENUM ('active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: professionals
CREATE TABLE IF NOT EXISTS public.professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    whatsapp VARCHAR(20),
    email VARCHAR(255),
    specialty VARCHAR(100) NOT NULL DEFAULT 'Geral',
    bio TEXT,
    avatar_url TEXT,
    status professional_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- 3. TABELA: professional_services (N:N entre profissionais e serviços)
CREATE TABLE IF NOT EXISTS public.professional_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(professional_id, service_id)
);

-- 4. TABELA: professional_schedules (Disponibilidade semanal regular)
-- day_of_week: 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
CREATE TABLE IF NOT EXISTS public.professional_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_start TIME,
    break_end TIME,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_work_hours CHECK (start_time < end_time),
    CONSTRAINT check_break_hours CHECK (
      (break_start IS NULL AND break_end IS NULL) OR
      (break_start IS NOT NULL AND break_end IS NOT NULL AND break_start < break_end AND break_start >= start_time AND break_end <= end_time)
    )
);

-- 5. TABELA: professional_time_blocks (Bloqueios e indisponibilidades eventuais)
CREATE TABLE IF NOT EXISTS public.professional_time_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_time_block_order CHECK (start_time < end_time)
);

-- 6. ÍNDICES DE PERFORMANCE E ISOLAMENTO MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_professionals_tenant_id ON public.professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_professionals_tenant_status ON public.professionals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_professional_services_tenant ON public.professional_services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_prof ON public.professional_services(professional_id);
CREATE INDEX IF NOT EXISTS idx_professional_services_srv ON public.professional_services(service_id);
CREATE INDEX IF NOT EXISTS idx_professional_schedules_prof ON public.professional_schedules(professional_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_professional_blocks_prof ON public.professional_time_blocks(professional_id, start_time);

-- 7. GATILHOS DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
DROP TRIGGER IF EXISTS set_professionals_updated_at ON public.professionals;
CREATE TRIGGER set_professionals_updated_at
  BEFORE UPDATE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_professional_schedules_updated_at ON public.professional_schedules;
CREATE TRIGGER set_professional_schedules_updated_at
  BEFORE UPDATE ON public.professional_schedules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 8. GATILHO DE PROTEÇÃO: IMPEDIR ASSOCIAÇÃO DE SERVIÇOS ENTRE TENANTS DIFERENTES
CREATE OR REPLACE FUNCTION public.check_professional_service_tenant_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prof_tenant_id UUID;
  v_srv_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_prof_tenant_id FROM public.professionals WHERE id = NEW.professional_id;
  SELECT tenant_id INTO v_srv_tenant_id FROM public.services WHERE id = NEW.service_id;

  IF v_prof_tenant_id IS NULL OR v_srv_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Profissional ou Serviço não localizado.';
  END IF;

  IF (v_prof_tenant_id <> NEW.tenant_id) OR (v_srv_tenant_id <> NEW.tenant_id) THEN
    RAISE EXCEPTION 'Não é permitido associar profissionais e serviços de estabelecimentos diferentes.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_professional_service_tenant_integrity ON public.professional_services;
CREATE TRIGGER trigger_check_professional_service_tenant_integrity
  BEFORE INSERT OR UPDATE ON public.professional_services
  FOR EACH ROW EXECUTE FUNCTION public.check_professional_service_tenant_integrity();

-- 9. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_time_blocks ENABLE ROW LEVEL SECURITY;

-- 10. POLÍTICAS RLS - PROFESSIONALS
-- SELECT: Membros do tenant podem consultar profissionais
DROP POLICY IF EXISTS "Members can view tenant professionals" ON public.professionals;
CREATE POLICY "Members can view tenant professionals" ON public.professionals
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

-- INSERT/UPDATE: Somente owner e admin
DROP POLICY IF EXISTS "Owners and admins can insert professionals" ON public.professionals;
CREATE POLICY "Owners and admins can insert professionals" ON public.professionals
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = professionals.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    );

DROP POLICY IF EXISTS "Owners and admins can update professionals" ON public.professionals;
CREATE POLICY "Owners and admins can update professionals" ON public.professionals
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = professionals.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    )
    WITH CHECK (
      tenant_id = professionals.tenant_id
    );

-- 11. POLÍTICAS RLS - PROFESSIONAL_SERVICES
DROP POLICY IF EXISTS "Members can view professional services" ON public.professional_services;
CREATE POLICY "Members can view professional services" ON public.professional_services
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Owners and admins can manage professional services" ON public.professional_services;
CREATE POLICY "Owners and admins can manage professional services" ON public.professional_services
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = professional_services.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users admin_user
        WHERE admin_user.tenant_id = professional_services.tenant_id
          AND admin_user.user_id = auth.uid()
          AND admin_user.role IN ('owner', 'admin')
          AND admin_user.status = 'active'
      )
    );

-- 12. POLÍTICAS RLS - PROFESSIONAL_SCHEDULES
DROP POLICY IF EXISTS "Members can view professional schedules" ON public.professional_schedules;
CREATE POLICY "Members can view professional schedules" ON public.professional_schedules
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Owners, admins and self-professional can update schedules" ON public.professional_schedules;
CREATE POLICY "Owners, admins and self-professional can update schedules" ON public.professional_schedules
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = professional_schedules.tenant_id
          AND staff_user.user_id = auth.uid()
          AND (
            staff_user.role IN ('owner', 'admin')
            OR (
              staff_user.role = 'professional' AND
              EXISTS (
                SELECT 1 FROM public.professionals p
                WHERE p.id = professional_schedules.professional_id
                  AND p.user_id = auth.uid()
              )
            )
          )
          AND staff_user.status = 'active'
      )
    );

-- 13. POLÍTICAS RLS - PROFESSIONAL_TIME_BLOCKS
DROP POLICY IF EXISTS "Members can view time blocks" ON public.professional_time_blocks;
CREATE POLICY "Members can view time blocks" ON public.professional_time_blocks
    FOR SELECT
    USING (public.current_user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS "Owners, admins and self-professional can manage blocks" ON public.professional_time_blocks;
CREATE POLICY "Owners, admins and self-professional can manage blocks" ON public.professional_time_blocks
    FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = professional_time_blocks.tenant_id
          AND staff_user.user_id = auth.uid()
          AND (
            staff_user.role IN ('owner', 'admin')
            OR (
              staff_user.role = 'professional' AND
              EXISTS (
                SELECT 1 FROM public.professionals p
                WHERE p.id = professional_time_blocks.professional_id
                  AND p.user_id = auth.uid()
              )
            )
          )
          AND staff_user.status = 'active'
      )
    );
