import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import { TrialExpiredCheckoutView } from '@/components/subscription/TrialExpiredCheckoutView';

export const dynamic = 'force-dynamic';

interface AssinarPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function AssinarPage({ params }: AssinarPageProps) {
  const { tenantSlug } = await params;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // Se o tenant já possui assinatura ativa e válida, redireciona diretamente ao dashboard
  if (context.isSubscriptionValid) {
    redirect(`/${tenantSlug}`);
  }

  const canManage = context.role === 'owner' || context.role === 'admin';

  return (
    <TrialExpiredCheckoutView
      tenantSlug={tenantSlug}
      tenantName={context.tenantName}
      currentPlan={context.plan}
      trialEndsAt={context.trialEndsAt}
      canManage={canManage}
    />
  );
}
