-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.3.5: Integridade de Check-in e Máquina de Estados
-- Arquivo: 20261023000019_appointment_checkin_integrity.sql
--
-- Destaques de Arquitetura, Integridade & Segurança:
-- 1. Regra de Negócio Central no PostgreSQL:
--    - O avanço para 'in_progress' exige categoricamente a presença de 'checked_in_at' (presença física comprovada).
--    - Bloqueia transição direta via API/PostgREST para 'in_progress' sem check-in prévio ou simultâneo.
-- 2. Imutabilidade do Registro de Presença:
--    - Uma vez que 'checked_in_at' foi preenchido, é proibido anular ou remover o check-in (NEW.checked_in_at IS NULL).
--    - Garante trilha probatória auditável para compliance operacional.
-- 3. Compatibilidade com Registros Históricos:
--    - Agendamentos antigos já no estado 'in_progress' ou 'completed' antes da criação da coluna
--      continuam válidos para consulta e conclusão, não sofrendo rejeição retroativa.
-- 4. Preservação Integral das Regras Homologadas Anteriores:
--    - 'completed' continua terminal e imutável.
--    - Matriz de transições e advisory locks mantidos.
--    - Menor privilégio, RLS multi-tenant e triggers de proteção do profissional permanecem ativos.
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
  -- 1. Proteção de Imutabilidade do Check-in: Não permite anular checked_in_at já registrado
  IF OLD.checked_in_at IS NOT NULL AND NEW.checked_in_at IS NULL THEN
    RAISE EXCEPTION 'Operação inválida: o registro de check-in não pode ser removido ou anulado após sua confirmação.';
  END IF;

  -- Se o status não foi alterado, permite a continuidade do UPDATE
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- 2. Verificação de permissões e contexto do usuário executor
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

  -- 3. REGRA FUNDAMENTAL: Estado Concluído é Terminal e Imutável
  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'Transição inválida: atendimentos concluídos são imutáveis e não podem ser reabertos.';
  END IF;

  -- 4. Matriz Estrita de Transições Válidas
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

  -- 5. BLINDAGEM DE BANCO DE DADOS: Início de Atendimento Presencial exige Check-in
  -- Impede UPDATE direto via PostgREST/SQL para 'in_progress' sem presença física registrada
  IF NEW.status = 'in_progress' AND NEW.checked_in_at IS NULL THEN
    RAISE EXCEPTION 'Transição inválida: não é permitido iniciar o atendimento ("Em Atendimento") sem o prévio registro de check-in (presença física do cliente).';
  END IF;

  -- 6. Restrição Operacional Específica para Perfil 'professional'
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

-- Revoga privilégios de PUBLIC e concede estritamente a autenticados e service_role
REVOKE EXECUTE ON FUNCTION public.check_appointment_status_transitions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_appointment_status_transitions() TO authenticated, service_role;
