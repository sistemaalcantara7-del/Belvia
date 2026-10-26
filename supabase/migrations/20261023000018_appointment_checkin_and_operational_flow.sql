-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.3.4: Rastreabilidade de Check-in e Máquina de Estados
-- Arquivo: 20261023000018_appointment_checkin_and_operational_flow.sql
--
-- Destaques & Governança Operacional:
-- 1. Diferenciação explícita entre Confirmação e Presença Física (Check-in):
--    - Adição da coluna 'checked_in_at TIMESTAMPTZ' na tabela 'appointments'.
--    - Confirmação ('confirmed'): cliente confirmou presença remotamente (WhatsApp/telefone).
--    - Check-in ('checked_in_at'): registro atômico do momento em que o cliente chegou à recepção.
-- 2. Máquina de Estados Operacional:
--    - 'scheduled' -> 'confirmed', 'in_progress', 'canceled', 'no_show'
--    - 'confirmed' -> 'scheduled', 'in_progress', 'canceled', 'no_show'
--    - 'in_progress' -> 'completed', 'canceled', 'no_show'
--    - 'completed' -> TERMINAL (imutável)
-- 3. Menor Privilégio e Permissões por Papel:
--    - Recepção, Admin e Owner: realizam Check-in (atualizam 'checked_in_at') e alteram status.
--    - Profissional: atualiza exclusivamente 'status' para transições operacionais ('in_progress', 'completed', 'no_show').
--    - A função trigger 'check_appointment_professional_update_fields' assegura que profissionais
--      não adulterem relacionamentos, horários, valores ou campos administrativos.
-- ==============================================================================

-- 1. ADIÇÃO DA COLUNA DE CHECK-IN
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ DEFAULT NULL;

-- 2. ATUALIZAÇÃO DO TRIGGER DE PROTEÇÃO DE CAMPOS DO PROFISSIONAL
-- Garante que checked_in_at não seja alterado indevidamente pelo profissional
CREATE OR REPLACE FUNCTION public.check_appointment_professional_update_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role tenant_role;
BEGIN
  -- Identifica o papel do usuário no estabelecimento
  SELECT role INTO v_role
  FROM public.tenant_users
  WHERE tenant_id = OLD.tenant_id
    AND user_id = auth.uid()
    AND status = 'active';

  -- Se for profissional, restringe severamente os campos modificáveis
  IF v_role = 'professional' THEN
    -- Impede alteração de relacionamentos, horários, valores e do carimbo de check-in
    IF (NEW.client_id <> OLD.client_id) OR
       (NEW.service_id <> OLD.service_id) OR
       (NEW.professional_id <> OLD.professional_id) OR
       (NEW.start_time <> OLD.start_time) OR
       (NEW.end_time <> OLD.end_time) OR
       (NEW.price <> OLD.price) OR
       (NEW.tenant_id <> OLD.tenant_id) OR
       (COALESCE(NEW.notes, '') <> COALESCE(OLD.notes, '')) OR
       (COALESCE(NEW.checked_in_at, '1970-01-01'::timestamptz) <> COALESCE(OLD.checked_in_at, '1970-01-01'::timestamptz)) THEN
      RAISE EXCEPTION 'Profissionais têm permissão exclusiva para atualizar o status operacional do atendimento.';
    END IF;

    -- Permite apenas transições operacionais válidas
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show', OLD.status) THEN
      RAISE EXCEPTION 'Status não permitido para atualização por profissional.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
