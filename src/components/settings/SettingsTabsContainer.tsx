'use client';

import React, { useState } from 'react';
import { CreditCard, Building2, Wallet } from 'lucide-react';
import { RemindersConfigManager } from './RemindersConfigManager';
import { WhatsAppOfficialManager } from './WhatsAppOfficialManager';
import { OnlineBookingCustomizer } from './OnlineBookingCustomizer';
import { SubscriptionTab } from './SubscriptionTab';
import { AIUsageTab } from './AIUsageTab';
import { TenantReminderSettings, NotificationQueueItem } from '@/types/reminders';
import { TenantWhatsAppConfig, WhatsAppOfficialTemplate } from '@/types/whatsapp';
import { OnlineBookingSettings } from '@/types/publicBooking';
import { SubscriptionOverviewData } from '@/types/subscriptions';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';

interface SettingsTabsContainerProps {
  tenantSlug: string;
  userRole: string;
  reminderSettings: TenantReminderSettings;
  queueItems: NotificationQueueItem[];
  whatsappConfig: TenantWhatsAppConfig;
  whatsappTemplates: WhatsAppOfficialTemplate[];
  bookingSettings: OnlineBookingSettings;
  subscriptionData?: SubscriptionOverviewData;
  aiUsageData?: {
    plan: string;
    monthlyLimit: number;
    usedTokens: number;
    remainingTokens: number;
    percentageUsed: number;
    estimatedCostUsd: number;
    recentLogs: import('@/types/aiReceptionist').AIUsageLogItem[];
  } | null;
  services: Service[];
  professionals: Professional[];
  initialTab?: 'booking' | 'subscription' | 'financial_integration' | 'reminders' | 'whatsapp' | 'ai';
}

export function SettingsTabsContainer({
  tenantSlug,
  userRole,
  reminderSettings,
  queueItems,
  whatsappConfig,
  whatsappTemplates,
  bookingSettings,
  subscriptionData,
  aiUsageData,
  services,
  professionals,
  initialTab = 'booking',
}: SettingsTabsContainerProps) {
  const [currentTab, setCurrentTab] = useState<'booking' | 'subscription' | 'financial_integration' | 'reminders' | 'whatsapp' | 'ai'>(
    initialTab || 'booking'
  );

  return (
    <div className="space-y-6">
      {/* Navegação de Abas do Módulo de Configurações */}
      <div className="flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs w-fit">
        {/* Aba 1: Dados Cadastrais */}
        <button
          type="button"
          onClick={() => setCurrentTab('booking')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentTab === 'booking'
              ? 'bg-[#B87070] text-white shadow-2xs font-bold'
              : 'text-[#7D6B65] hover:text-[#2C1810]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Dados Cadastrais</span>
          {bookingSettings.enabled && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Vitrine Ativa" />
          )}
        </button>

        {/* Aba 2: Minha Assinatura */}
        {subscriptionData && (
          <button
            type="button"
            onClick={() => setCurrentTab('subscription')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              currentTab === 'subscription'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-[#B87070]" />
            <span>Minha Assinatura</span>
          </button>
        )}

        {/* Aba 3 (Futura): Integração Financeira (Estrutura visual preparada para lançamento) */}
        <div
          title="Em breve: Gateway de pagamentos, conciliação e split bancário"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-[#A8948D] bg-stone-50/70 border border-dashed border-[#EADBCE] cursor-not-allowed select-none opacity-80"
        >
          <Wallet className="w-3.5 h-3.5 text-[#A8948D]" />
          <span>Integração Financeira</span>
          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm bg-[#FAF0EC] text-[#B87070] border border-[#F2DDD9]">
            Em breve
          </span>
        </div>
      </div>

      {/* Conteúdo da Aba Ativa */}
      {currentTab === 'booking' && (
        <OnlineBookingCustomizer
          tenantSlug={tenantSlug}
          userRole={userRole}
          initialSettings={bookingSettings}
          services={services}
          professionals={professionals}
        />
      )}

      {currentTab === 'reminders' && (
        <RemindersConfigManager
          tenantSlug={tenantSlug}
          userRole={userRole}
          initialSettings={reminderSettings}
          queueItems={queueItems}
        />
      )}

      {currentTab === 'whatsapp' && (
        <WhatsAppOfficialManager
          tenantSlug={tenantSlug}
          userRole={userRole}
          initialConfig={whatsappConfig}
          templates={whatsappTemplates}
          queueItems={queueItems}
        />
      )}

      {currentTab === 'ai' && aiUsageData && (
        <AIUsageTab
          tenantSlug={tenantSlug}
          data={aiUsageData}
        />
      )}

      {currentTab === 'subscription' && subscriptionData && (
        <SubscriptionTab
          tenantSlug={tenantSlug}
          initialData={subscriptionData}
        />
      )}
    </div>
  );
}
