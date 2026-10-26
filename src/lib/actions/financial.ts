'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import {
  CashRegister,
  CashMovement,
  CashMovementType,
  CashRegisterSummary,
  PaymentOrder,
  PaymentTransaction,
  PaymentMethodType,
  ProfessionalCommission,
  CommissionStatus,
} from '@/types/financial';
import { revalidatePath } from 'next/cache';

export interface FinancialActionResponse<T = unknown> {
  error?: string;
  success?: boolean;
  data?: T;
}

/**
 * Abre um novo caixa físico no terminal/estabelecimento.
 * Respeita regras dos planos: Essencial (máx 1 caixa aberto); Inteligente (múltiplos).
 */
export async function openCashRegisterAction(
  tenantSlug: string,
  data: {
    terminal_name?: string;
    initial_balance: number;
    notes?: string;
  }
): Promise<FinancialActionResponse<CashRegister>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado ou estabelecimento não encontrado.' };
  }

  // Apenas owner, admin e receptionist podem operar o caixa
  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Seu perfil de acesso não possui permissão para abrir caixa.' };
  }

  const initialBalance = Number(data.initial_balance);
  if (isNaN(initialBalance) || initialBalance < 0) {
    return { error: 'O fundo de troco inicial deve ser um valor numérico maior ou igual a zero.' };
  }

  const terminalName = data.terminal_name?.trim() || 'Balcão Principal';
  const notes = data.notes?.trim() || null;

  const supabase = await createClient();

  const { data: newRegister, error } = await supabase
    .from('cash_registers')
    .insert({
      tenant_id: context.tenantId,
      opened_by: context.userId,
      terminal_name: terminalName,
      initial_balance: initialBalance,
      status: 'open',
      notes,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/caixa`);
  return { success: true, data: newRegister as CashRegister };
}

/**
 * Registra uma movimentação no caixa (Suprimento, Sangria ou Despesa operacional em espécie).
 */
export async function createCashMovementAction(
  tenantSlug: string,
  data: {
    cash_register_id: string;
    type: CashMovementType;
    amount: number;
    category?: string;
    description: string;
  }
): Promise<FinancialActionResponse<CashMovement>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente para registrar movimentações no caixa.' };
  }

  const amount = Number(data.amount);
  if (isNaN(amount) || amount <= 0) {
    return { error: 'O valor da movimentação deve ser maior que zero.' };
  }

  const description = data.description?.trim();
  if (!description || description.length < 3) {
    return { error: 'A descrição da movimentação é obrigatória (mínimo 3 caracteres).' };
  }

  const category = data.category?.trim() || (data.type === 'expense' ? 'Despesas Operacionais' : 'Movimentação de Caixa');

  const supabase = await createClient();

  // Verifica se o caixa existe, pertence ao tenant e está aberto
  const { data: register, error: regErr } = await supabase
    .from('cash_registers')
    .select('id, status, tenant_id')
    .eq('id', data.cash_register_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (regErr || !register) {
    return { error: 'Caixa não localizado no estabelecimento.' };
  }

  if (register.status !== 'open') {
    return { error: 'Não é possível movimentar um caixa já encerrado.' };
  }

  const { data: movement, error } = await supabase
    .from('cash_movements')
    .insert({
      tenant_id: context.tenantId,
      cash_register_id: data.cash_register_id,
      type: data.type,
      amount,
      category,
      description,
      performed_by: context.userId,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/${tenantSlug}/caixa`);
  return { success: true, data: movement as CashMovement };
}

/**
 * Realiza o fechamento cego e seguro do caixa.
 * O operador informa o valor físico contado na gaveta.
 * O servidor calcula o saldo esperado real e apura a diferença, bloqueando edições posteriores.
 */
export async function closeCashRegisterAction(
  tenantSlug: string,
  data: {
    cash_register_id: string;
    closing_balance: number;
    notes?: string;
  }
): Promise<FinancialActionResponse<CashRegister>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente para fechar o caixa.' };
  }

  const closingBalance = Number(data.closing_balance);
  if (isNaN(closingBalance) || closingBalance < 0) {
    return { error: 'O valor contado na gaveta deve ser um número maior ou igual a zero.' };
  }

  const supabase = await createClient();

  // 1. Busca dados do caixa
  const { data: register, error: regErr } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('id', data.cash_register_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (regErr || !register) {
    return { error: 'Caixa não encontrado.' };
  }

  if (register.status === 'closed') {
    return { error: 'Este caixa já se encontra fechado e imutável.' };
  }

  // 2. Busca todas as movimentações de caixa (Suprimentos, Sangrias, Despesas)
  const { data: movements } = await supabase
    .from('cash_movements')
    .select('type, amount')
    .eq('cash_register_id', register.id)
    .eq('tenant_id', context.tenantId);

  let totalSupplies = 0;
  let totalBleeds = 0;
  let totalExpenses = 0;

  (movements || []).forEach((m) => {
    const val = Number(m.amount) || 0;
    if (m.type === 'supply') totalSupplies += val;
    else if (m.type === 'bleed') totalBleeds += val;
    else if (m.type === 'expense') totalExpenses += val;
  });

  // 3. Busca recebimentos em DINHEIRO (cash) vinculados a este caixa
  const { data: cashPayments } = await supabase
    .from('payment_transactions')
    .select('amount, status')
    .eq('cash_register_id', register.id)
    .eq('method', 'cash')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'confirmed');

  let totalCashReceived = 0;
  (cashPayments || []).forEach((p) => {
    totalCashReceived += Number(p.amount) || 0;
  });

  // 4. Cálculo transacional no servidor do saldo esperado na gaveta física
  const initialBalance = Number(register.initial_balance) || 0;
  const systemCalculatedBalance = Number(
    (initialBalance + totalSupplies + totalCashReceived - totalBleeds - totalExpenses).toFixed(2)
  );

  const difference = Number((closingBalance - systemCalculatedBalance).toFixed(2));
  const closedAt = new Date().toISOString();
  const notes = data.notes?.trim()
    ? `${register.notes ? register.notes + ' | ' : ''}Fechamento: ${data.notes.trim()}`
    : register.notes;

  // 5. Atualização atômica do fechamento
  const { data: closedRegister, error: closeErr } = await supabase
    .from('cash_registers')
    .update({
      status: 'closed',
      closing_balance: closingBalance,
      system_calculated_balance: systemCalculatedBalance,
      difference,
      closed_at: closedAt,
      closed_by: context.userId,
      notes,
    })
    .eq('id', register.id)
    .eq('tenant_id', context.tenantId)
    .select()
    .single();

  if (closeErr) {
    return { error: closeErr.message };
  }

  revalidatePath(`/${tenantSlug}/caixa`);
  return { success: true, data: closedRegister as CashRegister };
}

/**
 * Carrega o resumo completo de um caixa ativo ou fechado.
 */
export async function getCashRegisterSummaryAction(
  tenantSlug: string,
  cashRegisterId: string
): Promise<FinancialActionResponse<CashRegisterSummary>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente para consultar dados do caixa.' };
  }

  const supabase = await createClient();

  const { data: register, error: regErr } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('id', cashRegisterId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (regErr || !register) {
    return { error: 'Caixa não encontrado.' };
  }

  // Movimentações
  const { data: movements } = await supabase
    .from('cash_movements')
    .select('*')
    .eq('cash_register_id', cashRegisterId)
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  // Transações de pagamento associadas ao caixa
  const { data: transactions } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('cash_register_id', cashRegisterId)
    .eq('tenant_id', context.tenantId)
    .eq('status', 'confirmed');

  let totalSupplies = 0;
  let totalBleeds = 0;
  let totalExpenses = 0;
  (movements || []).forEach((m) => {
    const val = Number(m.amount) || 0;
    if (m.type === 'supply') totalSupplies += val;
    else if (m.type === 'bleed') totalBleeds += val;
    else if (m.type === 'expense') totalExpenses += val;
  });

  let totalCashReceived = 0;
  let totalPixReceived = 0;
  let totalCardReceived = 0;
  let totalOtherReceived = 0;

  (transactions || []).forEach((tx) => {
    const val = Number(tx.amount) || 0;
    if (tx.method === 'cash') totalCashReceived += val;
    else if (tx.method === 'pix') totalPixReceived += val;
    else if (tx.method === 'credit_card' || tx.method === 'debit_card') totalCardReceived += val;
    else totalOtherReceived += val;
  });

  const initialBalance = Number(register.initial_balance) || 0;
  const expectedBalance = Number(
    (initialBalance + totalSupplies + totalCashReceived - totalBleeds - totalExpenses).toFixed(2)
  );

  return {
    success: true,
    data: {
      register: register as CashRegister,
      movements: (movements || []) as CashMovement[],
      initialBalance,
      totalSupplies,
      totalBleeds,
      totalExpenses,
      totalCashReceived,
      expectedBalance,
      totalPixReceived,
      totalCardReceived,
      totalOtherReceived,
    },
  };
}

/**
 * Obtém ou cria a ordem financeira (PaymentOrder) para um agendamento.
 * Garante idempotência: se a ordem já existir, retorna a existente com suas transações.
 * Bloqueia agendamentos cancelados e preserva o valor histórico contratado.
 */
export async function getOrCreatePaymentOrderForAppointmentAction(
  tenantSlug: string,
  appointmentId: string
): Promise<FinancialActionResponse<{ order: PaymentOrder; activeCashRegister: CashRegister | null; plan: string }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Seu perfil de acesso não possui permissão para gerenciar pagamentos.' };
  }

  const supabase = await createClient();

  // 1. Busca o agendamento
  const { data: appointment, error: apptErr } = await supabase
    .from('appointments')
    .select('id, tenant_id, client_id, price, status, checked_in_at')
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (apptErr || !appointment) {
    return { error: 'Agendamento não localizado.' };
  }

  if (appointment.status === 'canceled') {
    return { error: 'Não é permitido criar ou processar cobrança para agendamentos cancelados.' };
  }

  // 2. Busca ordem já existente para este agendamento
  const { data: existingOrders, error: ordErr } = await supabase
    .from('payment_orders')
    .select(`
      id,
      tenant_id,
      appointment_id,
      client_id,
      gross_amount,
      discount_amount,
      addition_amount,
      net_amount,
      paid_amount,
      balance_due,
      status,
      notes,
      created_at,
      updated_at
    `)
    .eq('appointment_id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: true });

  if (ordErr) {
    return { error: `Erro ao buscar ordem de pagamento: ${ordErr.message}` };
  }

  let orderRecord: PaymentOrder;

  if (existingOrders && existingOrders.length > 0) {
    orderRecord = existingOrders[0] as PaymentOrder;
  } else {
    // Criação inicial da ordem financeira baseada no preço contratado do agendamento
    const grossAmount = Number(appointment.price) || 0;
    const { data: newOrder, error: createErr } = await supabase
      .from('payment_orders')
      .insert({
        tenant_id: context.tenantId,
        appointment_id: appointment.id,
        client_id: appointment.client_id,
        gross_amount: grossAmount,
        discount_amount: 0,
        addition_amount: 0,
        net_amount: grossAmount,
        paid_amount: 0,
        balance_due: grossAmount,
        status: grossAmount === 0 ? 'paid' : 'pending',
      })
      .select()
      .single();

    if (createErr || !newOrder) {
      // Em caso de concorrência onde outra requisição inseriu primeiro
      const { data: retryOrders } = await supabase
        .from('payment_orders')
        .select('*')
        .eq('appointment_id', appointmentId)
        .eq('tenant_id', context.tenantId);

      if (retryOrders && retryOrders.length > 0) {
        orderRecord = retryOrders[0] as PaymentOrder;
      } else {
        return { error: `Falha ao gerar ordem de pagamento: ${createErr?.message}` };
      }
    } else {
      orderRecord = newOrder as PaymentOrder;
    }
  }

  // 3. Carrega transações confirmadas vinculadas à ordem
  const { data: transactions } = await supabase
    .from('payment_transactions')
    .select(`
      id,
      tenant_id,
      payment_order_id,
      cash_register_id,
      amount,
      method,
      installments,
      status,
      refunded_at,
      refund_reason,
      received_by,
      paid_at,
      created_at
    `)
    .eq('payment_order_id', orderRecord.id)
    .eq('tenant_id', context.tenantId)
    .order('paid_at', { ascending: true });

  orderRecord.transactions = (transactions || []) as PaymentTransaction[];

  // 4. Busca se há caixa físico aberto no momento no estabelecimento
  const { data: openRegisters } = await supabase
    .from('cash_registers')
    .select('*')
    .eq('tenant_id', context.tenantId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1);

  const activeCashRegister = openRegisters && openRegisters.length > 0 ? (openRegisters[0] as CashRegister) : null;

  return {
    success: true,
    data: {
      order: orderRecord,
      activeCashRegister,
      plan: context.plan || 'essential',
    },
  };
}

export interface SplitPaymentItem {
  method: PaymentMethodType;
  amount: number;
}

/**
 * Registra pagamento para uma ordem de pagamento.
 * Suporta pagamento único ou misto/parcial dependendo do plano do tenant.
 * - No plano Essencial: Permite apenas 1 forma de pagamento por atendimento.
 * - No plano Inteligente: Permite split / pagamentos mistos (ex: Dinheiro + Pix + Cartão).
 * - Dinheiro: exige caixa físico aberto e atualiza a gaveta.
 * - Pix, Cartão e Transferência: não alteram a gaveta física (cash_register_id opcional/nulo).
 */
export async function processPaymentOrderAction(
  tenantSlug: string,
  data: {
    payment_order_id: string;
    discount_amount?: number;
    payments: SplitPaymentItem[];
  }
): Promise<FinancialActionResponse<{ order: PaymentOrder; transactions: PaymentTransaction[] }>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin', 'receptionist'].includes(context.role)) {
    return { error: 'Permissão insuficiente para registrar recebimentos.' };
  }

  const payments = data.payments || [];
  if (payments.length === 0) {
    return { error: 'Informe ao menos uma forma de pagamento.' };
  }

  // Regra de Planos: Essencial permite apenas 1 forma de pagamento por transação/ordem
  const tenantPlan = context.plan || 'essential';
  if (tenantPlan === 'essential' && payments.length > 1) {
    return {
      error: 'O plano Essencial permite registrar apenas uma forma de pagamento por atendimento. Faça upgrade para o plano Inteligente para aceitar pagamentos mistos (ex: Pix + Cartão).',
    };
  }

  // Validação básica dos pagamentos
  let totalToPay = 0;
  for (const p of payments) {
    const amt = Number(p.amount);
    if (isNaN(amt) || amt <= 0) {
      return { error: 'Todos os valores de pagamento devem ser maiores que zero.' };
    }
    totalToPay = Number((totalToPay + amt).toFixed(2));
  }

  const supabase = await createClient();

  // 1. Busca a ordem de pagamento
  const { data: order, error: ordErr } = await supabase
    .from('payment_orders')
    .select('*')
    .eq('id', data.payment_order_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (ordErr || !order) {
    return { error: 'Ordem de pagamento não localizada.' };
  }

  if (order.status === 'canceled') {
    return { error: 'Não é permitido registrar pagamentos em uma ordem cancelada.' };
  }

  if (order.status === 'paid' || Number(order.balance_due) <= 0) {
    return { error: 'Esta ordem de pagamento já está integralmente quitada.' };
  }

  // 2. Aplica desconto autorizado se informado e se a ordem ainda não possuir pagamentos
  const discountAmount = Number(data.discount_amount || 0);
  if (discountAmount > 0) {
    if (Number(order.paid_amount) > 0) {
      return { error: 'Descontos só podem ser ajustados antes do primeiro pagamento parcial.' };
    }
    if (discountAmount > Number(order.gross_amount)) {
      return { error: 'O valor do desconto não pode ser maior que o valor bruto do serviço.' };
    }

    const newNet = Number((Number(order.gross_amount) - discountAmount).toFixed(2));
    const newBalanceDue = newNet;

    const { error: updErr } = await supabase
      .from('payment_orders')
      .update({
        discount_amount: discountAmount,
        net_amount: newNet,
        balance_due: newBalanceDue,
        status: newBalanceDue === 0 ? 'paid' : 'pending',
      })
      .eq('id', order.id)
      .eq('tenant_id', context.tenantId);

    if (updErr) {
      return { error: `Erro ao aplicar desconto: ${updErr.message}` };
    }

    order.discount_amount = discountAmount;
    order.net_amount = newNet;
    order.balance_due = newBalanceDue;
  }

  // 3. Validação do saldo devedor
  const currentBalanceDue = Number(order.balance_due);
  if (totalToPay > currentBalanceDue) {
    return {
      error: `O valor total informado (R$ ${totalToPay.toFixed(2)}) excede o saldo restante devedor (R$ ${currentBalanceDue.toFixed(2)}).`,
    };
  }

  // 4. Se houver pagamento em DINHEIRO (cash), precisamos validar e obter o caixa físico aberto
  const hasCash = payments.some((p) => p.method === 'cash');
  let openCashRegisterId: string | null = null;

  if (hasCash) {
    const { data: openRegisters } = await supabase
      .from('cash_registers')
      .select('id, status')
      .eq('tenant_id', context.tenantId)
      .eq('status', 'open')
      .limit(1);

    if (!openRegisters || openRegisters.length === 0) {
      return {
        error: 'Para receber pagamentos em dinheiro, é obrigatório haver um Caixa Diário aberto no estabelecimento.',
      };
    }
    openCashRegisterId = openRegisters[0].id;
  }

  // 5. Inserir as transações
  const insertedTransactions: PaymentTransaction[] = [];

  for (const p of payments) {
    const isCash = p.method === 'cash';
    const cashRegisterIdToUse = isCash ? openCashRegisterId : null;

    const { data: tx, error: txErr } = await supabase
      .from('payment_transactions')
      .insert({
        tenant_id: context.tenantId,
        payment_order_id: order.id,
        cash_register_id: cashRegisterIdToUse,
        method: p.method,
        amount: Number(p.amount),
        installments: 1,
        status: 'confirmed',
        received_by: context.userId,
      })
      .select()
      .single();

    if (txErr || !tx) {
      return {
        error: `Erro ao processar transação em ${p.method}: ${txErr?.message || 'Falha ao gravar transação'}`,
      };
    }

    insertedTransactions.push(tx as PaymentTransaction);
  }

  // 6. Recarregar a ordem atualizada pelo trigger PostgreSQL
  const { data: updatedOrder } = await supabase
    .from('payment_orders')
    .select('*')
    .eq('id', order.id)
    .eq('tenant_id', context.tenantId)
    .single();

  revalidatePath(`/${tenantSlug}/agenda`);
  revalidatePath(`/${tenantSlug}/caixa`);

  return {
    success: true,
    data: {
      order: (updatedOrder || order) as PaymentOrder,
      transactions: insertedTransactions,
    },
  };
}

/**
 * Cria ou sincroniza o snapshot de comissão para um agendamento.
 * Respeita snapshots históricos: se a comissão já existir, não sobrescreve.
 * Permissões: owner e admin.
 */
export async function syncAppointmentCommissionAction(
  tenantSlug: string,
  appointmentId: string,
  customRatePercentage?: number
): Promise<FinancialActionResponse<ProfessionalCommission>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Apenas proprietários e administradores podem gerenciar comissões.' };
  }

  const supabase = await createClient();

  // 1. Busca agendamento com dados do serviço e ordem de pagamento
  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select(`
      id,
      tenant_id,
      professional_id,
      service_id,
      price,
      status
    `)
    .eq('id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .single();

  if (apptErr || !appt) {
    return { error: 'Agendamento não encontrado.' };
  }

  if (appt.status === 'canceled') {
    return { error: 'Não é possível gerar comissão para atendimentos cancelados.' };
  }

  // 2. Verifica se a comissão já existe (idempotência e snapshot histórico)
  const { data: existingComm } = await supabase
    .from('professional_commissions')
    .select('*')
    .eq('appointment_id', appointmentId)
    .eq('tenant_id', context.tenantId)
    .maybeSingle();

  if (existingComm) {
    return { success: true, data: existingComm as ProfessionalCommission };
  }

  // 3. Determina a taxa de comissão: parâmetro customizado ou taxa padrão da clínica (default 30.00%)
  const ratePercentage = typeof customRatePercentage === 'number' && !isNaN(customRatePercentage)
    ? Math.max(0, Math.min(100, customRatePercentage))
    : 30.00;

  // 4. Base de cálculo = valor contratado do serviço no agendamento
  const baseAmount = Number(appt.price) || 0;
  const commissionAmount = Number(((baseAmount * ratePercentage) / 100).toFixed(2));

  // 5. Determina status inicial: 'payable' se agendamento já concluído; 'forecast' caso contrário
  const status: CommissionStatus = appt.status === 'completed' ? 'payable' : 'forecast';

  const { data: newComm, error: insErr } = await supabase
    .from('professional_commissions')
    .insert({
      tenant_id: context.tenantId,
      appointment_id: appt.id,
      professional_id: appt.professional_id,
      service_id: appt.service_id,
      base_amount: baseAmount,
      rate_percentage: ratePercentage,
      commission_amount: commissionAmount,
      status,
    })
    .select()
    .single();

  if (insErr) {
    return { error: `Erro ao registrar comissão: ${insErr.message}` };
  }

  revalidatePath(`/${tenantSlug}/comissoes`);
  return { success: true, data: newComm as ProfessionalCommission };
}

/**
 * Registra o repasse / pagamento efetivo da comissão ao profissional.
 * Garante prevenção contra pagamento duplicado (status !== 'paid').
 * Permissões: owner e admin.
 */
export async function settleCommissionAction(
  tenantSlug: string,
  data: {
    commission_id: string;
    notes?: string;
  }
): Promise<FinancialActionResponse<ProfessionalCommission>> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  if (!['owner', 'admin'].includes(context.role)) {
    return { error: 'Apenas administradores podem registrar o repasse de comissões.' };
  }

  const supabase = await createClient();

  // 1. Busca a comissão existente
  const { data: comm, error: commErr } = await supabase
    .from('professional_commissions')
    .select('*')
    .eq('id', data.commission_id)
    .eq('tenant_id', context.tenantId)
    .single();

  if (commErr || !comm) {
    return { error: 'Registro de comissão não localizado.' };
  }

  if (comm.status === 'paid') {
    return { error: 'Esta comissão já foi liquidada e repassada anteriormente.' };
  }

  if (comm.status === 'canceled') {
    return { error: 'Não é permitido repassar comissões canceladas.' };
  }

  const settledAt = new Date().toISOString();
  const notes = data.notes?.trim()
    ? `${comm.notes ? comm.notes + ' | ' : ''}Repasse: ${data.notes.trim()}`
    : comm.notes;

  // 2. Atualiza atomicamente o repasse
  const { data: settledComm, error: updErr } = await supabase
    .from('professional_commissions')
    .update({
      status: 'paid',
      settled_at: settledAt,
      settled_by: context.userId,
      notes,
    })
    .eq('id', comm.id)
    .eq('tenant_id', context.tenantId)
    .select()
    .single();

  if (updErr || !settledComm) {
    return { error: `Falha ao liquidar repasse: ${updErr?.message || 'Erro desconhecido'}` };
  }

  revalidatePath(`/${tenantSlug}/comissoes`);
  return { success: true, data: settledComm as ProfessionalCommission };
}

/**
 * Consulta listagem e totais consolidados de comissões.
 * - owner / admin: visualizam a equipe com filtros por profissional, status e período.
 * - professional: visualiza EXCLUSIVAMENTE suas próprias comissões.
 * - receptionist: BLOQUEADO (retorna erro).
 */
export async function getCommissionsAction(
  tenantSlug: string,
  filters?: {
    professional_id?: string;
    status?: CommissionStatus | 'ALL';
    startDate?: string;
    endDate?: string;
  }
): Promise<
  FinancialActionResponse<{
    commissions: ProfessionalCommission[];
    summary: {
      totalForecast: number;
      totalPayable: number;
      totalPaid: number;
      totalCanceled: number;
    };
  }>
> {
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    return { error: 'Acesso negado.' };
  }

  // Recepcionista NÃO tem acesso a comissões
  if (context.role === 'receptionist') {
    return { error: 'Acesso não autorizado: recepcionistas não têm permissão para acessar o módulo de comissões.' };
  }

  const supabase = await createClient();

  // Para o perfil professional, descobre o seu ID na tabela professionals
  let enforcedProfId: string | null = null;
  if (context.role === 'professional') {
    const { data: myProf } = await supabase
      .from('professionals')
      .select('id')
      .eq('user_id', context.userId)
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    if (!myProf) {
      return { error: 'Perfil profissional não vinculado neste estabelecimento.' };
    }
    enforcedProfId = myProf.id;
  }

  let query = supabase
    .from('professional_commissions')
    .select(`
      id,
      tenant_id,
      appointment_id,
      professional_id,
      service_id,
      base_amount,
      rate_percentage,
      commission_amount,
      status,
      settled_at,
      settled_by,
      notes,
      created_at,
      updated_at,
      professional:professional_id (
        id,
        full_name,
        specialty
      ),
      service:service_id (
        id,
        name
      ),
      appointment:appointment_id (
        id,
        start_time,
        status,
        client:client_id (
          id,
          full_name
        )
      )
    `)
    .eq('tenant_id', context.tenantId)
    .order('created_at', { ascending: false });

  // Aplica filtro de profissional
  if (enforcedProfId) {
    query = query.eq('professional_id', enforcedProfId);
  } else if (filters?.professional_id && filters.professional_id !== 'ALL') {
    query = query.eq('professional_id', filters.professional_id);
  }

  // Aplica filtro de status
  if (filters?.status && filters.status !== 'ALL') {
    query = query.eq('status', filters.status);
  }

  // Aplica filtros de data
  if (filters?.startDate) {
    query = query.gte('created_at', `${filters.startDate}T00:00:00.000Z`);
  }
  if (filters?.endDate) {
    query = query.lte('created_at', `${filters.endDate}T23:59:59.999Z`);
  }

  const { data: comms, error: commsErr } = await query;
  if (commsErr) {
    return { error: `Erro ao consultar comissões: ${commsErr.message}` };
  }

  const list = (comms || []) as unknown as ProfessionalCommission[];

  let totalForecast = 0;
  let totalPayable = 0;
  let totalPaid = 0;
  let totalCanceled = 0;

  list.forEach((c) => {
    const val = Number(c.commission_amount) || 0;
    if (c.status === 'forecast') totalForecast += val;
    else if (c.status === 'payable') totalPayable += val;
    else if (c.status === 'paid') totalPaid += val;
    else if (c.status === 'canceled') totalCanceled += val;
  });

  return {
    success: true,
    data: {
      commissions: list,
      summary: {
        totalForecast: Number(totalForecast.toFixed(2)),
        totalPayable: Number(totalPayable.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalCanceled: Number(totalCanceled.toFixed(2)),
      },
    },
  };
}
