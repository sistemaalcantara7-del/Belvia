import { createClient } from '@/lib/supabase/server';
import { UserTenantContext, TenantRole, PlanType } from '@/types/tenant';

/**
 * Obtém e valida o contexto multi-tenant do usuário autenticado no servidor.
 * NUNCA confia em parâmetros fornecidos pelo cliente sem cruzar com a tabela tenant_users.
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
        status
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

  if (!selected.tenants || selected.tenants.status !== 'active') {
    return null;
  }

  return {
    userId: user.id,
    tenantId: selected.tenants.id,
    tenantSlug: selected.tenants.slug,
    tenantName: selected.tenants.name,
    role: selected.role,
    plan: selected.tenants.plan,
  };
}
