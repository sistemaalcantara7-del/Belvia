export type CashRegisterStatus = 'open' | 'closed';
export type PaymentMethodType = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'bank_transfer' | 'other';
export type PaymentOrderStatus = 'pending' | 'partially_paid' | 'paid' | 'canceled';
export type PaymentTransactionStatus = 'confirmed' | 'refunded';
export type CommissionStatus = 'forecast' | 'payable' | 'paid' | 'canceled';
export type CashMovementType = 'supply' | 'bleed' | 'expense';

export interface ProfessionalCommission {
  id: string;
  tenant_id: string;
  appointment_id: string;
  professional_id: string;
  service_id: string;
  base_amount: number;
  rate_percentage: number;
  commission_amount: number;
  status: CommissionStatus;
  settled_at: string | null;
  settled_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  professional?: {
    id: string;
    full_name: string;
    specialty: string;
  };
  service?: {
    id: string;
    name: string;
  };
  appointment?: {
    id: string;
    start_time: string;
    status: string;
    client?: {
      id: string;
      full_name: string;
    };
  };
  settler?: {
    id: string;
    full_name: string;
  };
}

export const COMMISSION_STATUS_MAP: Record<
  CommissionStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  forecast: {
    label: 'Prevista',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-300',
    border: 'border-zinc-300 dark:border-zinc-700',
    desc: 'Procedimento agendado ou em andamento',
  },
  payable: {
    label: 'Devida (A Pagar)',
    bg: 'bg-amber-50 dark:bg-amber-950/60',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
    desc: 'Procedimento concluído e quitado, aguardando repasse',
  },
  paid: {
    label: 'Paga (Repassada)',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
    desc: 'Comissão quitada e repassada ao profissional',
  },
  canceled: {
    label: 'Cancelada',
    bg: 'bg-red-50 dark:bg-red-950/60',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-300 dark:border-red-800',
    desc: 'Atendimento cancelado ou estornado',
  },
};

export interface PaymentOrder {
  id: string;
  tenant_id: string;
  appointment_id: string | null;
  client_id: string;
  gross_amount: number;
  discount_amount: number;
  addition_amount: number;
  net_amount: number;
  paid_amount: number;
  balance_due: number;
  status: PaymentOrderStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  transactions?: PaymentTransaction[];
}

export interface PaymentTransaction {
  id: string;
  tenant_id: string;
  payment_order_id: string;
  cash_register_id: string | null;
  amount: number;
  method: PaymentMethodType;
  installments: number;
  status: PaymentTransactionStatus;
  refunded_at: string | null;
  refund_reason: string | null;
  received_by: string;
  paid_at: string;
  created_at: string;
  receiver?: {
    id: string;
    full_name: string;
  };
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  cash: 'Dinheiro (Espécie)',
  pix: 'Pix',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  bank_transfer: 'Transferência Bancária',
  other: 'Outro Meio',
};

export const PAYMENT_ORDER_STATUS_MAP: Record<
  PaymentOrderStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: 'Pendente',
    bg: 'bg-zinc-100 dark:bg-zinc-800',
    text: 'text-zinc-700 dark:text-zinc-300',
    border: 'border-zinc-300 dark:border-zinc-700',
  },
  partially_paid: {
    label: 'Parcialmente Pago',
    bg: 'bg-amber-50 dark:bg-amber-950/60',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-800',
  },
  paid: {
    label: 'Pago',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-300 dark:border-emerald-800',
  },
  canceled: {
    label: 'Cancelado',
    bg: 'bg-red-50 dark:bg-red-950/60',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-300 dark:border-red-800',
  },
};

export interface CashRegister {
  id: string;
  tenant_id: string;
  opened_by: string;
  closed_by: string | null;
  terminal_name: string;
  initial_balance: number;
  closing_balance: number | null;
  system_calculated_balance: number;
  difference: number;
  status: CashRegisterStatus;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  opener?: {
    id: string;
    full_name: string;
    email: string;
  };
  closer?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export interface CashMovement {
  id: string;
  tenant_id: string;
  cash_register_id: string;
  type: CashMovementType;
  amount: number;
  category: string;
  description: string;
  performed_by: string;
  created_at: string;
  performer?: {
    id: string;
    full_name: string;
  };
}

export interface CashRegisterSummary {
  register: CashRegister;
  movements: CashMovement[];
  initialBalance: number;
  totalSupplies: number;
  totalBleeds: number;
  totalExpenses: number;
  totalCashReceived: number;
  expectedBalance: number; // initial + supplies + cashReceived - bleeds - expenses
  // Totais informativos que NÃO compõem a gaveta física:
  totalPixReceived: number;
  totalCardReceived: number;
  totalOtherReceived: number;
}
