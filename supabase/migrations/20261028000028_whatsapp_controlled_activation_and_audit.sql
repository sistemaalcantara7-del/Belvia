-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 5.5: Ativação Operacional Segura do WhatsApp Oficial
-- Arquivo: supabase/migrations/20261028000028_whatsapp_controlled_activation_and_audit.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança de Ativação:
-- 1. Padrões Seguros de Inicialização:
--    - dry_run_mode BOOLEAN NOT NULL DEFAULT true (padrão seguro contra disparos acidentais).
--    - is_live_active BOOLEAN NOT NULL DEFAULT false (ativação explícita obrigatória).
--    - is_paused BOOLEAN NOT NULL DEFAULT false (chave de emergência/pausa operacional).
-- 2. Compatibilidade Estrita de Schema (auth.users & status = 'processing'):
--    - Chaves estrangeiras de usuários apontam para auth.users(id) ON DELETE SET NULL / CASCADE.
--    - Detecção de mensagens travadas / em processamento baseada em status = 'processing' e
--      processing_started_at, sem depender de colunas inexistentes.
-- 3. Validação Rigorosa de Pré-Ativação (Sem Descarte / Sem Reenvio Automático):
--    - Impede ativação real (can_activate = false) enquanto houver:
--      * Mensagens com status = 'processing'
--      * Mensagens de simulação pendentes / travadas (simulated_messages_count > 0)
--      * Mensagens com falhas ou resultados incertos não resolvidos
--    - NÃO reenvia nem descarta/cancela registros silenciosamente no banco.
-- 4. Governança e Auditoria Estrita:
--    - Exclusivo para 'owner' ou 'admin' ativos em public.tenant_users.
--    - Log imutável em tenant_whatsapp_activation_logs com snapshot e justificativa.
-- ==============================================================================

-- 1. NOVOS CAMPOS DE GOVERNANÇA EM tenant_whatsapp_configs
ALTER TABLE public.tenant_whatsapp_configs
    ADD COLUMN IF NOT EXISTS is_live_active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS live_activated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS live_activated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paused_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Assegura valores padrão seguros caso as colunas já existissem
ALTER TABLE public.tenant_whatsapp_configs
    ALTER COLUMN is_live_active SET DEFAULT false,
    ALTER COLUMN is_paused SET DEFAULT false;

COMMENT ON COLUMN public.tenant_whatsapp_configs.is_live_active IS 'Indica se o estabelecimento ativou conscientemente o envio de mensagens reais à Meta (Padrão: false).';
COMMENT ON COLUMN public.tenant_whatsapp_configs.live_activated_at IS 'Data e hora da confirmação explícita de ativação real pelo gestor.';
COMMENT ON COLUMN public.tenant_whatsapp_configs.live_activated_by IS 'Usuário gestor autenticado que confirmou a ativação do canal real.';
COMMENT ON COLUMN public.tenant_whatsapp_configs.is_paused IS 'Flag de interrupção operacional temporária da fila de envios reais.';
COMMENT ON COLUMN public.tenant_whatsapp_configs.paused_at IS 'Data e hora da última pausa operacional acionada.';
COMMENT ON COLUMN public.tenant_whatsapp_configs.paused_by IS 'Usuário que solicitou a pausa operacional da fila.';
COMMENT ON COLUMN public.tenant_whatsapp_configs.pause_reason IS 'Motivo registrado para a pausa operacional do serviço de notificações.';

-- 2. TABELA DE AUDITORIA DE ATIVAÇÃO E CONTROLE
CREATE TABLE IF NOT EXISTS public.tenant_whatsapp_activation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    performed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'ACTIVATE_LIVE', 'DEACTIVATE_LIVE', 'PAUSE_LIVE', 'RESUME_LIVE'
    reason TEXT,
    snapshot JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_activation_logs_tenant
    ON public.tenant_whatsapp_activation_logs(tenant_id, created_at DESC);

-- Habilita RLS na tabela de auditoria
ALTER TABLE public.tenant_whatsapp_activation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_activation_logs_select_policy" ON public.tenant_whatsapp_activation_logs;
CREATE POLICY "whatsapp_activation_logs_select_policy"
    ON public.tenant_whatsapp_activation_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = tenant_whatsapp_activation_logs.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

-- 3. RPC DE CHECKLIST PRÉ-ATIVAÇÃO (Verificação Rigorosa)
CREATE OR REPLACE FUNCTION public.get_whatsapp_pre_activation_checklist(
    p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
    v_cfg RECORD;
    v_reminders RECORD;
    v_approved_templates_count INT := 0;
    v_simulated_pending_count INT := 0;
    v_processing_count INT := 0;
    v_stuck_processing_count INT := 0;
    v_uncertain_failures_count INT := 0;
    v_opt_in_clients_count INT := 0;
    v_total_clients_count INT := 0;
    v_can_activate BOOLEAN := false;
    v_checklist JSONB;
BEGIN
    -- Validação de Permissão: Apenas 'owner' ou 'admin' ativos
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_user_role
        FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id
          AND status = 'active';

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Acesso negado: apenas administradores ativos podem verificar a pré-ativação.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Autenticação necessária.';
    END IF;

    -- 1. Conexão e Credenciais Meta
    SELECT * INTO v_cfg
    FROM public.tenant_whatsapp_configs
    WHERE tenant_id = p_tenant_id;

    -- 2. Configurações de Lembrete
    SELECT * INTO v_reminders
    FROM public.tenant_reminder_settings
    WHERE tenant_id = p_tenant_id;

    -- 3. Templates UTILITY Aprovados
    SELECT COUNT(*) INTO v_approved_templates_count
    FROM public.whatsapp_official_templates
    WHERE tenant_id = p_tenant_id
      AND category = 'UTILITY'
      AND status = 'APPROVED';

    -- 4. Contagem de Mensagens em Processamento Ativo
    -- Utiliza status = 'processing' e processing_started_at sem depender de is_processing
    SELECT
        COUNT(*) FILTER (WHERE status = 'processing'),
        COUNT(*) FILTER (WHERE status = 'processing' AND processing_started_at < (now() - INTERVAL '5 minutes'))
    INTO v_processing_count, v_stuck_processing_count
    FROM public.notification_queue
    WHERE tenant_id = p_tenant_id;

    -- 5. Contagem de Mensagens Simuladas Pendentes na Fila
    -- Mensagens com status pending que foram marcadas como simulação ou geradas em homologação
    SELECT COUNT(*) INTO v_simulated_pending_count
    FROM public.notification_queue
    WHERE tenant_id = p_tenant_id
      AND status = 'pending'
      AND (is_simulation IS TRUE OR error_message ILIKE '%homologação%');

    -- 6. Contagem de Falhas com Resultado Incerto / Timeout Suspenso
    SELECT COUNT(*) INTO v_uncertain_failures_count
    FROM public.notification_queue
    WHERE tenant_id = p_tenant_id
      AND status = 'failed'
      AND (error_message ILIKE '%incerto%' OR error_message ILIKE '%timeout%');

    -- 7. Clientes com Consentimento LGPD (Opt-In Ativo)
    SELECT
        COUNT(*) FILTER (WHERE opt_in_reminders IS TRUE),
        COUNT(*)
    INTO v_opt_in_clients_count, v_total_clients_count
    FROM public.clients
    WHERE tenant_id = p_tenant_id;

    -- Regra de Bloqueio Rígida:
    -- A ativação real NÃO pode ocorrer enquanto houver:
    -- - Mensagens em processamento ativo (processing_count > 0)
    -- - Mensagens simuladas pendentes de envio
    -- - Falhas de envio incertas não resolvidas
    v_can_activate := (
        v_cfg.connection_status = 'connected' AND
        (v_cfg.phone_number_id IS NOT NULL AND v_cfg.phone_number_id <> '') AND
        (v_cfg.access_token_secret IS NOT NULL AND length(v_cfg.access_token_secret) > 10) AND
        COALESCE(v_reminders.enabled, false) AND
        v_approved_templates_count >= 2 AND
        v_processing_count = 0 AND
        v_simulated_pending_count = 0 AND
        v_uncertain_failures_count = 0
    );

    v_checklist := jsonb_build_object(
        'meta_connected', (v_cfg.connection_status = 'connected'),
        'has_phone_number', (v_cfg.phone_number_id IS NOT NULL AND v_cfg.phone_number_id <> ''),
        'has_waba_id', (v_cfg.waba_id IS NOT NULL AND v_cfg.waba_id <> ''),
        'has_token', (v_cfg.access_token_secret IS NOT NULL AND length(v_cfg.access_token_secret) > 10),
        'reminders_enabled', COALESCE(v_reminders.enabled, false),
        'utility_templates_approved', (v_approved_templates_count >= 2),
        'approved_templates_count', v_approved_templates_count,
        'processing_messages_count', v_processing_count,
        'stuck_messages_count', v_stuck_processing_count,
        'simulated_pending_count', v_simulated_pending_count,
        'uncertain_failures_count', v_uncertain_failures_count,
        'opt_in_clients_count', v_opt_in_clients_count,
        'total_clients_count', v_total_clients_count,
        'is_live_active', COALESCE(v_cfg.is_live_active, false),
        'is_paused', COALESCE(v_cfg.is_paused, false),
        'can_activate', v_can_activate
    );

    RETURN v_checklist;
END;
$$;

-- 4. RPC ATÔMICA: Ativação / Desativação do Envio Real com Auditoria Estrita
CREATE OR REPLACE FUNCTION public.set_whatsapp_live_activation(
    p_tenant_id UUID,
    p_enable_live BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
    v_checklist JSONB;
BEGIN
    -- Validação de Permissão Restrita: Apenas 'owner' ou 'admin' ativos
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_user_role
        FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id
          AND status = 'active';

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Acesso negado: apenas administradores ativos podem alterar o modo de ativação do WhatsApp.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Autenticação necessária para alterar o modo de ativação do WhatsApp.';
    END IF;

    -- Se estiver ativando, executa checklist obrigatório
    IF p_enable_live THEN
        v_checklist := public.get_whatsapp_pre_activation_checklist(p_tenant_id);
        IF NOT (v_checklist->>'can_activate')::boolean THEN
            RAISE EXCEPTION 'Não é permitido ativar disparos reais enquanto houver pendências técnicas: mensagens em processamento, simulações pendentes, falhas incertas ou templates não aprovados.';
        END IF;

        -- Atualiza status de ativação mantendo integridade dos dados existentes
        UPDATE public.tenant_whatsapp_configs
        SET is_live_active = true,
            dry_run_mode = false,
            is_paused = false,
            live_activated_at = now(),
            live_activated_by = v_user_id,
            updated_at = now()
        WHERE tenant_id = p_tenant_id;

        -- Log de Auditoria Imutável
        INSERT INTO public.tenant_whatsapp_activation_logs (
            tenant_id,
            performed_by,
            action,
            reason,
            snapshot
        ) VALUES (
            p_tenant_id,
            v_user_id,
            'ACTIVATE_LIVE',
            COALESCE(p_reason, 'Ativação de envios reais autorizada pelo gestor após validação do checklist.'),
            v_checklist
        );
    ELSE
        -- Retorno seguro ao modo homologação (dry-run)
        UPDATE public.tenant_whatsapp_configs
        SET is_live_active = false,
            dry_run_mode = true,
            updated_at = now()
        WHERE tenant_id = p_tenant_id;

        -- Log de Auditoria Imutável
        INSERT INTO public.tenant_whatsapp_activation_logs (
            tenant_id,
            performed_by,
            action,
            reason,
            snapshot
        ) VALUES (
            p_tenant_id,
            v_user_id,
            'DEACTIVATE_LIVE',
            COALESCE(p_reason, 'Retorno ao modo seguro (homologação/dry-run) solicitado pelo gestor.'),
            '{}'::jsonb
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_live_active', p_enable_live,
        'dry_run_mode', NOT p_enable_live
    );
END;
$$;

-- 5. RPC ATÔMICA: Pausa / Retomada Operacional da Fila
CREATE OR REPLACE FUNCTION public.set_whatsapp_operational_pause(
    p_tenant_id UUID,
    p_pause BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role VARCHAR(50);
    v_action VARCHAR(50);
BEGIN
    -- Validação de Permissão Restrita: Apenas 'owner' ou 'admin' ativos
    IF v_user_id IS NOT NULL THEN
        SELECT role INTO v_user_role
        FROM public.tenant_users
        WHERE tenant_id = p_tenant_id
          AND user_id = v_user_id
          AND status = 'active';

        IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'Acesso negado: apenas administradores ativos podem pausar ou retomar a fila.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Autenticação necessária para pausar ou retomar a fila.';
    END IF;

    v_action := CASE WHEN p_pause THEN 'PAUSE_LIVE' ELSE 'RESUME_LIVE' END;

    UPDATE public.tenant_whatsapp_configs
    SET is_paused = p_pause,
        paused_at = CASE WHEN p_pause THEN now() ELSE NULL END,
        paused_by = CASE WHEN p_pause THEN v_user_id ELSE NULL END,
        pause_reason = CASE WHEN p_pause THEN COALESCE(p_reason, 'Pausa operacional manual.') ELSE NULL END,
        updated_at = now()
    WHERE tenant_id = p_tenant_id;

    INSERT INTO public.tenant_whatsapp_activation_logs (
        tenant_id,
        performed_by,
        action,
        reason,
        snapshot
    ) VALUES (
        p_tenant_id,
        v_user_id,
        v_action,
        COALESCE(p_reason, CASE WHEN p_pause THEN 'Pausa operacional manual da fila.' ELSE 'Retomada manual da fila.' END),
        jsonb_build_object('is_paused', p_pause)
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_paused', p_pause
    );
END;
$$;

-- Permissões de Execução (Restritas a papéis autenticados)
REVOKE ALL ON FUNCTION public.get_whatsapp_pre_activation_checklist FROM public;
REVOKE ALL ON FUNCTION public.set_whatsapp_live_activation FROM public;
REVOKE ALL ON FUNCTION public.set_whatsapp_operational_pause FROM public;

GRANT EXECUTE ON FUNCTION public.get_whatsapp_pre_activation_checklist TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_live_activation TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_whatsapp_operational_pause TO authenticated, service_role;
