'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { Service, ServiceFormData } from '@/types/services';
import { revalidatePath } from 'next/cache';

export interface ServiceActionResponse {
  error?: string;
  success?: boolean;
  service?: Service;
}

/**
 * Salva ou atualiza um serviço com validação estrita no servidor.
 */
export async function saveServiceAction(
  tenantSlug: string,
  formData: ServiceFormData
): Promise<ServiceActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  // Validação de papel (apenas owner ou admin podem gerenciar serviços)
  if (context.role !== 'owner' && context.role !== 'admin') {
    return { error: 'Você não tem permissão para gerenciar serviços.' };
  }

  // Validação dos dados
  const name = formData.name?.trim();
  const description = formData.description?.trim() || null;
  const category = formData.category?.trim() || 'Geral';
  const duration_minutes = Number(formData.duration_minutes);
  const break_minutes = Number(formData.break_minutes || 0);
  const price = Number(formData.price || 0);
  const status = formData.status === 'inactive' ? 'inactive' : 'active';

  if (!name || name.length < 2) {
    return { error: 'O nome do serviço deve conter pelo menos 2 caracteres.' };
  }

  if (isNaN(duration_minutes) || duration_minutes <= 0) {
    return { error: 'A duração deve ser maior que 0 minutos.' };
  }

  if (isNaN(break_minutes) || break_minutes < 0) {
    return { error: 'O intervalo não pode ser negativo.' };
  }

  if (isNaN(price) || price < 0) {
    return { error: 'O preço não pode ser negativo.' };
  }

  const supabase = await createClient();

  if (formData.id) {
    // Atualização de serviço existente
    const { data, error } = await supabase
      .from('services')
      .update({
        name,
        description,
        category,
        duration_minutes,
        break_minutes,
        price,
        status,
      })
      .eq('id', formData.id)
      .eq('tenant_id', context.tenantId)
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/${tenantSlug}/servicos`);
    return { success: true, service: data as Service };
  } else {
    // Criação de novo serviço
    const { data, error } = await supabase
      .from('services')
      .insert({
        tenant_id: context.tenantId,
        name,
        description,
        category,
        duration_minutes,
        break_minutes,
        price,
        status,
      })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    revalidatePath(`/${tenantSlug}/servicos`);
    return { success: true, service: data as Service };
  }
}

/**
 * Altera rapidamente o status (ativo/inativo) de um serviço.
 */
export async function toggleServiceStatusAction(
  tenantSlug: string,
  serviceId: string,
  currentStatus: 'active' | 'inactive'
): Promise<ServiceActionResponse> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (context.role !== 'owner' && context.role !== 'admin') {
    return { error: 'Sem permissão para alterar o status do serviço.' };
  }

  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
  const supabase = await createClient();

  const { error } = await supabase
    .from('services')
    .update({ status: nextStatus })
    .eq('id', serviceId)
    .eq('tenant_id', context.tenantId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/servicos`);
  return { success: true };
}
