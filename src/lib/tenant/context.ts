import { createClient } from '@/lib/supabase/server';
import { UserTenantContext, TenantRole, PlanType, TenantStatus } from '@/types/tenant';
import { checkTenantSubscriptionValidity } from '@/lib/plans/entitlements';

/**
 * Obtém e valida o contexto multi-tenant do usuário autenticado no servidor.
 * NUNCA confia em parâmetros fornecidos pelo cliente sem cruzar com a tabela tenant_users.
 * Realiza validação estrita no backend do ciclo de vida da assinatura SaaS (trial e ativa).
 */
export async function getAuthenticatedTenantContext(
  targetTenantSlug?: string
): Promise<UserTenantContext | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Consulta as associações do usuário com tenants ativos
  const query = supabase
    .from('tenant_users')
    .select(`
      tenant_id,
      role,
      status,
      tenants:tenant_id (
        id,
        name,
        slug,
        plan,
        status,
        settings,
        created_at
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active');

  const { data: memberships, error } = await query;

  if (error || !memberships || memberships.length === 0) {
    return null;
  }

  // Tipagem interna do retorno do Supabase join
  interface MembershipRow {
    tenant_id: string;
    role: TenantRole;
    status: string;
    tenants: {
      id: string;
      name: string;
      slug: string;
      plan: PlanType;
      status: string;
      settings: Record<string, unknown> | null;
      created_at?: string;
    } | null;
  }

  const typedMemberships = memberships as unknown as MembershipRow[];

  // Se o slug foi solicitado, valida se o usuário tem membership ativo especificamente nele
  let selected = typedMemberships[0];
  if (targetTenantSlug) {
    const matched = typedMemberships.find(
      (m) => m.tenants && m.tenants.slug === targetTenantSlug
    );
    if (!matched) {
      // Usuário não pertence ou não tem acesso ativo a este tenant
      return null;
    }
    selected = matched;
  }

  // Se o tenant foi cancelado/deletado
  if (!selected.tenants) {
    return null;
  }

  // ── VALIDAÇÃO DE ASSINATURA E TRIAL NO BACKEND ──
  // Busca a assinatura do tenant diretamente em public.saas_subscriptions
  const { data: subscription } = await supabase
    .from('saas_subscriptions')
    .select('status, trial_ends_at, current_period_end, grace_period_days')
    .eq('tenant_id', selected.tenants.id)
    .maybeSingle();

  const validity = checkTenantSubscriptionValidity({
    tenantStatus: selected.tenants.status,
    tenantCreatedAt: selected.tenants.created_at,
    subscription,
  });

  const isSubscriptionValid = validity.isValid;
  const isTrialExpired = validity.isTrialExpired;
  const subStatus = validity.status;

  const timezone = (selected.tenants.settings?.timezone as string) || 'America/Sao_Paulo';

  return {
    userId: user.id,
    tenantId: selected.tenants.id,
    tenantSlug: selected.tenants.slug,
    tenantName: selected.tenants.name,
    role: selected.role,
    plan: selected.tenants.plan,
    tenantStatus: (isSubscriptionValid ? selected.tenants.status : 'suspended') as TenantStatus,
    timezone,
    subscriptionStatus: subStatus,
    isSubscriptionValid,
    isTrialExpired,
    trialEndsAt: subscription?.trial_ends_at || null,
    subscriptionEndsAt: subscription?.current_period_end || null,
  };
}
