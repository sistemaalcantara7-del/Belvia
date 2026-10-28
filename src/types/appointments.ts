import { Client } from './clients';
import { Service } from './services';
import { Professional } from './professionals';
import { PaymentOrder } from './financial';

export type AppointmentStatus =
  | 'scheduled'   // Agendado
  | 'confirmed'   // Confirmado
  | 'in_progress' // Em atendimento
  | 'completed'   // Concluído
  | 'canceled'    // Cancelado
  | 'no_show';    // Não compareceu

export type AnamnesisCardStatus = 'up_to_date' | 'pending' | 'expired' | 'risk_alert';

export interface ClientAnamnesisBadge {
  formId?: string;
  status: AnamnesisCardStatus;
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  hasAllergiesAlert: boolean;
  filledAt?: string;
  version?: number;
  templateTitle?: string;
}

export interface Appointment {
  id: string;
  tenant_id: string;
  client_id: string;
  service_id: string;
  professional_id: string;
  start_time: string; // ISO string TIMESTAMPTZ
  end_time: string;   // ISO string TIMESTAMPTZ
  price: number;
  status: AppointmentStatus;
  notes: string | null;
  checked_in_at?: string | null;
  confirmed_via_whatsapp?: boolean;
  confirmed_at?: string | null;
  confirmation_source?: string | null;
  confirmation_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  client?: Client;
  service?: Service;
  professional?: Professional;
  anamnesisBadge?: ClientAnamnesisBadge;
  paymentOrder?: PaymentOrder | null;
}

export interface AppointmentFormData {
  id?: string;
  client_id: string;
  service_id: string;
  professional_id: string;
  date: string;       // "YYYY-MM-DD"
  start_time: string; // "HH:MM"
  status?: AppointmentStatus;
  notes?: string;
}

export const APPOINTMENT_STATUS_MAP: Record<
  AppointmentStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  scheduled: {
    label: 'Agendado',
    bg: 'bg-blue-50 dark:bg-blue-950/50',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  confirmed: {
    label: 'Confirmado',
    bg: 'bg-emerald-50 dark:bg-emerald-950/50',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  in_progress: {
    label: 'Em Atendimento',
    bg: 'bg-amber-50 dark:bg-amber-950/50',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  completed: {
    label: 'Concluído',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-300',
    border: 'border-zinc-200 dark:border-zinc-700',
  },
  canceled: {
    label: 'Cancelado',
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-900',
  },
  no_show: {
    label: 'Não Compareceu',
    bg: 'bg-zinc-100 dark:bg-zinc-900',
    text: 'text-zinc-500',
    border: 'border-zinc-200 dark:border-zinc-800',
  },
};
