export interface AIChatAnamnesisPrompt {
  appointmentId: string;
  templateId: string;
  templateTitle: string;
  category: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  question?: {
    id: string;
    text: string;
    type: 'text' | 'single_choice' | 'multiple_choice' | 'boolean' | 'date';
    options?: string[];
  };
  consentPending?: boolean;
  status: 'pending_consent' | 'in_progress' | 'completed' | 'declined';
}

export interface SuggestedSlotItem {
  time: string;
  professionalName: string;
  professionalId: string;
  date: string;
  serviceId?: string;
  serviceName?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  // Campos estruturados quando a IA sugere ou confirma ações
  suggestedSlots?: SuggestedSlotItem[];
  bookingSummary?: {
    serviceName: string;
    serviceId: string;
    professionalName: string;
    professionalId: string;
    date: string;
    time: string;
    price: number;
    clientName: string;
    clientWhatsapp: string;
  };
  confirmedAppointment?: {
    id: string;
    serviceName: string;
    professionalName: string;
    date: string;
    time: string;
  };
  anamnesisPrompt?: AIChatAnamnesisPrompt;
  quickReplies?: {
    label: string;
    actionText: string;
  }[];
}

export interface AIChatSessionState {
  sessionToken: string;
  messages: AIChatMessage[];
  isAvailable: boolean;
  modelProvider?: string;
  currentDraft?: {
    serviceId?: string;
    serviceName?: string;
    professionalId?: string;
    professionalName?: string;
    date?: string;
    time?: string;
    clientName?: string;
    clientWhatsapp?: string;
  };
  anamnesisState?: {
    appointmentId: string;
    templateId: string;
    templateTitle: string;
    consentGiven: boolean;
    currentIndex: number;
    answers: { questionId: string; answerText?: string; answerJson?: unknown }[];
  };
}

export interface SendChatMessageInput {
  tenantSlug: string;
  sessionToken: string;
  message: string;
  clientIp?: string;
}

export interface AIUsageLogItem {
  id: string;
  tenant_id?: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  session_token?: string | null;
  created_at: string;
}

export interface AIQuotaStatus {
  allowed: boolean;
  plan: string;
  monthly_limit: number;
  used_tokens: number;
  remaining_tokens: number;
  percentage_used: number;
  estimated_month_cost_usd: number;
}

export interface SendChatMessageResponse {
  success: boolean;
  message?: AIChatMessage;
  error?: string;
  isFallback?: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    provider: 'openai' | 'gemini' | 'deterministic';
  };
}
