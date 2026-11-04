'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { PortfolioItem } from '@/types/publicBooking';
import { revalidatePath } from 'next/cache';

interface PortfolioDbRow extends PortfolioItem {
  services?: { name?: string | null } | null;
}

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
      .select('*, services:service_id(name)')
      .eq('tenant_id', context.tenantId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    const items = ((data || []) as unknown as PortfolioDbRow[]).map((row) => ({
      ...row,
      service_name: row.services?.name || null,
    }));

    return { success: true, items: (items as PortfolioItem[]) || [] };


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

    // Não permitir publicação ativa sem consentimento expresso do cliente
    const isConsentGiven = item.client_consent === true;
    const finalIsActive = isConsentGiven ? (item.is_active ?? true) : false;

    if (item.id) {
      // Atualização
      const updatePayload: Record<string, unknown> = {
        title: item.title,
        description: item.description || null,
        image_url: item.image_url,
        category: item.category || 'Geral',
        service_id: item.service_id || null,
        sort_order: Number(item.sort_order ?? 0),
        client_consent: isConsentGiven,
        client_consent_at: isConsentGiven ? (item.client_consent_at || new Date().toISOString()) : null,
        is_active: finalIsActive,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('tenant_portfolio')
        .update(updatePayload)
        .eq('id', item.id)
        .eq('tenant_id', context.tenantId)
        .select('*, services:service_id(name)')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const formattedItem: PortfolioItem = {
        ...data,
        service_name: (data as unknown as PortfolioDbRow)?.services?.name || null,
      };

      revalidatePath(`/${tenantSlug}`);
      revalidatePath(`/${tenantSlug}/portfolio`);
      revalidatePath(`/p/${tenantSlug}`);
      return { success: true, item: formattedItem };
    } else {
      // Criação
      if (!item.title || !item.image_url) {
        return { success: false, error: 'Título e imagem do trabalho são obrigatórios.' };
      }

      const insertPayload = {
        tenant_id: context.tenantId,
        title: item.title.trim(),
        description: item.description?.trim() || null,
        image_url: item.image_url,
        category: item.category || 'Geral',
        service_id: item.service_id || null,
        sort_order: Number(item.sort_order ?? 0),
        client_consent: isConsentGiven,
        client_consent_at: isConsentGiven ? new Date().toISOString() : null,
        is_active: finalIsActive,
      };

      const { data, error } = await supabase
        .from('tenant_portfolio')
        .insert(insertPayload)
        .select('*, services:service_id(name)')
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      const formattedItem: PortfolioItem = {
        ...data,
        service_name: (data as unknown as PortfolioDbRow)?.services?.name || null,
      };

      revalidatePath(`/${tenantSlug}`);
      revalidatePath(`/${tenantSlug}/portfolio`);
      revalidatePath(`/p/${tenantSlug}`);
      return { success: true, item: formattedItem };
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
    revalidatePath(`/${tenantSlug}/portfolio`);
    revalidatePath(`/p/${tenantSlug}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao excluir item.';
    return { success: false, error: msg };
  }
}

/**
 * Alterna rapidamente a ativação pública de um trabalho,
 * impedindo ativação caso não haja consentimento do cliente registrado.
 */
export async function togglePortfolioStatusAction(
  tenantSlug: string,
  itemId: string,
  currentStatus: boolean
): Promise<{ success: boolean; is_active?: boolean; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return { success: false, error: 'Permissão negada.' };
    }

    const supabase = await createClient();

    // Se estiver tentando ativar, verifica se o consentimento está registrado
    if (!currentStatus) {
      const { data: itemData, error: itemErr } = await supabase
        .from('tenant_portfolio')
        .select('client_consent')
        .eq('id', itemId)
        .eq('tenant_id', context.tenantId)
        .single();

      if (itemErr || !itemData) {
        return { success: false, error: 'Trabalho não encontrado.' };
      }

      if (!itemData.client_consent) {
        return {
          success: false,
          error: 'Não é possível publicar este trabalho sem o consentimento do cliente registrado.',
        };
      }
    }

    const nextStatus = !currentStatus;
    const { error: updErr } = await supabase
      .from('tenant_portfolio')
      .update({ is_active: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .eq('tenant_id', context.tenantId);

    if (updErr) {
      return { success: false, error: updErr.message };
    }

    revalidatePath(`/${tenantSlug}`);
    revalidatePath(`/${tenantSlug}/portfolio`);
    revalidatePath(`/p/${tenantSlug}`);
    return { success: true, is_active: nextStatus };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao alterar status do trabalho.';
    return { success: false, error: msg };
  }
}
