'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { revalidatePath } from 'next/cache';

export interface OnboardingProgress {
  hasConfiguredBusiness: boolean; // Dados, telefone ou logo salvos
  hasProfessionals: boolean;     // Pelo menos 1 profissional cadastrado
  hasServices: boolean;          // Pelo menos 1 serviço cadastrado
  hasClients: boolean;           // Pelo menos 1 cliente cadastrado
  hasSharedPublicPage: boolean;  // Usuário marcou ou abriu/copiou a página pública
  isDismissed: boolean;          // Se o proprietário optou por "Fazer depois" / dispensar
  completedCount: number;
  totalSteps: number;
}

export async function getOnboardingStatusAction(
  tenantSlug: string
): Promise<{ success: boolean; data?: OnboardingProgress; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    const supabase = await createClient();

    // 1. Consulta em paralelo para contagem real no banco
    const [tenantRes, profsRes, srvsRes, clientsRes] = await Promise.all([
      supabase
        .from('tenants')
        .select('settings')
        .eq('id', context.tenantId)
        .single(),
      supabase
        .from('professionals')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('status', 'active'),
      supabase
        .from('services')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('status', 'active'),
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('status', 'active'),
    ]);

    const tenantSettings = (tenantRes.data?.settings as Record<string, unknown>) || {};
    const bookingSettings = (tenantSettings.booking_settings as Record<string, unknown>) || {};
    const onboardingSettings = (tenantSettings.onboarding as Record<string, unknown>) || {};

    // 1. "Configurar negócio" exige dados institucionais mínimos E logomarca cadastrada
    const hasLogo = Boolean(bookingSettings.logo_url && String(bookingSettings.logo_url).trim().length > 0);
    const hasMinBusinessInfo = Boolean(
      (bookingSettings.business_name && String(bookingSettings.business_name).trim().length > 0) ||
      (tenantRes.data?.settings && (tenantRes.data.settings as Record<string, unknown>).business_name)
    ) && Boolean(
      bookingSettings.phone ||
      bookingSettings.whatsapp ||
      bookingSettings.address ||
      bookingSettings.city
    );
    const hasConfiguredBusiness = hasLogo && hasMinBusinessInfo;

    // Etapa 2: Equipe / Profissionais cadastrados (> 0)
    const hasProfessionals = (profsRes.count ?? 0) > 0;

    // Etapa 3: Serviços / Preços cadastrados (> 0)
    const hasServices = (srvsRes.count ?? 0) > 0;

    // Etapa 4: Primeiros clientes cadastrados (> 0)
    const hasClients = (clientsRes.count ?? 0) > 0;

    // Etapa 5: Página pública conhecida / compartilhada
    const hasSharedPublicPage = Boolean(onboardingSettings.public_page_shared);

    // 2. Dispensa individual por usuário e tenant
    const dismissedUsers = Array.isArray(onboardingSettings.dismissed_users)
      ? (onboardingSettings.dismissed_users as string[])
      : onboardingSettings.dismissed_by === context.userId && onboardingSettings.dismissed
      ? [context.userId]
      : [];

    const isDismissed = dismissedUsers.includes(context.userId);

    const steps = [
      hasConfiguredBusiness,
      hasProfessionals,
      hasServices,
      hasClients,
      hasSharedPublicPage,
    ];

    const completedCount = steps.filter(Boolean).length;

    return {
      success: true,
      data: {
        hasConfiguredBusiness,
        hasProfessionals,
        hasServices,
        hasClients,
        hasSharedPublicPage,
        isDismissed,
        completedCount,
        totalSteps: 5,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao buscar status do onboarding.';
    return { success: false, error: msg };
  }
}

export async function dismissOnboardingAction(
  tenantSlug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (context.role !== 'owner' && context.role !== 'admin') {
      return { success: false, error: 'Apenas proprietários podem dispensar o guia inicial.' };
    }

    const supabase = await createClient();

    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', context.tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Estabelecimento não encontrado.' };
    }

    const currentSettings = (tenant.settings as Record<string, unknown>) || {};
    const currentOnboarding = (currentSettings.onboarding as Record<string, unknown>) || {};
    const existingDismissedUsers: string[] = Array.isArray(currentOnboarding.dismissed_users)
      ? (currentOnboarding.dismissed_users as string[])
      : currentOnboarding.dismissed_by
      ? [currentOnboarding.dismissed_by as string]
      : [];

    const updatedDismissedUsers = Array.from(new Set([...existingDismissedUsers, context.userId]));

    const updatedSettings = {
      ...currentSettings,
      onboarding: {
        ...currentOnboarding,
        dismissed: true,
        dismissed_users: updatedDismissedUsers,
        last_dismissed_at: new Date().toISOString(),
        last_dismissed_by: context.userId,
      },
    };

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath(`/${tenantSlug}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao dispensar o guia.';
    return { success: false, error: msg };
  }
}

export async function markPublicPageSharedAction(
  tenantSlug: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    const supabase = await createClient();

    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', context.tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Estabelecimento não encontrado.' };
    }

    const currentSettings = (tenant.settings as Record<string, unknown>) || {};
    const currentOnboarding = (currentSettings.onboarding as Record<string, unknown>) || {};

    if (currentOnboarding.public_page_shared) {
      return { success: true };
    }

    const updatedSettings = {
      ...currentSettings,
      onboarding: {
        ...currentOnboarding,
        public_page_shared: true,
        public_page_shared_at: new Date().toISOString(),
      },
    };

    const { error: updateErr } = await supabase
      .from('tenants')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath(`/${tenantSlug}`);
    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao registrar etapa.';
    return { success: false, error: msg };
  }
}
