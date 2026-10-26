'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { AnamnesisFormData, AnamnesisForm, AnamnesisTemplate } from '@/types/anamnesis';
import { revalidatePath } from 'next/cache';

export interface ActionResponse<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

// -----------------------------------------------------------------------------
// 1. OBTER OU INICIALIZAR MODELOS PADRÃO DE ANAMNESE
// -----------------------------------------------------------------------------
export async function getAnamnesisTemplates(tenantSlug: string): Promise<ActionResponse<AnamnesisTemplate[]>> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { error: 'Acesso não autorizado.' };
    }

    const supabase = await createClient();

    // Consulta os modelos existentes
    const { data: templates, error: errTemplates } = await supabase
      .from('anamnesis_templates')
      .select(`
        id,
        tenant_id,
        title,
        category,
        description,
        is_active,
        created_at,
        updated_at,
        questions:anamnesis_questions (
          id,
          tenant_id,
          template_id,
          question_text,
          question_type,
          options,
          is_required,
          order_index,
          created_at,
          updated_at
        )
      `)
      .eq('tenant_id', context.tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (errTemplates) {
      return { error: 'Falha ao carregar modelos de anamnese: ' + errTemplates.message };
    }

    // Se o tenant ainda não tiver templates cadastrados, cria os modelos clínicos de referência
    if (!templates || templates.length === 0) {
      const defaultTemplates = [
        {
          tenant_id: context.tenantId,
          title: 'Anamnese Estética Facial',
          category: 'Facial',
          description: 'Avaliação clínica dermatológica, hábitos e histórico de saúde para procedimentos faciais.',
          questions: [
            { question_text: 'Qual seu tipo de pele predominante?', question_type: 'single_choice', options: ['Normal', 'Seca', 'Oleosa', 'Mista'], is_required: true, order_index: 1 },
            { question_text: 'Costuma usar protetor solar diariamente?', question_type: 'boolean', options: [], is_required: true, order_index: 2 },
            { question_text: 'Possui histórico de herpes facial recorrente?', question_type: 'boolean', options: [], is_required: true, order_index: 3 },
            { question_text: 'Já realizou procedimentos estéticos faciais prévios (toxina, preenchimento, fios)? Quais?', question_type: 'text', options: [], is_required: false, order_index: 4 },
            { question_text: 'Data do último procedimento estético (se aplicável):', question_type: 'date', options: [], is_required: false, order_index: 5 }
          ]
        },
        {
          tenant_id: context.tenantId,
          title: 'Anamnese Corporal e Massoterapia',
          category: 'Corporal',
          description: 'Avaliação física, restrições ortopédicas e vasculares para terapias corporais.',
          questions: [
            { question_text: 'Possui problemas de circulação, varizes ou trombose prévia?', question_type: 'boolean', options: [], is_required: true, order_index: 1 },
            { question_text: 'É portador de marcapasso ou próteses metálicas?', question_type: 'boolean', options: [], is_required: true, order_index: 2 },
            { question_text: 'Queixa principal ou regiões de dor/tensão:', question_type: 'text', options: [], is_required: true, order_index: 3 },
            { question_text: 'Objetivos pretendidos:', question_type: 'multiple_choice', options: ['Relaxamento', 'Redução de Medidas', 'Drenagem Linfática', 'Alívio de Dores'], is_required: false, order_index: 4 }
          ]
        }
      ];

      for (const tpl of defaultTemplates) {
        const { data: newTpl } = await supabase
          .from('anamnesis_templates')
          .insert({
            tenant_id: tpl.tenant_id,
            title: tpl.title,
            category: tpl.category,
            description: tpl.description,
          })
          .select()
          .single();

        if (newTpl) {
          const qInserts = tpl.questions.map(q => ({
            tenant_id: context.tenantId,
            template_id: newTpl.id,
            question_text: q.question_text,
            question_type: q.question_type,
            options: q.options,
            is_required: q.is_required,
            order_index: q.order_index,
          }));
          await supabase.from('anamnesis_questions').insert(qInserts);
        }
      }

      // Recarrega após inicialização
      const { data: reloaded } = await supabase
        .from('anamnesis_templates')
        .select(`
          id, tenant_id, title, category, description, is_active, created_at, updated_at,
          questions:anamnesis_questions (
            id, tenant_id, template_id, question_text, question_type, options, is_required, order_index, created_at, updated_at
          )
        `)
        .eq('tenant_id', context.tenantId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      return { success: true, data: (reloaded || []) as unknown as AnamnesisTemplate[] };
    }

    return { success: true, data: templates as unknown as AnamnesisTemplate[] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return { error: 'Erro ao processar modelos: ' + msg };
  }
}

// -----------------------------------------------------------------------------
// 2. LISTAGEM DE FICHAS (COM SEGREGAÇÃO E AUDITORIA OBRIGATÓRIA)
// -----------------------------------------------------------------------------
export async function getAnamnesisForms(tenantSlug: string, searchClient?: string): Promise<ActionResponse<AnamnesisForm[]>> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { error: 'Acesso não autorizado.' };
    }

    const supabase = await createClient();

    // SE O USUÁRIO FOR RECEPCIONISTA:
    // Consulta a VIEW 'reception_anamnesis_status' (sem texto clínico sensível)
    if (context.role === 'receptionist') {
      let query = supabase
        .from('reception_anamnesis_status')
        .select(`
          form_id,
          tenant_id,
          client_id,
          template_title,
          template_category,
          version,
          status,
          filled_at,
          has_allergies_alert,
          created_at,
          updated_at,
          client:clients (
            id,
            full_name,
            whatsapp
          )
        `)
        .eq('tenant_id', context.tenantId)
        .order('filled_at', { ascending: false });

      if (searchClient && searchClient.trim() !== '') {
        query = query.ilike('client.full_name', `%${searchClient.trim()}%`);
      }

      const { data: statusRows, error: errStatus } = await query;
      if (errStatus) {
        return { error: 'Falha ao buscar status de triagem: ' + errStatus.message };
      }

      const mapped = (statusRows || []).map((r) => ({
        id: r.form_id,
        tenant_id: r.tenant_id,
        client_id: r.client_id,
        template_id: '',
        professional_id: null,
        appointment_id: null,
        health_history: null,
        allergies: null,
        medications: null,
        relevant_conditions: null,
        treatment_goal: null,
        professional_notes: null,
        version: r.version,
        parent_form_id: null,
        status: r.status,
        filled_at: r.filled_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
        has_allergies_alert: r.has_allergies_alert,
        client: Array.isArray(r.client) ? r.client[0] : r.client,
        template: {
          id: '',
          title: r.template_title,
          category: r.template_category,
        },
      }));

      return { success: true, data: mapped as unknown as AnamnesisForm[] };
    }

    // PARA OWNER, ADMIN OU PROFESSIONAL:
    // Consulta a VIEW 'anamnesis_forms_summary' (metadados estruturados sem expor texto clínico desauditado)
    let query = supabase
      .from('anamnesis_forms_summary')
      .select(`
        id,
        tenant_id,
        client_id,
        template_id,
        professional_id,
        appointment_id,
        version,
        parent_form_id,
        status,
        filled_at,
        has_allergies_alert,
        created_at,
        updated_at,
        client:clients (
          id,
          full_name,
          whatsapp,
          birth_date
        ),
        professional:professionals (
          id,
          full_name,
          specialty
        ),
        template:anamnesis_templates (
          id,
          title,
          category
        )
      `)
      .eq('tenant_id', context.tenantId)
      .order('filled_at', { ascending: false });

    if (searchClient && searchClient.trim() !== '') {
      query = query.ilike('client.full_name', `%${searchClient.trim()}%`);
    }

    const { data: forms, error } = await query;

    if (error) {
      return { error: 'Falha ao buscar fichas de anamnese: ' + error.message };
    }

    return { success: true, data: (forms || []) as unknown as AnamnesisForm[] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return { error: 'Erro ao listar anamneses: ' + msg };
  }
}

// -----------------------------------------------------------------------------
// 3. CONSULTA DETALHADA DE PRONTUÁRIO (VIA RPC SEGURA COM AUDITORIA OBRIGATÓRIA)
// -----------------------------------------------------------------------------
export async function getAnamnesisFormDetail(tenantSlug: string, formId: string): Promise<ActionResponse<AnamnesisForm>> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { error: 'Acesso não autorizado.' };
    }

    if (context.role === 'receptionist') {
      return { error: 'Acesso restrito: recepcionistas têm acesso exclusivo ao status administrativo de triagem.' };
    }

    const supabase = await createClient();

    // Chama a RPC com SECURITY DEFINER e registro atômico de auditoria no PostgreSQL
    const { data: secureDetail, error: rpcError } = await supabase.rpc('get_anamnesis_form_secure_detail', {
      p_form_id: formId,
    });

    if (rpcError) {
      return { error: rpcError.message };
    }

    return { success: true, data: secureDetail as AnamnesisForm };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return { error: 'Erro ao consultar detalhes da anamnese: ' + msg };
  }
}

// -----------------------------------------------------------------------------
// 4. CRIAR NOVA FICHA OU NOVA VERSÃO COM AUDITORIA E VERSIONAMENTO SEGURO
// -----------------------------------------------------------------------------
export async function saveAnamnesisFormAction(tenantSlug: string, payload: AnamnesisFormData): Promise<ActionResponse<AnamnesisForm>> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { error: 'Acesso não autorizado.' };
    }

    if (!payload.clientId || !payload.templateId) {
      return { error: 'Cliente e modelo de ficha são obrigatórios.' };
    }

    const supabase = await createClient();

    // 1. Inserir a ficha via RPC segura (garante retorno do ID gerado mesmo com SELECT revogado em anamnesis_forms)
    const { data: newForm, error: errRpcForm } = await supabase.rpc('create_anamnesis_form_secure', {
      p_client_id: payload.clientId,
      p_template_id: payload.templateId,
      p_professional_id: payload.professionalId || null,
      p_appointment_id: payload.appointmentId || null,
      p_health_history: payload.healthHistory?.trim() || null,
      p_allergies: payload.allergies?.trim() || null,
      p_medications: payload.medications?.trim() || null,
      p_relevant_conditions: payload.relevantConditions?.trim() || null,
      p_treatment_goal: payload.treatmentGoal?.trim() || null,
      p_professional_notes: payload.professionalNotes?.trim() || null,
      p_parent_form_id: payload.parentFormId || null,
    });

    if (errRpcForm || !newForm) {
      return { error: 'Erro ao gravar ficha clínica: ' + errRpcForm?.message };
    }

    const createdFormId = newForm.id;

    // 2. Inserir respostas das perguntas personalizadas
    if (payload.answers && payload.answers.length > 0) {
      const answersToInsert = payload.answers.map(ans => ({
        tenant_id: context.tenantId,
        form_id: createdFormId,
        question_id: ans.questionId,
        answer_text: ans.answerText || null,
        answer_json: ans.answerJson !== undefined ? ans.answerJson : null,
      }));

      const { error: errAnswers } = await supabase
        .from('anamnesis_answers')
        .insert(answersToInsert);

      if (errAnswers) {
        return { error: 'Erro ao registrar respostas da ficha: ' + errAnswers.message };
      }
    }

    // 3. Inserir termo de consentimento / base legal LGPD
    const terms = payload.consentTermsText?.trim() ||
      'Declaro que as informações de saúde prestadas são verdadeiras e completas. Autorizo o tratamento destes dados sensíveis exclusivamente para fins de avaliação clínica e execução segura dos procedimentos estéticos, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).';

    const { error: errConsent } = await supabase
      .from('anamnesis_legal_consents')
      .insert({
        tenant_id: context.tenantId,
        form_id: createdFormId,
        legal_basis: payload.legalBasis || 'consent',
        consent_terms_text: terms,
        is_accepted: payload.isAccepted !== false,
        accepted_at: new Date().toISOString(),
        recorded_by: context.userId,
      });

    if (errConsent) {
      return { error: 'Erro ao registrar base legal/consentimento: ' + errConsent.message };
    }

    revalidatePath(`/${tenantSlug}/anamnese`);
    return { success: true, data: newForm as unknown as AnamnesisForm };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return { error: 'Falha ao salvar anamnese: ' + msg };
  }
}
