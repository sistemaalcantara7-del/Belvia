import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { getReminderSettingsAction, getNotificationQueueAction } from '@/lib/actions/reminders';
import { getTenantWhatsAppConfigAction, getOfficialTemplatesAction } from '@/lib/actions/whatsapp';
import {
  getOnlineBookingSettingsAction,
} from '@/lib/actions/bookingSettings';
import { getTenantPortfolioAction } from '@/lib/actions/portfolio';
import { getSubscriptionOverviewAction } from '@/lib/actions/saasSubscriptions';
import { getTenantAIUsageMetricsAction } from '@/lib/actions/aiReceptionist';
import { DEFAULT_BOOKING_SETTINGS, PortfolioItem } from '@/types/publicBooking';
import { SettingsTabsContainer } from '@/components/settings/SettingsTabsContainer';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';

export const dynamic = 'force-dynamic';

interface ConfiguracoesPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ConfiguracoesPage({ params }: ConfiguracoesPageProps) {
  const { tenantSlug } = await params;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const supabase = await createClient();

  // 1. Busca configurações, templates, catálogo de serviços, profissionais, portfólio, assinatura e métricas de IA em paralelo
  const [
    remindersRes,
    queueRes,
    whatsappRes,
    templatesRes,
    bookingRes,
    portfolioRes,
    subscriptionRes,
    aiMetricsRes,
    srvRes,
    profRes,
  ] = await Promise.all([
    getReminderSettingsAction(tenantSlug),
    getNotificationQueueAction(tenantSlug, { limit: 50 }),
    getTenantWhatsAppConfigAction(tenantSlug),
    getOfficialTemplatesAction(tenantSlug),
    getOnlineBookingSettingsAction(tenantSlug),
    getTenantPortfolioAction(tenantSlug),
    getSubscriptionOverviewAction(tenantSlug),
    getTenantAIUsageMetricsAction(tenantSlug),
    supabase
      .from('services')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    supabase
      .from('professionals')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
  ]);

  const reminderSettings = remindersRes.data || {
    tenant_id: context.tenantId,
    enabled: true,
    enable_24h_reminder: true,
    enable_2h_reminder: true,
    provider: 'meta_cloud_api',
    template_24h:
      'Olá, {cliente}! Confirmamos seu agendamento de {servico} com {profissional} amanhã, {data} às {horario}, na {estabelecimento}. Responda SIM para confirmar.',
    template_2h:
      'Olá, {cliente}! Lembramos que seu atendimento de {servico} com {profissional} na {estabelecimento} será hoje às {horario}. Estamos aguardando você!',
  };

  const queueItems = queueRes.data || [];

  const whatsappConfig = whatsappRes.data || {
    tenant_id: context.tenantId,
    waba_id: null,
    phone_number_id: null,
    business_phone_display: null,
    has_access_token: false,
    webhook_verify_token: null,
    connection_status: 'disconnected',
    last_health_check_at: null,
    last_error_message: null,
  };

  const whatsappTemplates = templatesRes.data || [];
  const bookingSettings = bookingRes.settings || DEFAULT_BOOKING_SETTINGS;
  const portfolioItems = (portfolioRes.items || []) as PortfolioItem[];
  const subscriptionData = subscriptionRes.data;
  const aiUsageData = aiMetricsRes.data || null;
  const services = (srvRes.data || []) as Service[];
  const professionals = (profRes.data || []) as Professional[];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
          <Settings className="w-5 h-5 stroke-[2.2]" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1115] tracking-tight">
            Configurações do Estabelecimento
          </h1>
          <p className="text-xs sm:text-sm text-[#7D6B65]">
            {context.tenantName} • Vitrine digital, agendamento online, lembretes automáticos, consumo de IA e assinatura
          </p>
        </div>
      </div>

      {/* Container Unificado com Abas */}
      <SettingsTabsContainer
        tenantSlug={tenantSlug}
        userRole={context.role}
        reminderSettings={reminderSettings}
        queueItems={queueItems}
        whatsappConfig={whatsappConfig}
        whatsappTemplates={whatsappTemplates}
        bookingSettings={bookingSettings}
        portfolioItems={portfolioItems}
        subscriptionData={subscriptionData}
        aiUsageData={aiUsageData}
        services={services}
        professionals={professionals}
      />
    </div>
  );
}
