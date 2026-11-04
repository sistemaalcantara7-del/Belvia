import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PortfolioItem } from '@/types/publicBooking';
import { Service } from '@/types/services';
import { PortfolioManager } from '@/components/portfolio/PortfolioManager';
import { TrialExpiredView } from '@/components/settings/TrialExpiredView';

export const dynamic = 'force-dynamic';

interface PortfolioPageProps {
  params: Promise<{ tenantSlug: string }>;
}

interface PortfolioRowDb extends PortfolioItem {
  services?: { name?: string | null } | null;
}

export default async function PortfolioPage({ params }: PortfolioPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita do contexto no servidor (isolamento multi-tenant)
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

  // Consulta itens de portfólio pertencentes exclusivamente ao tenant autenticado com o nome do serviço
  const { data: portfolioData, error: portError } = await supabase
    .from('tenant_portfolio')
    .select('*, services:service_id(name)')
    .eq('tenant_id', context.tenantId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (portError) {
    console.error('Erro ao carregar portfólio:', portError.message);
  }

  const typedRows = (portfolioData || []) as unknown as PortfolioRowDb[];

  const formattedPortfolio: PortfolioItem[] = typedRows.map((row) => ({
    ...row,
    service_name: row.services?.name || null,
  }));

  // Consulta serviços ativos para seleção no modal
  const { data: servicesData } = await supabase
    .from('services')
    .select('id, name, category, price, duration_minutes, break_minutes, status')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  const activeServices = (servicesData || []) as Service[];

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <PortfolioManager
          initialItems={formattedPortfolio}
          services={activeServices}
          tenantSlug={context.tenantSlug}
          tenantName={context.tenantName}
          userRole={context.role}
        />
      </div>
    </div>
  );
}
