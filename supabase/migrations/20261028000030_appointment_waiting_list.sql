-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.8: Lista de Espera Inteligente
-- Arquivo: supabase/migrations/20261028000030_appointment_waiting_list.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança da Lista de Espera:
-- 1. Tabela public.waiting_list:
--    - client_id: Cliente interessado no horário.
--    - service_id: Serviço desejado (para cálculo automático da duração e janela de vaga).
--    - professional_id: Profissional preferencial (ou NULL para qualquer profissional habilitado).
--    - preferred_date_start / preferred_date_end: Intervalo de datas desejadas.
--    - preferred_time_start / preferred_time_end: Faixa de horários aceita (ex: "08:00" a "12:00").
--    - preferred_days_of_week: Array de inteiros (0=Dom, 1=Seg, ..., 6=Sáb) com os dias compatíveis.
--    - priority: Prioridade operacional ('low', 'normal', 'high', 'urgent').
--    - status: 'waiting', 'offered', 'booked', 'expired', 'canceled'.
--    - offer_expires_at: Expiração de ofertas ativas para evitar retenção indefinida.
-- 2. Tabela public.waiting_list_offers (Histórico de Ofertas):
--    - Vincula waiting_list_id ao horário liberado (start_time, end_time, professional_id).
--    - status: 'pending', 'accepted', 'rejected', 'expired'.
--    - offered_by: Usuário da recepção responsável pela abordagem via WhatsApp manual.
-- 3. RPC match_waiting_list_candidates:
--    - Localiza clientes compatíveis com a vaga liberada por cancelamento/reagendamento,
--      respeitando serviço, duração, profissional habilitado e disponibilidade cadastrada.
-- 4. RPC atômica convert_waiting_list_to_appointment:
--    - Converte a solicitação da lista de espera em agendamento oficial,
--      validando atomicamente conflitos de agenda (overlap) e atualizando o status para 'booked'.
-- ==============================================================================

-- 1. ENUMS DA LISTA DE ESPERA
DO $$ BEGIN
    CREATE TYPE waiting_list_status AS ENUM ('waiting', 'offered', 'booked', 'expired', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE waiting_list_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE waiting_offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: waiting_list
CREATE TABLE IF NOT EXISTS public.waiting_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
    professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL, -- NULL = Qualquer profissional habilitado
    preferred_date_start DATE NOT NULL,
    preferred_date_end DATE NOT NULL,
    preferred_time_start TIME DEFAULT '08:00:00',
    preferred_time_end TIME DEFAULT '20:00:00',
    preferred_days_of_week INT[] DEFAULT ARRAY[1,2,3,4,5,6], -- Seg a Sáb por padrão
    priority waiting_list_priority NOT NULL DEFAULT 'normal',
    status waiting_list_status NOT NULL DEFAULT 'waiting',
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_waiting_list_dates CHECK (preferred_date_start <= preferred_date_end),
    CONSTRAINT chk_waiting_list_times CHECK (preferred_time_start < preferred_time_end)
);

-- Trigger de updated_at para waiting_list
DROP TRIGGER IF EXISTS set_waiting_list_updated_at ON public.waiting_list;
CREATE TRIGGER set_waiting_list_updated_at
    BEFORE UPDATE ON public.waiting_list
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices de Performance da Fila de Espera
CREATE INDEX IF NOT EXISTS idx_waiting_list_tenant_status
    ON public.waiting_list(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_waiting_list_matching
    ON public.waiting_list(tenant_id, service_id, professional_id, preferred_date_start, preferred_date_end)
    WHERE status = 'waiting';

-- 3. TABELA: waiting_list_offers (Histórico de Abordagens e Ofertas)
CREATE TABLE IF NOT EXISTS public.waiting_list_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    waiting_list_id UUID NOT NULL REFERENCES public.waiting_list(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status waiting_offer_status NOT NULL DEFAULT 'pending',
    channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp_manual',
    offered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours'),
    responded_at TIMESTAMPTZ,
    response_notes TEXT,
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waiting_offers_tenant
    ON public.waiting_list_offers(tenant_id, waiting_list_id, status);

-- Habilita RLS
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waiting_list_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "waiting_list_tenant_isolation" ON public.waiting_list;
CREATE POLICY "waiting_list_tenant_isolation"
    ON public.waiting_list
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = waiting_list.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin', 'receptionist')
              AND tu.status = 'active'
        )
    );

DROP POLICY IF EXISTS "waiting_offers_tenant_isolation" ON public.waiting_list_offers;
CREATE POLICY "waiting_offers_tenant_isolation"
    ON public.waiting_list_offers
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = waiting_list_offers.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin', 'receptionist')
              AND tu.status = 'active'
        )
    );

-- 4. RPC: Detectar Clientes Compatíveis com Vaga Liberada
CREATE OR REPLACE FUNCTION public.match_waiting_list_candidates(
    p_tenant_id UUID,
    p_service_id UUID,
    p_professional_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    waiting_id UUID,
    client_id UUID,
    client_name VARCHAR(255),
    client_phone VARCHAR(50),
    client_whatsapp VARCHAR(50),
    service_name VARCHAR(150),
    preferred_professional_name VARCHAR(255),
    priority waiting_list_priority,
    notes TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_date DATE := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_time TIME := (p_start_time AT TIME ZONE 'America/Sao_Paulo')::TIME;
    v_dow INT := EXTRACT(DOW FROM (p_start_time AT TIME ZONE 'America/Sao_Paulo'))::INT;
BEGIN
    RETURN QUERY
    SELECT
        w.id AS waiting_id,
        c.id AS client_id,
        c.full_name AS client_name,
        c.phone AS client_phone,
        c.whatsapp AS client_whatsapp,
        s.name AS service_name,
        p.full_name AS preferred_professional_name,
        w.priority,
        w.notes,
        w.created_at
    FROM public.waiting_list w
    JOIN public.clients c ON c.id = w.client_id
    JOIN public.services s ON s.id = w.service_id
    LEFT JOIN public.professionals p ON p.id = w.professional_id
    WHERE w.tenant_id = p_tenant_id
      AND w.status = 'waiting'
      AND w.service_id = p_service_id
      AND (w.professional_id IS NULL OR w.professional_id = p_professional_id)
      AND v_date BETWEEN w.preferred_date_start AND w.preferred_date_end
      AND v_dow = ANY(w.preferred_days_of_week)
      AND v_time >= w.preferred_time_start
      AND v_time <= w.preferred_time_end
    ORDER BY
        CASE w.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'normal' THEN 3
            WHEN 'low' THEN 4
        END ASC,
        w.created_at ASC;
END;
$$;

-- 5. RPC ATÔMICA: Converter Solicitação em Agendamento Oficial
CREATE OR REPLACE FUNCTION public.convert_waiting_list_to_appointment(
    p_tenant_id UUID,
    p_waiting_list_id UUID,
    p_professional_id UUID,
    p_start_time TIMESTAMPTZ,
    p_offer_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
    v_wait RECORD;
    v_service RECORD;
    v_duration_minutes INT;
    v_end_time TIMESTAMPTZ;
    v_appointment_id UUID;
BEGIN
    -- 1. Validação de Permissão (owner, admin, receptionist)
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_user_role
        FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id
          AND status = 'active';

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin', 'receptionist') THEN
            RAISE EXCEPTION 'Acesso negado: permissão insuficiente para converter lista de espera em agendamento.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Autenticação necessária.';
    END IF;

    -- 2. Busca e bloqueia a solicitação na lista de espera
    SELECT * INTO v_wait
    FROM public.waiting_list
    WHERE id = p_waiting_list_id
      AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solicitação de lista de espera não localizada.';
    END IF;

    IF v_wait.status = 'booked' THEN
        RAISE EXCEPTION 'Esta solicitação já foi atendida e convertida em agendamento.';
    END IF;

    IF v_wait.status = 'canceled' THEN
        RAISE EXCEPTION 'Esta solicitação foi cancelada anteriormente.';
    END IF;

    -- 3. Busca informações do serviço para cálculo da duração e preço
    SELECT id, name, price, duration_minutes, break_minutes
    INTO v_service
    FROM public.services
    WHERE id = v_wait.service_id
      AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Serviço não localizado no estabelecimento.';
    END IF;

    v_duration_minutes := v_service.duration_minutes + COALESCE(v_service.break_minutes, 0);
    v_end_time := p_start_time + (v_duration_minutes || ' minutes')::INTERVAL;

    -- 4. Criação atômica do agendamento (aciona as triggers existentes de conflito e advisory lock)
    INSERT INTO public.appointments (
        tenant_id,
        client_id,
        service_id,
        professional_id,
        start_time,
        end_time,
        price,
        status,
        notes
    ) VALUES (
        p_tenant_id,
        v_wait.client_id,
        v_wait.service_id,
        p_professional_id,
        p_start_time,
        v_end_time,
        v_service.price,
        'confirmed', -- Já confirmado após aceitar oferta da lista de espera
        COALESCE(v_wait.notes, 'Convertido via Lista de Espera Inteligente.')
    ) RETURNING id INTO v_appointment_id;

    -- 5. Atualiza o status da lista de espera para 'booked'
    UPDATE public.waiting_list
    SET status = 'booked',
        updated_at = now()
    WHERE id = p_waiting_list_id;

    -- 6. Atualiza oferta, se fornecida
    IF p_offer_id IS NOT NULL THEN
        UPDATE public.waiting_list_offers
        SET status = 'accepted',
            appointment_id = v_appointment_id,
            responded_at = now(),
            updated_at = now()
        WHERE id = p_offer_id
          AND tenant_id = p_tenant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'waiting_list_id', p_waiting_list_id,
        'client_id', v_wait.client_id,
        'start_time', p_start_time,
        'end_time', v_end_time
    );
END;
$$;

-- Permissões de Execução
REVOKE ALL ON FUNCTION public.match_waiting_list_candidates FROM PUBLIC;
REVOKE ALL ON FUNCTION public.convert_waiting_list_to_appointment FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.match_waiting_list_candidates TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.convert_waiting_list_to_appointment TO authenticated, service_role;
