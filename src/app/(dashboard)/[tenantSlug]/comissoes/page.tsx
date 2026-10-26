import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getCommissionsAction } from '@/lib/actions/financial';
import { CommissionManager } from '@/components/financial/CommissionManager';
import { Professional } from '@/types/professionals';

export const dynamic = 'force-dynamic';

interface ComissoesPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ComissoesPage({ params }: ComissoesPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita de contexto multi-tenant no servidor
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // Regra de segurança BELVIA: Recepção NÃO tem acesso a comissões
  if (context.role === 'receptionist') {
    redirect(`/${tenantSlug}/agenda`);
  }

  // Consulta inicial de comissões via Server Action
  const commissionsRes = await getCommissionsAction(tenantSlug);
  const initialCommissions = commissionsRes.data?.commissions || [];
  const initialSummary = commissionsRes.data?.summary || {
    totalForecast: 0,
    totalPayable: 0,
    totalPaid: 0,
    totalCanceled: 0,
  };

  // Se for owner/admin, carrega lista de profissionais para o seletor de filtros
  let professionals: Professional[] = [];
  if (['owner', 'admin'].includes(context.role)) {
    const supabase = await createClient();
    const { data: profs } = await supabase
      .from('professionals')
      .select('id, full_name, specialty, status')
      .eq('tenant_id', context.tenantId)
      .order('full_name', { ascending: true });

    professionals = (profs || []) as unknown as Professional[];
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <CommissionManager
        tenantSlug={tenantSlug}
        userRole={context.role}
        initialCommissions={initialCommissions}
        initialSummary={initialSummary}
        professionals={professionals}
      />
    </div>
  );
}
