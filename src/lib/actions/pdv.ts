'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { assertActiveSubscription } from '@/lib/plans/entitlements';
import { revalidatePath } from 'next/cache';
import { PaymentOrder } from '@/types/financial';
import { syncAppointmentCommissionAction } from '@/lib/actions/financial';

export interface PDVActionResponse<T = unknown> {
  success?: boolean;
  error?: string;
  data?: T;
}

export interface PDVAttendanceItem {
  id: string; // appointment_id
  tenant_id: string;
  client_id: string;
  service_id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  price: number;
  status: string;
  notes: string | null;
  client: {
    id: string;
    full_name: string;
    whatsapp?: string | null;
    phone?: string | null;
  };
  service: {
    id: string;
    name: string;
    price: number;
    duration_minutes: number;
  };
  professional: {
    id: string;
    full_name: string;
    specialty?: string | null;
  };
  paymentOrder: PaymentOrder | null;
  isDirectWalkIn?: boolean;
}

/**
 * Busca todos os atendimentos/agendamentos ativos do dia para o PDV:
 * - Agendamentos confirmados ou em atendimento que ainda estão em aberto / aguardando pagamento
 * - Atendimentos diretos (balcão) realizados hoje
 * - Ordens pendentes
 */
export async function getPDVAttendancesAction(
  tenantSlug: string,
  filterDate?: string
): Promise<PDVActionResponse<PDVAttendanceItem[]>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const subCheck = assertActiveSubscription(context);
  if (!subCheck.allowed) {
    return { error: subCheck.error };
  }

  const supabase = await createClient();

  const targetDate = filterDate || new Date().toISOString().slice(0, 10);
  const startOfDay = `${targetDate}T00:00:00.000Z`;
  const endOfDay = `${targetDate}T23:59:59.999Z`;

  try {
    // 1. Busca agendamentos do tenant que não foram cancelados
    const { data: appointments, error: apptErr } = await supabase
      .from('appointments')
      .select(`
        id,
        tenant_id,
        client_id,
        service_id,
        professional_id,
        start_time,
        end_time,
        price,
        status,
        notes,
        client:client_id (
          id,
          full_name,
          whatsapp,
          phone
        ),
        service:service_id (
          id,
          name,
          price,
          duration_minutes
        ),
        professional:professional_id (
          id,
          full_name,
          specialty
        )
      `)
      .eq('tenant_id', context.tenantId)
      .neq('status', 'canceled')
      .neq('status', 'no_show')
      .gte('start_time', startOfDay)
      .lte('start_time', endOfDay)
      .order('start_time', { ascending: false });

    if (apptErr) {
      return { error: `Erro ao buscar agendamentos do PDV: ${apptErr.message}` };
    }

    const apptIds = (appointments || []).map((a) => a.id);

    // 2. Busca ordens de pagamento vinculadas
    const ordersMap = new Map<string, PaymentOrder>();
    if (apptIds.length > 0) {
      const { data: orders } = await supabase
        .from('payment_orders')
        .select(`
          id,
          tenant_id,
          appointment_id,
          client_id,
          gross_amount,
          discount_amount,
          addition_amount,
          net_amount,
          paid_amount,
          balance_due,
          status,
          notes,
          created_at,
          transactions:payment_transactions (
            id,
            amount,
            method,
            status,
            paid_at
          )
        `)
        .eq('tenant_id', context.tenantId)
        .in('appointment_id', apptIds);

      (orders || []).forEach((ord) => {
        if (ord.appointment_id) {
          ordersMap.set(ord.appointment_id, ord as unknown as PaymentOrder);
        }
      });
    }

    // 3. Monta os itens do PDV
    const items: PDVAttendanceItem[] = (appointments || []).map((a) => {
      const ord = ordersMap.get(a.id) || null;
      return {
        id: a.id,
        tenant_id: a.tenant_id,
        client_id: a.client_id,
        service_id: a.service_id,
        professional_id: a.professional_id,
        start_time: a.start_time,
        end_time: a.end_time,
        price: Number(a.price) || 0,
        status: a.status,
        notes: a.notes,
        client: (a.client as unknown as PDVAttendanceItem['client']) || {
          id: a.client_id,
          full_name: 'Cliente não identificado',
        },
        service: (a.service as unknown as PDVAttendanceItem['service']) || {
          id: a.service_id,
          name: 'Serviço',
          price: Number(a.price) || 0,
          duration_minutes: 30,
        },
        professional: (a.professional as unknown as PDVAttendanceItem['professional']) || {
          id: a.professional_id,
          full_name: 'Profissional',
        },
        paymentOrder: ord,
        isDirectWalkIn: (a.notes || '').includes('[ATENDIMENTO DIRETO PDV]'),
      };
    });

    return { success: true, data: items };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao consultar PDV.';
    return { error: msg };
  }
}

/**
 * Cria um atendimento direto (balcão/walk-in) no PDV sem agendamento prévio na grade.
 * - Registra em appointments com horário atual
 * - Marca check-in imediato
 * - Gera a ordem de pagamento correspondente
 */
export async function createDirectPDVAttendanceAction(
  tenantSlug: string,
  data: {
    client_id: string;
    service_id: string;
    professional_id: string;
    notes?: string;
  }
): Promise<PDVActionResponse<{ appointmentId: string; orderId: string }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const subCheck = assertActiveSubscription(context);
  if (!subCheck.allowed) {
    return { error: subCheck.error };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente para criar atendimento no PDV.' };
  }

  const supabase = await createClient();

  // 1. Busca dados do serviço para valor e tempo
  const { data: service, error: srvErr } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes')
    .eq('id', data.service_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (srvErr || !service) {
    return { error: 'Serviço não encontrado.' };
  }

  const now = new Date();
  const startTime = now.toISOString();
  const durationMs = (service.duration_minutes || 30) * 60 * 1000;
  const endTime = new Date(now.getTime() + durationMs).toISOString();
  const servicePrice = Number(service.price) || 0;

  const notesText = data.notes?.trim()
    ? `[ATENDIMENTO DIRETO PDV] ${data.notes.trim()}`
    : '[ATENDIMENTO DIRETO PDV] Realizado no balcão';

  // 2. Insere agendamento concluído ou em atendimento direto
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .insert({
      tenant_id: context.tenantId,
      client_id: data.client_id,
      service_id: data.service_id,
      professional_id: data.professional_id,
      start_time: startTime,
      end_time: endTime,
      price: servicePrice,
      status: 'confirmed',
      notes: notesText,
      checked_in_at: startTime,
    })
    .select()
    .single();

  if (apptErr || !appt) {
    return { error: `Falha ao registrar atendimento direto: ${apptErr?.message || 'Erro desconhecido'}` };
  }

  // 3. Cria ordem de pagamento para o atendimento
  const { data: order, error: ordErr } = await supabase
    .from('payment_orders')
    .insert({
      tenant_id: context.tenantId,
      appointment_id: appt.id,
      client_id: data.client_id,
      gross_amount: servicePrice,
      discount_amount: 0,
      addition_amount: 0,
      net_amount: servicePrice,
      paid_amount: 0,
      balance_due: servicePrice,
      status: servicePrice === 0 ? 'paid' : 'pending',
    })
    .select()
    .single();

  if (ordErr || !order) {
    return { error: `Atendimento gerado, mas falha ao abrir ordem financeira: ${ordErr?.message}` };
  }

  // 4. Cria previsão de comissão para o profissional
  try {
    await syncAppointmentCommissionAction(tenantSlug, appt.id);
  } catch {
    // ignora falha de comissão para não travar venda
  }

  revalidatePath(`/${tenantSlug}/pdv`);
  revalidatePath(`/${tenantSlug}/agenda`);
  revalidatePath(`/${tenantSlug}/caixa`);

  return {
    success: true,
    data: {
      appointmentId: appt.id,
      orderId: order.id,
    },
  };
}

/**
 * Marca o atendimento como "Pagar depois" (mantém ordem pendente em aberto no PDV e Financeiro).
 * Conclui o status operacional do atendimento na agenda para liberar o horário do profissional.
 */
export async function deferPaymentOrderAction(
  tenantSlug: string,
  appointmentId: string,
  notes?: string
): Promise<PDVActionResponse<boolean>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente.' };
  }

  const supabase = await createClient();

  // 1. Atualiza appointment para completed
  await supabase
    .from('appointments')
    .update({
      status: 'completed',
      notes: notes ? `[PAGAR DEPOIS] ${notes}` : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId);

  // 2. Anota na payment_order que o pagamento foi postergado
  await supabase
    .from('payment_orders')
    .update({
      notes: notes ? `Aguardando acerto posterior: ${notes}` : 'Pagamento postergado (Pagar depois)',
      updated_at: new Date().toISOString(),
    })
    .eq('appointment_id', appointmentId)
    .eq('tenant_id', context.tenantId);

  revalidatePath(`/${tenantSlug}/pdv`);
  revalidatePath(`/${tenantSlug}/agenda`);
  revalidatePath(`/${tenantSlug}/caixa`);

  return { success: true, data: true };
}

/**
 * Cancela um atendimento no PDV sincronizando status no agendamento e ordem financeira
 */
export async function cancelPDVAttendanceAction(
  tenantSlug: string,
  appointmentId: string
): Promise<PDVActionResponse<boolean>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente.' };
  }

  const supabase = await createClient();

  // 1. Atualizar agendamento para cancelado
  const { error: apptErr } = await supabase
    .from('appointments')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId);

  if (apptErr) {
    return { error: 'Erro ao cancelar agendamento: ' + apptErr.message };
  }

  // 2. Se houver payment_order pendente, cancelar também
  await supabase
    .from('payment_orders')
    .update({
      status: 'canceled',
      updated_at: new Date().toISOString(),
    })
    .eq('appointment_id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .eq('status', 'pending');

  revalidatePath(`/${tenantSlug}/pdv`);
  revalidatePath(`/${tenantSlug}/agenda`);
  revalidatePath(`/${tenantSlug}/caixa`);

  return { success: true, data: true };
}

