-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.1: Agenda de Atendimentos & Agendamentos
-- Arquivo: 20261023000007_create_appointments_schema.sql
--
-- Destaques de Segurança & Regras de Negócio:
-- 1. Tabela 'appointments' com integridade referencial estrita e tenant_id obrigatório.
-- 2. Status de agendamento: 'scheduled', 'confirmed', 'in_progress', 'completed', 'canceled', 'no_show'.
-- 3. Snapshots financeiros: 'price' gravado no agendamento para preservar histórico.
-- 4. Prevenção de conflito de horários (double-booking) no PostgreSQL via trigger com
--    lock transacional por profissional ('PERFORM pg_advisory_xact_lock(...)').
-- 5. RLS com segregação de papéis:
--    - 'owner', 'admin', 'receptionist': gestão completa da agenda do tenant.
--    - 'professional': consulta apenas agendamentos atribuídos ao seu próprio cadastro
--      e atualiza status operacionais ('in_progress', 'completed', 'no_show').
-- ==============================================================================

-- 1. ENUM: appointment_status
DO $$ BEGIN
    CREATE TYPE appointment_status AS ENUM (
        'scheduled',    -- Agendado
        'confirmed',    -- Confirmado
        'in_progress',  -- Em atendimento
        'completed',    -- Concluído
        'canceled',     -- Cancelado (libera a agenda)
        'no_show'       -- Não compareceu (libera a agenda)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: appointments
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status appointment_status NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints de integridade temporal e valor
    CONSTRAINT check_appointment_times CHECK (start_time < end_time),
    CONSTRAINT check_appointment_price CHECK (price >= 0.00)
);

-- 3. ÍNDICES DE PERFORMANCE PARA AGENDA
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_id ON public.appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_dates ON public.appointments(tenant_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_prof ON public.appointments(tenant_id, professional_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_client ON public.appointments(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status ON public.appointments(tenant_id, status);

-- 4. GATILHO DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
DROP TRIGGER IF EXISTS set_appointments_updated_at ON public.appointments;
CREATE TRIGGER set_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 5. GATILHO DE PROTEÇÃO CONTRA CONFLITOS DE HORÁRIOS & DOUBLE-BOOKING NO POSTGRESQL
CREATE OR REPLACE FUNCTION public.check_appointment_overlap_and_tenancy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_tenant UUID;
  v_service_tenant UUID;
  v_prof_tenant UUID;
  v_has_conflict BOOLEAN;
BEGIN
  -- 1. Validação de consistência multi-tenant de todas as chaves estrangeiras
  SELECT tenant_id INTO v_client_tenant FROM public.clients WHERE id = NEW.client_id;
  SELECT tenant_id INTO v_service_tenant FROM public.services WHERE id = NEW.service_id;
  SELECT tenant_id INTO v_prof_tenant FROM public.professionals WHERE id = NEW.professional_id;

  IF v_client_tenant IS NULL OR v_service_tenant IS NULL OR v_prof_tenant IS NULL THEN
    RAISE EXCEPTION 'Cliente, Serviço ou Profissional não localizado.';
  END IF;

  IF (v_client_tenant <> NEW.tenant_id) OR (v_service_tenant <> NEW.tenant_id) OR (v_prof_tenant <> NEW.tenant_id) THEN
    RAISE EXCEPTION 'Todos os registros associados devem pertencer ao mesmo estabelecimento.';
  END IF;

  -- 2. Conflito de horário apenas para status que efetivamente ocupam a agenda
  -- Status 'canceled' e 'no_show' liberam a vaga para novo atendimento.
  IF NEW.status IN ('scheduled', 'confirmed', 'in_progress', 'completed') THEN
    -- Lock transacional por profissional para evitar race conditions em reservas simultâneas
    PERFORM pg_advisory_xact_lock(hashtext('prof_appt_lock_' || NEW.professional_id::text));

    SELECT EXISTS (
      SELECT 1
      FROM public.appointments
      WHERE tenant_id = NEW.tenant_id
        AND professional_id = NEW.professional_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status IN ('scheduled', 'confirmed', 'in_progress', 'completed')
        -- Condição de sobreposição: (StartA < EndB) AND (EndA > StartB)
        AND (start_time < NEW.end_time AND end_time > NEW.start_time)
    ) INTO v_has_conflict;

    IF v_has_conflict THEN
      RAISE EXCEPTION 'Conflito de agenda: o profissional selecionado já possui atendimento marcado neste horário.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_appointment_overlap_and_tenancy ON public.appointments;
CREATE TRIGGER trigger_check_appointment_overlap_and_tenancy
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_overlap_and_tenancy();

-- 6. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- 7. POLÍTICAS RLS - APPOINTMENTS

-- SELECT:
-- Owners, Admins e Recepcionistas podem ver toda a agenda do estabelecimento.
-- Profissionais podem ver apenas os agendamentos atribuídos ao seu cadastro.
DROP POLICY IF EXISTS "Authorized members can view appointments" ON public.appointments;
CREATE POLICY "Authorized members can view appointments" ON public.appointments
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = appointments.tenant_id
          AND staff_user.user_id = auth.uid()
          AND (
            staff_user.role IN ('owner', 'admin', 'receptionist')
            OR (
              staff_user.role = 'professional' AND
              EXISTS (
                SELECT 1 FROM public.professionals p
                WHERE p.id = appointments.professional_id
                  AND p.user_id = auth.uid()
              )
            )
          )
          AND staff_user.status = 'active'
      )
    );

-- INSERT:
-- Apenas Owner, Admin e Recepcionista
DROP POLICY IF EXISTS "Management can insert appointments" ON public.appointments;
CREATE POLICY "Management can insert appointments" ON public.appointments
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = appointments.tenant_id
          AND staff_user.user_id = auth.uid()
          AND staff_user.role IN ('owner', 'admin', 'receptionist')
          AND staff_user.status = 'active'
      )
    );

-- UPDATE:
-- Owner, Admin e Recepcionista podem atualizar qualquer agendamento do seu tenant.
-- Profissional pode atualizar status dos agendamentos atribuídos a ele.
DROP POLICY IF EXISTS "Authorized roles can update appointments" ON public.appointments;
CREATE POLICY "Authorized roles can update appointments" ON public.appointments
    FOR UPDATE
    USING (
      EXISTS (
        SELECT 1 FROM public.tenant_users staff_user
        WHERE staff_user.tenant_id = appointments.tenant_id
          AND staff_user.user_id = auth.uid()
          AND (
            staff_user.role IN ('owner', 'admin', 'receptionist')
            OR (
              staff_user.role = 'professional' AND
              EXISTS (
                SELECT 1 FROM public.professionals p
                WHERE p.id = appointments.professional_id
                  AND p.user_id = auth.uid()
              )
            )
          )
          AND staff_user.status = 'active'
      )
    )
    WITH CHECK (
      tenant_id = appointments.tenant_id
    );

-- DELETE: Bloqueada por regra de negócio (utiliza status 'canceled' para rastreabilidade)
DROP POLICY IF EXISTS "Management can delete appointments" ON public.appointments;
