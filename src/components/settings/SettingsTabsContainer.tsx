'use client';

import React, { useState } from 'react';
import { Bell, MessageCircle, Globe, CreditCard, Bot } from 'lucide-react';
import { RemindersConfigManager } from './RemindersConfigManager';
import { WhatsAppOfficialManager } from './WhatsAppOfficialManager';
import { OnlineBookingCustomizer } from './OnlineBookingCustomizer';
import { SubscriptionTab } from './SubscriptionTab';
import { AIUsageTab } from './AIUsageTab';
import { TenantReminderSettings, NotificationQueueItem } from '@/types/reminders';
import { TenantWhatsAppConfig, WhatsAppOfficialTemplate } from '@/types/whatsapp';
import { OnlineBookingSettings, PortfolioItem } from '@/types/publicBooking';
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
  portfolioItems?: PortfolioItem[];
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
}

export function SettingsTabsContainer({
  tenantSlug,
  userRole,
  reminderSettings,
  queueItems,
  whatsappConfig,
  whatsappTemplates,
  bookingSettings,
  portfolioItems = [],
  subscriptionData,
  aiUsageData,
  services,
  professionals,
}: SettingsTabsContainerProps) {
  const [currentTab, setCurrentTab] = useState<'booking' | 'reminders' | 'whatsapp' | 'subscription' | 'ai'>('booking');

  return (
    <div className="space-y-6">
      {/* Navegação de Abas do Módulo de Configurações */}
      <div className="flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs w-fit">
        <button
          type="button"
          onClick={() => setCurrentTab('booking')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentTab === 'booking'
              ? 'bg-[#B87070] text-white shadow-2xs font-bold'
              : 'text-[#7D6B65] hover:text-[#2C1810]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Agendamento Online</span>
          {bookingSettings.enabled && (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('reminders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentTab === 'reminders'
              ? 'bg-[#B87070] text-white shadow-2xs font-bold'
              : 'text-[#7D6B65] hover:text-[#2C1810]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Lembretes Automáticos</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('whatsapp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentTab === 'whatsapp'
              ? 'bg-[#B87070] text-white shadow-2xs font-bold'
              : 'text-[#7D6B65] hover:text-[#2C1810]'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>WhatsApp Business Oficial</span>
          {whatsappConfig.connection_status === 'connected' && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

        {aiUsageData && (
          <button
            type="button"
            onClick={() => setCurrentTab('ai')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              currentTab === 'ai'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#2B72D4]" />
            <span>Consumo IA</span>
          </button>
        )}

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
      </div>

      {/* Conteúdo da Aba Ativa */}
      {currentTab === 'booking' && (
        <OnlineBookingCustomizer
          tenantSlug={tenantSlug}
          userRole={userRole}
          initialSettings={bookingSettings}
          initialPortfolio={portfolioItems}
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
