'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { getPlanLimits } from '@/lib/plans/entitlements';
import { Professional, ProfessionalFormData } from '@/types/professionals';
import { sanitizeDigits } from '@/lib/utils/masks';
import { revalidatePath } from 'next/cache';

export interface ProfessionalActionResponse {
  error?: string;
  success?: boolean;
  professional?: Professional;
}

/**
 * Salva ou atualiza um profissional, seus serviços habilitados e grade de horários,
 * validando limites do plano (Essencial vs Inteligente) no servidor.
 */
export async function saveProfessionalAction(
  tenantSlug: string,
  formData: ProfessionalFormData
): Promise<ProfessionalActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  // Apenas owner ou admin podem cadastrar ou editar profissionais
  if (context.role !== 'owner' && context.role !== 'admin') {
    return { error: 'Somente proprietários e administradores podem gerenciar profissionais.' };
  }

  const fullName = formData.full_name?.trim();
  if (!fullName || fullName.length < 3) {
    return { error: 'O nome do profissional deve ter no mínimo 3 caracteres.' };
  }

  const rawWhatsapp = sanitizeDigits(formData.whatsapp);
  const email = formData.email?.trim().toLowerCase() || null;
  const specialty = formData.specialty?.trim() || 'Geral';
  const bio = formData.bio?.trim() || null;
  const status = formData.status === 'inactive' ? 'inactive' : 'active';

  if (rawWhatsapp && (rawWhatsapp.length < 10 || rawWhatsapp.length > 11)) {
    return { error: 'WhatsApp inválido (deve conter DDD + número com 10 ou 11 dígitos).' };
  }

  const supabase = await createClient();

  // 1. Verificação de Limites do Plano (Essencial = 1 profissional ativo, Inteligente = até 10)
  if (!formData.id && status === 'active') {
    const limits = getPlanLimits(context.plan);
    const { count, error: countErr } = await supabase
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .eq('status', 'active');

    if (!countErr && typeof count === 'number' && count >= limits.maxProfessionals) {
      return {
        error: `O limite do seu plano (${context.plan === 'essential' ? 'Essencial: 1 profissional' : `Inteligente: ${limits.maxProfessionals} profissionais`}) foi atingido. Faça upgrade para adicionar mais profissionais.`,
      };
    }
  }

  // 2. Validação da grade de horários
  for (const s of formData.schedules || []) {
    if (s.is_active) {
      if (!s.start_time || !s.end_time || s.start_time >= s.end_time) {
        return { error: `Horário de atendimento inconsistente no dia ${s.day_of_week}. O início deve ser menor que o término.` };
      }
      if (s.break_start || s.break_end) {
        if (!s.break_start || !s.break_end || s.break_start >= s.break_end) {
          return { error: `Intervalo inconsistente no dia ${s.day_of_week}.` };
        }
        if (s.break_start < s.start_time || s.break_end > s.end_time) {
          return { error: `O intervalo deve estar dentro do expediente de trabalho no dia ${s.day_of_week}.` };
        }
      }
    }
  }

  let profId = formData.id;

  if (profId) {
    // Atualização
    const { error: updateErr } = await supabase
      .from('professionals')
      .update({
        full_name: fullName,
        whatsapp: rawWhatsapp || null,
        email: email,
        specialty: specialty,
        bio: bio,
        status: status,
      })
      .eq('id', profId)
      .eq('tenant_id', context.tenantId);

    if (updateErr) {
      return { error: updateErr.message };
    }
  } else {
    // Inserção
    const { data: newProf, error: insertErr } = await supabase
      .from('professionals')
      .insert({
        tenant_id: context.tenantId,
        full_name: fullName,
        whatsapp: rawWhatsapp || null,
        email: email,
        specialty: specialty,
        bio: bio,
        status: status,
      })
      .select('id')
      .single();

    if (insertErr || !newProf) {
      return { error: insertErr?.message || 'Falha ao cadastrar profissional.' };
    }
    profId = newProf.id;
  }

  // 3. Atualizar Serviços Habilitados (apenas serviços do mesmo tenant)
  // Remove associações anteriores
  await supabase
    .from('professional_services')
    .delete()
    .eq('professional_id', profId)
    .eq('tenant_id', context.tenantId);

  if (formData.service_ids && formData.service_ids.length > 0) {
    const serviceRows = formData.service_ids.map((serviceId) => ({
      tenant_id: context.tenantId,
      professional_id: profId as string,
      service_id: serviceId,
    }));

    const { error: srvErr } = await supabase
      .from('professional_services')
      .insert(serviceRows);

    if (srvErr) {
      return { error: `Profissional salvo, mas ocorreu erro ao vincular serviços: ${srvErr.message}` };
    }
  }

  // 4. Atualizar Grade de Horários
  await supabase
    .from('professional_schedules')
    .delete()
    .eq('professional_id', profId)
    .eq('tenant_id', context.tenantId);

  if (formData.schedules && formData.schedules.length > 0) {
    const scheduleRows = formData.schedules.map((s) => ({
      tenant_id: context.tenantId,
      professional_id: profId as string,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      break_start: s.break_start || null,
      break_end: s.break_end || null,
      is_active: s.is_active,
    }));

    const { error: schedErr } = await supabase
      .from('professional_schedules')
      .insert(scheduleRows);

    if (schedErr) {
      return { error: `Profissional salvo, mas ocorreu erro ao configurar horários: ${schedErr.message}` };
    }
  }

  revalidatePath(`/${tenantSlug}/profissionais`);
  return {
    success: true,
    professional: {
      id: profId as string,
      tenant_id: context.tenantId,
      user_id: null,
      full_name: fullName,
      whatsapp: rawWhatsapp || null,
      email: email,
      specialty: specialty,
      bio: bio,
      avatar_url: null,
      status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      service_ids: formData.service_ids || [],
      schedules: formData.schedules || [],
    },
  };
}

/**
 * Ativa ou desativa rapidamente um profissional.
 */
export async function toggleProfessionalStatusAction(
  tenantSlug: string,
  professionalId: string,
  currentStatus: 'active' | 'inactive'
): Promise<ProfessionalActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (context.role !== 'owner' && context.role !== 'admin') {
    return { error: 'Sem permissão para alterar o status do profissional.' };
  }

  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const supabase = await createClient();

  // Se estiver ativando, checa limite do plano
  if (nextStatus === 'active') {
    const limits = getPlanLimits(context.plan);
    const { count } = await supabase
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', context.tenantId)
      .eq('status', 'active');

    if (typeof count === 'number' && count >= limits.maxProfessionals) {
      return {
        error: `Não é possível ativar. Limite do plano atingido (${limits.maxProfessionals} profissionais ativos).`,
      };
    }
  }

  const { error } = await supabase
    .from('professionals')
    .update({ status: nextStatus })
    .eq('id', professionalId)
    .eq('tenant_id', context.tenantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/profissionais`);
  return { success: true };
}
