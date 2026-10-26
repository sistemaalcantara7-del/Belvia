export type ProfessionalStatus = 'active' | 'inactive';

export interface ProfessionalSchedule {
  id?: string;
  day_of_week: number; // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  start_time: string;  // "09:00"
  end_time: string;    // "18:00"
  break_start?: string | null; // "12:00"
  break_end?: string | null;   // "13:00"
  is_active: boolean;
}

export interface ProfessionalTimeBlock {
  id: string;
  tenant_id: string;
  professional_id: string;
  start_time: string; // ISO string TIMESTAMPTZ
  end_time: string;   // ISO string TIMESTAMPTZ
  reason: string | null;
  created_at?: string;
  professional?: {
    id: string;
    full_name: string;
    specialty: string;
  };
}

export interface TimeBlockFormData {
  id?: string;
  professional_id: string;
  date: string;       // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  reason?: string;
}

export interface Professional {
  id: string;
  tenant_id: string;
  user_id: string | null;
  full_name: string;
  whatsapp: string | null;
  email: string | null;
  specialty: string;
  bio: string | null;
  avatar_url: string | null;
  status: ProfessionalStatus;
  created_at: string;
  updated_at: string;
  service_ids?: string[];
  schedules?: ProfessionalSchedule[];
}

export interface ProfessionalFormData {
  id?: string;
  full_name: string;
  whatsapp?: string;
  email?: string;
  specialty: string;
  bio?: string;
  status: ProfessionalStatus;
  user_id?: string | null;
  service_ids: string[];
  schedules: ProfessionalSchedule[];
}

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
] as const;
