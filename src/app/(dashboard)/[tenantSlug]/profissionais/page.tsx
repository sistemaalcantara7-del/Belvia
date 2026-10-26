import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { getPlanLimits } from '@/lib/plans/entitlements';
import { PLAN_CONFIGS } from '@/types/plans';
import { redirect } from 'next/navigation';
import { Professional, ProfessionalSchedule } from '@/types/professionals';
import { Service } from '@/types/services';
import { ProfessionalsManager } from '@/components/professionals/ProfessionalsManager';

interface ProfessionalsPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function ProfessionalsPage({ params }: ProfessionalsPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita do contexto multi-tenant no servidor
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const supabase = await createClient();

  // 1. Carregar profissionais do tenant
  const { data: professionalsData, error: profErr } = await supabase
    .from('professionals')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  if (profErr) {
    console.error('Erro ao buscar profissionais:', profErr.message);
  }

  // 2. Carregar serviços do tenant para o seletor
  const { data: servicesData } = await supabase
    .from('services')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  // 3. Carregar vínculos de serviços e horários de cada profissional
  const profList: Professional[] = (professionalsData || []) as Professional[];

  if (profList.length > 0) {
    const profIds = profList.map((p) => p.id);

    const { data: srvLinks } = await supabase
      .from('professional_services')
      .select('professional_id, service_id')
      .in('professional_id', profIds)
      .eq('tenant_id', context.tenantId);

    const { data: schedulesData } = await supabase
      .from('professional_schedules')
      .select('*')
      .in('professional_id', profIds)
      .eq('tenant_id', context.tenantId);

    // Mapear relacionamentos
    profList.forEach((prof) => {
      prof.service_ids = (srvLinks || [])
        .filter((l) => l.professional_id === prof.id)
        .map((l) => l.service_id);

      prof.schedules = (schedulesData || [])
        .filter((s) => s.professional_id === prof.id) as ProfessionalSchedule[];
    });
  }

  const planLimits = getPlanLimits(context.plan);
  const planInfo = PLAN_CONFIGS[context.plan];

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <ProfessionalsManager
          initialProfessionals={profList}
          availableServices={(servicesData || []) as Service[]}
          tenantSlug={context.tenantSlug}
          tenantName={context.tenantName}
          userRole={context.role}
          planName={planInfo?.name || 'Essencial'}
          maxProfessionals={planLimits.maxProfessionals}
        />
      </div>
    </div>
  );
}
