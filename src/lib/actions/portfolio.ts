'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { PortfolioItem } from '@/types/publicBooking';
import { revalidatePath } from 'next/cache';

/**
 * Altera a URL personalizada (slug) do estabelecimento com validação rigorosa,
 * concorrência segura e preservação de histórico para redirecionamento 308 (Prompt 175/181).
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
    const oldSlug = currentSlug.trim().toLowerCase();

    if (cleanSlug === oldSlug) {
      return { success: true, newSlug: cleanSlug };
    }

    // Lista abrangente de palavras e rotas reservadas do sistema
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
      'assinar',
      'esqueci-senha',
      'termos',
      'privacidade',
      'terms',
      'privacy',
      'suporte',
      'help',
      'status',
      'p',
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

    // 1. Verifica se outro tenant já utiliza este slug canônico
    const { data: conflict } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('slug', cleanSlug)
      .neq('id', context.tenantId)
      .maybeSingle();

    if (conflict) {
      return {
        success: false,
        error: 'Este endereço já está sendo utilizado por outro estabelecimento.',
      };
    }

    // 2. Verifica se o novo slug colide com o histórico de aliases de outro tenant
    const { data: aliasConflict } = await supabase
      .from('tenants')
      .select('id')
      .neq('id', context.tenantId)
      .contains('settings', { slug_history: [cleanSlug] })
      .maybeSingle();

    if (aliasConflict) {
      return {
        success: false,
        error: 'Este endereço foi utilizado anteriormente por outro estabelecimento e está reservado.',
      };
    }

    // 3. Obtém as configurações atuais para registrar no histórico de aliases
    const { data: currentTenant } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', context.tenantId)
      .single();

    const currentSettings = (currentTenant?.settings as Record<string, unknown>) || {};
    const existingHistory: string[] = Array.isArray(currentSettings.slug_history)
      ? currentSettings.slug_history
      : [];

    // Adiciona o slug antigo ao histórico se ainda não estiver presente
    const updatedHistory = Array.from(new Set([...existingHistory, oldSlug])).filter(
      (s) => s !== cleanSlug
    );

    const newSettings = {
      ...currentSettings,
      slug_history: updatedHistory,
    };

    // 4. Atualização atômica do slug e do histórico
    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        slug: cleanSlug,
        settings: newSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath(`/${oldSlug}`);
    revalidatePath(`/${cleanSlug}`);
    revalidatePath(`/${oldSlug}/configuracoes`);
    revalidatePath(`/${cleanSlug}/configuracoes`);
    revalidatePath(`/agendar/${cleanSlug}`);
    revalidatePath(`/p/${oldSlug}`);
    revalidatePath(`/p/${cleanSlug}`);

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
      .order('sort_order', { ascending: true });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, items: (data as PortfolioItem[]) || [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao buscar portfólio.';
    return { success: false, error: msg };
  }
}

/**
 * Cria ou atualiza item de portfólio
 */
export async function savePortfolioItemAction(
  tenantSlug: string,
  item: Partial<PortfolioItem>
): Promise<{ success: boolean; item?: PortfolioItem; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return { success: false, error: 'Permissão negada para editar portfólio.' };
    }

    const supabase = await createClient();

    if (item.id) {
      // Atualização
      const { data, error } = await supabase
        .from('tenant_portfolio')
        .update({
          title: item.title,
          description: item.description,
          image_url: item.image_url,
          category: item.category,
          sort_order: item.sort_order ?? 0,
          is_active: item.is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('tenant_id', context.tenantId)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      revalidatePath(`/${tenantSlug}`);
      revalidatePath(`/p/${tenantSlug}`);
      return { success: true, item: data as PortfolioItem };
    } else {
      // Criação
      if (!item.title || !item.image_url) {
        return { success: false, error: 'Título e imagem são obrigatórios.' };
      }

      const { data, error } = await supabase
        .from('tenant_portfolio')
        .insert({
          tenant_id: context.tenantId,
          title: item.title,
          description: item.description || null,
          image_url: item.image_url,
          category: item.category || 'Geral',
          sort_order: item.sort_order ?? 0,
          is_active: item.is_active ?? true,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      revalidatePath(`/${tenantSlug}`);
      revalidatePath(`/p/${tenantSlug}`);
      return { success: true, item: data as PortfolioItem };
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar item de portfólio.';
    return { success: false, error: msg };
  }
}

/**
 * Remove item de portfólio
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
      return { success: false, error: 'Permissão negada para excluir do portfólio.' };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('tenant_portfolio')
      .delete()
      .eq('id', itemId)
      .eq('tenant_id', context.tenantId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(`/${tenantSlug}`);
    revalidatePath(`/p/${tenantSlug}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao excluir item.';
    return { success: false, error: msg };
  }
}
