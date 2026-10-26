export type TenantRole = 'owner' | 'admin' | 'professional' | 'receptionist';
export type PlanType = 'essential' | 'smart';
export type TenantStatus = 'active' | 'suspended' | 'trial';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: PlanType;
  status: TenantStatus;
  custom_domain?: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  status: 'active' | 'inactive' | 'invited';
  created_at: string;
  updated_at: string;
  tenant?: Tenant;
  profile?: Profile;
}

export interface UserTenantContext {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: TenantRole;
  plan: PlanType;
  tenantName: string;
  timezone?: string;
}
