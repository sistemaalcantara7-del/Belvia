-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.1.1: Blindagem de Atualizações por Profissionais
-- Arquivo: 20261023000008_appointments_professional_update_guard.sql
--
-- Destaques de Segurança & Menor Privilégio:
-- 1. Criação do gatilho 'check_appointment_professional_update_fields':
--    - Quando um usuário com papel 'professional' executa um UPDATE em 'appointments',
--      ele é ESTRITAMENTE limitado a alterar o campo 'status' para valores operacionais:
--      'in_progress', 'completed', 'no_show'.
--    - Bloqueia qualquer tentativa maliciosa de alterar:
--      'client_id', 'service_id', 'professional_id', 'start_time', 'end_time',
--      'price', 'tenant_id' ou 'notes'.
--    - Owners, Admins e Recepcionistas mantêm capacidade plena de edição e reagendamento.
-- ==============================================================================

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
    -- Impede alteração de relacionamentos, horários e valores
    IF (NEW.client_id <> OLD.client_id) OR
       (NEW.service_id <> OLD.service_id) OR
       (NEW.professional_id <> OLD.professional_id) OR
       (NEW.start_time <> OLD.start_time) OR
       (NEW.end_time <> OLD.end_time) OR
       (NEW.price <> OLD.price) OR
       (NEW.tenant_id <> OLD.tenant_id) OR
       (COALESCE(NEW.notes, '') <> COALESCE(OLD.notes, '')) THEN
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

DROP TRIGGER IF EXISTS trigger_check_appointment_professional_update_fields ON public.appointments;
CREATE TRIGGER trigger_check_appointment_professional_update_fields
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_professional_update_fields();
