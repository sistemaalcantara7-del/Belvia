import { FeatureFlag, PLAN_CONFIGS } from '@/types/plans';
import { PlanType, TenantRole, UserTenantContext } from '@/types/tenant';
import { ROLE_PERMISSIONS } from '@/types/plans';

/**
 * Avalia se o plano do tenant possui uma feature específica liberada.
 */
export function hasFeature(plan: PlanType, feature: FeatureFlag): boolean {
  const planConfig = PLAN_CONFIGS[plan];
  if (!planConfig) return false;
  return !!planConfig.features[feature];
}

/**
 * Retorna os limites numéricos do plano ativo.
 */
export function getPlanLimits(plan: PlanType) {
  const planConfig = PLAN_CONFIGS[plan] || PLAN_CONFIGS.essential;
  return planConfig.limits;
}

/**
 * Verifica se um papel de usuário (Role) possui determinada permissão operacional.
 */
export function hasRolePermission(role: TenantRole, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  if (permissions.includes('all')) return true;
  return permissions.includes(permission);
}

/**
 * Avalia se o status e período de assinatura ou trial do tenant estão vigentes.
 * Regra idêntica utilizada tanto no contexto autenticado quanto nas páginas públicas.
 */
export function checkTenantSubscriptionValidity(params: {
  tenantStatus: string;
  tenantCreatedAt?: string | null;
  subscription?: {
    status?: string | null;
    trial_ends_at?: string | null;
    current_period_end?: string | null;
    grace_period_days?: number | null;
  } | null;
}): {
  isValid: boolean;
  isTrialExpired: boolean;
  status: string;
} {
  const { tenantStatus, tenantCreatedAt, subscription } = params;
  const nowTime = Date.now();

  if (subscription) {
    if (subscription.status === 'trial') {
      const trialEnd = subscription.trial_ends_at
        ? new Date(subscription.trial_ends_at).getTime()
        : new Date(tenantCreatedAt || 0).getTime() + 7 * 86400000;

      if (nowTime > trialEnd) {
        return { isValid: false, isTrialExpired: true, status: 'suspended' };
      }
      return { isValid: true, isTrialExpired: false, status: 'trial' };
    }

    if (subscription.status === 'active') {
      return { isValid: true, isTrialExpired: false, status: 'active' };
    }

    if (subscription.status === 'suspended' || subscription.status === 'canceled') {
      return { isValid: false, isTrialExpired: false, status: 'suspended' };
    }

    if (subscription.status === 'overdue') {
      const graceDays = subscription.grace_period_days ?? 5;
      const endWithGrace = subscription.current_period_end
        ? new Date(subscription.current_period_end).getTime() + graceDays * 86400000
        : nowTime;
      if (nowTime > endWithGrace) {
        return { isValid: false, isTrialExpired: false, status: 'suspended' };
      }
      // Dentro da tolerância de dias de carência
      return { isValid: true, isTrialExpired: false, status: 'overdue' };
    }
  }

  // Fallback caso não haja registro em saas_subscriptions
  if (tenantStatus === 'trial') {
    const trialEnd = new Date(tenantCreatedAt || 0).getTime() + 7 * 86400000;
    if (nowTime > trialEnd) {
      return { isValid: false, isTrialExpired: true, status: 'suspended' };
    }
    return { isValid: true, isTrialExpired: false, status: 'trial' };
  }

  if (tenantStatus === 'active') {
    return { isValid: true, isTrialExpired: false, status: 'active' };
  }

  return { isValid: false, isTrialExpired: false, status: 'suspended' };
}

/**
 * Valida se o estabelecimento possui assinatura ativa ou trial válido.
 * Lança ou retorna erro caso o período de teste tenha expirado ou a assinatura esteja suspensa,
 * bloqueando operações como criação/edição de clientes, agendamentos, comandas e caixa.
 */
export function assertActiveSubscription(context: UserTenantContext): {
  allowed: boolean;
  error?: string;
} {
  if (context.isSubscriptionValid === false) {
    if (context.isTrialExpired) {
      return {
        allowed: false,
        error:
          'O período de testes gratuitos (7 dias) deste estabelecimento expirou. Regularize a assinatura nas Configurações para continuar utilizando as funcionalidades.',
      };
    }
    return {
      allowed: false,
      error:
        'A assinatura deste estabelecimento está suspensa ou pendente de regularização. Acesse as Configurações para reativar seu acesso.',
    };
  }
  return { allowed: true };
}
