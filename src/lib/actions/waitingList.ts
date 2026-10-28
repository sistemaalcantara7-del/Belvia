'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { revalidatePath } from 'next/cache';
import {
  WaitingListItem,
  WaitingListCandidate,
  CreateWaitingListInput,
} from '@/types/waitingList';

export interface WaitingListActionResponse<T = unknown> {
  error?: string;
  success?: boolean;
  data?: T;
}

/**
 * Cadastra uma nova solicitação na Lista de Espera Inteligente.
 */
export async function createWaitingListEntryAction(
  tenantSlug: string,
  input: CreateWaitingListInput
): Promise<WaitingListActionResponse<WaitingListItem>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Permissão insuficiente para incluir na lista de espera.' };
  }

  const { client_id, service_id, preferred_date_start, preferred_date_end } = input;
  if (!client_id || !service_id || !preferred_date_start || !preferred_date_end) {
    return { error: 'Cliente, serviço e datas de preferência são obrigatórios.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('waiting_list')
    .insert({
      tenant_id: context.tenantId,
      client_id,
      service_id,
      professional_id: input.professional_id || null,
      preferred_date_start,
      preferred_date_end,
      preferred_time_start: input.preferred_time_start || '08:00:00',
      preferred_time_end: input.preferred_time_end || '20:00:00',
      preferred_days_of_week: input.preferred_days_of_week || [1, 2, 3, 4, 5, 6],
      priority: input.priority || 'normal',
      status: 'waiting',
      notes: input.notes || null,
      created_by: context.userId,
    })
    .select(`
      *,
      client:client_id (id, full_name, phone, whatsapp),
      service:service_id (id, name, price, duration_minutes),
      professional:professional_id (id, full_name)
    `)
    .single();

  if (error) {
    return { error: `Erro ao adicionar à lista de espera: ${error.message}` };
  }

  revalidatePath(`/${tenantSlug}/agenda`);

  return {
    success: true,
    data: data as unknown as WaitingListItem,
  };
}

/**
 * Consulta a lista de espera do estabelecimento com filtros de status e prioridade.
 */
export async function getWaitingListEntriesAction(
  tenantSlug: string,
  options?: {
    status?: string;
  }
): Promise<WaitingListActionResponse<WaitingListItem[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist', 'professional'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  let query = supabase
    .from('waiting_list')
    .select(`
      *,
      client:client_id (id, full_name, phone, whatsapp),
      service:service_id (id, name, price, duration_minutes),
      professional:professional_id (id, full_name)
    `)
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'ALL') {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;

  if (error) {
    if (error.message.includes('relation "public.waiting_list" does not exist')) {
      return { success: true, data: [] };
    }
    return { error: `Erro ao buscar lista de espera: ${error.message}` };
  }

  return {
    success: true,
    data: (data || []) as unknown as WaitingListItem[],
  };
}

/**
 * Detecta candidatos da lista de espera compatíveis com uma vaga liberada (por cancelamento ou horário livre).
 */
export async function matchWaitingListCandidatesAction(
  tenantSlug: string,
  params: {
    serviceId: string;
    professionalId: string;
    startTime: string; // ISO
    endTime: string;   // ISO
  }
): Promise<WaitingListActionResponse<WaitingListCandidate[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('match_waiting_list_candidates', {
    p_tenant_id: context.tenantId,
    p_service_id: params.serviceId,
    p_professional_id: params.professionalId,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
  });

  if (error) {
    // Fallback gracioso caso a migration 30 ainda não tenha sido executada manualmente
    const { data: fallbackData } = await supabase
      .from('waiting_list')
      .select(`
        id,
        client_id,
        priority,
        notes,
        created_at,
        client:client_id (id, full_name, phone, whatsapp),
        service:service_id (name),
        professional:professional_id (full_name)
      `)
      .eq('tenant_id', context.tenantId)
      .eq('service_id', params.serviceId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    type RawWait = {
      id: string;
      client_id: string;
      priority: import('@/types/waitingList').WaitingListPriority;
      notes: string | null;
      created_at: string;
      client?: { full_name: string; phone: string; whatsapp: string | null };
      service?: { name: string };
      professional?: { full_name: string } | null;
    };

    const candidates: WaitingListCandidate[] = ((fallbackData || []) as unknown as RawWait[]).map((w) => ({
      waiting_id: w.id,
      client_id: w.client_id,
      client_name: w.client?.full_name || 'Cliente',
      client_phone: w.client?.phone || '',
      client_whatsapp: w.client?.whatsapp || null,
      service_name: w.service?.name || '',
      preferred_professional_name: w.professional?.full_name || null,
      priority: w.priority,
      notes: w.notes,
      created_at: w.created_at,
    }));

    return { success: true, data: candidates };
  }

  return {
    success: true,
    data: (data || []) as WaitingListCandidate[],
  };
}

/**
 * Converte atomicamente uma solicitação da lista de espera em agendamento confirmado.
 */
export async function convertWaitingListToAppointmentAction(
  tenantSlug: string,
  params: {
    waitingListId: string;
    professionalId: string;
    startTime: string; // ISO
    offerId?: string;
  }
): Promise<WaitingListActionResponse<{ appointmentId: string }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Permissão insuficiente para converter lista de espera em agendamento.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc('convert_waiting_list_to_appointment', {
    p_tenant_id: context.tenantId,
    p_waiting_list_id: params.waitingListId,
    p_professional_id: params.professionalId,
    p_start_time: params.startTime,
    p_offer_id: params.offerId || null,
  });

  if (error) {
    return { error: `Erro na conversão: ${error.message}` };
  }

  revalidatePath(`/${tenantSlug}/agenda`);

  return {
    success: true,
    data: { appointmentId: (data as { appointment_id: string })?.appointment_id },
  };
}

/**
 * Cancela ou altera o status de uma solicitação na lista de espera.
 */
export async function updateWaitingListStatusAction(
  tenantSlug: string,
  waitingListId: string,
  status: import('@/types/waitingList').WaitingListStatus
): Promise<WaitingListActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Permissão insuficiente.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('waiting_list')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', waitingListId)
    .eq('tenant_id', context.tenantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/agenda`);
  return { success: true };
}
