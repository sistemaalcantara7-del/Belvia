'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { Appointment, AppointmentFormData, AppointmentStatus } from '@/types/appointments';
import { localDateTimeToUtcIso } from '@/lib/utils/timezone';
import { revalidatePath } from 'next/cache';

export interface AppointmentActionResponse {
  error?: string;
  success?: boolean;
  appointment?: Appointment;
}

/**
 * Cria ou atualiza um agendamento com validação completa de disponibilidade,
 * horários de funcionamento, duração, intervalo e prevenção de sobreposição.
 */
export async function saveAppointmentAction(
  tenantSlug: string,
  formData: AppointmentFormData
): Promise<AppointmentActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  // Apenas owner, admin e receptionist podem criar agendamentos
  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Seu perfil de acesso não tem permissão para criar ou reagendar atendimentos.' };
  }

  const { client_id, service_id, professional_id, date, start_time, notes } = formData;
  if (!client_id || !service_id || !professional_id || !date || !start_time) {
    return { error: 'Todos os campos obrigatórios devem ser selecionados.' };
  }

  const supabase = await createClient();

  // 1. Obter informações do serviço (preço, duração e intervalo de higienização)
  const { data: service, error: srvErr } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes, break_minutes, status')
    .eq('id', service_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (srvErr || !service) {
    return { error: 'Serviço selecionado não encontrado ou indisponível.' };
  }

  if (service.status !== 'active') {
    return { error: 'O serviço selecionado está inativo no momento.' };
  }

  // 2. Obter informações do profissional
  const { data: professional, error: profErr } = await supabase
    .from('professionals')
    .select('id, full_name, status')
    .eq('id', professional_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (profErr || !professional) {
    return { error: 'Profissional selecionado não encontrado.' };
  }

  if (professional.status !== 'active') {
    return { error: 'O profissional selecionado está com agendamentos pausados.' };
  }

  // 3. Validar se o profissional está habilitado para este serviço
  const { data: link, error: linkErr } = await supabase
    .from('professional_services')
    .select('id')
    .eq('professional_id', professional_id)
    .eq('service_id', service_id)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (linkErr || !link) {
    return { error: 'Este profissional não está habilitado para realizar o serviço selecionado.' };
  }

  // 4. Calcular início e término em TIMESTAMPTZ (incluindo intervalo de preparação/higienização)
  const totalDurationMinutes = service.duration_minutes + (service.break_minutes || 0);

  const tenantTz = context.timezone || 'America/Sao_Paulo';
  const startIso = localDateTimeToUtcIso(date, start_time, tenantTz);
  const endDateObj = new Date(new Date(startIso).getTime() + totalDurationMinutes * 60 * 1000);
  const endIso = endDateObj.toISOString();

  // 5. Validar disponibilidade semanal habitual do profissional (dia da semana e expediente)
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay(); // 0 a 6
  const { data: schedule } = await supabase
    .from('professional_schedules')
    .select('start_time, end_time, break_start, break_end, is_active')
    .eq('professional_id', professional_id)
    .eq('day_of_week', dayOfWeek)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (schedule && !schedule.is_active) {
    return { error: 'O profissional não realiza atendimentos neste dia da semana.' };
  }

  if (schedule && schedule.is_active) {
    const apptStartHM = start_time;
    const apptEndHM = `${String(endDateObj.getHours()).padStart(2, '0')}:${String(endDateObj.getMinutes()).padStart(2, '0')}`;

    if (apptStartHM < schedule.start_time.slice(0, 5) || apptEndHM > schedule.end_time.slice(0, 5)) {
      return { error: `Horário fora do expediente do profissional (${schedule.start_time.slice(0, 5)} às ${schedule.end_time.slice(0, 5)}).` };
    }

    if (schedule.break_start && schedule.break_end) {
      const bStart = schedule.break_start.slice(0, 5);
      const bEnd = schedule.break_end.slice(0, 5);
      // Sobreposição com almoço: (StartA < EndB) and (EndA > StartB)
      if (apptStartHM < bEnd && apptEndHM > bStart) {
        return { error: `O horário coincide com o intervalo de descanso do profissional (${bStart} às ${bEnd}).` };
      }
    }
  }

  // 6. Validar bloqueios eventuais de agenda
  const { data: blocks } = await supabase
    .from('professional_time_blocks')
    .select('reason, start_time, end_time')
    .eq('professional_id', professional_id)
    .eq('tenant_id', context.tenantId)
    .lt('start_time', endIso)
    .gt('end_time', startIso);

  if (blocks && blocks.length > 0) {
    return { error: `Profissional indisponível neste horário: ${blocks[0].reason || 'Bloqueio de agenda'}.` };
  }

  // 7. Persistir Agendamento no Banco (O trigger do PostgreSQL fará a trava final com lock)
  const status = formData.status || 'scheduled';

  if (formData.id) {
    // Atualização
    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update({
        client_id,
        service_id,
        professional_id,
        start_time: startIso,
        end_time: endIso,
        price: service.price,
        status,
        notes: notes?.trim() || null,
      })
      .eq('id', formData.id)
      .eq('tenant_id', context.tenantId)
      .select()
      .single();

    if (updateErr) {
      return { error: updateErr.message };
    }

    revalidatePath(`/${tenantSlug}/agenda`);
    return { success: true, appointment: updated as Appointment };
  } else {
    // Inserção
    const { data: created, error: insertErr } = await supabase
      .from('appointments')
      .insert({
        tenant_id: context.tenantId,
        client_id,
        service_id,
        professional_id,
        start_time: startIso,
        end_time: endIso,
        price: service.price,
        status,
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (insertErr) {
      return { error: insertErr.message };
    }

    revalidatePath(`/${tenantSlug}/agenda`);
    return { success: true, appointment: created as Appointment };
  }
}

/**
 * Registra a chegada física do cliente (Check-in na recepção).
 * Permissão exclusiva de recepção, admin e owner.
 */
export async function checkInAppointmentAction(
  tenantSlug: string,
  appointmentId: string
): Promise<AppointmentActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const allowedRoles = ['owner', 'admin', 'receptionist'];
  if (!allowedRoles.includes(context.role)) {
    return { error: 'Apenas a recepção ou administração podem registrar a chegada do cliente.' };
  }

  const supabase = await createClient();

  // 1. Validar estado atual do agendamento
  const { data: currentAppt, error: findErr } = await supabase
    .from('appointments')
    .select('id, status, checked_in_at')
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (findErr || !currentAppt) {
    return { error: 'Agendamento não localizado.' };
  }

  if (currentAppt.checked_in_at) {
    return { error: 'O cliente já realizou check-in para este atendimento.' };
  }

  if (['canceled', 'no_show'].includes(currentAppt.status)) {
    return { error: 'Não é possível realizar check-in em um agendamento cancelado ou marcado como não compareceu.' };
  }

  if (['in_progress', 'completed'].includes(currentAppt.status)) {
    return { error: 'Não é possível realizar check-in em um atendimento já iniciado ou concluído.' };
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('appointments')
    .update({
      checked_in_at: nowIso,
      status: 'confirmed', // Ao fazer check-in presencial, confirma automaticamente caso estivesse 'scheduled'
    })
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/agenda`);
  return { success: true, appointment: updated as Appointment };
}

/**
 * Atualiza rapidamente o status de um agendamento.
 * Profissionais podem atualizar status de agendamentos atribuídos a eles.
 */
export async function updateAppointmentStatusAction(
  tenantSlug: string,
  appointmentId: string,
  newStatus: AppointmentStatus
): Promise<AppointmentActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  const supabase = await createClient();

  // Busca agendamento atual para validar regras de negócio
  const { data: currentAppt, error: findErr } = await supabase
    .from('appointments')
    .select('id, professional_id, status, checked_in_at')
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (findErr || !currentAppt) {
    return { error: 'Agendamento não localizado.' };
  }

  // Se for profissional, valida se o agendamento é atribuído a ele
  if (context.role === 'professional') {
    const { data: myProf } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', context.userId)
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    if (!myProf) {
      return { error: 'Vínculo profissional não localizado.' };
    }

    if (currentAppt.professional_id !== myProf.id) {
      return { error: 'Você só pode alterar status de atendimentos atribuídos a você.' };
    }
  }

  // REGRA DE NEGÓCIO: Iniciar atendimento ('in_progress') exige check-in presencial prévio
  if (newStatus === 'in_progress' && !currentAppt.checked_in_at) {
    return { error: 'Não é possível iniciar o atendimento sem a realização prévia do check-in presencial na recepção.' };
  }

  const { error } = await supabase
    .from('appointments')
    .update({ status: newStatus })
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/agenda`);
  return { success: true };
}
