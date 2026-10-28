'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { revalidatePath } from 'next/cache';
import { TenantReminderSettings, NotificationQueueItem } from '@/types/reminders';

export interface ReminderActionResponse<T = unknown> {
  error?: string;
  success?: boolean;
  data?: T;
}

/**
 * Obtém as configurações de lembretes e mensagens do estabelecimento.
 */
export async function getReminderSettingsAction(
  tenantSlug: string
): Promise<ReminderActionResponse<TenantReminderSettings>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tenant_reminder_settings')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (error) {
    return { error: `Erro ao buscar configurações de lembretes: ${error.message}` };
  }

  const defaultSettings: TenantReminderSettings = {
    tenant_id: context.tenantId,
    enabled: true,
    enable_24h_reminder: true,
    enable_2h_reminder: true,
    provider: 'meta_cloud_api',
    template_24h:
      'Olá, {cliente}! Confirmamos seu agendamento de {servico} com {profissional} amanhã, {data} às {horario}, na {estabelecimento}. Responda SIM para confirmar.',
    template_2h:
      'Olá, {cliente}! Lembramos que seu atendimento de {servico} com {profissional} na {estabelecimento} será hoje às {horario}. Estamos aguardando você!',
  };

  return {
    success: true,
    data: data ? (data as TenantReminderSettings) : defaultSettings,
  };
}

/**
 * Salva as configurações de lembretes e templates de mensagem do estabelecimento.
 */
export async function saveReminderSettingsAction(
  tenantSlug: string,
  settings: Partial<TenantReminderSettings>
): Promise<ReminderActionResponse<TenantReminderSettings>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Apenas proprietários e administradores podem alterar as configurações de lembretes.' };
  }

  const supabase = await createClient();

  const upsertPayload = {
    tenant_id: context.tenantId,
    enabled: settings.enabled ?? true,
    enable_24h_reminder: settings.enable_24h_reminder ?? true,
    enable_2h_reminder: settings.enable_2h_reminder ?? true,
    provider: settings.provider ?? 'meta_cloud_api',
    template_24h:
      settings.template_24h ||
      'Olá, {cliente}! Confirmamos seu agendamento de {servico} com {profissional} amanhã, {data} às {horario}, na {estabelecimento}. Responda SIM para confirmar.',
    template_2h:
      settings.template_2h ||
      'Olá, {cliente}! Lembramos que seu atendimento de {servico} com {profissional} na {estabelecimento} será hoje às {horario}. Estamos aguardando você!',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('tenant_reminder_settings')
    .upsert(upsertPayload, { onConflict: 'tenant_id' })
    .select()
    .single();

  if (error) {
    return { error: `Erro ao salvar configurações de lembrete: ${error.message}` };
  }

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: data as TenantReminderSettings,
  };
}

/**
 * Consulta o histórico da fila de notificações do estabelecimento.
 */
export async function getNotificationQueueAction(
  tenantSlug: string,
  filters?: {
    status?: string;
    limit?: number;
  }
): Promise<ReminderActionResponse<NotificationQueueItem[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      client:client_id ( id, full_name, phone ),
      appointment:appointment_id (
        id,
        start_time,
        status,
        service:service_id ( name ),
        professional:professional_id ( full_name )
      )
    `)
    .eq('tenant_id', context.tenantId)
    .order('scheduled_for', { ascending: false })
    .limit(filters?.limit || 50);

  if (filters?.status && filters.status !== 'ALL') {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    // Tratamento gracioso se a migration ainda não tiver sido executada no Supabase
    if (error.message.includes('relation "public.notification_queue" does not exist')) {
      return { success: true, data: [] };
    }
    return { error: `Erro ao consultar fila de notificações: ${error.message}` };
  }

  return {
    success: true,
    data: (data || []) as unknown as NotificationQueueItem[],
  };
}

/**
 * Enfileira lembretes automáticos para um agendamento específico via RPC atômica idempotente.
 */
export async function enqueueRemindersForAppointmentAction(
  tenantSlug: string,
  appointmentId: string
): Promise<ReminderActionResponse<{ enqueuedCount: number }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('enqueue_appointment_reminders', {
    p_tenant_id: context.tenantId,
    p_appointment_id: appointmentId,
  });

  if (error) {
    // Fallback silencioso se a RPC não existir ainda
    if (error.message.includes('function public.enqueue_appointment_reminders') || error.message.includes('does not exist')) {
      return { success: true, data: { enqueuedCount: 0 } };
    }
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/configuracoes`);

  return {
    success: true,
    data: { enqueuedCount: data?.enqueued_count || 0 },
  };
}
