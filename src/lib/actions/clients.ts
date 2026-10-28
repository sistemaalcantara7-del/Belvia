'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import {
  Client,
  ClientFormData,
  Client360History,
  ClientTimelineItem,
  ClientTimelineAppointmentItem,
  ClientTimelinePaymentItem,
  ClientTimelineAnamnesisItem,
} from '@/types/clients';
import { PaymentOrder } from '@/types/financial';
import { Appointment } from '@/types/appointments';
import { sanitizeDigits, isValidCPF } from '@/lib/utils/masks';
import { revalidatePath } from 'next/cache';

export interface ClientActionResponse {
  error?: string;
  success?: boolean;
  client?: Client;
}

/**
 * Salva ou atualiza um cliente com validação rigorosa de LGPD e regras de negócio.
 */
export async function saveClientAction(
  tenantSlug: string,
  formData: ClientFormData
): Promise<ClientActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  // Apenas owner, admin e receptionist podem criar ou editar clientes
  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Seu perfil de acesso não tem permissão para cadastrar ou editar clientes.' };
  }

  const fullName = formData.full_name?.trim();
  if (!fullName || fullName.length < 3) {
    return { error: 'O nome completo deve conter pelo menos 3 caracteres.' };
  }

  const rawWhatsapp = sanitizeDigits(formData.whatsapp);
  const rawPhone = sanitizeDigits(formData.phone);
  const rawCpf = sanitizeDigits(formData.cpf);
  const email = formData.email?.trim().toLowerCase() || null;
  const birthDate = formData.birth_date?.trim() || null;
  const notes = formData.notes?.trim() || null;
  const status = formData.status === 'inactive' ? 'inactive' : 'active';

  // Validação de telefone / WhatsApp
  if (rawWhatsapp && (rawWhatsapp.length < 10 || rawWhatsapp.length > 11)) {
    return { error: 'Número de WhatsApp inválido (deve conter DDD + número com 10 ou 11 dígitos).' };
  }

  if (rawPhone && (rawPhone.length < 10 || rawPhone.length > 11)) {
    return { error: 'Número de telefone alternativo inválido (deve conter DDD + número).' };
  }

  // Validação de CPF (se preenchido)
  if (rawCpf) {
    if (!isValidCPF(rawCpf)) {
      return { error: 'CPF inválido. Verifique os dígitos digitados.' };
    }
  }

  // Validação básica de formato de e-mail
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Formato de e-mail inválido.' };
  }

  const supabase = await createClient();

  // Verifica unicidade de CPF dentro do mesmo tenant
  if (rawCpf) {
    let duplicateQuery = supabase
      .from('clients')
      .select('id')
      .eq('tenant_id', context.tenantId)
      .eq('cpf', rawCpf);

    if (formData.id) {
      duplicateQuery = duplicateQuery.neq('id', formData.id);
    }

    const { data: duplicate } = await duplicateQuery.maybeSingle();
    if (duplicate) {
      return { error: 'Já existe um cliente cadastrado com este CPF neste estabelecimento.' };
    }
  }

  const clientPayload = {
    full_name: fullName,
    whatsapp: rawWhatsapp || null,
    phone: rawPhone || null,
    email: email,
    birth_date: birthDate,
    cpf: rawCpf || null,
    address: formData.address || {},
    notes: notes,
    status: status,
  };

  if (formData.id) {
    // Atualização
    const { data, error } = await supabase
      .from('clients')
      .update(clientPayload)
      .eq('id', formData.id)
      .eq('tenant_id', context.tenantId)
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/${tenantSlug}/clientes`);
    return { success: true, client: data as Client };
  } else {
    // Inserção
    const { data, error } = await supabase
      .from('clients')
      .insert({
        tenant_id: context.tenantId,
        ...clientPayload,
      })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/${tenantSlug}/clientes`);
    return { success: true, client: data as Client };
  }
}

/**
 * Alterna o status ativo/inativo do cliente.
 */
export async function toggleClientStatusAction(
  tenantSlug: string,
  clientId: string,
  currentStatus: 'active' | 'inactive'
): Promise<ClientActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Sem permissão para alterar o status do cliente.' };
  }

  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const supabase = await createClient();

  const { error } = await supabase
    .from('clients')
    .update({ status: nextStatus })
    .eq('id', clientId)
    .eq('tenant_id', context.tenantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/clientes`);
  return { success: true };
}

export interface Client360ActionResponse {
  error?: string;
  success?: boolean;
  data?: Client360History;
}

/**
 * FASE 4.2.1 | Agregador Central do Histórico 360º do Cliente
 * - Consolida atendimentos, procedimentos, presenças, pagamentos e metadados de anamnese.
 * - Anti-N+1: consultas em lote otimizadas com filtros estritos de tenant_id.
 * - Menor privilégio:
 *   - Recepção, Admin e Owner visualizam dados cadastrais e financeiros operacionais;
 *   - Acesso a dados clínicos restrito a badges e metadados na recepção (sem expor respostas);
 *   - Profissionais consultam apenas seus próprios atendimentos e comissões.
 * - Paginação determinística sobre a linha do tempo cronológica.
 */
export async function getClient360HistoryAction(
  tenantSlug: string,
  clientId: string,
  options?: {
    page?: number;
    pageSize?: number;
  }
): Promise<Client360ActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.max(5, Math.min(50, options?.pageSize || 15));

  const supabase = await createClient();

  // 1. Busca cadastral do cliente
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (clientErr || !client) {
    return { error: 'Cliente não localizado no estabelecimento.' };
  }

  // 2. Busca o vínculo de profissional se o usuário for 'professional'
  let enforcedProfId: string | null = null;
  if (context.role === 'professional') {
    const { data: myProf } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', context.userId)
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    if (!myProf) {
      return { error: 'Perfil profissional não vinculado.' };
    }
    enforcedProfId = myProf.id;
  }

  // 3. Busca em lote de todos os agendamentos do cliente no tenant
  let apptQuery = supabase
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
      checked_in_at,
      created_at,
      service:service_id (
        id,
        name
      ),
      professional:professional_id (
        id,
        full_name,
        specialty
      )
    `)
    .eq('client_id', clientId)
    .eq('tenant_id', context.tenantId)
    .order('start_time', { ascending: false });

  if (enforcedProfId) {
    apptQuery = apptQuery.eq('professional_id', enforcedProfId);
  }

  const { data: rawAppointments, error: apptErr } = await apptQuery;
  if (apptErr) {
    return { error: `Erro ao buscar agendamentos: ${apptErr.message}` };
  }

  const appointmentsList = rawAppointments || [];

  // 4. Busca em lote das Ordens Financeiras associadas aos agendamentos ou diretamente ao cliente
  // Apenas owner, admin e receptionist têm acesso ao financeiro completo do cliente
  const canAccessFinancial = ['owner', 'admin', 'receptionist'].includes(context.role);

  let ordersList: Array<{
    id: string;
    appointment_id: string | null;
    gross_amount: number;
    discount_amount: number;
    net_amount: number;
    paid_amount: number;
    balance_due: number;
    status: string;
    created_at: string;
  }> = [];

  let transactionsList: Array<{
    id: string;
    payment_order_id: string;
    amount: number;
    method: string;
    status: string;
    paid_at: string;
  }> = [];

  if (canAccessFinancial) {
    const { data: ordersData } = await supabase
      .from('payment_orders')
      .select('id, appointment_id, gross_amount, discount_amount, net_amount, paid_amount, balance_due, status, created_at')
      .eq('client_id', clientId)
      .eq('tenant_id', context.tenantId);

    ordersList = ordersData || [];
    const orderIds = ordersList.map((o) => o.id);

    if (orderIds.length > 0) {
      const { data: txsData } = await supabase
        .from('payment_transactions')
        .select('id, payment_order_id, amount, method, status, paid_at')
        .in('payment_order_id', orderIds)
        .eq('tenant_id', context.tenantId)
        .eq('status', 'confirmed');

      transactionsList = txsData || [];
    }
  }

  // Mapeia ordens por appointment_id para enriquecer os atendimentos
  const orderMapByAppt = new Map<string, typeof ordersList[0]>();
  ordersList.forEach((ord) => {
    if (ord.appointment_id) {
      orderMapByAppt.set(ord.appointment_id, ord);
    }
  });

  // Mapeia serviço por appointment_id para pagamentos
  const serviceNameMapByAppt = new Map<string, string>();
  appointmentsList.forEach((a) => {
    const srv = a.service as unknown as { name?: string };
    if (srv?.name) {
      serviceNameMapByAppt.set(a.id, srv.name);
    }
  });

  // Mapeia appointment_id por payment_order_id
  const apptIdMapByOrder = new Map<string, string | null>();
  ordersList.forEach((ord) => {
    apptIdMapByOrder.set(ord.id, ord.appointment_id);
  });

  // 5. Busca em lote dos Metadados Administrativos de Anamnese (Respeitando estritamente o sigilo clínico)
  // Recepção e profissionais consultam a VIEW auditada segura
  const viewName = context.role === 'receptionist' ? 'reception_anamnesis_status' : 'anamnesis_forms_summary';
  const { data: anamnesisSummaries } = await supabase
    .from(viewName)
    .select('id, version, status, filled_at, has_allergies_alert')
    .eq('client_id', clientId)
    .eq('tenant_id', context.tenantId)
    .order('filled_at', { ascending: false });

  const anamnesisList = anamnesisSummaries || [];

  // 6. Cálculo das Métricas Consolidadas (Assiduidade, LTV e Anamnese)
  let completedAppointments = 0;
  let canceledAppointments = 0;
  let noShowAppointments = 0;
  let sumCompletedPrice = 0;

  appointmentsList.forEach((a) => {
    if (a.status === 'completed') {
      completedAppointments++;
      sumCompletedPrice += Number(a.price) || 0;
    } else if (a.status === 'canceled') {
      canceledAppointments++;
    } else if (a.status === 'no_show') {
      noShowAppointments++;
    }
  });

  const totalEvaluated = completedAppointments + noShowAppointments;
  const attendanceRatePercentage = totalEvaluated > 0
    ? Number(((completedAppointments / totalEvaluated) * 100).toFixed(1))
    : 100;

  let totalSpentLTV = 0;
  let totalPendingBalance = 0;

  if (canAccessFinancial) {
    ordersList.forEach((o) => {
      totalSpentLTV += Number(o.paid_amount) || 0;
      if (o.status !== 'canceled') {
        totalPendingBalance += Number(o.balance_due) || 0;
      }
    });
  }

  const averageTicket = completedAppointments > 0
    ? Number((sumCompletedPrice / completedAppointments).toFixed(2))
    : 0;

  // Badge da anamnese mais recente
  let anamnesisBadgeStatus: 'up_to_date' | 'pending' | 'expired' | 'risk_alert' = 'pending';
  let anamnesisBadgeLabel = 'Sem Anamnese';
  let hasAllergiesAlert = false;
  let latestFilledAt: string | undefined = undefined;

  if (anamnesisList.length > 0) {
    const latest = anamnesisList[0];
    hasAllergiesAlert = Boolean(latest.has_allergies_alert);
    latestFilledAt = latest.filled_at;

    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const isExpired = latest.filled_at ? (Date.now() - new Date(latest.filled_at).getTime()) > oneYearMs : true;

    if (hasAllergiesAlert) {
      anamnesisBadgeStatus = 'risk_alert';
      anamnesisBadgeLabel = 'Alerta de Risco/Alergia';
    } else if (isExpired) {
      anamnesisBadgeStatus = 'expired';
      anamnesisBadgeLabel = 'Anamnese Expirada';
    } else if (latest.status === 'partial') {
      anamnesisBadgeStatus = 'pending';
      anamnesisBadgeLabel = 'Anamnese Parcial (IA)';
    } else {
      anamnesisBadgeStatus = 'up_to_date';
      anamnesisBadgeLabel = 'Anamnese em Dia';
    }
  }

  // 7. Montagem Unificada da Linha do Tempo Cronológica
  const timelineItems: ClientTimelineItem[] = [];

  // 7.1 Itens de Agendamento
  appointmentsList.forEach((a) => {
    const ord = orderMapByAppt.get(a.id);
    const srv = a.service as unknown as { name?: string };
    const prof = a.professional as unknown as { full_name?: string };

    const item: ClientTimelineAppointmentItem = {
      type: 'appointment',
      id: a.id,
      date: a.start_time,
      serviceName: srv?.name || 'Procedimento',
      professionalName: prof?.full_name || 'Profissional',
      price: Number(a.price) || 0,
      status: a.status,
      checkedInAt: a.checked_in_at,
      notes: a.notes,
      paymentStatus: (ord ? ord.status : 'none') as
        | 'pending'
        | 'partially_paid'
        | 'paid'
        | 'canceled'
        | 'none',
      paidAmount: ord ? Number(ord.paid_amount) : 0,
      balanceDue: ord ? Number(ord.balance_due) : Number(a.price),
    };
    timelineItems.push(item);
  });

  // 7.2 Itens de Transações Financeiras (Apenas para perfis administrativos com acesso financeiro)
  if (canAccessFinancial) {
    transactionsList.forEach((tx) => {
      const apptId = apptIdMapByOrder.get(tx.payment_order_id) || null;
      const srvName = apptId ? serviceNameMapByAppt.get(apptId) : undefined;

      const item: ClientTimelinePaymentItem = {
        type: 'payment',
        id: tx.id,
        date: tx.paid_at,
        orderId: tx.payment_order_id,
        appointmentId: apptId,
        serviceName: srvName,
        amount: Number(tx.amount) || 0,
        method: tx.method,
        status: tx.status,
      };
      timelineItems.push(item);
    });
  }

  // 7.3 Itens de Atualização de Anamnese
  anamnesisList.forEach((an) => {
    if (an.filled_at) {
      const item: ClientTimelineAnamnesisItem = {
        type: 'anamnesis_update',
        id: an.id,
        date: an.filled_at,
        version: an.version || 1,
        status: an.status,
        hasAllergiesAlert: Boolean(an.has_allergies_alert),
      };
      timelineItems.push(item);
    }
  });

  // 8. Ordenação Cronológica Estrita (do mais recente para o mais antigo)
  timelineItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // 9. Paginação Determinística
  const totalItems = timelineItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (page - 1) * pageSize;
  const paginatedTimeline = timelineItems.slice(startIndex, startIndex + pageSize);

  return {
    success: true,
    data: {
      client: client as Client,
      metrics: {
        totalAppointments: appointmentsList.length,
        completedAppointments,
        canceledAppointments,
        noShowAppointments,
        attendanceRatePercentage,
        totalSpentLTV: Number(totalSpentLTV.toFixed(2)),
        totalPendingBalance: Number(totalPendingBalance.toFixed(2)),
        averageTicket,
        anamnesisBadge: {
          status: anamnesisBadgeStatus,
          label: anamnesisBadgeLabel,
          hasAllergiesAlert,
          filledAt: latestFilledAt,
        },
      },
      timeline: paginatedTimeline,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
      },
    },
  };
}

/**
 * FASE 4.2.2 | Carrega dados de um comprovante não fiscal a partir do histórico 360º.
 * Garante tenant_id, RLS e permissões de acesso ao atendimento/ordem de pagamento.
 */
export async function getReceiptDataForAppointmentAction(
  tenantSlug: string,
  appointmentId: string
): Promise<{
  error?: string;
  data?: {
    order: PaymentOrder;
    appointment: Appointment;
  };
}> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  const supabase = await createClient();

  // 1. Busca agendamento com client, service e professional
  const { data: appt, error: apptErr } = await supabase
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
      checked_in_at,
      notes,
      client:clients (
        id,
        full_name,
        whatsapp,
        phone,
        email,
        cpf
      ),
      service:services (
        id,
        name,
        duration_minutes
      ),
      professional:professionals (
        id,
        full_name,
        specialty,
        user_id
      )
    `)
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (apptErr || !appt) {
    return { error: 'Agendamento não encontrado.' };
  }

  // Se for professional, só pode visualizar recibo do seu próprio atendimento
  if (context.role === 'professional') {
    const prof = Array.isArray(appt.professional) ? appt.professional[0] : appt.professional;
    if (!prof || prof.user_id !== context.userId) {
      return { error: 'Acesso negado ao comprovante deste atendimento.' };
    }
  }

  // 2. Busca a ordem de pagamento e transações
  const { data: order, error: ordErr } = await supabase
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
      updated_at
    `)
    .eq('appointment_id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (ordErr || !order) {
    return { error: 'Nenhuma ordem de pagamento vinculada a este atendimento.' };
  }

  const { data: transactions } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('payment_order_id', order.id)
    .eq('tenant_id', context.tenantId)
    .order('paid_at', { ascending: true });

  const completeOrder: PaymentOrder = {
    ...(order as unknown as PaymentOrder),
    transactions: (transactions || []) as PaymentOrder['transactions'],
  };

  return {
    data: {
      order: completeOrder,
      appointment: appt as unknown as Appointment,
    },
  };
}

