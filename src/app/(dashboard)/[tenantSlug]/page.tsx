import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { DashboardView } from '@/components/dashboard/DashboardView';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  params: Promise<{ tenantSlug: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  professional: 'Profissional',
};

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { tenantSlug } = await params;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const supabase = await createClient();
  const timezone = context.timezone ?? 'America/Sao_Paulo';
  const role = context.role;
  const canViewFinancial = ['owner', 'admin', 'receptionist'].includes(role);

  // ── 1. Construir intervalo de hoje com base no fuso horário do tenant ───
  const now = new Date();
  const localDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const localOffsetMinutes = (() => {
    try {
      const utcDate = new Date('2000-01-01T12:00:00Z');
      const localStr = utcDate.toLocaleString('en-US', { timeZone: timezone, hour12: false });
      const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC', hour12: false });
      return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
    } catch {
      return -180; // BRT fallback
    }
  })();

  const startUtc = new Date(
    Date.UTC(
      parseInt(localDateStr.slice(0, 4)),
      parseInt(localDateStr.slice(5, 7)) - 1,
      parseInt(localDateStr.slice(8, 10)),
      0, 0, 0
    ) - localOffsetMinutes * 60000
  ).toISOString();

  const endUtc = new Date(
    Date.UTC(
      parseInt(localDateStr.slice(0, 4)),
      parseInt(localDateStr.slice(5, 7)) - 1,
      parseInt(localDateStr.slice(8, 10)),
      23, 59, 59
    ) - localOffsetMinutes * 60000
  ).toISOString();

  // ── 2. Buscar agendamentos de hoje ────────────────────────────────────
  let appointmentsQuery = supabase
    .from('appointments')
    .select(`
      id,
      start_time,
      end_time,
      status,
      price,
      client:client_id ( id, full_name ),
      service:service_id ( id, name ),
      professional:professional_id ( id, full_name )
    `)
    .eq('tenant_id', context.tenantId)
    .gte('start_time', startUtc)
    .lte('start_time', endUtc)
    .neq('status', 'canceled')
    .order('start_time', { ascending: true })
    .limit(50);

  // Se for profissional, filtra apenas os próprios atendimentos
  if (role === 'professional') {
    appointmentsQuery = appointmentsQuery.eq('professional_id', context.userId);
  }

  const { data: rawAppointments } = await appointmentsQuery;
  const allToday = rawAppointments ?? [];

  // Mapear tipagem compatível
  interface RawApptRow {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    price: number | string | null;
    client: { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null;
    service: { id?: string; name?: string } | { id?: string; name?: string }[] | null;
    professional: { id?: string; full_name?: string } | { id?: string; full_name?: string }[] | null;
  }

  const typedToday = (allToday as unknown as RawApptRow[]).map((a) => ({
    id: a.id,
    start_time: a.start_time,
    end_time: a.end_time,
    status: a.status,
    price: Number(a.price) || 0,
    client: Array.isArray(a.client) ? a.client[0] ?? null : a.client,
    service: Array.isArray(a.service) ? a.service[0] ?? null : a.service,
    professional: Array.isArray(a.professional) ? a.professional[0] ?? null : a.professional,
  }));

  const totalToday = typedToday.length;
  const completedToday = typedToday.filter((a) => a.status === 'completed').length;
  const revenueToday = typedToday
    .filter((a) => a.status === 'completed')
    .reduce((sum, a) => sum + a.price, 0);

  // ── 3. Clientes ativos ────────────────────────────────────────────────
  const { count: activeClientsCount } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active');

  // ── 4. Novos clientes recentes (últimos 5) ────────────────────────────
  const { data: rawClients } = await supabase
    .from('clients')
    .select('id, full_name, created_at')
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentClients = (rawClients ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    created_at: c.created_at,
  }));

  // ── 5. Ranking de Serviços mais realizados (últimos 30 dias) ─────────
  const thirtyDaysAgoUtc = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pastAppointments } = await supabase
    .from('appointments')
    .select('service_id, service:service_id ( name )')
    .eq('tenant_id', context.tenantId)
    .gte('start_time', thirtyDaysAgoUtc)
    .neq('status', 'canceled')
    .limit(300);

  interface PastApptRow {
    service_id: string;
    service: { name: string } | { name: string }[] | null;
  }

  const serviceCountMap: Record<string, { name: string; count: number }> = {};
  for (const row of (pastAppointments ?? []) as unknown as PastApptRow[]) {
    const serviceObj = Array.isArray(row.service) ? row.service[0] : row.service;
    const name = serviceObj?.name || 'Serviço';
    if (!serviceCountMap[name]) {
      serviceCountMap[name] = { name, count: 0 };
    }
    serviceCountMap[name].count += 1;
  }

  const topServices = Object.values(serviceCountMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── 6. Receita real dos últimos 7 dias ─────────────────────────────────
  const sevenDaysAgoUtc = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: weekCompleted } = await supabase
    .from('appointments')
    .select('start_time, price')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'completed')
    .gte('start_time', sevenDaysAgoUtc)
    .limit(200);

  // Montar array dos últimos 7 dias
  const revenueWeek = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);

    const dayLabel = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: timezone,
    }).format(d);

    // Soma valor dos atendimentos que começaram nesta data local
    const dayAmount = (weekCompleted ?? []).reduce((sum, item) => {
      const itemDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(item.start_time));
      return itemDateStr === dateStr ? sum + (Number(item.price) || 0) : sum;
    }, 0);

    revenueWeek.push({
      dateStr,
      label: dayLabel,
      amount: dayAmount,
    });
  }

  const roleLabel = ROLE_LABELS[role] ?? role;
  const initials = context.tenantName
    ? context.tenantName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'Z';

  return (
    <DashboardView
      tenantSlug={tenantSlug}
      tenantName={context.tenantName}
      roleLabel={roleLabel}
      initials={initials}
      timezone={timezone}
      totalToday={totalToday}
      completedToday={completedToday}
      revenueToday={revenueToday}
      activeClientsCount={activeClientsCount ?? 0}
      appointments={typedToday}
      recentClients={recentClients}
      topServices={topServices}
      revenueWeek={revenueWeek}
      canViewFinancial={canViewFinancial}
    />
  );
}