export type ClientStatus = 'active' | 'inactive';

export interface ClientAddress {
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  full_name: string;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  cpf: string | null;
  address: ClientAddress | null;
  notes: string | null;
  status: ClientStatus;
  created_at: string;
  updated_at: string;
}

export interface ClientFormData {
  id?: string;
  full_name: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  cpf?: string;
  address?: ClientAddress;
  notes?: string;
  status: ClientStatus;
}

// ---------------------------------------------------------------------------
// Modelagem do Histórico 360º do Cliente (Fase 4.2.1)
// ---------------------------------------------------------------------------

export type TimelineItemType = 'appointment' | 'payment' | 'anamnesis_update';

export interface ClientTimelineAppointmentItem {
  type: 'appointment';
  id: string;
  date: string;
  serviceName: string;
  professionalName: string;
  price: number;
  status: string;
  checkedInAt: string | null;
  notes: string | null;
  paymentStatus: 'pending' | 'partially_paid' | 'paid' | 'canceled' | 'none';
  paidAmount: number;
  balanceDue: number;
}

export interface ClientTimelinePaymentItem {
  type: 'payment';
  id: string;
  date: string;
  orderId: string;
  appointmentId: string | null;
  serviceName?: string;
  amount: number;
  method: string;
  status: string;
  recordedBy?: string;
}

export interface ClientTimelineAnamnesisItem {
  type: 'anamnesis_update';
  id: string;
  date: string;
  version: number;
  templateTitle?: string;
  status: string;
  hasAllergiesAlert: boolean;
}

export type ClientTimelineItem =
  | ClientTimelineAppointmentItem
  | ClientTimelinePaymentItem
  | ClientTimelineAnamnesisItem;

export interface ClientMetricsSummary {
  totalAppointments: number;
  completedAppointments: number;
  canceledAppointments: number;
  noShowAppointments: number;
  attendanceRatePercentage: number; // taxa de comparecimento
  totalSpentLTV: number;           // Lifetime Value total pago
  totalPendingBalance: number;     // Saldo devedor total em aberto
  averageTicket: number;           // Ticket médio de atendimentos concluídos
  anamnesisBadge: {
    status: 'up_to_date' | 'pending' | 'expired' | 'risk_alert';
    label: string;
    hasAllergiesAlert: boolean;
    filledAt?: string;
  };
}

export interface Client360History {
  client: Client;
  metrics: ClientMetricsSummary;
  timeline: ClientTimelineItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
  };
}
