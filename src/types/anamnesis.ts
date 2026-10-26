export type AnamnesisQuestionType = 'text' | 'single_choice' | 'multiple_choice' | 'boolean' | 'date';
export type AnamnesisFormStatus = 'draft' | 'completed' | 'archived';
export type LgpdLegalBasis = 'consent' | 'health_protection' | 'contract_execution' | 'legal_obligation';

export interface AnamnesisTemplate {
  id: string;
  tenant_id: string;
  title: string;
  category: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  questions?: AnamnesisQuestion[];
}

export interface AnamnesisQuestion {
  id: string;
  tenant_id: string;
  template_id: string;
  question_text: string;
  question_type: AnamnesisQuestionType;
  options: string[] | null;
  is_required: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface AnamnesisForm {
  id: string;
  tenant_id: string;
  client_id: string;
  template_id: string;
  professional_id: string | null;
  appointment_id: string | null;
  
  // Dados de Saúde e Condições
  health_history: string | null;
  allergies: string | null;
  medications: string | null;
  relevant_conditions: string | null;
  treatment_goal: string | null;
  professional_notes: string | null;

  // Versionamento e Rastreabilidade
  version: number;
  parent_form_id: string | null;
  status: AnamnesisFormStatus;
  filled_at: string;
  created_at: string;
  updated_at: string;

  // Relações em consultas
  client?: {
    id: string;
    full_name: string;
    whatsapp: string | null;
    birth_date: string | null;
  };
  professional?: {
    id: string;
    full_name: string;
    specialty: string;
  } | null;
  template?: {
    id: string;
    title: string;
    category: string;
  };
  answers?: AnamnesisAnswer[];
  legal_consent?: AnamnesisLegalConsent | null;
  has_allergies_alert?: boolean;
}

export interface ReceptionAnamnesisStatus {
  form_id: string;
  tenant_id: string;
  client_id: string;
  template_title: string;
  template_category: string;
  version: number;
  status: AnamnesisFormStatus;
  filled_at: string;
  has_allergies_alert: boolean;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    full_name: string;
    whatsapp: string | null;
  };
}

export interface AnamnesisAnswer {
  id: string;
  tenant_id: string;
  form_id: string;
  question_id: string;
  answer_text: string | null;
  answer_json: unknown;
  created_at: string;
  question?: AnamnesisQuestion;
}

export interface AnamnesisLegalConsent {
  id: string;
  tenant_id: string;
  form_id: string;
  legal_basis: LgpdLegalBasis;
  consent_terms_text: string;
  is_accepted: boolean;
  accepted_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
  recorded_by?: string | null;
  created_at: string;
}

export interface AnamnesisAuditLog {
  id: string;
  tenant_id: string;
  form_id: string;
  user_id: string;
  action: 'VIEW' | 'CREATE' | 'UPDATE_VERSION' | 'ARCHIVE';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AnamnesisFormData {
  clientId: string;
  templateId: string;
  professionalId?: string | null;
  appointmentId?: string | null;
  healthHistory?: string;
  allergies?: string;
  medications?: string;
  relevantConditions?: string;
  treatmentGoal?: string;
  professionalNotes?: string;
  legalBasis: LgpdLegalBasis;
  consentTermsText: string;
  isAccepted: boolean;
  answers: {
    questionId: string;
    answerText?: string;
    answerJson?: unknown;
  }[];
  parentFormId?: string | null;
}
