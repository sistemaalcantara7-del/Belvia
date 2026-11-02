import { PlanType } from '@/types/tenant';
import { TrialExpiredCheckoutView } from '@/components/subscription/TrialExpiredCheckoutView';

interface TrialExpiredViewProps {
  tenantSlug: string;
  tenantName: string;
  plan: PlanType;
  trialEndsAt?: string | null;
  canManage: boolean;
}

export function TrialExpiredView({
  tenantSlug,
  tenantName,
  plan,
  trialEndsAt,
  canManage,
}: TrialExpiredViewProps) {
  return (
    <TrialExpiredCheckoutView
      tenantSlug={tenantSlug}
      tenantName={tenantName}
      currentPlan={plan}
      trialEndsAt={trialEndsAt}
      canManage={canManage}
    />
  );
}
