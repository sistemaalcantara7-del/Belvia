import { createClient } from '@supabase/supabase-js';
import { PlanType, TenantStatus } from '@/types/tenant';
import { checkTenantSubscriptionValidity } from '@/lib/plans/entitlements';
import { PLAN_CONFIGS } from '@/types/plans';
import { revalidatePath } from 'next/cache';

export interface HubAdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: PlanType;
  created_at: string;
  lifecycle: {
    status: 'trial' | 'active' | 'overdue' | 'suspended' | 'canceled';
    is_valid: boolean;
    is_trial: boolean;
    is_trial_expired: boolean;
    trial_ends_at: string | null;
    current_period_end: string | null;
    grace_period_days: number;
    amount_monthly: number;
  };
  asaas: {
    has_customer: boolean;
    has_subscription: boolean;
    asaas_customer_id: string | null;
    asaas_subscription_id: string | null;
  };
}

export interface HubAdminTenantsListResponse {
  tenants: HubAdminTenantSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface HubAdminTenantInvoiceSummary {
  id: string;
  asaas_payment_id: string;
  amount: number;
  status: string;
  billing_type: string;
  due_date: string;
  paid_at: string | null;
  created_at: string;
}

export interface HubAdminTenantDetailsResponse {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    plan: PlanType;
    created_at: string;
    updated_at?: string;
  };
  subscription: {
    id?: string;
    plan: PlanType;
    status: 'trial' | 'active' | 'overdue' | 'suspended' | 'canceled';
    billing_cycle: string;
    amount: number;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    grace_period_days: number;
    last_payment_at: string | null;
    canceled_at: string | null;
    cancellation_reason: string | null;
    entitlement_validity: {
      is_valid: boolean;
      is_trial_expired: boolean;
      calculated_status: string;
    };
  };
  asaas: {
    customer_id: string | null;
    subscription_id: string | null;
    customer_created: boolean;
    subscription_created: boolean;
  };
  usage_summary: {
    active_professionals_count: number;
    clients_total_count: number;
    completed_appointments_count: number;
  };
  recent_invoices: HubAdminTenantInvoiceSummary[];
}

export interface HubAdminMutationResult {
  success: boolean;
  idempotent?: boolean;
  code?: string;
  message?: string;
  error?: string;
  tenant_id?: string;
  tenant_slug?: string;
  previous_state?: Record<string, unknown>;
  current_state?: Record<string, unknown>;
  executed_at?: string;
}

/**
 * Consulta ou registra resultado de idempotência distribuída baseada em intenção.
 * Garante que requisições com a mesma intenção (mesmo que com nonces diferentes)
 * retornem a mesma resposta e não reexecutem a mutação de domínio.
 */
export async function getOrSetIntentIdempotency(params: {
  supabase: import('@supabase/supabase-js').SupabaseClient;
  intentKey: string;
  tenantId: string;
  operation: string;
  execute: () => Promise<HubAdminMutationResult>;
}): Promise<HubAdminMutationResult> {
  const { supabase, intentKey, tenantId, operation, execute } = params;

  try {
    // 1. Tenta recuperar intenção prévia
    const { data: cached } = await supabase
      .from('hub_admin_idempotency_keys')
      .select('response_payload, status_code, expires_at')
      .eq('intent_key', intentKey)
      .maybeSingle();

    if (cached?.response_payload) {
      const payload = cached.response_payload as unknown as HubAdminMutationResult;
      return {
        ...payload,
        idempotent: true,
      };
    }
  } catch {
    // Se a tabela não estiver criada ou conexão falhar na consulta, prossegue para execução
  }

  // 2. Executa a mutação de domínio
  const result = await execute();

  // 3. Se a mutação teve sucesso ou bloqueio esperado, armazena o registro de intenção por 24h
  if (result.success || result.code === 'FINANCIAL_SYNC_REQUIRED') {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('hub_admin_idempotency_keys').upsert({
        intent_key: intentKey,
        tenant_id: tenantId,
        operation,
        response_payload: result,
        expires_at: expiresAt,
      });
    } catch {
      // Ignora erro de gravação de cache distribuído de idempotência se a tabela não estiver criada
    }
  }

  return result;
}

export function getServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente para o Gateway Administrativo M2M.');
  }

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor. O Gateway Administrativo M2M exige chave de serviço com bypass de RLS para persistência de nonces, auditoria e operações de tenant.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Listagem paginada de tenants corporativos para o Alcântara Hub com filtros de busca, plano e status
 * NUNCA expõe dados clínicos, anamneses, nomes de clientes atendidos ou dados protegidos
 */
export async function listHubAdminTenants(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  plan?: string;
}): Promise<HubAdminTenantsListResponse> {
  const supabase = getServiceRoleSupabaseClient();
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  // Consulta base com contagem total
  let query = supabase
    .from('tenants')
    .select('id, name, slug, plan, status, created_at', { count: 'exact' });

  if (params.search) {
    const term = `%${params.search}%`;
    query = query.or(`name.ilike.${term},slug.ilike.${term}`);
  }

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.plan) {
    query = query.eq('plan', params.plan);
  }

  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data: tenants, count, error } = await query;
  if (error) {
    throw new Error(`Erro ao listar estabelecimentos no Hub Admin: ${error.message}`);
  }

  const tenantList = tenants || [];
  const tenantIds = tenantList.map((t) => t.id);

  interface TenantSubRow {
    tenant_id: string;
    plan: PlanType;
    status: 'trial' | 'active' | 'overdue' | 'suspended' | 'canceled';
    amount: number;
    trial_ends_at: string | null;
    current_period_end: string | null;
    grace_period_days: number | null;
    asaas_customer_id: string | null;
    asaas_subscription_id: string | null;
  }

  // Busca assinaturas SaaS vinculadas aos estabelecimentos
  const subscriptionsMap = new Map<string, TenantSubRow>();
  if (tenantIds.length > 0) {
    const { data: subs } = await supabase
      .from('saas_subscriptions')
      .select('tenant_id, plan, status, amount, trial_ends_at, current_period_end, grace_period_days, asaas_customer_id, asaas_subscription_id')
      .in('tenant_id', tenantIds);

    subs?.forEach((s) => subscriptionsMap.set(s.tenant_id, s as unknown as TenantSubRow));
  }

  const formattedTenants: HubAdminTenantSummary[] = tenantList.map((t) => {
    const sub = subscriptionsMap.get(t.id);
    const planType: PlanType = (sub?.plan || t.plan || 'smart') as PlanType;
    const planConfig = PLAN_CONFIGS[planType] || PLAN_CONFIGS.essential;

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
    const trialEndsAt = sub?.trial_ends_at || (t.created_at ? new Date(new Date(t.created_at).getTime() + 7 * 86400000).toISOString() : null);

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      plan: planType,
      created_at: t.created_at,
      lifecycle: {
        status: (sub?.status || (isTrial ? 'trial' : 'suspended')) as HubAdminTenantSummary['lifecycle']['status'],
        is_valid: validity.isValid,
        is_trial: isTrial,
        is_trial_expired: validity.isTrialExpired,
        trial_ends_at: trialEndsAt,
        current_period_end: sub?.current_period_end || null,
        grace_period_days: sub?.grace_period_days ?? 5,
        amount_monthly: Number(sub?.amount) || planConfig.priceMonthly,
      },
      asaas: {
        has_customer: !!sub?.asaas_customer_id,
        has_subscription: !!sub?.asaas_subscription_id,
        asaas_customer_id: sub?.asaas_customer_id || null,
        asaas_subscription_id: sub?.asaas_subscription_id || null,
      },
    };
  });

  const total = count || 0;
  return {
    tenants: formattedTenants,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Detalhes corporativos profundos de um estabelecimento para a operação central do Hub
 * Inclui assinatura, status Asaas, histórico de faturas e métricas agregadas de uso
 */
export async function getHubAdminTenantDetails(tenantId: string): Promise<HubAdminTenantDetailsResponse | null> {
  const supabase = getServiceRoleSupabaseClient();

  // 1. Busca dados do tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, status, plan, created_at, updated_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (tErr || !tenant) {
    return null;
  }

  // 2. Busca assinatura SaaS e faturas em paralelo
  const [subRes, invoicesRes, profCountRes, clientCountRes, apptCountRes] = await Promise.all([
    supabase
      .from('saas_subscriptions')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    supabase
      .from('saas_invoices')
      .select('id, asaas_payment_id, amount, status, billing_type, due_date, paid_at, created_at')
      .eq('tenant_id', tenantId)
      .order('due_date', { ascending: false })
      .limit(20),
    supabase
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'completed'),
  ]);

  const sub = subRes.data;
  const invoices = invoicesRes.data || [];
  const planType: PlanType = (sub?.plan || tenant.plan || 'smart') as PlanType;
  const planConfig = PLAN_CONFIGS[planType] || PLAN_CONFIGS.essential;

  const validity = checkTenantSubscriptionValidity({
    tenantStatus: tenant.status,
    tenantCreatedAt: tenant.created_at,
    subscription: sub ? {
      status: sub.status,
      trial_ends_at: sub.trial_ends_at,
      current_period_end: sub.current_period_end,
      grace_period_days: sub.grace_period_days,
    } : null,
  });

  const trialEndsAt = sub?.trial_ends_at || (tenant.created_at ? new Date(new Date(tenant.created_at).getTime() + 7 * 86400000).toISOString() : null);

  const formattedInvoices: HubAdminTenantInvoiceSummary[] = invoices.map((inv) => ({
    id: inv.id,
    asaas_payment_id: inv.asaas_payment_id,
    amount: Number(inv.amount) || 0,
    status: inv.status,
    billing_type: inv.billing_type || 'UNDEFINED',
    due_date: inv.due_date,
    paid_at: inv.paid_at || null,
    created_at: inv.created_at,
  }));

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: planType,
      created_at: tenant.created_at,
      updated_at: tenant.updated_at,
    },
    subscription: {
      id: sub?.id,
      plan: planType,
      status: (sub?.status || (validity.status === 'trial' ? 'trial' : 'suspended')) as HubAdminTenantDetailsResponse['subscription']['status'],
      billing_cycle: sub?.billing_cycle || 'monthly',
      amount: Number(sub?.amount) || planConfig.priceMonthly,
      trial_ends_at: trialEndsAt,
      current_period_start: sub?.current_period_start || null,
      current_period_end: sub?.current_period_end || null,
      grace_period_days: sub?.grace_period_days ?? 5,
      last_payment_at: sub?.last_payment_at || null,
      canceled_at: sub?.canceled_at || null,
      cancellation_reason: sub?.cancellation_reason || null,
      entitlement_validity: {
        is_valid: validity.isValid,
        is_trial_expired: validity.isTrialExpired,
        calculated_status: validity.status,
      },
    },
    asaas: {
      customer_id: sub?.asaas_customer_id || null,
      subscription_id: sub?.asaas_subscription_id || null,
      customer_created: !!sub?.asaas_customer_id,
      subscription_created: !!sub?.asaas_subscription_id,
    },
    usage_summary: {
      active_professionals_count: profCountRes.count || 0,
      clients_total_count: clientCountRes.count || 0,
      completed_appointments_count: apptCountRes.count || 0,
    },
    recent_invoices: formattedInvoices,
  };
}

// ==============================================================================
// OPERAÇÕES ADMINISTRATIVAS M2M (HUB -> ZELUNIA)
// ==============================================================================

/**
 * 1. ATIVAR ASSINATURA (POST /api/v1/hub/admin/tenants/[id]/activate)
 * Concede ou regulariza o acesso ativo do tenant administrativamente por funcionários da Alcântara Sistemas.
 * REGRAS DE DOMÍNIO:
 * - Se já estiver com status 'active' e período válido: idempotente (sem alteração).
 * - Se tenant possui assinatura Asaas recorrente em produção com cobranças pendentes: BLOQUEIA para não
 *   gerar divergência financeira sem conciliação prévia.
 * - Concede período de 30 dias a partir da data atual se current_period_end estiver no passado.
 */
export async function activateTenantSubscriptionAdmin(params: {
  tenantId: string;
  days?: number;
  reason: string;
  operatorId?: string;
}): Promise<HubAdminMutationResult> {
  const { tenantId, days = 30, reason } = params;
  const supabase = getServiceRoleSupabaseClient();

  // 1. Busca dados do tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, status, plan, created_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (tErr || !tenant) {
    return { success: false, code: 'TENANT_NOT_FOUND', error: `Estabelecimento '${tenantId}' não localizado.` };
  }

  // 2. Busca assinatura
  const { data: sub } = await supabase
    .from('saas_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // 3. Bloqueio Concreto: não permitir sobreposição não conciliada se houver assinatura Asaas com faturas pendentes/overdue
  if (sub?.asaas_subscription_id && sub.status === 'overdue') {
    const { data: pendingInvoices } = await supabase
      .from('saas_invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'overdue')
      .limit(1);

    if (pendingInvoices && pendingInvoices.length > 0) {
      return {
        success: false,
        code: 'FINANCIAL_SYNC_REQUIRED',
        error: 'Operação bloqueada: o estabelecimento possui faturas vencidas atreladas ao gateway Asaas. Regularize ou cancele a cobrança no gateway antes de forçar ativação manual.',
      };
    }
  }

  // 4. Verificação de Idempotência
  const now = new Date();
  const currentPeriodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const isAlreadyActiveAndValid = sub?.status === 'active' && currentPeriodEnd && currentPeriodEnd > now && tenant.status === 'active';

  if (isAlreadyActiveAndValid) {
    return {
      success: true,
      idempotent: true,
      message: 'Estabelecimento já possui assinatura ativa e vigente. Nenhuma alteração necessária.',
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      current_state: {
        status: 'active',
        plan: sub.plan,
        current_period_end: sub.current_period_end,
      },
    };
  }

  // 5. Calcula novo período de vigência (30 dias padrão ou estende)
  const baseDate = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
  const newPeriodEnd = new Date(baseDate.getTime() + days * 86400000).toISOString();
  const planType: PlanType = (sub?.plan || tenant.plan || 'smart') as PlanType;
  const planConfig = PLAN_CONFIGS[planType] || PLAN_CONFIGS.essential;

  // 6. Atualiza saas_subscriptions e tenants
  const subUpsertPayload = {
    tenant_id: tenant.id,
    plan: planType,
    status: 'active' as const,
    amount: Number(sub?.amount) || planConfig.priceMonthly,
    current_period_start: now.toISOString(),
    current_period_end: newPeriodEnd,
    grace_period_days: sub?.grace_period_days ?? 5,
    updated_at: now.toISOString(),
  };

  const { error: subErr } = await supabase
    .from('saas_subscriptions')
    .upsert(subUpsertPayload, { onConflict: 'tenant_id' });

  if (subErr) {
    throw new Error(`Falha ao ativar assinatura no banco: ${subErr.message}`);
  }

  await supabase
    .from('tenants')
    .update({ status: 'active', updated_at: now.toISOString() })
    .eq('id', tenant.id);

  try {
    revalidatePath(`/${tenant.slug}`);
    revalidatePath(`/${tenant.slug}/configuracoes`);
  } catch {
    // Revalidação em contexto M2M
  }

  return {
    success: true,
    message: `Assinatura ativada com sucesso por ${days} dias.`,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    previous_state: {
      tenant_status: tenant.status,
      subscription_status: sub?.status || 'none',
      current_period_end: sub?.current_period_end || null,
    },
    current_state: {
      tenant_status: 'active',
      subscription_status: 'active',
      current_period_end: newPeriodEnd,
      plan: planType,
      reason,
    },
    executed_at: now.toISOString(),
  };
}

/**
 * 2. ALTERAR PLANO (POST /api/v1/hub/admin/tenants/[id]/plan)
 * Permite alteração entre 'essential' e 'smart'.
 * REGRAS DE DOMÍNIO:
 * - Validação estrita contra planos aceitos pelo Zelunia ('essential' | 'smart').
 * - Idempotente se o plano já for o mesmo.
 * - Bloqueio de Sincronização: se houver assinatura ativa no Asaas, bloqueia alteração direta via Hub Admin
 *   para evitar dessincronia do valor recorrente no gateway (deve ser feita pelo próprio Zelunia ou webhook).
 */
export async function changeTenantPlanAdmin(params: {
  tenantId: string;
  newPlan: PlanType;
  reason: string;
  operatorId?: string;
}): Promise<HubAdminMutationResult> {
  const { tenantId, newPlan, reason } = params;

  // 1. Validação do plano
  if (newPlan !== 'essential' && newPlan !== 'smart') {
    return {
      success: false,
      code: 'INVALID_PLAN',
      error: `Plano '${newPlan}' inválido. O Zelunia suporta exclusivamente os planos 'essential' e 'smart'.`,
    };
  }

  const targetConfig = PLAN_CONFIGS[newPlan];
  const supabase = getServiceRoleSupabaseClient();

  // 2. Busca tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, status, plan')
    .eq('id', tenantId)
    .maybeSingle();

  if (tErr || !tenant) {
    return { success: false, code: 'TENANT_NOT_FOUND', error: `Estabelecimento '${tenantId}' não localizado.` };
  }

  // 3. Busca assinatura
  const { data: sub } = await supabase
    .from('saas_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // 4. Verificação de Idempotência
  const currentPlan = sub?.plan || tenant.plan;
  if (currentPlan === newPlan) {
    return {
      success: true,
      idempotent: true,
      message: `Estabelecimento já está no plano '${newPlan}'. Nenhuma alteração realizada.`,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      current_state: { plan: newPlan, amount: targetConfig.priceMonthly },
    };
  }

  // 5. Bloqueio Concreto: se o tenant tem assinatura recorrente ativa gerenciada pelo Asaas,
  // não altera sem sincronização financeira (requisito 4: 'Bloquear operações que exigiriam sincronização financeira ainda não implementada')
  if (sub?.asaas_subscription_id && sub.status === 'active') {
    return {
      success: false,
      code: 'FINANCIAL_SYNC_REQUIRED',
      error: 'Operação bloqueada: o estabelecimento possui assinatura ativa com conciliação automática no Asaas. A alteração de plano exigiria atualização de valor de cobrança no gateway, não suportada nesta fase administrativa.',
    };
  }

  // 6. Atualiza plano no Zelunia
  const now = new Date().toISOString();
  await supabase
    .from('tenants')
    .update({ plan: newPlan, updated_at: now })
    .eq('id', tenant.id);

  if (sub) {
    await supabase
      .from('saas_subscriptions')
      .update({ plan: newPlan, amount: targetConfig.priceMonthly, updated_at: now })
      .eq('tenant_id', tenant.id);
  } else {
    await supabase
      .from('saas_subscriptions')
      .insert({
        tenant_id: tenant.id,
        plan: newPlan,
        status: tenant.status === 'active' ? 'active' : 'trial',
        amount: targetConfig.priceMonthly,
        trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      });
  }

  try {
    revalidatePath(`/${tenant.slug}`);
    revalidatePath(`/${tenant.slug}/configuracoes`);
  } catch {
    // Revalidação em contexto M2M
  }

  return {
    success: true,
    message: `Plano alterado para '${targetConfig.name}' (R$ ${targetConfig.priceMonthly.toFixed(2)}/mês).`,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    previous_state: { plan: currentPlan },
    current_state: { plan: newPlan, amount: targetConfig.priceMonthly, reason },
    executed_at: now,
  };
}

/**
 * 3. ALTERAR STATUS (POST /api/v1/hub/admin/tenants/[id]/status)
 * Permite alteração de status operacional entre:
 * - 'active' (ativo)
 * - 'suspended' (suspenso por inadimplência ou decisão administrativa)
 * - 'trial' (redefinição para período de testes de 7 dias)
 * - 'canceled' (cancelamento do cadastro)
 */
export async function changeTenantStatusAdmin(params: {
  tenantId: string;
  newStatus: 'active' | 'suspended' | 'trial' | 'canceled';
  reason: string;
  operatorId?: string;
}): Promise<HubAdminMutationResult> {
  const { tenantId, newStatus, reason } = params;

  const validStatuses = ['active', 'suspended', 'trial', 'canceled'];
  if (!validStatuses.includes(newStatus)) {
    return {
      success: false,
      code: 'INVALID_STATUS',
      error: `Status '${newStatus}' inválido. Valores aceitos: 'active', 'suspended', 'trial', 'canceled'.`,
    };
  }

  const supabase = getServiceRoleSupabaseClient();

  // 1. Busca tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, slug, status, plan, created_at')
    .eq('id', tenantId)
    .maybeSingle();

  if (tErr || !tenant) {
    return { success: false, code: 'TENANT_NOT_FOUND', error: `Estabelecimento '${tenantId}' não localizado.` };
  }

  // 2. Busca assinatura
  const { data: sub } = await supabase
    .from('saas_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // 3. Verificação de Idempotência
  if (tenant.status === newStatus && (!sub || sub.status === newStatus)) {
    return {
      success: true,
      idempotent: true,
      message: `Estabelecimento já possui status '${newStatus}'. Nenhuma alteração realizada.`,
      tenant_id: tenant.id,
      tenant_slug: tenant.slug,
      current_state: { status: newStatus },
    };
  }

  // 4. Bloqueio Concreto: se tentar alterar para 'active' um tenant cancelado ou com Asaas ativo em atraso
  if (newStatus === 'active' && sub?.asaas_subscription_id && sub.status === 'overdue') {
    return {
      success: false,
      code: 'FINANCIAL_SYNC_REQUIRED',
      error: 'Operação bloqueada: o status não pode ser alterado para ativo enquanto houver cobrança pendente vinculada ao gateway Asaas.',
    };
  }

  // 5. Executa transição no domínio
  const now = new Date();
  const updateTenantPayload: { status: TenantStatus; updated_at: string } = {
    status: (newStatus === 'trial' ? 'active' : newStatus) as TenantStatus,
    updated_at: now.toISOString(),
  };

  await supabase
    .from('tenants')
    .update(updateTenantPayload)
    .eq('id', tenant.id);

  if (sub) {
    const subStatusUpdate: Record<string, unknown> = {
      status: newStatus,
      updated_at: now.toISOString(),
    };

    if (newStatus === 'trial') {
      subStatusUpdate.trial_ends_at = new Date(now.getTime() + 7 * 86400000).toISOString();
    } else if (newStatus === 'canceled') {
      subStatusUpdate.canceled_at = now.toISOString();
      subStatusUpdate.cancellation_reason = reason || 'Cancelado via Alcântara Hub';
    }

    await supabase
      .from('saas_subscriptions')
      .update(subStatusUpdate)
      .eq('tenant_id', tenant.id);
  } else {
    const planType: PlanType = tenant.plan || 'smart';
    await supabase
      .from('saas_subscriptions')
      .insert({
        tenant_id: tenant.id,
        plan: planType,
        status: newStatus,
        amount: PLAN_CONFIGS[planType].priceMonthly,
        trial_ends_at: newStatus === 'trial' ? new Date(now.getTime() + 7 * 86400000).toISOString() : null,
      });
  }

  try {
    revalidatePath(`/${tenant.slug}`);
    revalidatePath(`/${tenant.slug}/configuracoes`);
  } catch {
    // Revalidação em contexto M2M
  }

  return {
    success: true,
    message: `Status do estabelecimento alterado para '${newStatus}'.`,
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    previous_state: {
      tenant_status: tenant.status,
      subscription_status: sub?.status || 'none',
    },
    current_state: {
      tenant_status: updateTenantPayload.status,
      subscription_status: newStatus,
      reason,
    },
    executed_at: now.toISOString(),
  };
}
