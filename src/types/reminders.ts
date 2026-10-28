export type NotificationStatus = 'pending' | 'processing' | 'sent' | 'simulated' | 'failed' | 'canceled';
export type ReminderTriggerType =
  | 'reminder_24h'
  | 'reminder_2h'
  | 'instant_confirmation'
  | 'reschedule_notice'
  | 'cancellation_notice';

export interface TenantReminderSettings {
  id?: string;
  tenant_id: string;
  enabled: boolean;
  enable_24h_reminder: boolean;
  enable_2h_reminder: boolean;
  provider: 'meta_cloud_api' | 'official_bsp';
  template_24h: string;
  template_2h: string;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationQueueItem {
  id: string;
  tenant_id: string;
  appointment_id: string;
  client_id: string;
  notification_type: ReminderTriggerType;
  channel: string;
  recipient_phone: string;
  message_content: string;
  status: NotificationStatus;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;
  provider_message_id: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    full_name: string;
    phone: string | null;
  };
  appointment?: {
    id: string;
    start_time: string;
    status: string;
    service?: {
      name: string;
    };
    professional?: {
      full_name: string;
    };
  };
}

export const NOTIFICATION_STATUS_MAP: Record<
  NotificationStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: 'Aguardando Envio',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  processing: {
    label: 'Em Processamento',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  simulated: {
    label: 'Simulado (Homologação)',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  sent: {
    label: 'Enviado Oficial',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  failed: {
    label: 'Falha no Provedor',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  canceled: {
    label: 'Cancelado',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-200',
  },
};

export const REMINDER_TRIGGER_LABEL: Record<ReminderTriggerType, string> = {
  reminder_24h: 'Lembrete de 24 horas',
  reminder_2h: 'Lembrete de 2 horas',
  instant_confirmation: 'Confirmação Imediata',
  reschedule_notice: 'Aviso de Reagendamento',
  cancellation_notice: 'Aviso de Cancelamento',
};
