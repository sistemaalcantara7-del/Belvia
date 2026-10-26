'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { ProfessionalTimeBlock, TimeBlockFormData } from '@/types/professionals';
import { localDateTimeToUtcIso } from '@/lib/utils/timezone';
import { revalidatePath } from 'next/cache';

export interface TimeBlockActionResponse {
  error?: string;
  success?: boolean;
  timeBlock?: ProfessionalTimeBlock;
}

/**
 * Cria ou atualiza um bloqueio pontual de agenda.
 * Validações no PostgreSQL (Migration 000017):
 * - RLS: owner, admin, receptionist criam para qualquer profissional; profissional apenas para si mesmo.
 * - Trigger check_time_block_appointment_conflict: bloqueia criação sobre agendamentos ativos.
 * - Trigger check_time_block_immutability: bloqueia troca de tenant_id ou professional_id.
 */
export async function saveTimeBlockAction(
  tenantSlug: string,
  formData: TimeBlockFormData
): Promise<TimeBlockActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  const { professional_id, date, start_time, end_time, reason, id } = formData;
  if (!professional_id || !date || !start_time || !end_time) {
    return { error: 'Profissional, data, horário de início e término são obrigatórios.' };
  }

  if (start_time >= end_time) {
    return { error: 'O horário de início do bloqueio deve ser anterior ao horário de término.' };
  }

  const supabase = await createClient();

  // Se o usuário for professional, valida se ele está tentando criar para si mesmo
  if (context.role === 'professional') {
    const { data: ownProf } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', context.userId)
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    if (!ownProf || ownProf.id !== professional_id) {
      return { error: 'Profissionais só podem gerenciar bloqueios no seu próprio horário.' };
    }
  }

  const tenantTz = context.timezone || 'America/Sao_Paulo';
  const startIso = localDateTimeToUtcIso(date, start_time, tenantTz);
  const endIso = localDateTimeToUtcIso(date, end_time, tenantTz);

  if (id) {
    // Atualização de bloqueio existente
    const { data: updated, error: updateErr } = await supabase
      .from('professional_time_blocks')
      .update({
        start_time: startIso,
        end_time: endIso,
        reason: reason?.trim() || null,
      })
      .eq('id', id)
      .eq('tenant_id', context.tenantId)
      .select(`
        id,
        tenant_id,
        professional_id,
        start_time,
        end_time,
        reason,
        created_at,
        professional:professional_id (
          id,
          full_name,
          specialty
        )
      `)
      .single();

    if (updateErr) {
      return { error: updateErr.message };
    }

    revalidatePath(`/${tenantSlug}/agenda`);
    return { success: true, timeBlock: updated as unknown as ProfessionalTimeBlock };
  } else {
    // Inserção de novo bloqueio
    const { data: created, error: insertErr } = await supabase
      .from('professional_time_blocks')
      .insert({
        tenant_id: context.tenantId,
        professional_id,
        start_time: startIso,
        end_time: endIso,
        reason: reason?.trim() || null,
      })
      .select(`
        id,
        tenant_id,
        professional_id,
        start_time,
        end_time,
        reason,
        created_at,
        professional:professional_id (
          id,
          full_name,
          specialty
        )
      `)
      .single();

    if (insertErr) {
      return { error: insertErr.message };
    }

    revalidatePath(`/${tenantSlug}/agenda`);
    return { success: true, timeBlock: created as unknown as ProfessionalTimeBlock };
  }
}

/**
 * Exclui um bloqueio de agenda.
 * RLS garante que profissional só exclui os próprios; recepção/admin/owner excluem da clínica.
 */
export async function deleteTimeBlockAction(
  tenantSlug: string,
  blockId: string
): Promise<TimeBlockActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('professional_time_blocks')
    .delete()
    .eq('id', blockId)
    .eq('tenant_id', context.tenantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/agenda`);
  return { success: true };
}
