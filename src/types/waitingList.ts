import { Client } from './clients';
import { Service } from './services';
import { Professional } from './professionals';

export type WaitingListPriority = 'low' | 'normal' | 'high' | 'urgent';

export type WaitingListStatus = 'waiting' | 'offered' | 'booked' | 'expired' | 'canceled';

export type WaitingOfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface WaitingListItem {
  id: string;
  tenant_id: string;
  client_id: string;
  service_id: string;
  professional_id: string | null;
  preferred_date_start: string;
  preferred_date_end: string;
  preferred_time_start: string;
  preferred_time_end: string;
  preferred_days_of_week: number[];
  priority: WaitingListPriority;
  status: WaitingListStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  service?: Service;
  professional?: Professional | null;
}

export interface WaitingListCandidate {
  waiting_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  client_whatsapp: string | null;
  service_name: string;
  preferred_professional_name: string | null;
  priority: WaitingListPriority;
  notes: string | null;
  created_at: string;
}

export interface WaitingListOffer {
  id: string;
  tenant_id: string;
  waiting_list_id: string;
  professional_id: string;
  start_time: string;
  end_time: string;
  status: WaitingOfferStatus;
  channel: string;
  offered_by: string | null;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  response_notes: string | null;
  appointment_id: string | null;
  created_at: string;
  professional?: Professional;
}

export interface CreateWaitingListInput {
  client_id: string;
  service_id: string;
  professional_id?: string | null;
  preferred_date_start: string;
  preferred_date_end: string;
  preferred_time_start?: string;
  preferred_time_end?: string;
  preferred_days_of_week?: number[];
  priority?: WaitingListPriority;
  notes?: string;
}

export const WAITING_LIST_PRIORITY_MAP: Record<
  WaitingListPriority,
  { label: string; bg: string; text: string; border: string }
> = {
  urgent: {
    label: 'Urgente',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
  high: {
    label: 'Alta',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  normal: {
    label: 'Normal',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  low: {
    label: 'Baixa',
    bg: 'bg-zinc-50',
    text: 'text-zinc-600',
    border: 'border-zinc-200',
  },
};

export const WAITING_LIST_STATUS_MAP: Record<
  WaitingListStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  waiting: {
    label: 'Aguardando Vaga',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  offered: {
    label: 'Horário Ofertado',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  booked: {
    label: 'Atendido (Agendado)',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  expired: {
    label: 'Expirado',
    bg: 'bg-zinc-100',
    text: 'text-zinc-500',
    border: 'border-zinc-200',
  },
  canceled: {
    label: 'Cancelado',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    border: 'border-rose-200',
  },
};
