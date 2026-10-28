import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReportsView } from '@/components/reports/ReportsView';
import {
  ClientRetentionMetrics,
  ClientInactivityItem,
  ClientMonthlyEvolutionItem,
} from '@/types/retention';

export const dynamic = 'force-dynamic';

interface RelatoriosPageProps {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{
    startDate?: string;
    endDate?: string;
    professionalId?: string;
    serviceId?: string;
  }>;
}

export default async function RelatoriosPage({
  params,
  searchParams,
}: RelatoriosPageProps) {
  const { tenantSlug } = await params;
  const resolvedSearchParams = await searchParams;

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // Acesso financeiro gerencial (proprietário, admin ou recepcionista com máscara controlada)
  const role = context.role;
  const canViewFinancial = ['owner', 'admin', 'receptionist'].includes(role);
  const timezone = context.timezone ?? 'America/Sao_Paulo';

  const supabase = await createClient();

  // ── 1. Carregar Filtros Auxiliares: Profissionais e Serviços Ativos ──
  let profQuery = supabase
    .from('professionals')
    .select('id, full_name')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'active')
    .order('full_name', { ascending: true });

  if (role === 'professional') {
    profQuery = profQuery.eq('user_id', context.userId);
  }

  const { data: rawProfessionals } = await profQuery;
  const professionals = (rawProfessionals || []).map((p) => ({
    id: p.id,
    name: p.full_name,
  }));

  const { data: rawServices } = await supabase
    .from('services')
    .select('id, name')
    .eq('tenant_id', context.tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  const services = (rawServices || []).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  // ── 2. Definir Período Padrão (Últimos 30 Dias) no Fuso do Tenant ────
  const now = new Date();
  const defaultEndDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const past30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  const defaultStartDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(past30);

  const filterStartDate = resolvedSearchParams.startDate || defaultStartDateStr;
  const filterEndDate = resolvedSearchParams.endDate || defaultEndDateStr;
  const filterProfessionalId =
    role === 'professional'
      ? professionals[0]?.id || ''
      : (resolvedSearchParams.professionalId || 'ALL');
  const filterServiceId = resolvedSearchParams.serviceId || 'ALL';

  // Offset do fuso horário
  const localOffsetMinutes = (() => {
    try {
      const utcDate = new Date('2000-01-01T12:00:00Z');
      const localStr = utcDate.toLocaleString('en-US', { timeZone: timezone, hour12: false });
      const utcStr = utcDate.toLocaleString('en-US', { timeZone: 'UTC', hour12: false });
      return (new Date(localStr).getTime() - new Date(utcStr).getTime()) / 60000;
    } catch {
      return -180;
    }
  })();

  const startUtc = new Date(
    Date.UTC(
      parseInt(filterStartDate.slice(0, 4)),
      parseInt(filterStartDate.slice(5, 7)) - 1,
      parseInt(filterStartDate.slice(8, 10)),
      0, 0, 0
    ) - localOffsetMinutes * 60000
  ).toISOString();

  const endUtc = new Date(
    Date.UTC(
      parseInt(filterEndDate.slice(0, 4)),
      parseInt(filterEndDate.slice(5, 7)) - 1,
      parseInt(filterEndDate.slice(8, 10)),
      23, 59, 59
    ) - localOffsetMinutes * 60000
  ).toISOString();

  // ── 3. Consultar Atendimentos Realizados no Período ───────────────────
  let apptsQuery = supabase
    .from('appointments')
    .select(`
      id,
      client_id,
      start_time,
      status,
      price,
      service_id,
      professional_id,
      service:service_id ( id, name )
    `)
    .eq('tenant_id', context.tenantId)
    .gte('start_time', startUtc)
    .lte('start_time', endUtc)
    .neq('status', 'canceled');

  if (filterProfessionalId && filterProfessionalId !== 'ALL') {
    apptsQuery = apptsQuery.eq('professional_id', filterProfessionalId);
  }
  if (filterServiceId && filterServiceId !== 'ALL') {
    apptsQuery = apptsQuery.eq('service_id', filterServiceId);
  }

  const { data: rawAppointments } = await apptsQuery;
  const appointments = rawAppointments || [];

  const completedAppointments = appointments.filter((a) => a.status === 'completed');
  const totalCompletedCount = completedAppointments.length;

  // Distribuição por Serviços (Atendimentos Concluídos)
  const serviceDistributionMap: Record<string, { name: string; count: number; totalAmount: number }> = {};
  completedAppointments.forEach((a) => {
    interface ServiceRel {
      name?: string;
    }
    const servObj = (Array.isArray(a.service) ? a.service[0] : a.service) as ServiceRel | null;
    const servName = servObj?.name || 'Serviço Diversos';
    if (!serviceDistributionMap[servName]) {
      serviceDistributionMap[servName] = { name: servName, count: 0, totalAmount: 0 };
    }
    serviceDistributionMap[servName].count += 1;
    serviceDistributionMap[servName].totalAmount += Number(a.price) || 0;
  });

  const serviceDistribution = Object.values(serviceDistributionMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // ── 4. Apuração Financeira: Recebimentos, Estornos e Receita Líquida ───
  let totalGrossReceived = 0;
  let totalRefunds = 0;

  // Mapa diário para o gráfico de evolução financeira no período
  const dailyEvolutionMap: Record<string, { dateStr: string; label: string; received: number; refunded: number; net: number }> = {};

  // Inicializa os dias do intervalo selecionado
  const sDate = new Date(`${filterStartDate}T12:00:00Z`);
  const eDate = new Date(`${filterEndDate}T12:00:00Z`);
  const curDate = new Date(sDate);

  while (curDate <= eDate) {
    const dStr = curDate.toISOString().slice(0, 10);
    const dayLabel = new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }).format(curDate);

    dailyEvolutionMap[dStr] = {
      dateStr: dStr,
      label: dayLabel,
      received: 0,
      refunded: 0,
      net: 0,
    };
    curDate.setDate(curDate.getDate() + 1);
  }

  if (canViewFinancial) {
    // 4.1 Entradas de pagamentos confirmados
    const { data: rawTxs } = await supabase
      .from('payment_transactions')
      .select('id, amount, status, paid_at, refunded_at, payment_order:payment_order_id ( appointment_id )')
      .eq('tenant_id', context.tenantId)
      .gte('paid_at', startUtc)
      .lte('paid_at', endUtc)
      .limit(2000);

    // 4.2 Estornos compensatórios novos (payment_refunds)
    const { data: rawRefunds } = await supabase
      .from('payment_refunds')
      .select('id, payment_transaction_id, amount, refunded_at')
      .eq('tenant_id', context.tenantId)
      .gte('refunded_at', startUtc)
      .lte('refunded_at', endUtc)
      .limit(1000);

    const refundedTxIdsWithNewModel = new Set<string>();
    (rawRefunds || []).forEach((r) => {
      refundedTxIdsWithNewModel.add(r.payment_transaction_id);
    });

    // 4.3 Estornos legados (payment_transactions status = 'refunded' sem registro em payment_refunds)
    const { data: rawLegacyRefunds } = await supabase
      .from('payment_transactions')
      .select('id, amount, status, refunded_at')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'refunded')
      .gte('refunded_at', startUtc)
      .lte('refunded_at', endUtc)
      .limit(1000);

    // Processar Entradas
    interface TxRowItem {
      id: string;
      amount: number | string;
      paid_at: string;
    }

    (rawTxs || []).forEach((tx: unknown) => {
      const row = tx as TxRowItem;
      const amt = Number(row.amount) || 0;
      totalGrossReceived += amt;

      const txDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(row.paid_at));

      if (dailyEvolutionMap[txDateStr]) {
        dailyEvolutionMap[txDateStr].received += amt;
        dailyEvolutionMap[txDateStr].net += amt;
      }
    });

    // Processar Estornos Formais (payment_refunds)
    interface RefundItem {
      id: string;
      amount: number | string;
      refunded_at: string;
    }

    (rawRefunds || []).forEach((ref: unknown) => {
      const row = ref as RefundItem;
      const amt = Number(row.amount) || 0;
      totalRefunds += amt;

      const refDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(row.refunded_at));

      if (dailyEvolutionMap[refDateStr]) {
        dailyEvolutionMap[refDateStr].refunded += amt;
        dailyEvolutionMap[refDateStr].net -= amt;
      }
    });

    // Processar Estornos Legados
    interface LegacyRefundItem {
      id: string;
      amount: number | string;
      refunded_at: string | null;
    }

    (rawLegacyRefunds || []).forEach((leg: unknown) => {
      const row = leg as LegacyRefundItem;
      if (!row.refunded_at || refundedTxIdsWithNewModel.has(row.id)) return;
      const amt = Number(row.amount) || 0;
      totalRefunds += amt;

      const legDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(row.refunded_at));

      if (dailyEvolutionMap[legDateStr]) {
        dailyEvolutionMap[legDateStr].refunded += amt;
        dailyEvolutionMap[legDateStr].net -= amt;
      }
    });
  }

  const netReceived = totalGrossReceived - totalRefunds;
  const averageTicket = totalCompletedCount > 0 ? (totalGrossReceived / totalCompletedCount) : 0;

  // ── 5. Apuração de Comissões e Despesas Operacionais de Caixa ────────
  let commissionsQuery = supabase
    .from('professional_commissions')
    .select('commission_amount, status, created_at, settled_at')
    .eq('tenant_id', context.tenantId)
    .gte('created_at', startUtc)
    .lte('created_at', endUtc);

  if (filterProfessionalId && filterProfessionalId !== 'ALL') {
    commissionsQuery = commissionsQuery.eq('professional_id', filterProfessionalId);
  }

  const { data: rawCommissions } = await commissionsQuery;
  let totalCommissionsPaid = 0;
  let totalCommissionsPending = 0;

  interface CommItem {
    commission_amount: number | string;
    status: string;
  }

  (rawCommissions || []).forEach((c: unknown) => {
    const row = c as CommItem;
    const val = Number(row.commission_amount) || 0;
    if (row.status === 'paid') totalCommissionsPaid += val;
    else if (['forecast', 'payable'].includes(row.status)) totalCommissionsPending += val;
  });

  // Despesas Operacionais: Integradas com operating_expenses e cash_movements
  // Evita duplicidade: se a despesa de operating_expenses estiver vinculada a um cash_movement_id,
  // não soma o cash_movement duas vezes!
  let totalExpensesPaidCash = 0; // Despesas pagas no período (Regime de Caixa)
  let totalExpensesIncurredCompetence = 0; // Despesas incorridas no período (Regime de Competência)
  const coveredCashMovementIds = new Set<string>();

  if (canViewFinancial) {
    try {
      // 1. Busca despesas de operating_expenses
      const { data: rawOperatingExpenses } = await supabase
        .from('operating_expenses')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .neq('status', 'canceled')
        .or(`and(status.eq.paid,paid_at.gte.${startUtc},paid_at.lte.${endUtc}),and(competence_date.gte.${filterStartDate},competence_date.lte.${filterEndDate})`);

      interface OpExpRow {
        amount: number | string;
        status: string;
        paid_at: string | null;
        competence_date: string;
        cash_movement_id: string | null;
      }

      (rawOperatingExpenses || []).forEach((row: unknown) => {
        const exp = row as OpExpRow;
        const val = Number(exp.amount) || 0;

        // Caixa: pago dentro do intervalo de datas
        if (exp.status === 'paid' && exp.paid_at && exp.paid_at >= startUtc && exp.paid_at <= endUtc) {
          totalExpensesPaidCash += val;
          if (exp.cash_movement_id) {
            coveredCashMovementIds.add(exp.cash_movement_id);
          }
        }

        // Competência: competência dentro do intervalo selecionado
        if (exp.competence_date >= filterStartDate && exp.competence_date <= filterEndDate) {
          totalExpensesIncurredCompetence += val;
        }
      });
    } catch {
      // Fallback gracioso se a tabela operating_expenses ainda não foi aplicada no banco
    }

    // 2. Busca saídas do Caixa Diário (cash_movements do tipo 'expense')
    // Soma apenas se NÃO estiver coberto por uma operating_expense vinculada
    const { data: rawCashExpenses } = await supabase
      .from('cash_movements')
      .select('id, amount, category, created_at')
      .eq('tenant_id', context.tenantId)
      .eq('type', 'expense')
      .gte('created_at', startUtc)
      .lte('created_at', endUtc);

    interface ExpItem {
      id: string;
      amount: number | string;
      category: string;
      created_at: string;
    }

    (rawCashExpenses || []).forEach((e: unknown) => {
      const row = e as ExpItem;
      if (coveredCashMovementIds.has(row.id)) return; // Evita duplicidade

      const amt = Number(row.amount) || 0;
      totalExpensesPaidCash += amt;
      totalExpensesIncurredCompetence += amt;
    });
  }

  // Faturamento Bruto por Competência (Soma dos procedimentos com status 'completed' no período)
  const billedRevenueCompetence = completedAppointments.reduce(
    (sum, a) => sum + (Number(a.price) || 0),
    0
  );

  const dailyEvolution = Object.values(dailyEvolutionMap).map((d) => ({
    dateStr: d.dateStr,
    label: d.label,
    received: Number(d.received.toFixed(2)),
    refunded: Number(d.refunded.toFixed(2)),
    net: Number(d.net.toFixed(2)),
  }));

  // ── 7. INTELIGÊNCIA DE CLIENTES E RETENÇÃO ───────────────────────────
  // Busca todos os clientes do tenant com seus dados de identificação e cadastro
  const { data: rawTenantClients } = await supabase
    .from('clients')
    .select('id, full_name, phone, created_at')
    .eq('tenant_id', context.tenantId);

  const tenantClients = rawTenantClients || [];
  const clientMap = new Map<string, { id: string; name: string; phone: string | null; created_at: string }>();
  tenantClients.forEach((c) => {
    clientMap.set(c.id, {
      id: c.id,
      name: c.full_name,
      phone: c.phone || null,
      created_at: c.created_at,
    });
  });

  // Busca histórico de agendamentos CONCLUÍDOS para análise de retenção e recorrência
  let historicalApptsQuery = supabase
    .from('appointments')
    .select('id, client_id, professional_id, service_id, start_time, status, service:service_id(name)')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'completed')
    .order('start_time', { ascending: true });

  if (filterProfessionalId && filterProfessionalId !== 'ALL') {
    historicalApptsQuery = historicalApptsQuery.eq('professional_id', filterProfessionalId);
  }

  const { data: rawHistoricalAppts } = await historicalApptsQuery;
  interface HistApptRow {
    id: string;
    client_id: string;
    professional_id: string;
    service_id: string;
    start_time: string;
    status: string;
    service?: { name?: string } | Array<{ name?: string }> | null;
  }
  const historicalAppts = (rawHistoricalAppts || []) as HistApptRow[];

  // Mapeamento histórico por cliente: lista ordenada de visitas concluídas
  const clientVisitsMap = new Map<string, Array<{ startTime: string; serviceName: string }>>();
  historicalAppts.forEach((a) => {
    if (!a.client_id) return;
    const servObj = Array.isArray(a.service) ? a.service[0] : a.service;
    const servName = servObj?.name || 'Procedimento';
    const list = clientVisitsMap.get(a.client_id) || [];
    list.push({ startTime: a.start_time, serviceName: servName });
    clientVisitsMap.set(a.client_id, list);
  });

  // Clientes atendidos no período selecionado
  const clientsServedInPeriod = new Set<string>();
  const clientPeriodVisitsCount = new Map<string, number>();

  completedAppointments.forEach((a) => {
    if (!a.client_id) return;
    clientsServedInPeriod.add(a.client_id);
    clientPeriodVisitsCount.set(a.client_id, (clientPeriodVisitsCount.get(a.client_id) || 0) + 1);
  });

  let newClientsCount = 0;
  let recurringClientsCount = 0;

  clientsServedInPeriod.forEach((clientId) => {
    const visits = clientVisitsMap.get(clientId) || [];
    // Primeira visita histórica realizada
    const firstVisit = visits[0];
    if (firstVisit && firstVisit.startTime >= startUtc && firstVisit.startTime <= endUtc) {
      // Cliente cuja primeira visita histórica foi neste período
      newClientsCount++;
    } else {
      // Cliente já possuía atendimentos concluídos anteriores ao período
      recurringClientsCount++;
    }
  });

  const totalClientsServed = clientsServedInPeriod.size;
  const returnRatePercentage =
    totalClientsServed > 0 ? Number(((recurringClientsCount / totalClientsServed) * 100).toFixed(1)) : 0;

  const totalVisitsInPeriod = Array.from(clientPeriodVisitsCount.values()).reduce((sum, v) => sum + v, 0);
  const averageFrequencyPerClient =
    totalClientsServed > 0 ? Number((totalVisitsInPeriod / totalClientsServed).toFixed(2)) : 0;

  // Análise de Inatividade e Tempo Desde a Última Visita
  const nowMs = new Date().getTime();
  let totalDaysAccumulator = 0;
  let clientsWithVisitsCount = 0;

  const inactiveList30: ClientInactivityItem[] = [];

  clientVisitsMap.forEach((visits, clientId) => {
    if (visits.length === 0) return;
    const lastVisit = visits[visits.length - 1];
    const lastVisitMs = new Date(lastVisit.startTime).getTime();
    const diffDays = Math.max(0, Math.floor((nowMs - lastVisitMs) / (1000 * 60 * 60 * 24)));

    totalDaysAccumulator += diffDays;
    clientsWithVisitsCount++;

    const clientMeta = clientMap.get(clientId);
    if (!clientMeta) return;

    // Frequência de serviço mais contratado pelo cliente
    const svcCounts: Record<string, number> = {};
    visits.forEach((v) => {
      svcCounts[v.serviceName] = (svcCounts[v.serviceName] || 0) + 1;
    });
    const favService = Object.entries(svcCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    if (diffDays >= 30) {
      let tier: '30+' | '60+' | '90+' = '30+';
      if (diffDays >= 90) tier = '90+';
      else if (diffDays >= 60) tier = '60+';

      inactiveList30.push({
        id: clientId,
        name: clientMeta.name,
        phone: clientMeta.phone,
        lastVisitDate: lastVisit.startTime,
        daysSinceLastVisit: diffDays,
        totalCompletedVisits: visits.length,
        favoriteService: favService,
        inactivityTier: tier,
      });
    }
  });

  // Ordena a lista de clientes sem retorno pelos que estão há mais tempo sem vir
  inactiveList30.sort((a, b) => b.daysSinceLastVisit - a.daysSinceLastVisit);

  const averageDaysSinceLastVisit =
    clientsWithVisitsCount > 0 ? Math.round(totalDaysAccumulator / clientsWithVisitsCount) : 0;

  const activeClientsCount = totalClientsServed;
  const inactiveClientsCount = inactiveList30.length;

  const retentionMetrics: ClientRetentionMetrics = {
    newClientsCount,
    recurringClientsCount,
    activeClientsCount,
    inactiveClientsCount,
    returnRatePercentage,
    averageFrequencyPerClient,
    averageDaysSinceLastVisit,
  };

  // Evolução Mensal de Novos vs Recorrentes (Últimos 6 Meses)
  const monthlyEvolutionMap = new Map<string, { label: string; newClients: number; recurringClients: number }>();
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mLabel = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(d);
    monthlyEvolutionMap.set(mKey, { label: mLabel, newClients: 0, recurringClients: 0 });
  }

  // Agrupa atendimentos históricos pelos últimos 6 meses
  const monthServedClientsMap = new Map<string, Set<string>>();
  historicalAppts.forEach((a) => {
    if (!a.client_id) return;
    const mKey = a.start_time.slice(0, 7);
    if (monthlyEvolutionMap.has(mKey)) {
      const set = monthServedClientsMap.get(mKey) || new Set<string>();
      set.add(a.client_id);
      monthServedClientsMap.set(mKey, set);
    }
  });

  monthServedClientsMap.forEach((cSet, mKey) => {
    const target = monthlyEvolutionMap.get(mKey);
    if (!target) return;
    const monthStartIso = `${mKey}-01T00:00:00.000Z`;
    cSet.forEach((cId) => {
      const visits = clientVisitsMap.get(cId) || [];
      const firstVisit = visits[0];
      if (firstVisit && firstVisit.startTime.startsWith(mKey)) {
        target.newClients++;
      } else if (firstVisit && firstVisit.startTime < monthStartIso) {
        target.recurringClients++;
      }
    });
  });

  const clientMonthlyEvolution: ClientMonthlyEvolutionItem[] = Array.from(monthlyEvolutionMap.entries()).map(
    ([key, val]) => ({
      monthKey: key,
      monthLabel: val.label,
      newClients: val.newClients,
      recurringClients: val.recurringClients,
    })
  );

  return (
    <ReportsView
      tenantSlug={tenantSlug}
      tenantName={context.tenantName}
      role={role}
      canViewFinancial={canViewFinancial}
      startDate={filterStartDate}
      endDate={filterEndDate}
      selectedProfessionalId={filterProfessionalId}
      selectedServiceId={filterServiceId}
      professionals={professionals}
      services={services}
      metrics={{
        totalGrossReceived: Number(totalGrossReceived.toFixed(2)),
        totalRefunds: Number(totalRefunds.toFixed(2)),
        netReceived: Number(netReceived.toFixed(2)),
        totalCompletedCount,
        averageTicket: Number(averageTicket.toFixed(2)),
        totalCommissionsPaid: Number(totalCommissionsPaid.toFixed(2)),
        totalCommissionsPending: Number(totalCommissionsPending.toFixed(2)),
        totalExpensesPaidCash: Number(totalExpensesPaidCash.toFixed(2)),
        totalExpensesIncurredCompetence: Number(totalExpensesIncurredCompetence.toFixed(2)),
        billedRevenueCompetence: Number(billedRevenueCompetence.toFixed(2)),
      }}
      dailyEvolution={dailyEvolution}
      serviceDistribution={serviceDistribution}
      retentionMetrics={retentionMetrics}
      inactivityList={inactiveList30}
      clientMonthlyEvolution={clientMonthlyEvolution}
    />
  );
}
