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
