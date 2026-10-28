import { PlanType } from './tenant';

export type SaasSubscriptionStatus =
  | 'trial'
  | 'active'
  | 'overdue'
  | 'suspended'
  | 'canceled';

export type SaasInvoiceStatus =
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'refunded'
  | 'canceled';

export interface SaasSubscription {
  id: string;
  tenant_id: string;
  plan: PlanType;
  status: SaasSubscriptionStatus;
  billing_cycle: 'monthly';
  amount: number;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  current_period_start: string;
  current_period_end: string;
  grace_period_days: number;
  trial_ends_at: string | null;
  canceled_at: string | null;
  cancellation_reason: string | null;
  last_payment_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaasInvoice {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  asaas_payment_id: string;
  invoice_number: string | null;
  amount: number;
  status: SaasInvoiceStatus;
  billing_type: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';
  due_date: string;
  paid_at: string | null;
  invoice_url: string | null;
  bank_slip_url: string | null;
  pix_qr_code: string | null;
  created_at: string;
}

export interface SubscriptionOverviewData {
  subscription: SaasSubscription;
  invoices: SaasInvoice[];
  tenantPlan: PlanType;
  canManage: boolean;
  isSandBox: boolean;
}
