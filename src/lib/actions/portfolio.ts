'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { PortfolioItem } from '@/types/publicBooking';
import { revalidatePath } from 'next/cache';

/**
 * Altera a URL personalizada (slug) do estabelecimento com validação rigorosa
 */
export async function updateTenantSlugAction(
  currentSlug: string,
  newSlug: string
): Promise<{ success: boolean; newSlug?: string; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(currentSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return {
        success: false,
        error: 'Apenas proprietários e administradores podem alterar o endereço do estabelecimento.',
      };
    }

    const cleanSlug = newSlug.trim().toLowerCase();

    // Validações locais
    const RESERVED_WORDS = [
      'login',
      'register',
      'auth',
      'api',
      'agendar',
      'agenda',
      'dashboard',
      'admin',
      'superadmin',
      'configuracoes',
      'clientes',
      'profissionais',
      'servicos',
      'caixa',
      'comissoes',
      'relatorios',
      'anamnese',
      'zelunia',
      'belvia',
    ];

    if (RESERVED_WORDS.includes(cleanSlug)) {
      return {
        success: false,
        error: `O termo "${cleanSlug}" é reservado pelo sistema e não pode ser usado.`,
      };
    }

    if (cleanSlug.length < 3 || cleanSlug.length > 60) {
      return { success: false, error: 'O endereço deve conter entre 3 e 60 caracteres.' };
    }

    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(cleanSlug)) {
      return {
        success: false,
        error:
          'O endereço deve conter apenas letras minúsculas, números e hífens (sem espaços ou caracteres especiais).',
      };
    }

    const supabase = await createClient();

    // 1. Tenta via RPC da Migration 33
    const { data: rpcData, error: rpcErr } = await supabase.rpc('update_tenant_slug', {
      p_tenant_id: context.tenantId,
      p_new_slug: cleanSlug,
    });

    if (!rpcErr && rpcData) {
      if (!rpcData.success) {
        return { success: false, error: rpcData.error };
      }
      revalidatePath(`/${currentSlug}/configuracoes`);
      revalidatePath(`/${cleanSlug}/configuracoes`);
      revalidatePath(`/agendar/${cleanSlug}`);
      return { success: true, newSlug: cleanSlug };
    }

    // 2. Fallback direto seguro
    const { data: conflict } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', cleanSlug)
      .neq('id', context.tenantId)
      .maybeSingle();

    if (conflict) {
      return { success: false, error: 'Este endereço já está sendo utilizado por outro estabelecimento.' };
    }

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        slug: cleanSlug,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath(`/${currentSlug}/configuracoes`);
    revalidatePath(`/${cleanSlug}/configuracoes`);
    revalidatePath(`/agendar/${cleanSlug}`);

    return { success: true, newSlug: cleanSlug };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao atualizar endereço do estabelecimento.';
    return { success: false, error: msg };
  }
}

/**
 * Consulta itens de portfólio do estabelecimento
 */
export async function getTenantPortfolioAction(
  tenantSlug: string
): Promise<{ success: boolean; items?: PortfolioItem[]; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('tenant_portfolio')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      // Caso a tabela ainda não exista no Supabase remoto
      return { success: true, items: [] };
    }

    return { success: true, items: (data || []) as PortfolioItem[] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao carregar portfólio.';
    return { success: false, error: msg };
  }
}

/**
 * Adiciona ou edita item no portfólio da vitrine
 */
export async function savePortfolioItemAction(
  tenantSlug: string,
  item: {
    id?: string;
    title: string;
    description?: string;
    image_url: string;
    category?: string;
    sort_order?: number;
    is_active?: boolean;
  }
): Promise<{ success: boolean; item?: PortfolioItem; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return {
        success: false,
        error: 'Apenas proprietários e administradores podem gerenciar o portfólio.',
      };
    }

    const cleanTitle = item.title?.trim();
    const cleanUrl = item.image_url?.trim();

    if (!cleanTitle || cleanTitle.length < 2) {
      return { success: false, error: 'O título do trabalho deve ter pelo menos 2 caracteres.' };
    }

    if (!cleanUrl || !cleanUrl.startsWith('http')) {
      return { success: false, error: 'Por favor, informe uma URL de imagem válida (http/https).' };
    }

    const supabase = await createClient();

    if (item.id) {
      const { data, error } = await supabase
        .from('tenant_portfolio')
        .update({
          title: cleanTitle,
          description: item.description?.trim() || null,
          image_url: cleanUrl,
          category: item.category?.trim() || 'Geral',
          sort_order: Number(item.sort_order ?? 0),
          is_active: item.is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('tenant_id', context.tenantId)
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      revalidatePath(`/${tenantSlug}/configuracoes`);
      revalidatePath(`/agendar/${tenantSlug}`);
      return { success: true, item: data as PortfolioItem };
    } else {
      const { data, error } = await supabase
        .from('tenant_portfolio')
        .insert({
          tenant_id: context.tenantId,
          title: cleanTitle,
          description: item.description?.trim() || null,
          image_url: cleanUrl,
          category: item.category?.trim() || 'Geral',
          sort_order: Number(item.sort_order ?? 0),
          is_active: item.is_active ?? true,
        })
        .select()
        .single();

      if (error) return { success: false, error: error.message };
      revalidatePath(`/${tenantSlug}/configuracoes`);
      revalidatePath(`/agendar/${tenantSlug}`);
      return { success: true, item: data as PortfolioItem };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar item de portfólio.';
    return { success: false, error: msg };
  }
}

/**
 * Remove um item do portfólio
 */
export async function deletePortfolioItemAction(
  tenantSlug: string,
  itemId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return {
        success: false,
        error: 'Apenas proprietários e administradores podem excluir itens do portfólio.',
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('tenant_portfolio')
      .delete()
      .eq('id', itemId)
      .eq('tenant_id', context.tenantId);

    if (error) return { success: false, error: error.message };

    revalidatePath(`/${tenantSlug}/configuracoes`);
    revalidatePath(`/agendar/${tenantSlug}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao excluir item.';
    return { success: false, error: msg };
  }
}
