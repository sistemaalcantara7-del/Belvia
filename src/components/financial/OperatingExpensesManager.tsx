'use client';

import React, { useState, useTransition } from 'react';
import {
  OperatingExpense,
  ExpensePaymentSource,
  OperatingExpenseStatus,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_SOURCES,
  CashRegister,
} from '@/types/financial';
import {
  createOperatingExpenseAction,
  settleOperatingExpenseAction,
  cancelOperatingExpenseAction,
} from '@/lib/actions/financial';
import {
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Ban,
  Tag,
} from 'lucide-react';

interface OperatingExpensesManagerProps {
  tenantSlug: string;
  userRole: string;
  initialExpenses: OperatingExpense[];
  activeCashRegister: CashRegister | null;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function OperatingExpensesManager({
  tenantSlug,
  userRole,
  initialExpenses,
  activeCashRegister,
}: OperatingExpensesManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [expenses, setExpenses] = useState<OperatingExpense[]>(initialExpenses);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<'ALL' | OperatingExpenseStatus>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [settleModalExpense, setSettleModalExpense] = useState<OperatingExpense | null>(null);

  // Formulário de Nova Despesa
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [competenceDate, setCompetenceDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentSource, setPaymentSource] = useState<ExpensePaymentSource>('bank_account');
  const [isAlreadyPaid, setIsAlreadyPaid] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Baixa / Liquidação
  const [settleSource, setSettleSource] = useState<ExpensePaymentSource>('bank_account');
  const [settlePaidDate, setSettlePaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [settleMethod, setSettleMethod] = useState('Pix');
  const [settleError, setSettleError] = useState<string | null>(null);

  const canManage = ['owner', 'admin'].includes(userRole);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (!rawVal) {
      setAmountStr('');
      return;
    }
    const num = parseInt(rawVal, 10) / 100;
    setAmountStr(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const cleanAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0;

    if (cleanAmount <= 0) {
      setFormError('Informe um valor válido maior que zero.');
      return;
    }

    if (isAlreadyPaid && paymentSource === 'cash_register' && !activeCashRegister) {
      setFormError('Para pagar despesa em espécie com baixa imediata, é obrigatório haver Caixa Diário aberto.');
      return;
    }

    startTransition(async () => {
      const res = await createOperatingExpenseAction(tenantSlug, {
        category,
        description: description.trim(),
        amount: cleanAmount,
        dueDate,
        competenceDate,
        paymentSource,
        status: isAlreadyPaid ? 'paid' : 'pending',
        recipient: recipient.trim() || undefined,
        notes: notes.trim() || undefined,
        cashRegisterId: activeCashRegister?.id || null,
      });

      if (res.error) {
        setFormError(res.error);
      } else if (res.data) {
        setFormSuccess('Despesa cadastrada com sucesso!');
        setExpenses([res.data, ...expenses]);
        setTimeout(() => {
          setIsNewModalOpen(false);
          setDescription('');
          setAmountStr('');
          setRecipient('');
          setNotes('');
          setIsAlreadyPaid(false);
          setFormSuccess(null);
        }, 800);
      }
    });
  };

  const handleSettleExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleModalExpense) return;
    setSettleError(null);

    if (settleSource === 'cash_register' && !activeCashRegister) {
      setSettleError('Para liquidar em dinheiro (espécie), abra o Caixa Diário antes de confirmar.');
      return;
    }

    startTransition(async () => {
      const res = await settleOperatingExpenseAction(tenantSlug, {
        expenseId: settleModalExpense.id,
        paymentSource: settleSource,
        paymentMethod: settleMethod,
        paidAt: settlePaidDate,
        cashRegisterId: activeCashRegister?.id || null,
      });

      if (res.error) {
        setSettleError(res.error);
      } else if (res.data) {
        setExpenses(expenses.map((exp) => (exp.id === res.data?.id ? res.data : exp)));
        setSettleModalExpense(null);
      }
    });
  };

  const handleCancelExpense = (expId: string) => {
    if (!confirm('Deseja realmente cancelar esta despesa?')) return;

    startTransition(async () => {
      const res = await cancelOperatingExpenseAction(tenantSlug, expId, 'Cancelado pelo operador');
      if (res.data) {
        setExpenses(expenses.map((exp) => (exp.id === res.data?.id ? res.data : exp)));
      } else if (res.error) {
        alert(res.error);
      }
    });
  };

  // Filtragem dos dados
  const filteredExpenses = expenses.filter((exp) => {
    if (statusFilter !== 'ALL' && exp.status !== statusFilter) return false;
    if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchDesc = exp.description.toLowerCase().includes(term);
      const matchRec = exp.recipient ? exp.recipient.toLowerCase().includes(term) : false;
      const matchCat = exp.category.toLowerCase().includes(term);
      if (!matchDesc && !matchRec && !matchCat) return false;
    }
    return true;
  });

  // Totais
  const totalPending = expenses
    .filter((e) => e.status === 'pending')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalPaid = expenses
    .filter((e) => e.status === 'paid')
    .reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="space-y-6">
      {/* ── 1. CABEÇALHO DO MÓDULO E KPIS RÁPIDOS ─────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#1E1115]">
            Contas a Pagar & Despesas Operacionais
          </h2>
          <p className="text-xs text-[#7D6B65]">
            Gerencie despesas bancárias e operacionais com segregação entre competência e caixa
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#B87070] hover:bg-[#A35D5D] transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Despesa</span>
          </button>
        )}
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-[#7D6B65] block">A Pagar (Pendentes)</span>
            <span className="text-xl font-bold text-amber-700 block mt-0.5">
              {formatCurrency(totalPending)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-[#7D6B65] block">Despesas Liquidadas</span>
            <span className="text-xl font-bold text-[#1B873F] block mt-0.5">
              {formatCurrency(totalPaid)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-[#7D6B65] block">Total Cadastrado</span>
            <span className="text-xl font-bold text-[#1E1115] block mt-0.5">
              {expenses.length} lançamentos
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
            <Tag className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ── 2. FILTROS DE CONSULTA ───────────────────────────────────── */}
      <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Busca por Texto */}
          <div className="flex-1">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, favorecido ou categoria..."
              className="w-full px-3.5 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
            />
          </div>

          {/* Filtro de Status */}
          <div className="w-full sm:w-44">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | OperatingExpenseStatus)}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
            >
              <option value="ALL">Todas as Situações</option>
              <option value="pending">Apenas Pendentes</option>
              <option value="paid">Apenas Pagas</option>
              <option value="canceled">Canceladas</option>
            </select>
          </div>

          {/* Filtro de Categoria */}
          <div className="w-full sm:w-56">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
            >
              <option value="ALL">Todas as Categorias</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 3. LISTAGEM DE DESPESAS OPERACIONAIS ──────────────────────── */}
      <div className="bg-white border border-[#EADBCE] rounded-2xl shadow-xs overflow-hidden">
        {filteredExpenses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF5F3] text-[#7D6B65] border-b border-[#EADBCE] font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Descrição / Favorecido</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">Competência</th>
                  <th className="px-4 py-3">Fonte / Meio</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  {canManage && <th className="px-4 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5EBE6]">
                {filteredExpenses.map((exp) => {
                  const isPaid = exp.status === 'paid';
                  const isCanceled = exp.status === 'canceled';

                  return (
                    <tr key={exp.id} className="hover:bg-[#FAF5F3]/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`font-semibold text-[#1E1115] block ${isCanceled ? 'line-through text-zinc-400' : ''}`}>
                          {exp.description}
                        </span>
                        {exp.recipient && (
                          <span className="text-[11px] text-[#7D6B65] block">
                            Favorecido: {exp.recipient}
                          </span>
                        )}
                        {exp.cash_movement_id && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded inline-block mt-0.5 font-bold">
                            Gaveta de Caixa Vinculada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#66534E]">
                        <span className="px-2 py-1 rounded-md bg-[#FAF0EC] text-[#B87070] font-semibold text-[11px]">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[#2C1810]">
                        {new Date(`${exp.due_date}T12:00:00Z`).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 font-mono text-[#7D6B65]">
                        {new Date(`${exp.competence_date}T12:00:00Z`).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-[#7D6B65]">
                        <span>{EXPENSE_PAYMENT_SOURCES[exp.payment_source] || exp.payment_source}</span>
                        {exp.payment_method && (
                          <span className="block text-[10px] text-zinc-400">({exp.payment_method})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#EBF7F0] text-[#1B873F]">
                            <CheckCircle2 className="w-3 h-3" /> Pago
                          </span>
                        ) : isCanceled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 text-zinc-500">
                            <Ban className="w-3 h-3" /> Cancelada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">
                            <Clock className="w-3 h-3" /> Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#1E1115]">
                        {formatCurrency(Number(exp.amount))}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                          {!isPaid && !isCanceled && (
                            <>
                              <button
                                type="button"
                                onClick={() => setSettleModalExpense(exp)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-[#1B873F] hover:bg-[#156e33] transition-colors shadow-2xs"
                              >
                                Dar Baixa
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelExpense(exp.id)}
                                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                              >
                                Cancelar
                              </button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-[#7D6B65] space-y-1">
            <p className="font-semibold text-sm text-[#2C1810]">Nenhuma despesa encontrada</p>
            <p>Não há lançamentos de despesas operacionais para os filtros selecionados.</p>
          </div>
        )}
      </div>

      {/* ── MODAL 1: CADASTRAR NOVA DESPESA ──────────────────────────── */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#EADBCE] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#F0E5DF] bg-[#FAF5F3]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#1E1115]">Cadastrar Despesa / Conta a Pagar</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 text-[#7D6B65] hover:text-[#1E1115] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
              {formSuccess && (
                <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {/* Categoria */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                    Categoria Contábil *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Valor */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                    Valor (R$) *
                  </label>
                  <input
                    type="text"
                    value={amountStr}
                    onChange={handleAmountChange}
                    placeholder="0,00"
                    required
                    className="w-full px-3 py-2 text-xs font-bold bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                  Descrição da Obrigação *
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Fatura de Energia Elétrica Ref. Outubro"
                  required
                  className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                />
              </div>

              {/* Favorecido */}
              <div>
                <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                  Favorecido / Fornecedor
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Ex: Enel Distribuição / Imobiliária Central"
                  className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Vencimento */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                    Data de Vencimento *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  />
                </div>

                {/* Competência */}
                <div>
                  <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                    Mês de Competência *
                  </label>
                  <input
                    type="date"
                    value={competenceDate}
                    onChange={(e) => setCompetenceDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  />
                </div>
              </div>

              {/* Fonte de Pagamento Prevista */}
              <div>
                <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                  Fonte de Liquidação *
                </label>
                <select
                  value={paymentSource}
                  onChange={(e) => setPaymentSource(e.target.value as ExpensePaymentSource)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                >
                  <option value="bank_account">Conta Bancária (Pix / Boleto / Transferência)</option>
                  <option value="cash_register">
                    Caixa Diário em Espécie {!activeCashRegister ? '(Sem Caixa Aberto)' : ''}
                  </option>
                  <option value="credit_card">Cartão de Crédito Corporativo</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              {/* Checkbox de Já Paga */}
              <div className="p-3 bg-[#FAF5F3] rounded-xl border border-[#EADBCE] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1E1115] block">Baixa Imediata</span>
                  <span className="text-[11px] text-[#7D6B65]">Esta despesa já foi quitada hoje</span>
                </div>
                <input
                  type="checkbox"
                  checked={isAlreadyPaid}
                  onChange={(e) => setIsAlreadyPaid(e.target.checked)}
                  className="rounded text-[#B87070] focus:ring-[#B87070] w-4 h-4"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  disabled={isPending}
                  className="flex-1 py-2.5 text-xs font-semibold text-[#7D6B65] hover:bg-[#F5EBE6] rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-[#B87070] hover:bg-[#A35D5D] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isPending ? 'Salvando...' : 'Gravar Despesa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: DAR BAIXA EM DESPESA PENDENTE ───────────────────── */}
      {settleModalExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-[#EADBCE] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-[#F0E5DF] bg-[#FAF5F3]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#EBF7F0] text-[#1B873F] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#1E1115]">Liquidar Despesa (Dar Baixa)</h3>
              </div>
              <button
                type="button"
                onClick={() => setSettleModalExpense(null)}
                className="p-1 text-[#7D6B65] hover:text-[#1E1115] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSettleExpense} className="p-5 space-y-4">
              {settleError && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{settleError}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#7D6B65] block">Despesa</span>
                <span className="text-xs font-bold text-[#1E1115] block">{settleModalExpense.description}</span>
                <span className="text-sm font-mono font-bold text-[#B87070] block">
                  {formatCurrency(Number(settleModalExpense.amount))}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                  Fonte de Pagamento Utilizada *
                </label>
                <select
                  value={settleSource}
                  onChange={(e) => setSettleSource(e.target.value as ExpensePaymentSource)}
                  className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                >
                  <option value="bank_account">Conta Bancária (Pix / Boleto / Débito)</option>
                  <option value="cash_register">
                    Gaveta do Caixa Diário em Espécie {!activeCashRegister ? '(Sem Caixa Aberto)' : ''}
                  </option>
                  <option value="credit_card">Cartão de Crédito</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                    Data do Pagamento *
                  </label>
                  <input
                    type="date"
                    value={settlePaidDate}
                    onChange={(e) => setSettlePaidDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
                    Forma de Pagamento
                  </label>
                  <input
                    type="text"
                    value={settleMethod}
                    onChange={(e) => setSettleMethod(e.target.value)}
                    placeholder="Ex: Pix, Boleto, Dinheiro"
                    className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleModalExpense(null)}
                  disabled={isPending}
                  className="flex-1 py-2.5 text-xs font-semibold text-[#7D6B65] hover:bg-[#F5EBE6] rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-[#1B873F] hover:bg-[#156e33] rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isPending ? 'Baixando...' : 'Confirmar Liquidação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
