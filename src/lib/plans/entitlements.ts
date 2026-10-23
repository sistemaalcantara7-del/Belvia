import { FeatureFlag, PLAN_CONFIGS } from '@/types/plans';
import { PlanType, TenantRole } from '@/types/tenant';
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
