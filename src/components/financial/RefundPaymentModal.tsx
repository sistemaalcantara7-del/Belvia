'use client';

import React, { useState, useTransition } from 'react';
import { PaymentTransaction, PaymentMethodType, PAYMENT_METHOD_LABELS } from '@/types/financial';
import { refundPaymentTransactionAction } from '@/lib/actions/financial';
import { X, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface RefundPaymentModalProps {
  tenantSlug: string;
  transaction: PaymentTransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  activeCashRegisterId?: string | null;
}

export function RefundPaymentModal({
  tenantSlug,
  transaction,
  isOpen,
  onClose,
  onSuccess,
  activeCashRegisterId,
}: RefundPaymentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [amountStr, setAmountStr] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethodType>('pix');
  const [reopenBalanceDue, setReopenBalanceDue] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen || !transaction) return null;

  // Calcula o total já estornado
  const alreadyRefunded = (transaction.refunds || []).reduce(
    (sum, r) => sum + Number(r.amount),
    0
  );
  const maxRefundable = Math.max(0, Number(transaction.amount) - alreadyRefunded);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/\D/g, '');
    if (!rawVal) {
      setAmountStr('');
      return;
    }
    const num = parseInt(rawVal, 10) / 100;
    setAmountStr(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleSetMax = () => {
    setAmountStr(maxRefundable.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.')) || 0;

    if (cleanAmount <= 0) {
      setErrorMessage('Informe um valor de estorno válido maior que zero.');
      return;
    }

    if (cleanAmount > maxRefundable) {
      setErrorMessage(`O valor do estorno não pode ultrapassar o limite disponível de R$ ${maxRefundable.toFixed(2)}.`);
      return;
    }

    if (!reason || reason.trim().length < 3) {
      setErrorMessage('Informe uma justificativa auditável para o estorno.');
      return;
    }

    if (method === 'cash' && !activeCashRegisterId) {
      setErrorMessage('Para devolver valores em dinheiro (espécie), é obrigatório haver um Caixa Diário aberto no momento.');
      return;
    }

    startTransition(async () => {
      const res = await refundPaymentTransactionAction(tenantSlug, {
        transactionId: transaction.id,
        amount: cleanAmount,
        reason: reason.trim(),
        method,
        reopenBalanceDue,
        cashRegisterId: method === 'cash' ? activeCashRegisterId : null,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage('Estorno processado com sucesso!');
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1200);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full sm:max-w-md h-full sm:h-auto sm:max-h-[92vh] flex flex-col bg-white dark:bg-zinc-900 rounded-none sm:rounded-2xl shadow-2xl border-0 sm:border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800 bg-[#FAF4EE] dark:bg-zinc-800/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                Emitir Estorno / Reembolso
              </h3>
              <p className="text-[11px] text-zinc-500">
                Transação #{transaction.id.slice(0, 8)} • {PAYMENT_METHOD_LABELS[transaction.method]}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 text-xs bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Resumo Contábil da Transação */}
          <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Pago Original</span>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                R$ {Number(transaction.amount).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Já Estornado</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-400">
                R$ {alreadyRefunded.toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-zinc-400 block">Disponível</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                R$ {maxRefundable.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Valor do Estorno */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Valor a Estornar (R$) *
                </label>
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 underline"
                >
                  Estorno Total (R$ {maxRefundable.toFixed(2)})
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-zinc-400 font-bold">R$</span>
                <input
                  type="text"
                  value={amountStr}
                  onChange={handleAmountChange}
                  placeholder="0,00"
                  required
                  className="w-full pl-8 pr-3 py-2 text-sm font-bold bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>
            </div>

            {/* Meio de Devolução */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Forma de Devolução ao Cliente *
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethodType)}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none"
              >
                <option value="pix">Pix</option>
                <option value="credit_card">Cartão de Crédito (Estorno Adquirente)</option>
                <option value="debit_card">Cartão de Débito</option>
                <option value="cash">
                  Dinheiro Físico da Gaveta {!activeCashRegisterId ? '(Sem Caixa Aberto)' : ''}
                </option>
                <option value="bank_transfer">Transferência Bancária</option>
                <option value="other">Outro</option>
              </select>
            </div>

            {/* Motivo do Estorno */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Justificativa Auditável *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Cliente desistiu do procedimento / Procedimento cancelado em comum acordo..."
                rows={2}
                required
                className="w-full p-2.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none resize-none"
              />
            </div>

            {/* Opção de Reabertura de Cobrança */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-100 dark:border-zinc-800 space-y-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reopenBalanceDue}
                  onChange={(e) => setReopenBalanceDue(e.target.checked)}
                  className="rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  Reabrir saldo devedor na comanda
                </span>
              </label>
              <p className="text-[11px] text-zinc-500 pl-5">
                Marque apenas se o serviço foi mantido e o cliente ainda precisará pagar por outro meio. Deixe desmarcado em caso de desistência/cancelamento definitivo.
              </p>
            </div>
          </div>
          </div>

          {/* Botões Fixos no Rodapé */}
          <div className="flex items-center gap-2 p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || maxRefundable <= 0}
              className="flex-1 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isPending ? 'Estornando...' : 'Confirmar Estorno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
