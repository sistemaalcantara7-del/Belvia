'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { OnlineBookingSettings, DEFAULT_BOOKING_SETTINGS } from '@/types/publicBooking';
import { revalidatePath } from 'next/cache';

export async function getOnlineBookingSettingsAction(
  tenantSlug: string
): Promise<{ success: boolean; settings?: OnlineBookingSettings; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado ou estabelecimento não encontrado.' };
    }

    const supabase = await createClient();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', context.tenantId)
      .single();

    if (error || !tenant) {
      return { success: false, error: error?.message || 'Estabelecimento não localizado.' };
    }

    const rawSettings = (tenant.settings as { booking_settings?: OnlineBookingSettings }) || {};
    const bookingSettings: OnlineBookingSettings = {
      ...DEFAULT_BOOKING_SETTINGS,
      ...(rawSettings.booking_settings || {}),
    };

    return { success: true, settings: bookingSettings };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao buscar configurações.';
    return { success: false, error: msg };
  }
}

export async function saveOnlineBookingSettingsAction(
  tenantSlug: string,
  newSettings: Partial<OnlineBookingSettings>
): Promise<{ success: boolean; settings?: OnlineBookingSettings; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    if (!['owner', 'admin'].includes(context.role)) {
      return {
        success: false,
        error: 'Apenas proprietários e administradores podem alterar as configurações da página pública.',
      };
    }

    const supabase = await createClient();

    // 1. Busca settings atuais para merge seguro
    const { data: tenant, error: fetchErr } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', context.tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Falha ao localizar registro do estabelecimento.' };
    }

    const currentTenantSettings = (tenant.settings as Record<string, unknown>) || {};
    const currentBookingSettings = (currentTenantSettings.booking_settings as OnlineBookingSettings) || DEFAULT_BOOKING_SETTINGS;

    const mergedBookingSettings: OnlineBookingSettings = {
      ...currentBookingSettings,
      ...newSettings,
      // Sanitizações de segurança
      min_advance_hours: Math.max(0, Number(newSettings.min_advance_hours ?? currentBookingSettings.min_advance_hours)),
      max_future_days: Math.max(1, Math.min(180, Number(newSettings.max_future_days ?? currentBookingSettings.max_future_days))),
    };

    const updatedSettings = {
      ...currentTenantSettings,
      booking_settings: mergedBookingSettings,
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

    revalidatePath(`/${tenantSlug}/configuracoes`);
    revalidatePath(`/agendar/${tenantSlug}`);

    return { success: true, settings: mergedBookingSettings };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao salvar configurações.';
    return { success: false, error: msg };
  }
}
