-- ==============================================================================
-- ZELUNIA SaaS - Migration Fase 6.5: Anamnese Conversacional com IA Integrada
-- Arquivo: supabase/migrations/20261028000035_conversational_ai_anamnesis.sql
--
-- STATUS: NÃO APLICADA REMOTAMENTE — Arquivo pronto para aplicação manual no Supabase
--
-- Destaques de Arquitetura, Governança & LGPD:
-- 1. Ampliação do ENUM anamnesis_form_status:
--    - Adição segura do valor 'partial' para refletir fichas iniciadas e em andamento.
-- 2. Tabela anamnesis_forms:
--    - Campo source VARCHAR(50) DEFAULT 'manual' ('manual', 'ai_virtual_receptionist', 'whatsapp').
--    - Campo ai_session_id UUID REFERENCES public.ai_chat_sessions(id) ON DELETE SET NULL.
-- 3. Atualização das VIEWs administrativas:
--    - 'anamnesis_forms_summary' e 'reception_anamnesis_status' passam a expor 'source' e status 'partial'.
-- 4. Função RPC segura com SECURITY DEFINER para coleta progressiva de anamnese pela IA:
--    - save_conversational_anamnesis_progress(...)
--    - Permite salvar consentimento LGPD, alergias, restrições e respostas progressivas.
--    - Vincula ao tenant_id, client_id, appointment_id e ai_chat_sessions.
--    - Registra auditoria automática na tabela anamnesis_audit_logs.
-- ==============================================================================

-- 1. ADICIONAR VALOR 'partial' AO ENUM anamnesis_form_status SE AINDA NÃO EXISTIR
DO $$
BEGIN
    ALTER TYPE public.anamnesis_form_status ADD VALUE IF NOT EXISTS 'partial';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. NOVAS COLUNAS NA TABELA anamnesis_forms
ALTER TABLE public.anamnesis_forms
    ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS ai_session_id UUID REFERENCES public.ai_chat_sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.anamnesis_forms.source IS 'Canal de preenchimento da anamnese (ex: manual, ai_virtual_receptionist, whatsapp).';
COMMENT ON COLUMN public.anamnesis_forms.ai_session_id IS 'Referência à sessão conversacional de chat da IA onde a anamnese foi iniciada.';

CREATE INDEX IF NOT EXISTS idx_anamnesis_forms_appointment
    ON public.anamnesis_forms(appointment_id)
    WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_anamnesis_forms_ai_session
    ON public.anamnesis_forms(ai_session_id)
    WHERE ai_session_id IS NOT NULL;

-- 3. ATUALIZAÇÃO DA VIEW: anamnesis_forms_summary (GESTÃO & PROFISSIONAIS)
DROP VIEW IF EXISTS public.anamnesis_forms_summary;
CREATE OR REPLACE VIEW public.anamnesis_forms_summary
WITH (security_invoker = false)
AS
SELECT 
    f.id,
    f.tenant_id,
    f.client_id,
    f.template_id,
    f.professional_id,
    f.appointment_id,
    f.version,
    f.parent_form_id,
    f.status,
    f.source,
    f.filled_at,
    (f.allergies IS NOT NULL AND TRIM(f.allergies) <> '') AS has_allergies_alert,
    f.created_at,
    f.updated_at
FROM public.anamnesis_forms f
WHERE EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = f.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
      AND (
          tu.role IN ('owner', 'admin', 'receptionist')
          OR (
              tu.role = 'professional' AND (
                  EXISTS (
                      SELECT 1 FROM public.professionals p
                      WHERE p.id = f.professional_id AND p.user_id = auth.uid()
                  )
                  OR EXISTS (
                      SELECT 1 FROM public.appointments a
                      JOIN public.professionals p ON p.id = a.professional_id
                      WHERE a.tenant_id = f.tenant_id
                        AND a.client_id = f.client_id
                        AND p.user_id = auth.uid()
                  )
              )
          )
      )
);

GRANT SELECT ON public.anamnesis_forms_summary TO authenticated, service_role;

-- 4. ATUALIZAÇÃO DA VIEW: reception_anamnesis_status (MENOR PRIVILÉGIO RECEPÇÃO)
DROP VIEW IF EXISTS public.reception_anamnesis_status;
CREATE OR REPLACE VIEW public.reception_anamnesis_status
WITH (security_invoker = false)
AS
SELECT 
    f.id AS form_id,
    f.tenant_id,
    f.client_id,
    t.title AS template_title,
    t.category AS template_category,
    f.version,
    f.status,
    f.source,
    f.filled_at,
    (f.allergies IS NOT NULL AND TRIM(f.allergies) <> '') AS has_allergies_alert,
    f.created_at,
    f.updated_at
FROM public.anamnesis_forms f
JOIN public.anamnesis_templates t ON t.id = f.template_id
WHERE EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = f.tenant_id
      AND tu.user_id = auth.uid()
      AND tu.status = 'active'
);

GRANT SELECT ON public.reception_anamnesis_status TO authenticated, service_role;

-- 5. RPC SEGURA PARA SALVAMENTO PROGRESSIVO DA ANAMNESE CONVERSACIONAL (IA / WEB PÚBLICA)
CREATE OR REPLACE FUNCTION public.save_conversational_anamnesis_progress(
    p_session_token VARCHAR,
    p_appointment_id UUID,
    p_template_id UUID,
    p_status VARCHAR,                  -- 'partial' ou 'completed'
    p_consent_accepted BOOLEAN,
    p_consent_terms TEXT,
    p_allergies TEXT DEFAULT NULL,
    p_health_history TEXT DEFAULT NULL,
    p_medications TEXT DEFAULT NULL,
    p_relevant_conditions TEXT DEFAULT NULL,
    p_treatment_goal TEXT DEFAULT NULL,
    p_answers JSONB DEFAULT '[]'::jsonb, -- Array de { question_id, answer_text, answer_json }
    p_client_ip VARCHAR DEFAULT 'unknown'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_session RECORD;
    v_appointment RECORD;
    v_template RECORD;
    v_existing_form RECORD;
    v_form_id UUID;
    v_ans_record JSONB;
    v_new_status anamnesis_form_status;
BEGIN
    -- 1. Validar e obter a sessão de IA ativa
    SELECT id, tenant_id, client_identifier
    INTO v_session
    FROM public.ai_chat_sessions
    WHERE session_token = p_session_token
      AND expires_at > now();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'SESSION_INVALID_OR_EXPIRED', 'message', 'Sessão de atendimento expirada ou inválida.');
    END IF;

    -- 2. Validar o agendamento correspondente (deve pertencer ao mesmo tenant)
    SELECT id, tenant_id, client_id, professional_id, service_id
    INTO v_appointment
    FROM public.appointments
    WHERE id = p_appointment_id
      AND tenant_id = v_session.tenant_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'APPOINTMENT_NOT_FOUND', 'message', 'Agendamento não localizado para este estabelecimento.');
    END IF;

    -- 3. Validar se o template pertence ao mesmo tenant e está ativo
    SELECT id, tenant_id, title
    INTO v_template
    FROM public.anamnesis_templates
    WHERE id = p_template_id
      AND tenant_id = v_session.tenant_id
      AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'TEMPLATE_NOT_FOUND', 'message', 'Questionário de anamnese não localizado ou inativo.');
    END IF;

    -- Determinar o status ENUM
    IF p_status = 'completed' THEN
        v_new_status := 'completed'::anamnesis_form_status;
    ELSE
        v_new_status := 'partial'::anamnesis_form_status;
    END IF;

    -- 4. Verificar se já existe ficha vinculada a este atendimento ou em rascunho/parcial para este cliente no template
    SELECT id, status INTO v_existing_form
    FROM public.anamnesis_forms
    WHERE tenant_id = v_session.tenant_id
      AND client_id = v_appointment.client_id
      AND (appointment_id = v_appointment.id OR (ai_session_id = v_session.id AND status = 'partial'))
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_form.id IS NOT NULL THEN
        -- Atualiza progressivamente a ficha existente
        v_form_id := v_existing_form.id;

        UPDATE public.anamnesis_forms
        SET 
            appointment_id = COALESCE(appointment_id, v_appointment.id),
            professional_id = COALESCE(professional_id, v_appointment.professional_id),
            allergies = COALESCE(NULLIF(TRIM(p_allergies), ''), allergies),
            health_history = COALESCE(NULLIF(TRIM(p_health_history), ''), health_history),
            medications = COALESCE(NULLIF(TRIM(p_medications), ''), medications),
            relevant_conditions = COALESCE(NULLIF(TRIM(p_relevant_conditions), ''), relevant_conditions),
            treatment_goal = COALESCE(NULLIF(TRIM(p_treatment_goal), ''), treatment_goal),
            status = v_new_status,
            source = 'ai_virtual_receptionist',
            filled_at = now(),
            updated_at = now()
        WHERE id = v_form_id;

    ELSE
        -- Cria nova ficha inicial de anamnese
        INSERT INTO public.anamnesis_forms (
            tenant_id,
            client_id,
            template_id,
            professional_id,
            appointment_id,
            ai_session_id,
            source,
            health_history,
            allergies,
            medications,
            relevant_conditions,
            treatment_goal,
            version,
            status,
            filled_at
        ) VALUES (
            v_session.tenant_id,
            v_appointment.client_id,
            v_template.id,
            v_appointment.professional_id,
            v_appointment.id,
            v_session.id,
            'ai_virtual_receptionist',
            NULLIF(TRIM(p_health_history), ''),
            NULLIF(TRIM(p_allergies), ''),
            NULLIF(TRIM(p_medications), ''),
            NULLIF(TRIM(p_relevant_conditions), ''),
            NULLIF(TRIM(p_treatment_goal), ''),
            1,
            v_new_status,
            now()
        )
        RETURNING id INTO v_form_id;

        -- Registra termo de consentimento LGPD inicial
        IF p_consent_accepted IS TRUE THEN
            INSERT INTO public.anamnesis_legal_consents (
                tenant_id,
                form_id,
                legal_basis,
                consent_terms_text,
                is_accepted,
                accepted_at,
                ip_address,
                user_agent
            ) VALUES (
                v_session.tenant_id,
                v_form_id,
                'consent',
                COALESCE(NULLIF(TRIM(p_consent_terms), ''), 'Consentimento livre e informado concedido pelo titular via atendimento conversacional interativo com a Recepcionista Virtual Zelunia, nos termos do Art. 11 da LGPD.'),
                true,
                now(),
                NULLIF(TRIM(p_client_ip), 'unknown')::inet,
                'Conversational AI Receptionist'
            );
        END IF;

    END IF;

    -- 5. Gravar ou atualizar respostas das perguntas recebidas
    IF p_answers IS NOT NULL AND jsonb_array_length(p_answers) > 0 THEN
        FOR v_ans_record IN SELECT * FROM jsonb_array_elements(p_answers)
        LOOP
            IF (v_ans_record->>'question_id') IS NOT NULL THEN
                -- Remove resposta anterior da mesma pergunta se houver para idempotência
                DELETE FROM public.anamnesis_answers
                WHERE form_id = v_form_id
                  AND question_id = (v_ans_record->>'question_id')::uuid;

                INSERT INTO public.anamnesis_answers (
                    tenant_id,
                    form_id,
                    question_id,
                    answer_text,
                    answer_json,
                    created_at
                ) VALUES (
                    v_session.tenant_id,
                    v_form_id,
                    (v_ans_record->>'question_id')::uuid,
                    v_ans_record->>'answer_text',
                    v_ans_record->'answer_json',
                    now()
                );
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'form_id', v_form_id,
        'status', v_new_status,
        'template_title', v_template.title
    );
END;
$$;

-- Permissões na RPC
REVOKE ALL ON FUNCTION public.save_conversational_anamnesis_progress(VARCHAR, UUID, UUID, VARCHAR, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_conversational_anamnesis_progress(VARCHAR, UUID, UUID, VARCHAR, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, VARCHAR) TO anon;
GRANT EXECUTE ON FUNCTION public.save_conversational_anamnesis_progress(VARCHAR, UUID, UUID, VARCHAR, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_conversational_anamnesis_progress(VARCHAR, UUID, UUID, VARCHAR, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, VARCHAR) TO service_role;
