'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { revalidatePath } from 'next/cache';
import {
  TenantWhatsAppConfig,
  WhatsAppOfficialTemplate,
} from '@/types/whatsapp';
import { processNotificationQueueWorker, ProcessQueueResult } from '@/lib/whatsapp/queueWorker';

export interface WhatsAppActionResponse<T = unknown> {
  error?: string;
  success?: boolean;
  data?: T;
}

/**
 * Obtém a configuração da conexão WhatsApp Business oficial do estabelecimento (com token mascarado).
 */
export async function getTenantWhatsAppConfigAction(
  tenantSlug: string
): Promise<WhatsAppActionResponse<TenantWhatsAppConfig>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tenant_whatsapp_configs')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (error) {
    if (error.message.includes('relation "public.tenant_whatsapp_configs" does not exist')) {
      return {
        success: true,
        data: {
          tenant_id: context.tenantId,
          waba_id: null,
          phone_number_id: null,
          business_phone_display: null,
          has_access_token: false,
          webhook_verify_token: null,
          connection_status: 'disconnected',
          last_health_check_at: null,
          last_error_message: null,
        },
      };
    }
    return { error: `Erro ao buscar configuração do WhatsApp: ${error.message}` };
  }

  const hasToken = Boolean(data?.access_token_secret && data.access_token_secret.length > 5);

  const cleanConfig: TenantWhatsAppConfig = {
    id: data?.id,
    tenant_id: context.tenantId,
    waba_id: data?.waba_id || null,
    phone_number_id: data?.phone_number_id || null,
    business_phone_display: data?.business_phone_display || null,
    has_access_token: hasToken,
    webhook_verify_token: data?.webhook_verify_token || null,
    connection_status: data?.connection_status || 'disconnected',
    dry_run_mode: data?.dry_run_mode ?? true,
    is_live_active: data?.is_live_active ?? false,
    live_activated_at: data?.live_activated_at || null,
    is_paused: data?.is_paused ?? false,
    paused_at: data?.paused_at || null,
    pause_reason: data?.pause_reason || null,
    last_health_check_at: data?.last_health_check_at || null,
    last_error_message: data?.last_error_message || null,
    created_at: data?.created_at,
    updated_at: data?.updated_at,
  };

  return {
    success: true,
    data: cleanConfig,
  };
}

export interface SaveWhatsAppConfigInput {
  wabaId: string;
  phoneNumberId: string;
  businessPhoneDisplay: string;
  accessTokenSecret?: string;
  webhookVerifyToken?: string;
}

/**
 * Salva ou atualiza as credenciais do WhatsApp Business Oficial (Meta Cloud API).
 */
export async function saveTenantWhatsAppConfigAction(
  tenantSlug: string,
  input: SaveWhatsAppConfigInput
): Promise<WhatsAppActionResponse<TenantWhatsAppConfig>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Apenas proprietários e administradores podem configurar o WhatsApp Business Oficial.' };
  }

  const supabase = await createClient();

  // Busca config anterior para não sobrescrever token com vazio
  const { data: existing } = await supabase
    .from('tenant_whatsapp_configs')
    .select('access_token_secret, webhook_verify_token')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  const tokenToSave = input.accessTokenSecret && input.accessTokenSecret.trim().length > 0
    ? input.accessTokenSecret.trim()
    : existing?.access_token_secret || null;

  const verifyTokenToSave = input.webhookVerifyToken && input.webhookVerifyToken.trim().length > 0
    ? input.webhookVerifyToken.trim()
    : existing?.webhook_verify_token || `zelunia_verify_${context.tenantId.slice(0, 8)}`;

  const isConfigured = Boolean(input.wabaId && input.phoneNumberId && tokenToSave);

  const payload = {
    tenant_id: context.tenantId,
    waba_id: input.wabaId.trim() || null,
    phone_number_id: input.phoneNumberId.trim() || null,
    business_phone_display: input.businessPhoneDisplay?.trim() || null,
    access_token_secret: tokenToSave,
    webhook_verify_token: verifyTokenToSave,
    connection_status: isConfigured ? 'pending_verification' : 'disconnected',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('tenant_whatsapp_configs')
    .upsert(payload, { onConflict: 'tenant_id' })
    .select('id, tenant_id, waba_id, phone_number_id, business_phone_display, webhook_verify_token, connection_status, last_health_check_at, last_error_message, created_at, updated_at')
    .single();

  if (error) {
    return { error: `Erro ao salvar credenciais do WhatsApp: ${error.message}` };
  }

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: {
      ...data,
      has_access_token: Boolean(tokenToSave),
    } as TenantWhatsAppConfig,
  };
}

/**
 * Valida a conexão com a Meta Cloud API verificando o Phone Number ID e o Token no backend.
 */
export async function testWhatsAppConnectionAction(
  tenantSlug: string
): Promise<WhatsAppActionResponse<{ valid: boolean; message: string; verifiedName?: string }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Permissão insuficiente.' };
  }

  const supabase = await createClient();

  const { data: config, error } = await supabase
    .from('tenant_whatsapp_configs')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (error || !config) {
    return { error: 'Credenciais do WhatsApp não configuradas no estabelecimento.' };
  }

  if (!config.phone_number_id || !config.access_token_secret) {
    return { error: 'Informe o Phone Number ID e o Token Permanente de Acesso antes de testar a conexão.' };
  }

  try {
    // Chamada oficial à Graph API da Meta (Phone Number Endpoint)
    const metaApiUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}`;
    const response = await fetch(metaApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.access_token_secret}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const resJson = await response.json();

    if (!response.ok || resJson.error) {
      const errMsg = resJson.error?.message || 'Falha ao autenticar com a Meta Graph API.';
      // Registra o erro na tabela sem expor tokens
      await supabase
        .from('tenant_whatsapp_configs')
        .update({
          connection_status: 'error',
          last_health_check_at: new Date().toISOString(),
          last_error_message: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('tenant_id', context.tenantId);

      revalidatePath(`/${tenantSlug}/configuracoes`);
      return { error: `Erro na Meta API: ${errMsg}` };
    }

    const verifiedName = resJson.verified_name || resJson.display_phone_number || 'Número Homologado Meta';

    // Atualiza status para conectado
    await supabase
      .from('tenant_whatsapp_configs')
      .update({
        connection_status: 'connected',
        business_phone_display: resJson.display_phone_number || config.business_phone_display,
        last_health_check_at: new Date().toISOString(),
        last_error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', context.tenantId);

    revalidatePath(`/${tenantSlug}/configuracoes`);

    return {
      success: true,
      data: {
        valid: true,
        message: 'Conexão validada com sucesso com a Meta Cloud API!',
        verifiedName,
      },
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Falha na comunicação de rede com o endpoint da Meta.';
    return { error: `Erro ao testar conexão: ${errorMsg}` };
  }
}

/**
 * Consulta a lista de templates oficiais aprovados pela Meta para o tenant.
 */
export async function getOfficialTemplatesAction(
  tenantSlug: string
): Promise<WhatsAppActionResponse<WhatsAppOfficialTemplate[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('whatsapp_official_templates')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('relation "public.whatsapp_official_templates" does not exist')) {
      return { success: true, data: [] };
    }
    return { error: `Erro ao buscar templates: ${error.message}` };
  }

  return {
    success: true,
    data: (data || []) as WhatsAppOfficialTemplate[],
  };
}

/**
 * Sincroniza / cadastra os templates homologados padrão do ZELUNIA (Lembrete 24h e 2h)
 */
export async function seedStandardTemplatesAction(
  tenantSlug: string
): Promise<WhatsAppActionResponse<{ count: number }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Permissão insuficiente.' };
  }

  const supabase = await createClient();

  const standardTemplates = [
    {
      tenant_id: context.tenantId,
      template_name: 'zelunia_lembrete_24h',
      language: 'pt_BR',
      category: 'UTILITY',
      status: 'APPROVED',
      header_text: 'Lembrete de Agendamento',
      body_text:
        'Olá {{1}}! Confirmamos seu horário de {{2}} com {{3}} amanhã ({{4}}) às {{5}} na {{6}}. Responda SIM para confirmar.',
      footer_text: 'ZELUNIA Gestão de Alta Performance',
    },
    {
      tenant_id: context.tenantId,
      template_name: 'zelunia_lembrete_2h',
      language: 'pt_BR',
      category: 'UTILITY',
      status: 'APPROVED',
      header_text: 'Seu atendimento é hoje',
      body_text:
        'Olá {{1}}! Lembramos que seu procedimento de {{2}} com {{3}} na {{4}} será hoje às {{5}}. Estamos aguardando você!',
      footer_text: 'ZELUNIA Gestão de Alta Performance',
    },
  ];

  const { data, error } = await supabase
    .from('whatsapp_official_templates')
    .upsert(standardTemplates, { onConflict: 'tenant_id,template_name,language' })
    .select();

  if (error) {
    return { error: `Erro ao carregar templates oficiais: ${error.message}` };
  }

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: { count: data?.length || 0 },
  };
}

/**
 * Aciona o processamento da fila de notificações do estabelecimento via Server Action segura.
 */
export async function triggerNotificationQueueProcessingAction(
  tenantSlug: string,
  forceDryRun?: boolean
): Promise<WhatsAppActionResponse<ProcessQueueResult>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Permissão insuficiente para processar a fila.' };
  }

  const result = await processNotificationQueueWorker(context.tenantId, {
    batchSize: 10,
    forceDryRun: forceDryRun ?? true, // Seguro por padrão
  });

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: result,
  };
}

/**
 * Obtém o checklist rigoroso de pré-ativação do WhatsApp Oficial.
 */
export async function getWhatsAppPreActivationChecklistAction(
  tenantSlug: string
): Promise<WhatsAppActionResponse<import('@/types/whatsapp').WhatsAppPreActivationChecklist>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  // Tenta invocar a RPC da migration 28
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'get_whatsapp_pre_activation_checklist',
    { p_tenant_id: context.tenantId }
  );

  if (!rpcErr && rpcData) {
    return {
      success: true,
      data: rpcData as import('@/types/whatsapp').WhatsAppPreActivationChecklist,
    };
  }

  // Fallback seguro caso a migration 28 ainda não tenha sido executada manualmente
  const [cfgRes, remindersRes, tplRes, clientsRes, queueRes] = await Promise.all([
    supabase.from('tenant_whatsapp_configs').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
    supabase.from('tenant_reminder_settings').select('*').eq('tenant_id', context.tenantId).maybeSingle(),
    supabase.from('whatsapp_official_templates').select('id, category, status').eq('tenant_id', context.tenantId),
    supabase.from('clients').select('id, opt_in_reminders').eq('tenant_id', context.tenantId),
    supabase.from('notification_queue').select('id, status, error_message, is_simulation, processing_started_at').eq('tenant_id', context.tenantId),
  ]);

  const cfg = cfgRes.data;
  const reminders = remindersRes.data;
  const templates = tplRes.data || [];
  const clients = clientsRes.data || [];
  const queue = queueRes.data || [];

  const approvedTemplates = templates.filter(
    (t) => t.category === 'UTILITY' && t.status === 'APPROVED'
  ).length;

  const processingMessagesCount = queue.filter((q) => q.status === 'processing').length;
  const stuckCount = queue.filter(
    (q) => q.status === 'processing' && q.processing_started_at && new Date(q.processing_started_at).getTime() < Date.now() - 5 * 60 * 1000
  ).length;
  const simulatedPendingCount = queue.filter(
    (q) => q.status === 'pending' && (q.is_simulation === true || q.error_message?.toLowerCase().includes('homologação'))
  ).length;
  const uncertainFailuresCount = queue.filter(
    (q) => q.status === 'failed' && (q.error_message?.toLowerCase().includes('incerto') || q.error_message?.toLowerCase().includes('timeout'))
  ).length;

  const optInClients = clients.filter((c) => c.opt_in_reminders === true).length;

  const metaConnected = cfg?.connection_status === 'connected';
  const hasPhone = Boolean(cfg?.phone_number_id && cfg.phone_number_id.length > 0);
  const hasWaba = Boolean(cfg?.waba_id && cfg.waba_id.length > 0);
  const hasToken = Boolean(cfg?.access_token_secret && cfg.access_token_secret.length > 5);
  const remindersEnabled = Boolean(reminders?.enabled);
  const utilityApproved = approvedTemplates >= 2;

  const canActivate =
    metaConnected &&
    hasPhone &&
    hasWaba &&
    hasToken &&
    remindersEnabled &&
    utilityApproved &&
    processingMessagesCount === 0 &&
    simulatedPendingCount === 0 &&
    uncertainFailuresCount === 0;

  return {
    success: true,
    data: {
      meta_connected: metaConnected,
      has_phone_number: hasPhone,
      has_waba_id: hasWaba,
      has_token: hasToken,
      reminders_enabled: remindersEnabled,
      utility_templates_approved: utilityApproved,
      approved_templates_count: approvedTemplates,
      processing_messages_count: processingMessagesCount,
      stuck_messages_count: stuckCount,
      simulated_pending_count: simulatedPendingCount,
      uncertain_failures_count: uncertainFailuresCount,
      opt_in_clients_count: optInClients,
      total_clients_count: clients.length,
      is_live_active: Boolean(cfg?.is_live_active),
      is_paused: Boolean(cfg?.is_paused),
      can_activate: canActivate,
    },
  };
}

/**
 * Ativa ou desativa a operação real (live) do WhatsApp Oficial (exclusivo owner/admin).
 */
export async function setWhatsAppLiveActivationAction(
  tenantSlug: string,
  enableLive: boolean,
  reason?: string
): Promise<WhatsAppActionResponse<{ is_live_active: boolean }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Permissão insuficiente. Apenas administradores podem ativar disparos reais.' };
  }

  const supabase = await createClient();

  const { error: rpcErr } = await supabase.rpc(
    'set_whatsapp_live_activation',
    {
      p_tenant_id: context.tenantId,
      p_enable_live: enableLive,
      p_reason: reason || null,
    }
  );

  if (rpcErr) {
    // Fallback caso a RPC não tenha sido executada
    const { error: updErr } = await supabase
      .from('tenant_whatsapp_configs')
      .update({
        is_live_active: enableLive,
        dry_run_mode: !enableLive,
        is_paused: false,
        live_activated_at: enableLive ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', context.tenantId);

    if (updErr) {
      return { error: `Erro ao alterar modo de ativação: ${updErr.message}` };
    }
  }

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: { is_live_active: enableLive },
  };
}

/**
 * Pausa ou retoma a operação da fila de mensagens (chave de emergência).
 */
export async function setWhatsAppOperationalPauseAction(
  tenantSlug: string,
  pause: boolean,
  reason?: string
): Promise<WhatsAppActionResponse<{ is_paused: boolean }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Permissão insuficiente para pausar/retomar a fila.' };
  }

  const supabase = await createClient();

  const { error: rpcErr } = await supabase.rpc(
    'set_whatsapp_operational_pause',
    {
      p_tenant_id: context.tenantId,
      p_pause: pause,
      p_reason: reason || null,
    }
  );

  if (rpcErr) {
    const { error: updErr } = await supabase
      .from('tenant_whatsapp_configs')
      .update({
        is_paused: pause,
        paused_at: pause ? new Date().toISOString() : null,
        pause_reason: pause ? (reason || 'Pausa manual.') : null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', context.tenantId);

    if (updErr) {
      return { error: `Erro ao pausar/retomar fila: ${updErr.message}` };
    }
  }

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: { is_paused: pause },
  };
}

/**
 * Obtém os logs de auditoria de ativação e controle operacional.
 */
export async function getWhatsAppActivationLogsAction(
  tenantSlug: string
): Promise<WhatsAppActionResponse<import('@/types/whatsapp').WhatsAppActivationLog[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tenant_whatsapp_activation_logs')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    if (error.message.includes('relation "public.tenant_whatsapp_activation_logs" does not exist')) {
      return { success: true, data: [] };
    }
    return { error: `Erro ao buscar logs de ativação: ${error.message}` };
  }

  return {
    success: true,
    data: (data || []) as import('@/types/whatsapp').WhatsAppActivationLog[],
  };
}

/**
 * Busca histórico de mensagens de entrada (inbound) da Central de Confirmações.
 */
export async function getWhatsAppInboundMessagesAction(
  tenantSlug: string,
  options?: {
    actionTaken?: string;
    limit?: number;
  }
): Promise<WhatsAppActionResponse<import('@/types/whatsapp').WhatsAppInboundMessage[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Permissão insuficiente para consultar a central de confirmações.' };
  }

  const supabase = await createClient();

  let query = supabase
    .from('whatsapp_inbound_messages')
    .select(`
      id,
      tenant_id,
      client_id,
      appointment_id,
      provider_message_id,
      context_message_id,
      sender_phone,
      message_type,
      message_text,
      button_payload,
      action_taken,
      raw_payload,
      created_at,
      client:client_id (
        id,
        full_name,
        phone,
        whatsapp
      ),
      appointment:appointment_id (
        id,
        start_time,
        end_time,
        status,
        service:service_id (name),
        professional:professional_id (full_name)
      )
    `)
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false })
    .limit(options?.limit || 50);

  if (options?.actionTaken && options.actionTaken !== 'ALL') {
    query = query.eq('action_taken', options.actionTaken);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes('relation "public.whatsapp_inbound_messages" does not exist')) {
      return { success: true, data: [] };
    }
    return { error: `Erro ao buscar mensagens recebidas: ${error.message}` };
  }

  type RawInbound = {
    id: string;
    tenant_id: string;
    client_id: string | null;
    appointment_id: string | null;
    provider_message_id: string;
    context_message_id: string | null;
    sender_phone: string;
    message_type: string;
    message_text: string | null;
    button_payload: string | null;
    action_taken: string;
    raw_payload: Record<string, unknown>;
    created_at: string;
    client?: { id: string; full_name: string; phone: string | null; whatsapp: string | null } | { id: string; full_name: string; phone: string | null; whatsapp: string | null }[];
    appointment?: {
      id: string;
      start_time: string;
      end_time: string;
      status: string;
      service?: { name: string } | { name: string }[];
      professional?: { full_name: string } | { full_name: string }[];
    } | {
      id: string;
      start_time: string;
      end_time: string;
      status: string;
      service?: { name: string } | { name: string }[];
      professional?: { full_name: string } | { full_name: string }[];
    }[];
  };

  const rawList = (data || []) as unknown as RawInbound[];

  const formatted: import('@/types/whatsapp').WhatsAppInboundMessage[] = rawList.map((item) => {
    const singleClient = Array.isArray(item.client) ? item.client[0] : item.client;
    const singleAppt = Array.isArray(item.appointment) ? item.appointment[0] : item.appointment;

    return {
      ...item,
      action_taken: item.action_taken as import('@/types/whatsapp').WhatsAppInboundAction,
      client: singleClient || null,
      appointment: singleAppt
        ? {
            id: singleAppt.id,
            start_time: singleAppt.start_time,
            end_time: singleAppt.end_time,
            status: singleAppt.status,
            service: Array.isArray(singleAppt.service) ? singleAppt.service[0] : singleAppt.service,
            professional: Array.isArray(singleAppt.professional)
              ? singleAppt.professional[0]
              : singleAppt.professional,
          }
        : null,
    };
  });

  return {
    success: true,
    data: formatted,
  };
}

/**
 * Vinculação manual de resposta a um agendamento pela recepção (com auditoria).
 */
export async function manualLinkInboundConfirmationAction(
  tenantSlug: string,
  params: {
    inboundMessageId: string;
    appointmentId: string;
  }
): Promise<WhatsAppActionResponse<{ appointmentId: string }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Permissão insuficiente. Apenas a recepção ou gestores podem vincular agendamentos.' };
  }

  const { inboundMessageId, appointmentId } = params;
  if (!inboundMessageId || !appointmentId) {
    return { error: 'Mensagem e agendamento são obrigatórios.' };
  }

  const supabase = await createClient();

  // 1. Verifica e bloqueia o agendamento
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('id, status, client_id, start_time')
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (apptErr || !appt) {
    return { error: 'Agendamento não localizado.' };
  }

  if (['canceled', 'completed'].includes(appt.status)) {
    return { error: 'Não é permitido confirmar agendamentos já cancelados ou finalizados.' };
  }

  // 2. Busca a mensagem de entrada
  const { data: inbound, error: inErr } = await supabase
    .from('whatsapp_inbound_messages')
    .select('*')
    .eq('id', inboundMessageId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (inErr || !inbound) {
    return { error: 'Mensagem de entrada não localizada.' };
  }

  // 3. Atualiza o agendamento para confirmado
  const nowIso = new Date().toISOString();
  const { error: updApptErr } = await supabase
    .from('appointments')
    .update({
      status: 'confirmed',
      confirmed_via_whatsapp: true,
      confirmed_at: nowIso,
      confirmation_source: 'reception_manual_link',
      confirmation_metadata: {
        inbound_message_id: inbound.id,
        provider_message_id: inbound.provider_message_id,
        linked_by: context.userId,
        linked_at: nowIso,
        original_text: inbound.message_text,
        sender_phone: inbound.sender_phone,
      },
      updated_at: nowIso,
    })
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId);

  if (updApptErr) {
    return { error: `Erro ao confirmar agendamento: ${updApptErr.message}` };
  }

  // 4. Atualiza o registro em whatsapp_inbound_messages
  await supabase
    .from('whatsapp_inbound_messages')
    .update({
      appointment_id: appointmentId,
      client_id: appt.client_id,
      action_taken: 'CONFIRMED',
    })
    .eq('id', inboundMessageId)
    .eq('tenant_id', context.tenantId);

  revalidatePath(`/${tenantSlug}/agenda`);

  return {
    success: true,
    data: { appointmentId },
  };
}
