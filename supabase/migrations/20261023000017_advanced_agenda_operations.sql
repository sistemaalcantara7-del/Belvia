-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.3.1: Motor de Disponibilidade no PostgreSQL (Revisão Hardened)
-- Arquivo: 20261023000017_advanced_agenda_operations.sql
--
-- Destaques de Segurança & Regras de Negócio:
-- 1. Resolução Segura de Fuso Horário Dinâmico:
--    - Função interna get_tenant_timezone que valida timezone contra pg_timezone_names.
--    - Fallback resiliente para 'America/Sao_Paulo'.
--    - Função REVOGADA de PUBLIC/authenticated e acessível apenas como utilitário interno.
-- 2. Separação Estrita de TG_OP (INSERT vs UPDATE):
--    - Em INSERT, nunca acessa campos de OLD (evita erro de runtime).
--    - Em UPDATE de remarcação, adquire advisory lock em AMBOS os profissionais
--      (OLD.professional_id e NEW.professional_id) em ordem determinística para prevenir deadlock.
-- 3. Detecção Robusta de Bloqueios Pontuais ('professional_time_blocks'):
--    - Validação baseada em EXISTS(SELECT 1 ...) independente de 'reason' ser NULL, vazio ou preenchido.
-- 4. Exigência Rígida de Expediente Ativo:
--    - Rejeita o agendamento se NÃO existir registro na tabela 'professional_schedules'
--      para o dia da semana local, ou se 'is_active' for false.
-- 5. Imutabilidade e Integridade nos Bloqueios ('professional_time_blocks'):
--    - Trigger 'check_time_block_immutability' impede alteração de tenant_id e professional_id após criação.
--    - Trigger 'check_time_block_appointment_conflict' com advisory lock impede sobreposição
--      a atendimentos já ativos ('scheduled', 'confirmed', 'in_progress', 'completed').
-- 6. Hardening de Políticas RLS em 'professional_time_blocks':
--    - Revoga e elimina todas as políticas legadas permissivas ("Owners, admins and self-professional can manage blocks", "Members can view time blocks").
--    - Separação estrita de SELECT, INSERT, UPDATE e DELETE.
--    - 'owner', 'admin', 'receptionist': gestão plena dentro do tenant.
--    - 'professional': visualiza e gerencia estritamente os seus próprios bloqueios.
-- ==============================================================================

-- 1. FUNÇÃO INTERNA: Obter Fuso Horário Válido do Tenant
CREATE OR REPLACE FUNCTION public.get_tenant_timezone(p_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_tz TEXT;
  v_is_valid BOOLEAN;
BEGIN
  SELECT settings->>'timezone'
  INTO v_raw_tz
  FROM public.tenants
  WHERE id = p_tenant_id;

  IF v_raw_tz IS NOT NULL AND v_raw_tz <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_timezone_names WHERE name = v_raw_tz
    ) INTO v_is_valid;

    IF v_is_valid THEN
      RETURN v_raw_tz;
    END IF;
  END IF;

  RETURN 'America/Sao_Paulo';
END;
$$;

-- Não expor utilitário de timezone diretamente para usuários comuns
REVOKE ALL ON FUNCTION public.get_tenant_timezone(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tenant_timezone(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_timezone(UUID) TO service_role;

-- 2. FUNÇÃO E TRIGGER: Imutabilidade de Vínculos em Bloqueios Pontuais
CREATE OR REPLACE FUNCTION public.check_time_block_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'Não é permitido alterar o estabelecimento de um bloqueio existente.';
  END IF;

  IF NEW.professional_id <> OLD.professional_id THEN
    RAISE EXCEPTION 'Não é permitido alterar o profissional de um bloqueio existente. Exclua e recrie o bloqueio se necessário.';
  END IF;

  IF NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'Horário de início do bloqueio deve ser estritamente anterior ao horário de término.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_time_block_immutability ON public.professional_time_blocks;
CREATE TRIGGER trigger_check_time_block_immutability
  BEFORE UPDATE ON public.professional_time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.check_time_block_immutability();

-- 3. TRIGGER FUNCTION: Impedir Bloqueios sobre Agendamentos Existentes
CREATE OR REPLACE FUNCTION public.check_time_block_appointment_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflicting_count INTEGER;
  v_prof_tenant UUID;
  v_lock_id BIGINT;
BEGIN
  -- 1. Valida integridade do tenant do profissional
  SELECT tenant_id INTO v_prof_tenant FROM public.professionals WHERE id = NEW.professional_id;
  IF v_prof_tenant IS NULL OR v_prof_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Profissional não localizado ou não pertence ao estabelecimento do bloqueio.';
  END IF;

  -- 2. Lock transacional por profissional para sincronizar com agendamentos simultâneos
  v_lock_id := ('x' || substr(md5('prof_lock_' || NEW.professional_id::text), 1, 16))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_id);

  -- 3. Conta agendamentos ativos no período do bloqueio
  SELECT COUNT(*)
  INTO v_conflicting_count
  FROM public.appointments
  WHERE tenant_id = NEW.tenant_id
    AND professional_id = NEW.professional_id
    AND status IN ('scheduled', 'confirmed', 'in_progress', 'completed')
    AND (start_time < NEW.end_time AND end_time > NEW.start_time);

  IF v_conflicting_count > 0 THEN
    RAISE EXCEPTION 'Não é possível registrar o bloqueio: existem % agendamento(s) ativo(s) neste intervalo. Cancele ou reagende os atendimentos antes de registrar o bloqueio.',
      v_conflicting_count;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_time_block_appointment_conflict ON public.professional_time_blocks;
CREATE TRIGGER trigger_check_time_block_appointment_conflict
  BEFORE INSERT OR UPDATE ON public.professional_time_blocks
  FOR EACH ROW EXECUTE FUNCTION public.check_time_block_appointment_conflict();

-- 4. TRIGGER FUNCTION: Validação Completa de Disponibilidade e Conflitos na Agenda
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
  v_has_time_block BOOLEAN;
  v_service_duration INTEGER;
  v_service_break INTEGER;
  v_expected_duration_interval INTERVAL;
  v_actual_duration_interval INTERVAL;
  v_tenant_tz TEXT;
  v_local_start TIMESTAMP;
  v_local_end TIMESTAMP;
  v_dow INTEGER;
  v_start_time TIME;
  v_end_time TIME;
  v_sched_active BOOLEAN;
  v_sched_start TIME;
  v_sched_end TIME;
  v_sched_break_start TIME;
  v_sched_break_end TIME;
  v_schedule_found BOOLEAN;
  v_is_reschedule BOOLEAN;
  v_lock_id_1 BIGINT;
  v_lock_id_2 BIGINT;
  v_prof_text_1 TEXT;
  v_prof_text_2 TEXT;
BEGIN
  -- 1. Validação de consistência multi-tenant de todas as chaves estrangeiras
  SELECT tenant_id INTO v_client_tenant FROM public.clients WHERE id = NEW.client_id;
  SELECT tenant_id, duration_minutes, break_minutes
    INTO v_service_tenant, v_service_duration, v_service_break
    FROM public.services
    WHERE id = NEW.service_id;
  SELECT tenant_id INTO v_prof_tenant FROM public.professionals WHERE id = NEW.professional_id;

  IF v_client_tenant IS NULL OR v_service_tenant IS NULL OR v_prof_tenant IS NULL THEN
    RAISE EXCEPTION 'Cliente, Serviço ou Profissional não localizado.';
  END IF;

  IF (v_client_tenant <> NEW.tenant_id) OR (v_service_tenant <> NEW.tenant_id) OR (v_prof_tenant <> NEW.tenant_id) THEN
    RAISE EXCEPTION 'Todos os registros associados devem pertencer ao mesmo estabelecimento.';
  END IF;

  -- 2. Separação explícita entre INSERT e UPDATE (sem acessar OLD durante INSERT)
  IF TG_OP = 'INSERT' THEN
    v_is_reschedule := true;
    -- Adquire lock consultivo determinístico para o novo profissional
    v_lock_id_1 := ('x' || substr(md5('prof_lock_' || NEW.professional_id::text), 1, 16))::bit(64)::bigint;
    PERFORM pg_advisory_xact_lock(v_lock_id_1);
  ELSE
    -- Em UPDATE: verifica se houve alteração de profissional, serviço ou faixa de horário
    v_is_reschedule := (OLD.professional_id <> NEW.professional_id) OR 
                       (OLD.service_id <> NEW.service_id) OR 
                       (OLD.start_time <> NEW.start_time) OR 
                       (OLD.end_time <> NEW.end_time);

    -- Se trocou de profissional, bloqueia ambos em ordem alfabética para prevenir deadlocks
    IF OLD.professional_id <> NEW.professional_id THEN
      IF NEW.professional_id::text < OLD.professional_id::text THEN
        v_prof_text_1 := NEW.professional_id::text;
        v_prof_text_2 := OLD.professional_id::text;
      ELSE
        v_prof_text_1 := OLD.professional_id::text;
        v_prof_text_2 := NEW.professional_id::text;
      END IF;

      v_lock_id_1 := ('x' || substr(md5('prof_lock_' || v_prof_text_1), 1, 16))::bit(64)::bigint;
      v_lock_id_2 := ('x' || substr(md5('prof_lock_' || v_prof_text_2), 1, 16))::bit(64)::bigint;
      PERFORM pg_advisory_xact_lock(v_lock_id_1);
      PERFORM pg_advisory_xact_lock(v_lock_id_2);
    ELSE
      v_lock_id_1 := ('x' || substr(md5('prof_lock_' || NEW.professional_id::text), 1, 16))::bit(64)::bigint;
      PERFORM pg_advisory_xact_lock(v_lock_id_1);
    END IF;
  END IF;

  -- 3. Validações atômicas de disponibilidade apenas para status ativos
  IF NEW.status IN ('scheduled', 'confirmed', 'in_progress', 'completed') THEN

    -- 3.1 Validação de Duração e Higienização do Serviço
    IF v_is_reschedule THEN
      v_expected_duration_interval := ((v_service_duration + COALESCE(v_service_break, 0)) || ' minutes')::interval;
      v_actual_duration_interval := (NEW.end_time - NEW.start_time);

      IF v_actual_duration_interval <> v_expected_duration_interval THEN
        RAISE EXCEPTION 'Duração inválida do agendamento: o tempo total deve ser exatamente % minutos (duração de % min + % min de intervalo/higienização).',
          (v_service_duration + COALESCE(v_service_break, 0)),
          v_service_duration,
          COALESCE(v_service_break, 0);
      END IF;
    END IF;

    -- 3.2 Verificação de sobreposição com outros agendamentos (Double-booking)
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

    -- 3.3 Verificação de Bloqueios Pontuais ('professional_time_blocks') por EXISTS
    SELECT EXISTS (
      SELECT 1
      FROM public.professional_time_blocks
      WHERE tenant_id = NEW.tenant_id
        AND professional_id = NEW.professional_id
        AND (start_time < NEW.end_time AND end_time > NEW.start_time)
    ) INTO v_has_time_block;

    IF v_has_time_block THEN
      RAISE EXCEPTION 'Horário indisponível: o profissional possui um bloqueio de agenda ativo neste período.';
    END IF;

    -- 3.4 Validação de Expediente Semanal e Fuso Horário Local
    IF v_is_reschedule THEN
      v_tenant_tz := public.get_tenant_timezone(NEW.tenant_id);

      -- Converte TIMESTAMPTZ para data e hora local do estabelecimento
      v_local_start := NEW.start_time AT TIME ZONE v_tenant_tz;
      v_local_end   := NEW.end_time AT TIME ZONE v_tenant_tz;

      -- Bloqueia agendamentos que cruzem a meia-noite (virada de dia)
      IF v_local_start::date <> v_local_end::date THEN
        RAISE EXCEPTION 'Agendamentos não podem ultrapassar a virada de dia (meia-noite) no fuso horário do estabelecimento (%).', v_tenant_tz;
      END IF;

      -- Dia da semana local (0 = Domingo a 6 = Sábado)
      v_dow := EXTRACT(DOW FROM v_local_start)::INTEGER;
      v_start_time := v_local_start::time;
      v_end_time := v_local_end::time;

      -- Busca a grade do profissional para o dia da semana
      SELECT true, is_active, start_time, end_time, break_start, break_end
      INTO v_schedule_found, v_sched_active, v_sched_start, v_sched_end, v_sched_break_start, v_sched_break_end
      FROM public.professional_schedules
      WHERE tenant_id = NEW.tenant_id
        AND professional_id = NEW.professional_id
        AND day_of_week = v_dow;

      -- Se não existir registro de expediente configurado para o dia da semana, rejeita
      IF v_schedule_found IS NOT TRUE THEN
        RAISE EXCEPTION 'O profissional não possui horário de atendimento configurado para este dia da semana.';
      END IF;

      -- Se existir registro mas estiver inativo, rejeita
      IF v_sched_active IS NOT TRUE THEN
        RAISE EXCEPTION 'O profissional não realiza atendimentos neste dia da semana.';
      END IF;

      -- Verifica limites do expediente
      IF (v_start_time < v_sched_start) OR (v_end_time > v_sched_end) THEN
        RAISE EXCEPTION 'Horário fora do expediente do profissional no dia (% às %). Horário solicitado: % às %.',
          to_char(v_sched_start, 'HH24:MI'),
          to_char(v_sched_end, 'HH24:MI'),
          to_char(v_start_time, 'HH24:MI'),
          to_char(v_end_time, 'HH24:MI');
      END IF;

      -- Verifica conflito com intervalo de descanso/almoço
      IF v_sched_break_start IS NOT NULL AND v_sched_break_end IS NOT NULL THEN
        -- Sobreposição com intervalo: (StartA < BreakEnd) AND (EndA > BreakStart)
        IF (v_start_time < v_sched_break_end) AND (v_end_time > v_sched_break_start) THEN
          RAISE EXCEPTION 'Horário em conflito com o intervalo de descanso do profissional (% às %).',
            to_char(v_sched_break_start, 'HH24:MI'),
            to_char(v_sched_break_end, 'HH24:MI');
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_appointment_overlap_and_tenancy ON public.appointments;
CREATE TRIGGER trigger_check_appointment_overlap_and_tenancy
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.check_appointment_overlap_and_tenancy();

-- 5. REVOGAÇÃO E RECUPERAÇÃO SEGURA DAS POLÍTICAS RLS DE 'professional_time_blocks'
-- Revoga todas as políticas legadas permissivas da migration 000004
DROP POLICY IF EXISTS "Members can view time blocks" ON public.professional_time_blocks;
DROP POLICY IF EXISTS "Owners, admins and self-professional can manage blocks" ON public.professional_time_blocks;
DROP POLICY IF EXISTS "Authorized members can view time blocks" ON public.professional_time_blocks;
DROP POLICY IF EXISTS "Authorized roles can insert time blocks" ON public.professional_time_blocks;
DROP POLICY IF EXISTS "Authorized roles can update time blocks" ON public.professional_time_blocks;
DROP POLICY IF EXISTS "Authorized roles can delete time blocks" ON public.professional_time_blocks;

-- SELECT:
-- - 'owner', 'admin', 'receptionist': podem consultar todos os bloqueios do tenant.
-- - 'professional': pode consultar estritamente os seus próprios bloqueios.
CREATE POLICY "Authorized roles can view time blocks" ON public.professional_time_blocks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users staff_user
      WHERE staff_user.tenant_id = professional_time_blocks.tenant_id
        AND staff_user.user_id = auth.uid()
        AND staff_user.status = 'active'
        AND (
          staff_user.role IN ('owner', 'admin', 'receptionist')
          OR (
            staff_user.role = 'professional' AND
            EXISTS (
              SELECT 1 FROM public.professionals p
              WHERE p.id = professional_time_blocks.professional_id
                AND p.user_id = auth.uid()
                AND p.tenant_id = professional_time_blocks.tenant_id
            )
          )
        )
    )
  );

-- INSERT:
-- - 'owner', 'admin', 'receptionist': podem inserir para qualquer profissional do tenant.
-- - 'professional': pode inserir exclusivamente para si mesmo.
CREATE POLICY "Authorized roles can insert time blocks" ON public.professional_time_blocks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tenant_users staff_user
      WHERE staff_user.tenant_id = professional_time_blocks.tenant_id
        AND staff_user.user_id = auth.uid()
        AND staff_user.status = 'active'
        AND (
          staff_user.role IN ('owner', 'admin', 'receptionist')
          OR (
            staff_user.role = 'professional' AND
            EXISTS (
              SELECT 1 FROM public.professionals p
              WHERE p.id = professional_time_blocks.professional_id
                AND p.user_id = auth.uid()
                AND p.tenant_id = professional_time_blocks.tenant_id
            )
          )
        )
    )
  );

-- UPDATE:
-- - 'owner', 'admin', 'receptionist': podem atualizar bloqueios do tenant.
-- - 'professional': pode atualizar exclusivamente os seus próprios bloqueios.
-- - WITH CHECK reforça que tenant_id e professional_id não podem ser trocados.
CREATE POLICY "Authorized roles can update time blocks" ON public.professional_time_blocks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users staff_user
      WHERE staff_user.tenant_id = professional_time_blocks.tenant_id
        AND staff_user.user_id = auth.uid()
        AND staff_user.status = 'active'
        AND (
          staff_user.role IN ('owner', 'admin', 'receptionist')
          OR (
            staff_user.role = 'professional' AND
            EXISTS (
              SELECT 1 FROM public.professionals p
              WHERE p.id = professional_time_blocks.professional_id
                AND p.user_id = auth.uid()
                AND p.tenant_id = professional_time_blocks.tenant_id
            )
          )
        )
    )
  )
  WITH CHECK (
    tenant_id = professional_time_blocks.tenant_id
    AND EXISTS (
      SELECT 1 FROM public.tenant_users staff_user
      WHERE staff_user.tenant_id = professional_time_blocks.tenant_id
        AND staff_user.user_id = auth.uid()
        AND staff_user.status = 'active'
        AND (
          staff_user.role IN ('owner', 'admin', 'receptionist')
          OR (
            staff_user.role = 'professional' AND
            EXISTS (
              SELECT 1 FROM public.professionals p
              WHERE p.id = professional_time_blocks.professional_id
                AND p.user_id = auth.uid()
                AND p.tenant_id = professional_time_blocks.tenant_id
            )
          )
        )
    )
  );

-- DELETE:
-- - 'owner', 'admin', 'receptionist': podem excluir bloqueios do tenant.
-- - 'professional': pode excluir exclusivamente os seus próprios bloqueios.
CREATE POLICY "Authorized roles can delete time blocks" ON public.professional_time_blocks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_users staff_user
      WHERE staff_user.tenant_id = professional_time_blocks.tenant_id
        AND staff_user.user_id = auth.uid()
        AND staff_user.status = 'active'
        AND (
          staff_user.role IN ('owner', 'admin', 'receptionist')
          OR (
            staff_user.role = 'professional' AND
            EXISTS (
              SELECT 1 FROM public.professionals p
              WHERE p.id = professional_time_blocks.professional_id
                AND p.user_id = auth.uid()
                AND p.tenant_id = professional_time_blocks.tenant_id
            )
          )
        )
    )
  );

-- 6. CONCESSÃO RESTRITA DE PRIVILÉGIOS EM FUNÇÕES TRIGGER
REVOKE ALL ON FUNCTION public.check_appointment_overlap_and_tenancy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_appointment_overlap_and_tenancy() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_time_block_appointment_conflict() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_time_block_appointment_conflict() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_time_block_immutability() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_time_block_immutability() TO authenticated, service_role;
