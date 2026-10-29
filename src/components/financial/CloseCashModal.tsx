'use client';

import React, { useState } from 'react';
import { closeCashRegisterAction } from '@/lib/actions/financial';
import { X, Lock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CashRegister } from '@/types/financial';

interface CloseCashModalProps {
  tenantSlug: string;
  register: CashRegister;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CloseCashModal({
  tenantSlug,
  register,
  isOpen,
  onClose,
  onSuccess,
}: CloseCashModalProps) {
  const [closingBalance, setClosingBalance] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closureResult, setClosureResult] = useState<{
    difference: number;
    closing_balance: number;
    system_calculated_balance: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanValue = closingBalance.replace(/\./g, '').replace(',', '.');
    const numericClosing = parseFloat(cleanValue);

    if (isNaN(numericClosing) || numericClosing < 0) {
      setErrorMessage('Por favor, informe a contagem física válida da gaveta (ex: 250,50 ou 0,00).');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await closeCashRegisterAction(tenantSlug, {
        cash_register_id: register.id,
        closing_balance: numericClosing,
        notes: notes.trim() || undefined,
      });

      if (result.error) {
        setErrorMessage(result.error);
        setIsSubmitting(false);
      } else if (result.data) {
        // Exibe o resultado da apuração cega
        setClosureResult({
          difference: Number(result.data.difference),
          closing_balance: Number(result.data.closing_balance),
          system_calculated_balance: Number(result.data.system_calculated_balance),
        });
        setIsSubmitting(false);
      }
    } catch {
      setErrorMessage('Erro inesperado ao fechar caixa.');
      setIsSubmitting(false);
    }
  };

  const handleFinish = () => {
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border-0 sm:border border-zinc-200 dark:border-zinc-800 rounded-none sm:rounded-xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Fixo */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                Fechamento de Caixa Cego
              </h3>
              <p className="text-xs text-zinc-500">{register.terminal_name}</p>
            </div>
          </div>
          {!closureResult && (
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Corpo: Modo Apuração / Sucesso */}
        {closureResult ? (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Caixa Fechado com Sucesso!
              </h4>
              <p className="text-xs text-zinc-500">
                O registro foi encerrado e tornou-se imutável no sistema.
              </p>
            </div>

            {/* Resultado da Conferência Cega */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 space-y-3 border border-zinc-200 dark:border-zinc-700/60 text-sm">
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>Saldo Esperado no Sistema:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  R$ {closureResult.system_calculated_balance.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-400">
                <span>Valor Físico Informado:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  R$ {closureResult.closing_balance.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center font-bold">
                <span>Diferença Apurada:</span>
                <span
                  className={
                    closureResult.difference === 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : closureResult.difference > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  {closureResult.difference === 0
                    ? 'R$ 0,00 (Exato)'
                    : closureResult.difference > 0
                    ? `+ R$ ${closureResult.difference.toFixed(2)} (Sobra)`
                    : `- R$ ${Math.abs(closureResult.difference).toFixed(2)} (Quebra/Falta)`}
                </span>
              </div>
            </div>

            <button
              onClick={handleFinish}
              className="w-full py-2.5 text-sm font-semibold text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity"
            >
              Concluir e Atualizar Tela
            </button>
          </div>
        ) : (
          /* Formulário de Conferência Cega */
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Conferência Cega Ativa:</strong> Conte todo o dinheiro físico da gaveta e informe abaixo. O sistema comparará com as entradas e saídas e registrará a diferença.
                </span>
              </div>

              {errorMessage && (
                <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
                  {errorMessage}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Contagem Física da Gaveta (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-zinc-500 font-medium">R$</span>
                  <input
                    type="text"
                    value={closingBalance}
                    onChange={(e) => setClosingBalance(e.target.value)}
                    placeholder="0,00"
                    className="w-full pl-9 pr-3 py-2 text-sm font-bold bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Apenas dinheiro físico em espécie. Pagamentos via Pix e Cartões são apurados separadamente.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
                  Observações de Encerramento (Opcional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Turno encerrado sem intercorrências..."
                  rows={2}
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 sm:px-6 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Fechando e Auditando...' : 'Confirmar Fechamento'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
