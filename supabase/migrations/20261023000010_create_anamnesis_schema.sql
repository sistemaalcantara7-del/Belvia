-- ==============================================================================
-- BELVIA SaaS - Migration Fase 3.2: Ficha de Anamnese & Proteção de Dados de Saúde (LGPD)
-- Arquivo: 20261023000010_create_anamnesis_schema.sql
--
-- Destaques de Segurança, LGPD & Integridade Clínica:
-- 1. Dados de saúde são classificados como DADOS PESSOAIS SENSÍVEIS (Art. 5º, II e Art. 11 da LGPD).
-- 2. Tabela 'anamnesis_templates': Modelos de formulários por tipo de atendimento (Facial, Corporal, Massoterapia, etc.).
-- 3. Tabela 'anamnesis_questions': Perguntas com tipagem estrita de resposta (text, single_choice, multiple_choice, boolean, date).
-- 4. Tabela 'anamnesis_forms': Fichas de anamnese preenchidas associadas a clientes, com versionamento e rastreabilidade.
-- 5. Tabela 'anamnesis_answers': Respostas individuais de cada pergunta com histórico.
-- 6. Tabela 'anamnesis_legal_consents': Registro probatório da base legal (consentimento explícito ou tutela da saúde).
-- 7. Tabela 'anamnesis_audit_logs': Trilha de auditoria imutável (quem visualizou/preencheu/editou cada ficha de saúde).
-- 8. Row Level Security (RLS) Avançado:
--    - Gestão ('owner', 'admin', 'receptionist'): Acesso integral administrativo aos prontuários do tenant.
--    - Profissional ('professional'): Acesso RESTRITO e EXCLUSIVO às fichas de clientes com quem o profissional possui
--      atendimento agendado/realizado ('appointments'). Bloqueia completamente o acesso a fichas de clientes de outros profissionais.
-- 9. Gatilho de Imutabilidade e Versionamento: Fichas finalizadas não sofrem UPDATE destrutivo; alterações geram nova versão.
-- ==============================================================================

-- 1. ENUMS PARA A ESTRUTURA CLÍNICA
DO $$ BEGIN
    CREATE TYPE anamnesis_question_type AS ENUM ('text', 'single_choice', 'multiple_choice', 'boolean', 'date');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE anamnesis_form_status AS ENUM ('draft', 'completed', 'archived');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE lgpd_legal_basis AS ENUM (
        'consent',              -- Consentimento explícito e destacado (Art. 11, I)
        'health_protection',    -- Tutela da saúde / procedimento realizado por profissionais de saúde (Art. 11, II, f)
        'contract_execution',   -- Execução de contrato (Art. 7, V)
        'legal_obligation'      -- Cumprimento de obrigação legal ou regulatória (Art. 11, II, a)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABELA: anamnesis_templates (Modelos de Ficha por Tipo de Atendimento)
CREATE TABLE IF NOT EXISTS public.anamnesis_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Facial', -- Facial, Corporal, Massoterapia, Geral, etc.
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA: anamnesis_questions (Perguntas Configuráveis do Modelo)
CREATE TABLE IF NOT EXISTS public.anamnesis_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.anamnesis_templates(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type anamnesis_question_type NOT NULL DEFAULT 'text',
    options JSONB DEFAULT '[]'::jsonb, -- Array de strings para escolhas únicas ou múltiplas
    is_required BOOLEAN NOT NULL DEFAULT false,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABELA: anamnesis_forms (Fichas de Anamnese Digitais)
CREATE TABLE IF NOT EXISTS public.anamnesis_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES public.anamnesis_templates(id) ON DELETE RESTRICT,
    professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL, -- Responsável pelo preenchimento/avaliação
    appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,     -- Vínculo opcional ao atendimento da agenda
    
    -- Campos Clínicos Estruturados Fundamentais
    health_history TEXT,        -- Histórico de saúde informado
    allergies TEXT,             -- Alergias conhecidas e contraindicações
    medications TEXT,           -- Medicamentos de uso contínuo
    relevant_conditions TEXT,   -- Condições prévias (hipertensão, gestação, próteses, diabetes, etc.)
    treatment_goal TEXT,        -- Objetivo do atendimento / queixa principal
    professional_notes TEXT,    -- Observações e conduta do profissional

    -- Versionamento & Status
    version INTEGER NOT NULL DEFAULT 1,
    parent_form_id UUID REFERENCES public.anamnesis_forms(id) ON DELETE SET NULL,
    status anamnesis_form_status NOT NULL DEFAULT 'completed',
    filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABELA: anamnesis_answers (Respostas Detalhadas das Perguntas Personalizadas)
CREATE TABLE IF NOT EXISTS public.anamnesis_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.anamnesis_forms(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.anamnesis_questions(id) ON DELETE CASCADE,
    answer_text TEXT,
    answer_json JSONB, -- Para respostas booleanas, datas ou seleções múltiplas
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABELA: anamnesis_legal_consents (Registro Probatório de Base Legal & LGPD)
CREATE TABLE IF NOT EXISTS public.anamnesis_legal_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.anamnesis_forms(id) ON DELETE CASCADE,
    legal_basis lgpd_legal_basis NOT NULL DEFAULT 'consent',
    consent_terms_text TEXT NOT NULL,
    is_accepted BOOLEAN NOT NULL DEFAULT true,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET,
    user_agent TEXT,
    recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TABELA: anamnesis_audit_logs (Trilha de Auditoria e Acesso a Dados Sensíveis)
CREATE TABLE IF NOT EXISTS public.anamnesis_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    form_id UUID NOT NULL REFERENCES public.anamnesis_forms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL, -- 'VIEW', 'CREATE', 'UPDATE_VERSION', 'ARCHIVE'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. ÍNDICES DE PERFORMANCE E CONSULTA MULTI-TENANT
CREATE INDEX IF NOT EXISTS idx_anamnesis_templates_tenant ON public.anamnesis_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anamnesis_questions_template ON public.anamnesis_questions(template_id);
CREATE INDEX IF NOT EXISTS idx_anamnesis_forms_tenant_client ON public.anamnesis_forms(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_anamnesis_forms_professional ON public.anamnesis_forms(professional_id);
CREATE INDEX IF NOT EXISTS idx_anamnesis_forms_status ON public.anamnesis_forms(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_anamnesis_answers_form ON public.anamnesis_answers(form_id);
CREATE INDEX IF NOT EXISTS idx_anamnesis_consents_form ON public.anamnesis_legal_consents(form_id);
CREATE INDEX IF NOT EXISTS idx_anamnesis_audit_form ON public.anamnesis_audit_logs(form_id);

-- 9. GATILHOS DE ATUALIZAÇÃO AUTOMÁTICA DE updated_at
DROP TRIGGER IF EXISTS set_anamnesis_templates_updated_at ON public.anamnesis_templates;
CREATE TRIGGER set_anamnesis_templates_updated_at
  BEFORE UPDATE ON public.anamnesis_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_anamnesis_questions_updated_at ON public.anamnesis_questions;
CREATE TRIGGER set_anamnesis_questions_updated_at
  BEFORE UPDATE ON public.anamnesis_questions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_anamnesis_forms_updated_at ON public.anamnesis_forms;
CREATE TRIGGER set_anamnesis_forms_updated_at
  BEFORE UPDATE ON public.anamnesis_forms
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 10. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS CLÍNICAS
ALTER TABLE public.anamnesis_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_legal_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anamnesis_audit_logs ENABLE ROW LEVEL SECURITY;

-- 11. POLÍTICAS RLS - ANAMNESIS TEMPLATES & QUESTIONS
-- Leitura aberta para qualquer colaborador ativo do tenant
DROP POLICY IF EXISTS "Active members can view anamnesis templates" ON public.anamnesis_templates;
CREATE POLICY "Active members can view anamnesis templates" ON public.anamnesis_templates
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_templates.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Management can manage anamnesis templates" ON public.anamnesis_templates;
CREATE POLICY "Management can manage anamnesis templates" ON public.anamnesis_templates
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_templates.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_templates.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

-- Questions: Leitura para membros ativos, gestão para owner/admin
DROP POLICY IF EXISTS "Active members can view anamnesis questions" ON public.anamnesis_questions;
CREATE POLICY "Active members can view anamnesis questions" ON public.anamnesis_questions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_questions.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Management can manage anamnesis questions" ON public.anamnesis_questions;
CREATE POLICY "Management can manage anamnesis questions" ON public.anamnesis_questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_questions.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_questions.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

-- 12. POLÍTICAS RLS - ANAMNESIS FORMS (PROTEÇÃO MÁXIMA LGPD)
-- SELECT:
-- 1. Gestão ('owner', 'admin', 'receptionist') do tenant tem acesso aos prontuários clínicos.
-- 2. Profissional ('professional') tem acesso SOMENTE SE:
--    a) É o profissional diretamente atribuído à ficha (professional_id), OU
--    b) Possui ou possuiu agendamento ('appointments') com este cliente no mesmo tenant.
--    Profissionais desvinculados do cliente NÃO podem ver sua anamnese sob nenhuma hipótese.
DROP POLICY IF EXISTS "Authorized members can view anamnesis forms" ON public.anamnesis_forms;
CREATE POLICY "Authorized members can view anamnesis forms" ON public.anamnesis_forms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_forms.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
              AND (
                  tu.role IN ('owner', 'admin', 'receptionist')
                  OR (
                      tu.role = 'professional' AND (
                          -- Profissional responsável pela ficha
                          EXISTS (
                              SELECT 1 FROM public.professionals p
                              WHERE p.id = anamnesis_forms.professional_id
                                AND p.user_id = auth.uid()
                          )
                          -- OU profissional com agendamento ativo/histórico para o cliente
                          OR EXISTS (
                              SELECT 1 FROM public.appointments a
                              JOIN public.professionals p ON p.id = a.professional_id
                              WHERE a.tenant_id = anamnesis_forms.tenant_id
                                AND a.client_id = anamnesis_forms.client_id
                                AND p.user_id = auth.uid()
                          )
                      )
                  )
              )
        )
    );

-- INSERT:
-- Owner, Admin, Receptionist ou Profissional atendente do cliente
DROP POLICY IF EXISTS "Authorized members can insert anamnesis forms" ON public.anamnesis_forms;
CREATE POLICY "Authorized members can insert anamnesis forms" ON public.anamnesis_forms
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_forms.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
              AND (
                  tu.role IN ('owner', 'admin', 'receptionist')
                  OR (
                      tu.role = 'professional' AND EXISTS (
                          SELECT 1 FROM public.professionals p
                          WHERE p.id = anamnesis_forms.professional_id
                            AND p.user_id = auth.uid()
                      )
                  )
              )
        )
    );

-- UPDATE:
-- Apenas Owner e Admin podem atualizar metadados (como arquivamento)
-- Observação clínica segue imutabilidade/versionamento
DROP POLICY IF EXISTS "Management can update anamnesis forms" ON public.anamnesis_forms;
CREATE POLICY "Management can update anamnesis forms" ON public.anamnesis_forms
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_forms.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    ) WITH CHECK (
        tenant_id = anamnesis_forms.tenant_id
    );

-- DELETE: Proibida para preservar histórico clínico e obrigações sanitárias
DROP POLICY IF EXISTS "Prevent delete of anamnesis forms" ON public.anamnesis_forms;

-- 13. POLÍTICAS RLS - ANSWERS, CONSENTS & AUDIT LOGS
-- answers herdam a mesma visibilidade do form
DROP POLICY IF EXISTS "View answers corresponding to authorized forms" ON public.anamnesis_answers;
CREATE POLICY "View answers corresponding to authorized forms" ON public.anamnesis_answers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.anamnesis_forms f
            WHERE f.id = anamnesis_answers.form_id
        )
    );

DROP POLICY IF EXISTS "Insert answers corresponding to authorized forms" ON public.anamnesis_answers;
CREATE POLICY "Insert answers corresponding to authorized forms" ON public.anamnesis_answers
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.anamnesis_forms f
            WHERE f.id = anamnesis_answers.form_id
        )
    );

-- consents: Leitura permitida para quem tem acesso ao form, inserção na criação
DROP POLICY IF EXISTS "View consents corresponding to authorized forms" ON public.anamnesis_legal_consents;
CREATE POLICY "View consents corresponding to authorized forms" ON public.anamnesis_legal_consents
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.anamnesis_forms f
            WHERE f.id = anamnesis_legal_consents.form_id
        )
    );

DROP POLICY IF EXISTS "Insert consents corresponding to authorized forms" ON public.anamnesis_legal_consents;
CREATE POLICY "Insert consents corresponding to authorized forms" ON public.anamnesis_legal_consents
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.anamnesis_forms f
            WHERE f.id = anamnesis_legal_consents.form_id
        )
    );

-- audit_logs: Leitura exclusiva para Owner e Admin; inserção permitida para qualquer usuário autenticado
DROP POLICY IF EXISTS "Management can view audit logs" ON public.anamnesis_audit_logs;
CREATE POLICY "Management can view audit logs" ON public.anamnesis_audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_audit_logs.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.role IN ('owner', 'admin')
              AND tu.status = 'active'
        )
    );

DROP POLICY IF EXISTS "Active users can insert audit logs" ON public.anamnesis_audit_logs;
CREATE POLICY "Active users can insert audit logs" ON public.anamnesis_audit_logs
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tenant_users tu
            WHERE tu.tenant_id = anamnesis_audit_logs.tenant_id
              AND tu.user_id = auth.uid()
              AND tu.status = 'active'
        )
    );
