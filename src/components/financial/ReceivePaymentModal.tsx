'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Appointment } from '@/types/appointments';
import {
  PaymentOrder,
  PaymentMethodType,
  CashRegister,
  PAYMENT_METHOD_LABELS,
  PAYMENT_ORDER_STATUS_MAP,
} from '@/types/financial';
import {
  getOrCreatePaymentOrderForAppointmentAction,
  processPaymentOrderAction,
  SplitPaymentItem,
} from '@/lib/actions/financial';
import { PaymentReceiptModal } from './PaymentReceiptModal';
import {
  X,
  CreditCard,
  AlertCircle,
  Plus,
  Trash2,
  Receipt,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface ReceivePaymentModalProps {
  tenantSlug: string;
  tenantName: string;
  userRole: string;
  appointment: Appointment | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess?: () => void;
}

export function ReceivePaymentModal({
  tenantSlug,
  tenantName,
  userRole,
  appointment,
  isOpen,
  onClose,
  onPaymentSuccess,
}: ReceivePaymentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [activeCashRegister, setActiveCashRegister] = useState<CashRegister | null>(null);
  const [tenantPlan, setTenantPlan] = useState<'essential' | 'smart'>('essential');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de formulário de pagamento
  const [discountStr, setDiscountStr] = useState('0,00');
  const [payments, setPayments] = useState<Array<{ id: string; method: PaymentMethodType; amountStr: string }>>([
    { id: '1', method: 'pix', amountStr: '' },
  ]);

  // Recibo Não Fiscal
  const [receiptOpen, setReceiptOpen] = useState(false);

  const canManage = ['owner', 'admin', 'receptionist'].includes(userRole);

  // Carrega ou gera a ordem ao abrir o modal
  useEffect(() => {
    let isCancelled = false;

    if (isOpen && appointment) {
      const loadOrder = async () => {
        try {
          const res = await getOrCreatePaymentOrderForAppointmentAction(tenantSlug, appointment.id);
          if (isCancelled) return;
          if (res.error) {
            setErrorMessage(res.error);
          } else if (res.data) {
            setOrder(res.data.order);
            setActiveCashRegister(res.data.activeCashRegister);
            setTenantPlan(res.data.plan as 'essential' | 'smart');

            const balanceDue = Number(res.data.order.balance_due);
            setPayments([
              {
                id: '1',
                method: res.data.activeCashRegister ? 'cash' : 'pix',
                amountStr: balanceDue > 0 ? balanceDue.toFixed(2).replace('.', ',') : '0,00',
              },
            ]);
            if (Number(res.data.order.discount_amount) > 0) {
              setDiscountStr(Number(res.data.order.discount_amount).toFixed(2).replace('.', ','));
            }
          }
        } catch {
          if (!isCancelled) setErrorMessage('Erro ao carregar ordem financeira do atendimento.');
        } finally {
          if (!isCancelled) setLoadingOrder(false);
        }
      };

      loadOrder();
    }

    return () => {
      isCancelled = true;
    };
  }, [isOpen, appointment, tenantSlug]);

  if (!isOpen || !appointment) return null;

  // Cálculos dinâmicos em tempo de tela
  const grossAmount = order ? Number(order.gross_amount) : Number(appointment.price);
  const cleanDiscount = parseFloat(discountStr.replace(/\./g, '').replace(',', '.')) || 0;
  const currentPaid = order ? Number(order.paid_amount) : 0;
  const simulatedNet = Math.max(0, Number((grossAmount - cleanDiscount).toFixed(2)));
  const simulatedRemaining = Math.max(0, Number((simulatedNet - currentPaid).toFixed(2)));

  const handleAddPaymentRow = () => {
    if (tenantPlan === 'essential') return;
    setPayments((prev) => [
      ...prev,
      { id: Math.random().toString(), method: 'credit_card', amountStr: '' },
    ]);
  };

  const handleRemovePaymentRow = (id: string) => {
    if (payments.length <= 1) return;
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handlePaymentMethodChange = (id: string, method: PaymentMethodType) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, method } : p)));
  };

  const handlePaymentAmountChange = (id: string, amountStr: string) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, amountStr } : p)));
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Valida itens de pagamento
    const splitItems: SplitPaymentItem[] = [];
    let sumToPay = 0;

    for (const p of payments) {
      const cleanVal = parseFloat(p.amountStr.replace(/\./g, '').replace(',', '.'));
      if (isNaN(cleanVal) || cleanVal <= 0) {
        setErrorMessage('Todos os pagamentos informados devem ter valor maior que zero.');
        return;
      }
      splitItems.push({ method: p.method, amount: cleanVal });
      sumToPay = Number((sumToPay + cleanVal).toFixed(2));
    }

    if (splitItems.length === 0) {
      setErrorMessage('Informe ao menos uma forma de pagamento.');
      return;
    }

    if (tenantPlan === 'essential' && splitItems.length > 1) {
      setErrorMessage('O plano Essencial permite apenas 1 forma de pagamento por atendimento.');
      return;
    }

    // Se houver dinheiro, verifica caixa aberto
    const hasCash = splitItems.some((s) => s.method === 'cash');
    if (hasCash && !activeCashRegister) {
      setErrorMessage('Para receber em dinheiro, é obrigatório abrir o Caixa Diário antes.');
      return;
    }

    startTransition(async () => {
      try {
        const res = await processPaymentOrderAction(tenantSlug, {
          payment_order_id: order.id,
          discount_amount: currentPaid === 0 ? cleanDiscount : undefined,
          payments: splitItems,
        });

        if (res.error) {
          setErrorMessage(res.error);
        } else if (res.data) {
          setOrder(res.data.order);
          setSuccessMessage('Pagamento registrado com sucesso!');
          onPaymentSuccess?.();

          // Ajusta formulário para próximo pagamento ou encerramento
          const newBalanceDue = Number(res.data.order.balance_due);
          if (newBalanceDue > 0) {
            setPayments([
              {
                id: Math.random().toString(),
                method: 'pix',
                amountStr: newBalanceDue.toFixed(2).replace('.', ','),
              },
            ]);
          }
        }
      } catch {
        setErrorMessage('Erro inesperado ao registrar pagamento.');
      }
    });
  };

  const isOrderFullyPaid = order?.status === 'paid' || (order && Number(order.balance_due) <= 0);
  const statusCfg = order ? PAYMENT_ORDER_STATUS_MAP[order.status] : null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base">
                  Recebimento do Atendimento
                </h3>
                <p className="text-xs text-zinc-500">
                  {appointment.client?.full_name} • {appointment.service?.name}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Corpo Modal */}
          <div className="p-6 overflow-y-auto space-y-5">
            {loadingOrder ? (
              <div className="py-12 text-center space-y-2">
                <Clock className="w-8 h-8 animate-spin text-rose-500 mx-auto" />
                <p className="text-xs text-zinc-500">Carregando dados financeiros da ordem...</p>
              </div>
            ) : (
              <>
                {/* Mensagens de Alerta ou Sucesso */}
                {errorMessage && (
                  <div className="flex items-start gap-2 p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}
                {successMessage && (
                  <div className="flex items-start gap-2 p-3 text-xs text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {/* Banner de Status Financeiro Atual */}
                {order && statusCfg && (
                  <div className="flex items-center justify-between p-3.5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500 font-medium">Status da Cobrança:</span>
                      <span
                        className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {statusCfg.label}
                      </span>
                    </div>

                    {order.paid_amount > 0 && (
                      <button
                        type="button"
                        onClick={() => setReceiptOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Ver Comprovante
                      </button>
                    )}
                  </div>
                )}

                {/* Resumo de Valores */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Preço Bruto</span>
                    <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
                      R$ {grossAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Desconto</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      - R$ {(order ? Number(order.discount_amount) : cleanDiscount).toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Total Pago</span>
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      R$ {currentPaid.toFixed(2)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-zinc-100 dark:border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Saldo Restante</span>
                    <span
                      className={`text-sm font-black ${
                        simulatedRemaining > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      R$ {simulatedRemaining.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Histórico de Transações Já Realizadas */}
                {order && order.transactions && order.transactions.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                      Pagamentos Já Confirmados ({order.transactions.length})
                    </span>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                      {order.transactions.map((t) => (
                        <div key={t.id} className="p-3 flex items-center justify-between text-xs bg-white dark:bg-zinc-900">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <div>
                              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                {PAYMENT_METHOD_LABELS[t.method]}
                              </span>
                              <span className="text-[10px] text-zinc-400 block">
                                Pago em {new Date(t.paid_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            R$ {Number(t.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formulário de Novo Pagamento (se ainda houver saldo restante e permissão) */}
                {!isOrderFullyPaid && canManage ? (
                  <form onSubmit={handleSubmitPayment} className="space-y-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                    {/* Campo de Desconto (apenas se nenhum pagamento tiver sido feito ainda) */}
                    {currentPaid === 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                          Desconto Autorizado (R$)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-sm text-zinc-500 font-medium">R$</span>
                          <input
                            type="text"
                            value={discountStr}
                            onChange={(e) => setDiscountStr(e.target.value)}
                            placeholder="0,00"
                            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Formas de Pagamento */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                          Formas de Pagamento {tenantPlan === 'smart' && '(Pagamento Misto Ativo)'}
                        </label>
                        {tenantPlan === 'smart' && (
                          <button
                            type="button"
                            onClick={handleAddPaymentRow}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"
                          >
                            <Plus className="w-3.5 h-3.5" /> Adicionar Forma
                          </button>
                        )}
                      </div>

                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          {/* Seletor de Método */}
                          <div className="w-1/2">
                            <select
                              value={p.method}
                              onChange={(e) => handlePaymentMethodChange(p.id, e.target.value as PaymentMethodType)}
                              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                            >
                              <option value="pix">Pix</option>
                              <option value="credit_card">Cartão de Crédito</option>
                              <option value="debit_card">Cartão de Débito</option>
                              <option value="cash">
                                Dinheiro (Espécie) {!activeCashRegister ? '(Caixa Fechado)' : ''}
                              </option>
                              <option value="bank_transfer">Transferência</option>
                              <option value="other">Outro</option>
                            </select>
                          </div>

                          {/* Campo de Valor */}
                          <div className="relative flex-1">
                            <span className="absolute left-2.5 top-2 text-xs text-zinc-500">R$</span>
                            <input
                              type="text"
                              value={p.amountStr}
                              onChange={(e) => handlePaymentAmountChange(p.id, e.target.value)}
                              placeholder="0,00"
                              className="w-full pl-8 pr-3 py-2 text-xs font-semibold bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                              required
                            />
                          </div>

                          {/* Botão de Remover (Apenas no Plano Inteligente se houver mais de 1 linha) */}
                          {tenantPlan === 'smart' && payments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemovePaymentRow(p.id)}
                              className="p-2 text-zinc-400 hover:text-red-500 rounded-lg"
                              title="Remover forma de pagamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Alerta de Caixa Fechado se selecionou Dinheiro */}
                    {payments.some((p) => p.method === 'cash') && !activeCashRegister && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>
                          <strong>Caixa Fechado:</strong> Para registrar recebimentos em espécie, abra o Caixa Diário no menu lateral antes de confirmar.
                        </span>
                      </div>
                    )}

                    {/* Botão de Ação */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="w-full py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <CreditCard className="w-4 h-4" />
                        {isPending ? 'Processando Recebimento...' : 'Confirmar e Quitar Pagamento'}
                      </button>
                    </div>
                  </form>
                ) : isOrderFullyPaid ? (
                  <div className="p-5 text-center bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-900/60 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                    <h4 className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">
                      Atendimento Integralmente Quitado
                    </h4>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 max-w-sm mx-auto">
                      Todos os valores deste atendimento foram liquidados com sucesso.
                    </p>
                    <button
                      type="button"
                      onClick={() => setReceiptOpen(true)}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 rounded-lg hover:bg-emerald-50"
                    >
                      <Receipt className="w-3.5 h-3.5" /> Imprimir Recibo Não Fiscal
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/20">
            <span className="text-[11px] text-zinc-500">
              Plano: {tenantPlan === 'smart' ? 'Inteligente (Múltiplas Formas)' : 'Essencial (Forma Única)'}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Comprovante Não Fiscal */}
      {order && (
        <PaymentReceiptModal
          isOpen={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          order={order}
          appointment={appointment}
          tenantName={tenantName}
        />
      )}
    </>
  );
}
