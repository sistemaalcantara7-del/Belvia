import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Service } from '@/types/services';
import { ServicesManager } from '@/components/services/ServicesManager';
import { TrialExpiredView } from '@/components/settings/TrialExpiredView';

export const dynamic = 'force-dynamic';

interface ServicesPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ServicesPage({ params }: ServicesPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita do contexto no servidor (impede leitura cruzada de outro tenant)
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // Se o período de testes ou assinatura expirou, exibe a tela de regularização
  if (context.isSubscriptionValid === false) {
    return (
      <TrialExpiredView
        tenantSlug={tenantSlug}
        tenantName={context.tenantName}
        plan={context.plan}
        trialEndsAt={context.trialEndsAt}
        canManage={context.role === 'owner' || context.role === 'admin'}
      />
    );
  }

  const supabase = await createClient();

  // Consulta serviços pertencentes exclusivamente ao tenant autenticado
  const { data: services, error } = await supabase
    .from('services')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar serviços:', error.message);
  }

  const typedServices = (services || []) as Service[];

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <ServicesManager
          initialServices={typedServices}
          tenantSlug={context.tenantSlug}
          tenantName={context.tenantName}
          userRole={context.role}
        />
      </div>
    </div>
  );
}
