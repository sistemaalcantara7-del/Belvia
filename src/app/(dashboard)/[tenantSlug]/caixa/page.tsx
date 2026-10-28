import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { CashRegister, CashMovement, OperatingExpense } from '@/types/financial';
import { FinanceiroTabsView } from '@/components/financial/FinanceiroTabsView';

export const dynamic = 'force-dynamic';

interface CaixaPageProps {
  params: Promise<{ tenantSlug: string }>;
}

export default async function CaixaPage({ params }: CaixaPageProps) {
  const { tenantSlug } = await params;

  // Validação estrita de contexto multi-tenant no servidor
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // Regra de segurança BELVIA: professional NÃO tem acesso ao Caixa Balcão
  if (context.role === 'professional') {
    redirect(`/${tenantSlug}/agenda`);
  }

  const supabase = await createClient();

  // 1. Buscar caixa ativo (status = 'open')
  const { data: openRegisters, error: openErr } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false });

  if (openErr) {
    console.error('Erro ao buscar caixa ativo:', openErr);
  }

  const activeRegister = (openRegisters && openRegisters.length > 0) ? (openRegisters[0] as CashRegister) : null;

  // 2. Se houver caixa ativo, buscar movimentações e transações para o resumo
  let movements: CashMovement[] = [];
  let totalSupplies = 0;
  let totalBleeds = 0;
  let totalExpenses = 0;
  let totalCashReceived = 0;
  let totalPixReceived = 0;
  let totalCardReceived = 0;
  let totalOtherReceived = 0;

  if (activeRegister) {
    const { data: movementsData } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('cash_register_id', activeRegister.id)
      .eq('tenant_id', context.tenantId)
      .order('created_at', { ascending: false });

    movements = (movementsData || []) as CashMovement[];

    movements.forEach((m) => {
      const val = Number(m.amount) || 0;
      if (m.type === 'supply') totalSupplies += val;
      else if (m.type === 'bleed') totalBleeds += val;
      else if (m.type === 'expense') totalExpenses += val;
    });

    const { data: transactions } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('cash_register_id', activeRegister.id)
      .eq('tenant_id', context.tenantId)
      .eq('status', 'confirmed');

    (transactions || []).forEach((tx) => {
      const val = Number(tx.amount) || 0;
      if (tx.method === 'cash') totalCashReceived += val;
      else if (tx.method === 'pix') totalPixReceived += val;
      else if (tx.method === 'credit_card' || tx.method === 'debit_card') totalCardReceived += val;
      else totalOtherReceived += val;
    });
  }

  const initialBalance = activeRegister ? Number(activeRegister.initial_balance) || 0 : 0;
  const expectedBalance = Number(
    (initialBalance + totalSupplies + totalCashReceived - totalBleeds - totalExpenses).toFixed(2)
  );

  // 3. Buscar os últimos 5 caixas fechados para histórico
  const { data: closedData } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(5);

  const closedRegisters = (closedData || []) as CashRegister[];

  // 4. Buscar Despesas Operacionais (Contas a Pagar)
  let initialExpenses: OperatingExpense[] = [];
  try {
    const { data: expensesData } = await supabase
      .from('operating_expenses')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .order('due_date', { ascending: false })
      .limit(100);

    initialExpenses = (expensesData || []) as OperatingExpense[];
  } catch (err) {
    console.warn('Tabela operating_expenses ainda aguardando migration no banco:', err);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <FinanceiroTabsView
        tenantSlug={tenantSlug}
        userRole={context.role}
        plan={context.plan || 'essential'}
        activeRegister={activeRegister}
        movements={movements}
        closedRegisters={closedRegisters}
        summary={{
          initialBalance,
          totalSupplies,
          totalBleeds,
          totalExpenses,
          totalCashReceived,
          expectedBalance,
          totalPixReceived,
          totalCardReceived,
          totalOtherReceived,
        }}
        initialExpenses={initialExpenses}
      />
    </div>
  );
}
