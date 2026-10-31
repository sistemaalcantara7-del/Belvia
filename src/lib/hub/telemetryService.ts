import { createClient } from '@supabase/supabase-js';

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

export interface ZeluniaTenantPayload {
  external_tenant_id: string;
  financial: ZeluniaTenantFinancial;
  usage_aggregated: ZeluniaTenantUsage;
  ai_telemetry: ZeluniaAiTelemetry | null;
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
    .select('id, plan, status');

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
        version: '1.0.0',
        uptime_pct_last_30d: 99.9,
      },
      tenants_data: [],
    };
  }

  // 2. Consulta Assinaturas SaaS (MRR Contratado por Tenant)
  const { data: subscriptions } = await supabase
    .from('saas_subscriptions')
    .select('tenant_id, amount, status, plan')
    .in('tenant_id', tenantIds);

  const subByTenant = new Map<string, { amount: number; status: string }>();
  subscriptions?.forEach((s) => {
    subByTenant.set(s.tenant_id, {
      amount: Number(s.amount) || 0,
      status: s.status,
    });
  });

  // 3. Consulta Faturas SaaS do Mês de Referência (Faturado, Recebido, Vencido)
  const { data: invoices } = await supabase
    .from('saas_invoices')
    .select('tenant_id, amount, status, due_date, paid_at')
    .in('tenant_id', tenantIds)
    .gte('due_date', startOfMonth.slice(0, 10))
    .lte('due_date', endOfMonth.slice(0, 10));

  const financialByTenant = new Map<
    string,
    { billed: number; received: number; overdue: number }
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

  // 8. Montagem do payload padronizado por Tenant
  const tenantsPayload: ZeluniaTenantPayload[] = activeTenants.map((t) => {
    const sub = subByTenant.get(t.id);
    const fin = financialByTenant.get(t.id) || { billed: 0, received: 0, overdue: 0 };
    const ai = aiByTenant.get(t.id);

    // MRR: se tiver assinatura ativa, utiliza amount, senão 0
    const mrr = sub?.status === 'active' ? sub.amount : 0;

    const aiTelemetry: ZeluniaAiTelemetry | null = ai
      ? {
          tokens_consumed_total: ai.tokens,
          estimated_cost_usd: Number(ai.costUsd.toFixed(6)),
          models_used: Array.from(ai.models),
        }
      : null;

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
    };
  });

  return {
    product_slug: 'zelunia',
    reference_date: referenceDate,
    generated_at: new Date().toISOString(),
    system_status: {
      health: 'operational',
      version: '1.0.0',
      uptime_pct_last_30d: 99.9,
    },
    tenants_data: tenantsPayload,
  };
}
