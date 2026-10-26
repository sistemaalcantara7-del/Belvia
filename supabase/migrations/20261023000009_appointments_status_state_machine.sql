-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.1.2: Máquina de Estados e Integridade de Status da Agenda
-- Arquivo: 20261023000009_appointments_status_state_machine.sql
--
-- Destaques de Segurança & Regras de Negócio:
-- 1. Validação estrita de contexto de execução e permissões com proteção NULL-safe:
--    - Bloqueia explicitamente chamadas anônimas (auth.uid() IS NULL) em contextos RLS/autenticados.
--    - Bloqueia qualquer usuário sem vínculo ativo (status = 'active') na tabela tenant_users.
--    - Permite bypass seguro exclusivamente quando executado pela role 'service_role' (jobs/crons do sistema).
-- 2. Matriz Explícita e Rígida de Transições de Estado:
--    - 'scheduled'   -> 'confirmed', 'in_progress', 'canceled', 'no_show'
--    - 'confirmed'   -> 'scheduled', 'in_progress', 'canceled', 'no_show'
--    - 'in_progress' -> 'completed', 'no_show', 'canceled'
--    - 'completed'   -> NENHUMA (Estado final imutável sob qualquer circunstância)
--    - 'canceled'    -> 'scheduled', 'confirmed' (Reabertura controlada exclusiva de gestão/recepção)
--    - 'no_show'     -> 'scheduled', 'confirmed' (Reabertura controlada exclusiva de gestão/recepção)
-- 3. Blindagem Adicional para o Perfil 'professional':
--    - Profissionais NÃO podem reabrir atendimentos ('canceled'/'no_show' -> qualquer estado).
--    - Profissionais só podem transitar para ('in_progress', 'completed', 'no_show') a partir de
--      estados pré-atendimento ('scheduled', 'confirmed') ou em andamento ('in_progress').
-- 4. Reabertura Aciona Validação de Conflito e Concorrência:
--    - Transições para 'scheduled' ou 'confirmed' ativam 'trigger_check_appointment_overlap_and_tenancy'
--      garantindo bloqueio transacional (advisory lock) e verificando sobreposição de horários.
-- 5. Hardening PostgreSQL:
--    - SECURITY DEFINER, SET search_path = public.
--    - Revogação de privilégios de PUBLIC e concessão estrita para 'authenticated' e 'service_role'.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_appointment_status_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role tenant_role;
  v_is_service_role boolean;
BEGIN
  -- Se o status não foi alterado, permite a continuidade do UPDATE
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- 1. Verificação de permissões e contexto do usuário executor
  v_is_service_role := (COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role');

  IF NOT v_is_service_role THEN
    -- Garante que requisições autenticadas possuam auth.uid() presente
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: operação de alteração de status exige autenticação válida.';
    END IF;

    -- Obtém o papel ativo do usuário no respectivo tenant
    SELECT tu.role INTO v_role
    FROM public.tenant_users tu
    WHERE tu.tenant_id = OLD.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active';

    -- Se não encontrar vínculo ativo ou retornar NULL, rejeita imediatamente
    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: usuário não possui vínculo ativo com este estabelecimento.';
    END IF;
  END IF;

  -- 2. REGRA FUNDAMENTAL: Estado Concluído é Terminal e Imutável
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Transição inválida: atendimentos concluídos são imutáveis e não podem ser reabertos.';
  END IF;

  -- 3. Matriz Estrita de Transições Válidas
  CASE OLD.status
    WHEN 'scheduled' THEN
      IF NEW.status NOT IN ('confirmed', 'in_progress', 'canceled', 'no_show') THEN
        RAISE EXCEPTION 'Transição inválida: a partir de "Agendado", os próximos estados válidos são: Confirmado, Em Atendimento, Cancelado ou Não Compareceu.';
      END IF;

    WHEN 'confirmed' THEN
      IF NEW.status NOT IN ('scheduled', 'in_progress', 'canceled', 'no_show') THEN
        RAISE EXCEPTION 'Transição inválida: a partir de "Confirmado", os próximos estados válidos são: Agendado, Em Atendimento, Cancelado ou Não Compareceu.';
      END IF;

    WHEN 'in_progress' THEN
      IF NEW.status NOT IN ('completed', 'no_show', 'canceled') THEN
        RAISE EXCEPTION 'Transição inválida: a partir de "Em Atendimento", os próximos estados válidos são: Concluído, Não Compareceu ou Cancelado.';
      END IF;

    WHEN 'canceled' THEN
      IF NEW.status NOT IN ('scheduled', 'confirmed') THEN
        RAISE EXCEPTION 'Transição inválida: um atendimento cancelado só pode ser reaberto para Agendado ou Confirmado.';
      END IF;

      -- Reabertura permitida exclusivamente para gestão ou recepção
      IF NOT v_is_service_role AND v_role NOT IN ('owner', 'admin', 'receptionist') THEN
        RAISE EXCEPTION 'Permissão insuficiente: apenas proprietários, administradores ou recepcionistas podem reabrir atendimentos cancelados.';
      END IF;

    WHEN 'no_show' THEN
      IF NEW.status NOT IN ('scheduled', 'confirmed') THEN
        RAISE EXCEPTION 'Transição inválida: um atendimento marcado como "Não Compareceu" só pode ser reaberto para Agendado ou Confirmado.';
      END IF;

      -- Reabertura permitida exclusivamente para gestão ou recepção
      IF NOT v_is_service_role AND v_role NOT IN ('owner', 'admin', 'receptionist') THEN
        RAISE EXCEPTION 'Permissão insuficiente: apenas proprietários, administradores ou recepcionistas podem reabrir atendimentos registrados como não comparecimento.';
      END IF;

    ELSE
      RAISE EXCEPTION 'Transição inválida: status de origem "%" desconhecido.', OLD.status;
  END CASE;

  -- 4. Restrição Operacional Específica para Perfil 'professional'
  IF NOT v_is_service_role AND v_role = 'professional' THEN
    -- Profissionais não podem cancelar nem reabrir atendimentos; apenas transitar o ciclo do atendimento
    IF NEW.status NOT IN ('in_progress', 'completed', 'no_show') THEN
      RAISE EXCEPTION 'Permissão insuficiente: profissionais só podem alterar o status para Em Atendimento, Concluído ou Não Compareceu.';
    END IF;

    IF OLD.status NOT IN ('scheduled', 'confirmed', 'in_progress') THEN
      RAISE EXCEPTION 'Permissão insuficiente: profissionais não podem alterar agendamentos que estejam com status "%".', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Revoga privilégios públicos e concede apenas a roles autenticadas e de serviço
REVOKE EXECUTE ON FUNCTION public.check_appointment_status_transitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_appointment_status_transitions() TO authenticated, service_role;

-- Registro do Gatilho BEFORE UPDATE
DROP TRIGGER IF EXISTS trigger_check_appointment_status_transitions ON public.appointments;
CREATE TRIGGER trigger_check_appointment_status_transitions
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_status_transitions();
