'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { assertActiveSubscription } from '@/lib/plans/entitlements';
import { PaymentMethodType } from '@/types/financial';

export type FinancialReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface FinancialMethodBreakdown {
  method: PaymentMethodType;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface FinancialReportData {
  period: FinancialReportPeriod;
  startDate: string;
  endDate: string;
  tenantName: string;
  tenantDetails?: {
    cnpj?: string | null;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    logo_url?: string | null;
  };
  metrics: {
    totalRevenueReceived: number; // Faturamento efetivamente recebido (sem suprimentos)
    totalExpensesPaid: number;    // Despesas operacionais quitadas (sem sangrias)
    netCashFlow: number;          // totalRevenueReceived - totalExpensesPaid
    pendingRevenue: number;       // Atendimentos/pedidos pendentes ou a prazo
    pendingExpenses: number;      // Contas a pagar em aberto
    totalSupplies: number;        // Suprimentos de troco (informativo separado)
    totalBleeds: number;          // Sangrias de caixa (informativo separado)
    totalRefunds: number;         // Estornos deduzidos
  };
  methodsBreakdown: FinancialMethodBreakdown[];
  timeline: Array<{
    dateStr: string;
    label: string;
    revenue: number;
    expenses: number;
    net: number;
  }>;
  projection?: {
    method: string;
    description: string;
    projectedAnnualRevenue: number;
    projectedAnnualExpenses: number;
    projectedAnnualNet: number;
    monthlyAverageRevenue: number;
    monthlyAverageExpenses: number;
    realizedMonthsCount: number;
    remainingMonthsCount: number;
  };
}

const METHOD_LABELS: Record<PaymentMethodType, string> = {
  cash: 'Dinheiro (Espécie)',
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  bank_transfer: 'Transferência Bancária',
  other: 'Outro Meio',
};

/**
 * Obtém dados consolidados para a aba Relatórios da Gestão Financeira.
 * Regras Contábeis Rígidas:
 * 1. Faturamento: APENAS pagamentos de clientes de serviços e vendas (payment_transactions confirmed - refunds).
 * 2. Suprimento de caixa NÃO é receita/faturamento.
 * 3. Sangria de caixa NÃO é despesa operacional (é mera transferência/recolhimento).
 * 4. Despesas: pagamentos reais registrados em operating_expenses ou movimentações de despesa.
 * 5. Pendências: pedidos a receber (balance_due > 0) e contas a pagar pendentes.
 */
export async function getFinancialReportsAction(
  tenantSlug: string,
  period: FinancialReportPeriod = 'monthly',
  customYear?: number,
  customMonth?: number // 1 a 12
): Promise<{ success: boolean; data?: FinancialReportData; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    const subCheck = assertActiveSubscription(context);
    if (!subCheck.allowed) {
      return { success: false, error: subCheck.error };
    }

    if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
      return { success: false, error: 'Permissão negada para acessar relatórios financeiros.' };
    }

    const supabase = await createClient();
    const timezone = context.timezone || 'America/Sao_Paulo';
    const now = new Date();

    // ── 1. Determinação de Datas Conforme o Período ────────────────────
    const localTodayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const [curYear, curMonth] = localTodayStr.split('-').map(Number);
    const targetYear = customYear || curYear;
    const targetMonth = customMonth || curMonth;

    let startIso: string;
    let endIso: string;
    let displayStartDate: string;
    let displayEndDate: string;

    if (period === 'daily') {
      // Dia de hoje
      displayStartDate = localTodayStr;
      displayEndDate = localTodayStr;
      startIso = `${localTodayStr}T00:00:00.000Z`;
      endIso = `${localTodayStr}T23:59:59.999Z`;
    } else if (period === 'weekly') {
      // Últimos 7 dias
      const past6 = new Date(now);
      past6.setDate(past6.getDate() - 6);
      const startWeekStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(past6);

      displayStartDate = startWeekStr;
      displayEndDate = localTodayStr;
      startIso = `${startWeekStr}T00:00:00.000Z`;
      endIso = `${localTodayStr}T23:59:59.999Z`;
    } else if (period === 'yearly') {
      // Ano inteiro selecionado
      displayStartDate = `${targetYear}-01-01`;
      displayEndDate = `${targetYear}-12-31`;
      startIso = `${targetYear}-01-01T00:00:00.000Z`;
      endIso = `${targetYear}-12-31T23:59:59.999Z`;
    } else {
      // Mensal (Padrão)
      const lastDay = new Date(targetYear, targetMonth, 0).getDate();
      const monthPadded = String(targetMonth).padStart(2, '0');
      displayStartDate = `${targetYear}-${monthPadded}-01`;
      displayEndDate = `${targetYear}-${monthPadded}-${String(lastDay).padStart(2, '0')}`;
      startIso = `${displayStartDate}T00:00:00.000Z`;
      endIso = `${displayEndDate}T23:59:59.999Z`;
    }

    // ── 2. Buscar Dados Cadastrais do Tenant para o Timbre do PDF ───────
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('name, settings')
      .eq('id', context.tenantId)
      .single();

    const tenantSettings = (tenantData?.settings as Record<string, unknown>) || {};
    const bookingSettings = (tenantSettings.booking_settings as Record<string, unknown>) || {};

    const tenantDetails = {
      cnpj: (tenantSettings.cnpj as string) || (bookingSettings.cnpj as string) || null,
      address: (bookingSettings.address as string) || (tenantSettings.address as string) || null,
      city: (bookingSettings.city as string) || (tenantSettings.city as string) || null,
      phone: (bookingSettings.phone as string) || (tenantSettings.phone as string) || null,
      whatsapp: (bookingSettings.whatsapp as string) || (tenantSettings.whatsapp as string) || null,
      logo_url: (bookingSettings.logo_url as string) || null,
    };

    // ── 3. Receitas: Transações de Pagamento (Entradas e Estornos) ──────
    // Entradas confirmadas no período
    const { data: rawTx } = await supabase
      .from('payment_transactions')
      .select('id, amount, method, status, paid_at')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'confirmed')
      .gte('paid_at', startIso)
      .lte('paid_at', endIso)
      .limit(2000);

    // Estornos compensatórios formais (payment_refunds) no período
    const { data: rawRefunds } = await supabase
      .from('payment_refunds')
      .select('id, amount, method, refunded_at, payment_transaction_id')
      .eq('tenant_id', context.tenantId)
      .gte('refunded_at', startIso)
      .lte('refunded_at', endIso)
      .limit(1000);

    // Mapeamento e agrupamento por método
    const methodAmounts: Record<PaymentMethodType, { amount: number; count: number }> = {
      cash: { amount: 0, count: 0 },
      pix: { amount: 0, count: 0 },
      credit_card: { amount: 0, count: 0 },
      debit_card: { amount: 0, count: 0 },
      bank_transfer: { amount: 0, count: 0 },
      other: { amount: 0, count: 0 },
    };

    let totalGrossRevenue = 0;
    let totalRefunds = 0;

    (rawTx || []).forEach((tx) => {
      const amt = Number(tx.amount) || 0;
      const m = (tx.method as PaymentMethodType) || 'other';
      totalGrossRevenue += amt;
      if (methodAmounts[m]) {
        methodAmounts[m].amount += amt;
        methodAmounts[m].count += 1;
      } else {
        methodAmounts.other.amount += amt;
        methodAmounts.other.count += 1;
      }
    });

    (rawRefunds || []).forEach((ref) => {
      const amt = Number(ref.amount) || 0;
      const m = (ref.method as PaymentMethodType) || 'other';
      totalRefunds += amt;
      if (methodAmounts[m]) {
        methodAmounts[m].amount = Math.max(0, methodAmounts[m].amount - amt);
      }
    });

    const totalRevenueReceived = Math.max(0, Number((totalGrossRevenue - totalRefunds).toFixed(2)));

    // Breakdown de métodos percentual
    const methodsBreakdown: FinancialMethodBreakdown[] = Object.entries(methodAmounts)
      .map(([m, val]) => {
        const netAmt = Number(val.amount.toFixed(2));
        const pct = totalRevenueReceived > 0 ? Number(((netAmt / totalRevenueReceived) * 100).toFixed(1)) : 0;
        return {
          method: m as PaymentMethodType,
          label: METHOD_LABELS[m as PaymentMethodType] || m,
          amount: netAmt,
          count: val.count,
          percentage: pct,
        };
      })
      .filter((m) => m.amount > 0 || m.count > 0);

    // ── 4. Despesas Operacionais Quitadas e Pendentes ──────────────────
    let totalExpensesPaid = 0;
    let pendingExpenses = 0;

    try {
      const { data: expenses } = await supabase
        .from('operating_expenses')
        .select('id, amount, status, due_date, paid_at')
        .eq('tenant_id', context.tenantId)
        .limit(2000);

      (expenses || []).forEach((exp) => {
        const amt = Number(exp.amount) || 0;
        if (exp.status === 'paid' && exp.paid_at) {
          if (exp.paid_at >= startIso && exp.paid_at <= endIso) {
            totalExpensesPaid += amt;
          }
        } else if (exp.status === 'pending') {
          // Pendente no período ou total vencendo
          if (exp.due_date >= displayStartDate && exp.due_date <= displayEndDate) {
            pendingExpenses += amt;
          }
        }
      });
    } catch {
      // Caso tabela não exista em ambiente sem migração
    }

    // ── 5. Suprimentos e Sangrias (Separados do Faturamento) ───────────
    let totalSupplies = 0;
    let totalBleeds = 0;

    const { data: movements } = await supabase
      .from('cash_movements')
      .select('type, amount, created_at')
      .eq('tenant_id', context.tenantId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(1000);

    (movements || []).forEach((mov) => {
      const amt = Number(mov.amount) || 0;
      if (mov.type === 'supply') {
        totalSupplies += amt;
      } else if (mov.type === 'bleed') {
        totalBleeds += amt;
      }
    });

    // ── 6. Contas a Receber / Pendências de Pedidos ────────────────────
    let pendingRevenue = 0;
    const { data: orders } = await supabase
      .from('payment_orders')
      .select('balance_due, status, created_at')
      .eq('tenant_id', context.tenantId)
      .in('status', ['pending', 'partially_paid'])
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .limit(1000);

    (orders || []).forEach((ord) => {
      pendingRevenue += Number(ord.balance_due) || 0;
    });

    totalExpensesPaid = Number(totalExpensesPaid.toFixed(2));
    pendingExpenses = Number(pendingExpenses.toFixed(2));
    pendingRevenue = Number(pendingRevenue.toFixed(2));
    totalSupplies = Number(totalSupplies.toFixed(2));
    totalBleeds = Number(totalBleeds.toFixed(2));

    const netCashFlow = Number((totalRevenueReceived - totalExpensesPaid).toFixed(2));

    // ── 7. Timeline e Projeção Anual ──────────────────────────────────
    const timeline: Array<{
      dateStr: string;
      label: string;
      revenue: number;
      expenses: number;
      net: number;
    }> = [];

    let projection: FinancialReportData['projection'] = undefined;

    if (period === 'yearly') {
      // 12 Meses do Ano
      const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const monthlyRevenues = new Array(12).fill(0);
      const monthlyExpenses = new Array(12).fill(0);

      (rawTx || []).forEach((tx) => {
        const mIdx = new Date(tx.paid_at).getUTCMonth();
        monthlyRevenues[mIdx] += Number(tx.amount) || 0;
      });

      (rawRefunds || []).forEach((ref) => {
        const mIdx = new Date(ref.refunded_at).getUTCMonth();
        monthlyRevenues[mIdx] = Math.max(0, monthlyRevenues[mIdx] - (Number(ref.amount) || 0));
      });

      try {
        const { data: allYearExp } = await supabase
          .from('operating_expenses')
          .select('amount, paid_at')
          .eq('tenant_id', context.tenantId)
          .eq('status', 'paid')
          .gte('paid_at', startIso)
          .lte('paid_at', endIso);

        (allYearExp || []).forEach((e) => {
          if (e.paid_at) {
            const mIdx = new Date(e.paid_at).getUTCMonth();
            monthlyExpenses[mIdx] += Number(e.amount) || 0;
          }
        });
      } catch {
        // Fallback
      }

      // Constrói timeline mensal
      for (let i = 0; i < 12; i++) {
        const rev = Number(monthlyRevenues[i].toFixed(2));
        const exp = Number(monthlyExpenses[i].toFixed(2));
        timeline.push({
          dateStr: `${targetYear}-${String(i + 1).padStart(2, '0')}`,
          label: monthNames[i],
          revenue: rev,
          expenses: exp,
          net: Number((rev - exp).toFixed(2)),
        });
      }

      // Projeção baseada na média dos meses já transcorridos do ano alvo
      const monthsElapsed = targetYear === curYear ? Math.max(1, curMonth) : 12;
      const realizedRevenueSum = monthlyRevenues.slice(0, monthsElapsed).reduce((a, b) => a + b, 0);
      const realizedExpensesSum = monthlyExpenses.slice(0, monthsElapsed).reduce((a, b) => a + b, 0);

      const avgMonthlyRev = Number((realizedRevenueSum / monthsElapsed).toFixed(2));
      const avgMonthlyExp = Number((realizedExpensesSum / monthsElapsed).toFixed(2));
      const remainingMonths = targetYear === curYear ? Math.max(0, 12 - curMonth) : 0;

      const projectedAnnualRevenue = Number((realizedRevenueSum + avgMonthlyRev * remainingMonths).toFixed(2));
      const projectedAnnualExpenses = Number((realizedExpensesSum + avgMonthlyExp * remainingMonths).toFixed(2));
      const projectedAnnualNet = Number((projectedAnnualRevenue - projectedAnnualExpenses).toFixed(2));

      projection = {
        method: 'Média Móvel Histórica Mensal',
        description: `Projeção calculada com base na média realizada de ${monthsElapsed} mês(es) transcorrido(s) de ${targetYear}. Meses futuros (${remainingMonths}) projetados pela média real apurada.`,
        projectedAnnualRevenue,
        projectedAnnualExpenses,
        projectedAnnualNet,
        monthlyAverageRevenue: avgMonthlyRev,
        monthlyAverageExpenses: avgMonthlyExp,
        realizedMonthsCount: monthsElapsed,
        remainingMonthsCount: remainingMonths,
      };
    } else {
      // Timeline diária para daily, weekly e monthly
      // Agrupamento dia a dia
      const dayMap: Record<string, { revenue: number; expenses: number }> = {};

      (rawTx || []).forEach((tx) => {
        const dStr = tx.paid_at.slice(0, 10);
        if (!dayMap[dStr]) dayMap[dStr] = { revenue: 0, expenses: 0 };
        dayMap[dStr].revenue += Number(tx.amount) || 0;
      });

      (rawRefunds || []).forEach((ref) => {
        const dStr = ref.refunded_at.slice(0, 10);
        if (dayMap[dStr]) {
          dayMap[dStr].revenue = Math.max(0, dayMap[dStr].revenue - (Number(ref.amount) || 0));
        }
      });

      Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).forEach(([dStr, val]) => {
        const rev = Number(val.revenue.toFixed(2));
        const exp = Number(val.expenses.toFixed(2));
        const parts = dStr.split('-');
        const label = `${parts[2]}/${parts[1]}`;
        timeline.push({
          dateStr: dStr,
          label,
          revenue: rev,
          expenses: exp,
          net: Number((rev - exp).toFixed(2)),
        });
      });
    }

    return {
      success: true,
      data: {
        period,
        startDate: displayStartDate,
        endDate: displayEndDate,
        tenantName: context.tenantName,
        tenantDetails,
        metrics: {
          totalRevenueReceived,
          totalExpensesPaid,
          netCashFlow,
          pendingRevenue,
          pendingExpenses,
          totalSupplies,
          totalBleeds,
          totalRefunds,
        },
        methodsBreakdown,
        timeline,
        projection,
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao processar relatório financeiro.';
    return { success: false, error: msg };
  }
}

/**
 * Consulta de receita para o gráfico da Dashboard nos intervalos 7d, 30d ou 12m.
 */
export async function getDashboardRevenueChartAction(
  tenantSlug: string,
  range: '7d' | '30d' | '12m' = '7d'
): Promise<{
  success: boolean;
  data?: Array<{ dateStr: string; label: string; amount: number }>;
  error?: string;
}> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso negado.' };
    }

    const supabase = await createClient();
    const timezone = context.timezone || 'America/Sao_Paulo';
    const now = new Date();

    const localTodayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    if (range === '12m') {
      // 12 meses anteriores
      const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
      const past12MonthsDate = new Date(now);
      past12MonthsDate.setMonth(past12MonthsDate.getMonth() - 11);
      past12MonthsDate.setDate(1);

      const startUtc = past12MonthsDate.toISOString();
      const endUtc = now.toISOString();

      const { data: txData } = await supabase
        .from('payment_transactions')
        .select('amount, paid_at')
        .eq('tenant_id', context.tenantId)
        .eq('status', 'confirmed')
        .gte('paid_at', startUtc)
        .lte('paid_at', endUtc);

      const { data: refData } = await supabase
        .from('payment_refunds')
        .select('amount, refunded_at')
        .eq('tenant_id', context.tenantId)
        .gte('refunded_at', startUtc)
        .lte('refunded_at', endUtc);

      // 12 slots mensais ordenados cronologicamente
      const result: Array<{ dateStr: string; label: string; amount: number }> = [];
      const monthMap: Record<string, number> = {};

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        monthMap[key] = 0;
        result.push({
          dateStr: key,
          label: `${monthLabels[m]}`,
          amount: 0,
        });
      }

      (txData || []).forEach((tx) => {
        const k = tx.paid_at.slice(0, 7);
        if (monthMap[k] !== undefined) {
          monthMap[k] += Number(tx.amount) || 0;
        }
      });

      (refData || []).forEach((r) => {
        const k = r.refunded_at.slice(0, 7);
        if (monthMap[k] !== undefined) {
          monthMap[k] = Math.max(0, monthMap[k] - (Number(r.amount) || 0));
        }
      });

      result.forEach((item) => {
        item.amount = Number((monthMap[item.dateStr] || 0).toFixed(2));
      });

      return { success: true, data: result };
    }

    const daysCount = range === '30d' ? 30 : 7;
    const pastDaysDate = new Date(now);
    pastDaysDate.setDate(pastDaysDate.getDate() - (daysCount - 1));

    const startStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(pastDaysDate);

    const startUtc = `${startStr}T00:00:00.000Z`;
    const endUtc = `${localTodayStr}T23:59:59.999Z`;

    const { data: txData } = await supabase
      .from('payment_transactions')
      .select('amount, paid_at')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'confirmed')
      .gte('paid_at', startUtc)
      .lte('paid_at', endUtc);

    const { data: refData } = await supabase
      .from('payment_refunds')
      .select('amount, refunded_at')
      .eq('tenant_id', context.tenantId)
      .gte('refunded_at', startUtc)
      .lte('refunded_at', endUtc);

    const dayMap: Record<string, number> = {};
    const result: Array<{ dateStr: string; label: string; amount: number }> = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);

      const label = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: daysCount > 15 ? 'numeric' : '2-digit',
        timeZone: timezone,
      }).format(d);

      dayMap[dateStr] = 0;
      result.push({ dateStr, label, amount: 0 });
    }

    (txData || []).forEach((tx) => {
      const d = tx.paid_at.slice(0, 10);
      if (dayMap[d] !== undefined) {
        dayMap[d] += Number(tx.amount) || 0;
      }
    });

    (refData || []).forEach((r) => {
      const d = r.refunded_at.slice(0, 10);
      if (dayMap[d] !== undefined) {
        dayMap[d] = Math.max(0, dayMap[d] - (Number(r.amount) || 0));
      }
    });

    result.forEach((item) => {
      item.amount = Number((dayMap[item.dateStr] || 0).toFixed(2));
    });

    return { success: true, data: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao buscar receita da dashboard.';
    return { success: false, error: msg };
  }
}
