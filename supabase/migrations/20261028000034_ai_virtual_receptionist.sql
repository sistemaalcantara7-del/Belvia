-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 6.4: Recepcionista Virtual com IA & Sessões de Chat
-- Arquivo: supabase/migrations/20261028000034_ai_virtual_receptionist.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura & Governança:
-- 1. Tabela public.ai_chat_sessions:
--    - Identificador de sessão de atendimento conversacional (session_token UUID / string).
--    - tenant_id: Isolamento multi-tenant estrito.
--    - client_identifier: Hash do IP / telefone para controle de taxa e prevenção de abuso.
--    - message_count: Contador de mensagens na sessão (limite de segurança por sessão: máx 30).
--    - status: 'active', 'completed', 'expired'.
--    - metadata: JSONB com rascunho de agendamento em andamento (service_id, professional_id, date, time, client_name, whatsapp).
--    - created_at, updated_at, expires_at.
-- 2. Tabela public.ai_chat_messages:
--    - Histórico mínimo auditável das mensagens da conversa.
--    - session_id: Referência à sessão.
--    - role: 'user' | 'assistant' | 'system'.
--    - content: Conteúdo da mensagem (sanitizado).
-- 3. Índices de expiração e isolamento para consultas rápidas.
-- 4. RLS e funções de controle.
-- ==============================================================================

-- 1. TABELA: ai_chat_sessions
CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    session_token VARCHAR(100) NOT NULL UNIQUE,
    client_identifier VARCHAR(100) NOT NULL, -- Hash de IP ou identificador de cliente
    message_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'completed', 'expired'
    booking_draft JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_lookup
    ON public.ai_chat_sessions(tenant_id, session_token, status);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_ratelimit
    ON public.ai_chat_sessions(tenant_id, client_identifier, created_at);

-- Trigger de updated_at para ai_chat_sessions
DROP TRIGGER IF EXISTS set_ai_chat_sessions_updated_at ON public.ai_chat_sessions;
CREATE TRIGGER set_ai_chat_sessions_updated_at
    BEFORE UPDATE ON public.ai_chat_sessions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 2. TABELA: ai_chat_messages
CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session
    ON public.ai_chat_messages(session_id, created_at ASC);

-- 3. Habilitação de RLS
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas para Membros do Tenant (consulta operacional e auditoria pela recepção)
DROP POLICY IF EXISTS "tenant_staff_view_ai_sessions" ON public.ai_chat_sessions;
CREATE POLICY "tenant_staff_view_ai_sessions" ON public.ai_chat_sessions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = ai_chat_sessions.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
        )
    );

DROP POLICY IF EXISTS "tenant_staff_view_ai_messages" ON public.ai_chat_messages;
CREATE POLICY "tenant_staff_view_ai_messages" ON public.ai_chat_messages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = ai_chat_messages.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
        )
    );
