export type WhatsAppConnectionStatus =
  | 'disconnected'
  | 'pending_verification'
  | 'connected'
  | 'error';

export type WhatsAppDeliveryStatus =
  | 'enqueued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed';

export type WhatsAppTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

export type WhatsAppTemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';

export interface TenantWhatsAppConfig {
  id?: string;
  tenant_id: string;
  waba_id: string | null;
  phone_number_id: string | null;
  business_phone_display: string | null;
  has_access_token: boolean;
  webhook_verify_token: string | null;
  connection_status: WhatsAppConnectionStatus;
  dry_run_mode?: boolean;
  is_live_active?: boolean;
  live_activated_at?: string | null;
  is_paused?: boolean;
  paused_at?: string | null;
  pause_reason?: string | null;
  last_health_check_at: string | null;
  last_error_message: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WhatsAppPreActivationChecklist {
  meta_connected: boolean;
  has_phone_number: boolean;
  has_waba_id: boolean;
  has_token: boolean;
  reminders_enabled: boolean;
  utility_templates_approved: boolean;
  approved_templates_count: number;
  processing_messages_count: number;
  stuck_messages_count: number;
  simulated_pending_count: number;
  uncertain_failures_count: number;
  opt_in_clients_count: number;
  total_clients_count: number;
  is_live_active: boolean;
  is_paused: boolean;
  can_activate: boolean;
}

export interface WhatsAppActivationLog {
  id: string;
  tenant_id: string;
  performed_by: string;
  action: 'ACTIVATE_LIVE' | 'DEACTIVATE_LIVE' | 'PAUSE_LIVE' | 'RESUME_LIVE';
  reason: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface WhatsAppQueueMetrics {
  total: number;
  pending: number;
  simulated: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  canceled: number;
}

export type WhatsAppInboundAction =
  | 'CONFIRMED'
  | 'AMBIGUOUS'
  | 'NO_CONTEXT'
  | 'CLIENT_NOT_FOUND'
  | 'ALREADY_PROCESSED'
  | 'INVALID_STATE'
  | 'IGNORED';

export interface WhatsAppInboundMessage {
  id: string;
  tenant_id: string;
  client_id: string | null;
  appointment_id: string | null;
  provider_message_id: string;
  context_message_id: string | null;
  sender_phone: string;
  message_type: 'text' | 'button_reply' | 'interactive' | string;
  message_text: string | null;
  button_payload: string | null;
  action_taken: WhatsAppInboundAction;
  raw_payload: Record<string, unknown>;
  created_at: string;
  client?: {
    id: string;
    full_name: string;
    phone: string | null;
    whatsapp: string | null;
  } | null;
  appointment?: {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    service?: {
      name: string;
    };
    professional?: {
      full_name: string;
    };
  } | null;
}

export const WHATSAPP_INBOUND_ACTION_MAP: Record<
  WhatsAppInboundAction,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  CONFIRMED: {
    label: 'Confirmado Automaticamente',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    desc: 'O agendamento foi confirmado pelo cliente via WhatsApp.',
  },
  AMBIGUOUS: {
    label: 'Ambiguidade (Ação Necessária)',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    desc: 'O cliente possui múltiplos agendamentos pendentes. Requer seleção manual.',
  },
  NO_CONTEXT: {
    label: 'Sem Contexto de Lembrete',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    desc: 'Resposta recebida fora da janela de lembrete ativo.',
  },
  CLIENT_NOT_FOUND: {
    label: 'Número Não Cadastrado',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    desc: 'Telefone do remetente não localizado na base de clientes.',
  },
  ALREADY_PROCESSED: {
    label: 'Já Confirmado',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    desc: 'Mensagem repetida ou agendamento já estava confirmado.',
  },
  INVALID_STATE: {
    label: 'Status Não Elegível',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-200',
    desc: 'O agendamento já estava cancelado, concluído ou em andamento.',
  },
  IGNORED: {
    label: 'Outras Mensagens',
    bg: 'bg-zinc-100',
    text: 'text-zinc-500',
    border: 'border-zinc-200',
    desc: 'Mensagem sem intenção afirmativa de confirmação.',
  },
};

export interface WhatsAppOfficialTemplate {
  id: string;
  tenant_id: string;
  template_name: string;
  meta_template_id: string | null;
  language: string;
  category: WhatsAppTemplateCategory;
  status: WhatsAppTemplateStatus;
  body_text: string;
  header_text: string | null;
  footer_text: string | null;
  components: unknown[];
  created_at: string;
  updated_at: string;
}

export const WHATSAPP_CONNECTION_STATUS_MAP: Record<
  WhatsAppConnectionStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  disconnected: {
    label: 'Desconectado',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-300',
    desc: 'Nenhuma credencial oficial vinculada ao estabelecimento.',
  },
  pending_verification: {
    label: 'Aguardando Verificação',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-300',
    desc: 'Credenciais cadastradas. Validação de Webhook e telefone em andamento.',
  },
  connected: {
    label: 'Conectado (Oficial)',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    desc: 'Canal oficial ativo via Meta Cloud API com alta entregabilidade.',
  },
  error: {
    label: 'Falha de Conexão',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-300',
    desc: 'Erro na autenticação do token permanente ou WABA ID na Meta.',
  },
};

export const WHATSAPP_TEMPLATE_STATUS_MAP: Record<
  WhatsAppTemplateStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  APPROVED: {
    label: 'Aprovado pela Meta',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  PENDING: {
    label: 'Em Análise na Meta',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  REJECTED: {
    label: 'Rejeitado',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  PAUSED: {
    label: 'Pausado',
    bg: 'bg-zinc-100',
    text: 'text-zinc-600',
    border: 'border-zinc-200',
  },
};
