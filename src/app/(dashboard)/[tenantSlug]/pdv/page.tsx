import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PDVManager } from '@/components/pdv/PDVManager';
import { getPDVAttendancesAction } from '@/lib/actions/pdv';
import { TrialExpiredView } from '@/components/settings/TrialExpiredView';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';
import { Client } from '@/types/clients';
import { CashRegister } from '@/types/financial';

export const dynamic = 'force-dynamic';

interface PDVPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ date?: string }>;
}

export default async function PDVPage({ params, searchParams }: PDVPageProps) {
  const { tenantSlug } = await params;
  const { date: rawDate } = await searchParams;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // Se período de testes expirado
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

  // Regra de segurança: profissional não gerencia PDV geral
  if (context.role === 'professional') {
    redirect(`/${tenantSlug}/agenda`);
  }

  const selectedDate = rawDate || new Date().toISOString().split('T')[0];

  const supabase = await createClient();

  // 1. Buscar serviços ativos
  const { data: servicesData } = await supabase
    .from('services')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('is_active', true)
    .order('name');

  // 2. Buscar profissionais ativos
  const { data: professionalsData } = await supabase
    .from('professionals')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('is_active', true)
    .order('full_name');

  // 3. Buscar clientes
  const { data: clientsData } = await supabase
    .from('clients')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .order('full_name');

  // 4. Buscar caixa ativo
  const { data: openRegisters } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1);

  const activeCashRegister = (openRegisters && openRegisters.length > 0)
    ? (openRegisters[0] as CashRegister)
    : null;

  // 5. Buscar atendimentos e ordens do dia
  const attendancesRes = await getPDVAttendancesAction(tenantSlug, selectedDate);
  const attendances = attendancesRes.data || [];

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 sm:px-6">
      <PDVManager
        tenantSlug={tenantSlug}
        tenantName={context.tenantName}
        userRole={context.role}
        initialAttendances={attendances}
        services={(servicesData || []) as Service[]}
        professionals={(professionalsData || []) as Professional[]}
        clients={(clientsData || []) as Client[]}
        activeCashRegister={activeCashRegister}
        selectedDate={selectedDate}
      />
    </div>
  );
}
