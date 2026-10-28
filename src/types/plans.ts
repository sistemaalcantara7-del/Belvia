import { PlanType, TenantRole } from './tenant';

export type FeatureFlag =
  | 'smart_scheduling'          // Encaixes inteligentes
  | 'multi_professional'        // Múltiplos profissionais simultâneos
  | 'custom_anamnesis'          // Fichas de anamnese personalizadas
  | 'photo_history'             // Histórico fotográfico antes/depois
  | 'financial_reports'         // DRE simplificado e comissões
  | 'custom_domain'             // Subdomínio/domínio personalizado
  | 'automated_notifications'   // WhatsApp / SMS automatizados
  | 'generative_ai_reception';  // Recepcionista Virtual com IA Generativa (OpenAI/Gemini)

export interface PlanConfig {
  id: PlanType;
  name: string;
  priceMonthly: number;
  features: Record<FeatureFlag, boolean>;
  limits: {
    maxProfessionals: number;
    maxClients: number;
    storageMb: number;
    aiMonthlyTokens: number;
  };
}

export const PLAN_CONFIGS: Record<PlanType, PlanConfig> = {
  essential: {
    id: 'essential',
    name: 'Essencial',
    priceMonthly: 59.90,
    features: {
      smart_scheduling: false,
      multi_professional: false,
      custom_anamnesis: false,
      photo_history: false,
      financial_reports: false,
      custom_domain: false,
      automated_notifications: false,
      generative_ai_reception: false,
    },
    limits: {
      maxProfessionals: 1,
      maxClients: 500,
      storageMb: 500,
      aiMonthlyTokens: 0, // Plano Essencial utiliza atendimento determinístico seguro sem IA generativa
    },
  },
  smart: {
    id: 'smart',
    name: 'Inteligente',
    priceMonthly: 99.90,
    features: {
      smart_scheduling: true,
      multi_professional: true,
      custom_anamnesis: true,
      photo_history: true,
      financial_reports: true,
      custom_domain: true,
      automated_notifications: true,
      generative_ai_reception: true,
    },
    limits: {
      maxProfessionals: 10,
      maxClients: 10000,
      storageMb: 10000,
      aiMonthlyTokens: 300000, // Franquia mensal padrão de 300k tokens
    },
  },
};

export const ROLE_PERMISSIONS: Record<TenantRole, string[]> = {
  owner: ['all'],
  admin: [
    'manage_team',
    'manage_services',
    'view_finances',
    'manage_appointments',
    'manage_clients',
    'manage_anamnesis',
  ],
  professional: [
    'view_own_agenda',
    'edit_own_agenda',
    'view_assigned_clients',
    'manage_assigned_anamnesis',
  ],
  receptionist: [
    'view_all_agenda',
    'manage_appointments',
    'view_clients',
    'create_clients',
  ],
};
