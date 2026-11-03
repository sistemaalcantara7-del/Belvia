import { createClient } from '@supabase/supabase-js';
import { PlanType } from '@/types/tenant';
import { checkTenantSubscriptionValidity } from '@/lib/plans/entitlements';

export interface ZeluniaTenantUsage {
  active_professionals_count: number;
  completed_appointments_count: number;
  clients_total_count: number;
}

export interface ZeluniaAiTelemetry {
  tokens_consumed_total: number;
  estimated_cost_usd: number;
  models_used: string[];
}

export interface ZeluniaTenantFinancial {
  mrr_current: number;
  billed_period: number;
  received_period: number;
  overdue_balance: number;
}

export interface ZeluniaTenantSubscriptionDetails {
  plan: PlanType;
  lifecycle_status: 'trial' | 'active' | 'overdue' | 'suspended' | 'canceled';
  is_trial: boolean;
  is_active_paying: boolean;
  is_trial_expired: boolean;
  is_delinquent: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  has_asaas_integration: boolean;
  payment_method_last_invoice?: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED' | null;
}

export interface ZeluniaTenantPayload {
  external_tenant_id: string;
  financial: ZeluniaTenantFinancial;
  usage_aggregated: ZeluniaTenantUsage;
  ai_telemetry: ZeluniaAiTelemetry | null;
  subscription_details?: ZeluniaTenantSubscriptionDetails;
}

export interface ZeluniaGlobalMetrics {
  total_tenants: number;
  trial_active_count: number;
  trial_expired_count: number;
  active_paying_count: number;
  delinquent_count: number; // Inadimplentes (overdue ou grace period)
  canceled_count: number;
  conversions_total_count: number; // Tenants que saíram do trial e ativaram assinatura
  mrr_total: number;
  billed_period_total: number;
  received_period_total: number;
  overdue_balance_total: number;
  mrr_by_plan: {
    essential: number;
    smart: number;
  };
}

export interface ZeluniaTelemetryResponse {
  product_slug: 'zelunia';
  reference_date: string; // YYYY-MM-DD
  generated_at: string;   // ISO 8601
  system_status: {
    health: 'operational' | 'degraded' | 'maintenance' | 'offline';
    version: string;
    uptime_pct_last_30d: number;
  };
  global_metrics?: ZeluniaGlobalMetrics;
  tenants_data: ZeluniaTenantPayload[];
}

function getServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configurações de banco de dados ausentes para telemetria M2M.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Coleta e agrega as métricas reais do ZELUNIA para a data de referência solicitada.
 * NUNCA expõe nomes de clientes, telefones, prontuários, dados de anamnese ou PII.
 */
export async function getAggregatedTelemetry(referenceDate: string): Promise<ZeluniaTelemetryResponse> {
  const supabase = getServiceRoleSupabaseClient();

  // Define os limites do período mensal da reference_date (YYYY-MM-DD)
  const ref = new Date(`${referenceDate}T00:00:00Z`);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth(); // 0-indexed

  const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)).toISOString();

  // 1. Consulta Tenants
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, plan, status, created_at');

  if (tenantsError) {
    throw new Error(`Falha ao consultar tenants: ${tenantsError.message}`);
  }

  const activeTenants = tenants || [];
  const tenantIds = activeTenants.map((t) => t.id);

  if (tenantIds.length === 0) {
    return {
      product_slug: 'zelunia',
      reference_date: referenceDate,
      generated_at: new Date().toISOString(),
      system_status: {
        health: 'operational',
        version: '1.1.0',
        uptime_pct_last_30d: 99.9,
      },
      global_metrics: {
        total_tenants: 0,
        trial_active_count: 0,
        trial_expired_count: 0,
        active_paying_count: 0,
        delinquent_count: 0,
        canceled_count: 0,
        conversions_total_count: 0,
        mrr_total: 0,
        billed_period_total: 0,
        received_period_total: 0,
        overdue_balance_total: 0,
        mrr_by_plan: {
          essential: 0,
          smart: 0,
        },
      },
      tenants_data: [],
    };
  }

  // 2. Consulta Assinaturas SaaS (MRR Contratado por Tenant, Asaas IDs e Ciclo de Vida)
  const { data: subscriptions } = await supabase
    .from('saas_subscriptions')
    .select('tenant_id, amount, status, plan, trial_ends_at, current_period_end, grace_period_days, asaas_customer_id, asaas_subscription_id, last_payment_at')
    .in('tenant_id', tenantIds);

  interface SubRow {
    tenant_id: string;
    amount: number;
    status: string;
    plan: PlanType;
    trial_ends_at: string | null;
    current_period_end: string | null;
    grace_period_days: number | null;
    asaas_customer_id: string | null;
    asaas_subscription_id: string | null;
    last_payment_at: string | null;
  }

  const subByTenant = new Map<string, SubRow>();
  subscriptions?.forEach((s) => {
    subByTenant.set(s.tenant_id, {
      tenant_id: s.tenant_id,
      amount: Number(s.amount) || 0,
      status: s.status,
      plan: s.plan as PlanType,
      trial_ends_at: s.trial_ends_at,
      current_period_end: s.current_period_end,
      grace_period_days: s.grace_period_days,
      asaas_customer_id: s.asaas_customer_id,
      asaas_subscription_id: s.asaas_subscription_id,
      last_payment_at: s.last_payment_at,
    });
  });

  // 3. Consulta Faturas SaaS do Mês de Referência (Faturado, Recebido, Vencido)
  const { data: invoices } = await supabase
    .from('saas_invoices')
    .select('tenant_id, amount, status, due_date, paid_at, billing_type')
    .in('tenant_id', tenantIds)
    .gte('due_date', startOfMonth.slice(0, 10))
    .lte('due_date', endOfMonth.slice(0, 10));

  const financialByTenant = new Map<
    string,
    { billed: number; received: number; overdue: number; lastBillingType?: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED' }
  >();

  invoices?.forEach((inv) => {
    const current = financialByTenant.get(inv.tenant_id) || { billed: 0, received: 0, overdue: 0 };
    const amt = Number(inv.amount) || 0;
    current.billed += amt;

    if (inv.status === 'paid') {
      current.received += amt;
    } else if (inv.status === 'overdue') {
      current.overdue += amt;
    }
    if (inv.billing_type) {
      current.lastBillingType = inv.billing_type as 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';
    }

    financialByTenant.set(inv.tenant_id, current);
  });

  // 4. Consulta Profissionais Ativos por Tenant
  const { data: professionals } = await supabase
    .from('professionals')
    .select('tenant_id, id')
    .in('tenant_id', tenantIds)
    .eq('is_active', true);

  const profCountByTenant = new Map<string, number>();
  professionals?.forEach((p) => {
    profCountByTenant.set(p.tenant_id, (profCountByTenant.get(p.tenant_id) || 0) + 1);
  });

  // 5. Consulta Total de Clientes Cadastrados por Tenant
  const { data: clients } = await supabase
    .from('clients')
    .select('tenant_id, id')
    .in('tenant_id', tenantIds);

  const clientCountByTenant = new Map<string, number>();
  clients?.forEach((c) => {
    clientCountByTenant.set(c.tenant_id, (clientCountByTenant.get(c.tenant_id) || 0) + 1);
  });

  // 6. Consulta Agendamentos Concluídos no Período (Mês da data de referência)
  const { data: appointments } = await supabase
    .from('appointments')
    .select('tenant_id, id')
    .in('tenant_id', tenantIds)
    .eq('status', 'completed')
    .gte('start_time', startOfMonth)
    .lte('start_time', endOfMonth);

  const completedAppByTenant = new Map<string, number>();
  appointments?.forEach((a) => {
    completedAppByTenant.set(a.tenant_id, (completedAppByTenant.get(a.tenant_id) || 0) + 1);
  });

  // 7. Consulta Consumo Real de IA por Tenant no Período
  const { data: aiLogs } = await supabase
    .from('ai_usage_logs')
    .select('tenant_id, total_tokens, estimated_cost_usd, model')
    .in('tenant_id', tenantIds)
    .gte('created_at', startOfMonth)
    .lte('created_at', endOfMonth);

  const aiByTenant = new Map<
    string,
    { tokens: number; costUsd: number; models: Set<string> }
  >();

  aiLogs?.forEach((log) => {
    const current = aiByTenant.get(log.tenant_id) || {
      tokens: 0,
      costUsd: 0,
      models: new Set<string>(),
    };
    current.tokens += Number(log.total_tokens) || 0;
    current.costUsd += Number(log.estimated_cost_usd) || 0;
    if (log.model) {
      current.models.add(log.model);
    }
    aiByTenant.set(log.tenant_id, current);
  });

  // 8. Agregações Globais de Telemetria Financeira e de Ciclo de Vida
  let trialActiveCount = 0;
  let trialExpiredCount = 0;
  let activePayingCount = 0;
  let delinquentCount = 0;
  let canceledCount = 0;
  let conversionsCount = 0;
  let mrrTotal = 0;
  let billedTotal = 0;
  let receivedTotal = 0;
  let overdueTotal = 0;
  let mrrEssential = 0;
  let mrrSmart = 0;

  // 9. Montagem do payload padronizado por Tenant preservando compatibilidade
  const tenantsPayload: ZeluniaTenantPayload[] = activeTenants.map((t) => {
    const sub = subByTenant.get(t.id);
    const fin = financialByTenant.get(t.id) || { billed: 0, received: 0, overdue: 0 };
    const ai = aiByTenant.get(t.id);

    // Valida vigência oficial conforme regras canônicas de entitlements
    const validity = checkTenantSubscriptionValidity({
      tenantStatus: t.status,
      tenantCreatedAt: t.created_at,
      subscription: sub ? {
        status: sub.status,
        trial_ends_at: sub.trial_ends_at,
        current_period_end: sub.current_period_end,
        grace_period_days: sub.grace_period_days,
      } : null,
    });

    const isTrial = validity.status === 'trial';
    const isTrialExpired = validity.isTrialExpired;
    const isActivePaying = validity.status === 'active';
    const isDelinquent = validity.status === 'overdue' || (!validity.isValid && sub?.status === 'overdue');
    const isCanceled = t.status === 'suspended' && sub?.status === 'canceled';

    // Contabiliza agregados
    if (isTrial) trialActiveCount++;
    if (isTrialExpired) trialExpiredCount++;
    if (isActivePaying) activePayingCount++;
    if (isDelinquent) delinquentCount++;
    if (isCanceled) canceledCount++;

    // Conversão: tenant possui assinatura ativa paga ou teve histórico de pagamento
    if (isActivePaying || sub?.last_payment_at) {
      conversionsCount++;
    }

    // MRR: se tiver assinatura ativa, utiliza amount, senão 0
    const mrr = isActivePaying && sub ? sub.amount : 0;
    mrrTotal += mrr;
    billedTotal += fin.billed;
    receivedTotal += fin.received;
    overdueTotal += fin.overdue;

    const currentPlan: PlanType = (sub?.plan || t.plan || 'smart') as PlanType;
    if (isActivePaying) {
      if (currentPlan === 'essential') {
        mrrEssential += mrr;
      } else {
        mrrSmart += mrr;
      }
    }

    const aiTelemetry: ZeluniaAiTelemetry | null = ai
      ? {
          tokens_consumed_total: ai.tokens,
          estimated_cost_usd: Number(ai.costUsd.toFixed(6)),
          models_used: Array.from(ai.models),
        }
      : null;

    const subDetails: ZeluniaTenantSubscriptionDetails = {
      plan: currentPlan,
      lifecycle_status: (sub?.status as ZeluniaTenantSubscriptionDetails['lifecycle_status']) || (isTrial ? 'trial' : 'suspended'),
      is_trial: isTrial,
      is_active_paying: isActivePaying,
      is_trial_expired: isTrialExpired,
      is_delinquent: isDelinquent,
      trial_ends_at: sub?.trial_ends_at || null,
      current_period_end: sub?.current_period_end || null,
      has_asaas_integration: !!(sub?.asaas_customer_id || sub?.asaas_subscription_id),
      payment_method_last_invoice: fin.lastBillingType || null,
    };

    return {
      external_tenant_id: t.id,
      financial: {
        mrr_current: Number(mrr.toFixed(2)),
        billed_period: Number(fin.billed.toFixed(2)),
        received_period: Number(fin.received.toFixed(2)),
        overdue_balance: Number(fin.overdue.toFixed(2)),
      },
      usage_aggregated: {
        active_professionals_count: profCountByTenant.get(t.id) || 0,
        completed_appointments_count: completedAppByTenant.get(t.id) || 0,
        clients_total_count: clientCountByTenant.get(t.id) || 0,
      },
      ai_telemetry: aiTelemetry,
      subscription_details: subDetails,
    };
  });

  return {
    product_slug: 'zelunia',
    reference_date: referenceDate,
    generated_at: new Date().toISOString(),
    system_status: {
      health: 'operational',
      version: '1.1.0',
      uptime_pct_last_30d: 99.9,
    },
    global_metrics: {
      total_tenants: activeTenants.length,
      trial_active_count: trialActiveCount,
      trial_expired_count: trialExpiredCount,
      active_paying_count: activePayingCount,
      delinquent_count: delinquentCount,
      canceled_count: canceledCount,
      conversions_total_count: conversionsCount,
      mrr_total: Number(mrrTotal.toFixed(2)),
      billed_period_total: Number(billedTotal.toFixed(2)),
      received_period_total: Number(receivedTotal.toFixed(2)),
      overdue_balance_total: Number(overdueTotal.toFixed(2)),
      mrr_by_plan: {
        essential: Number(mrrEssential.toFixed(2)),
        smart: Number(mrrSmart.toFixed(2)),
      },
    },
    tenants_data: tenantsPayload,
  };
}
