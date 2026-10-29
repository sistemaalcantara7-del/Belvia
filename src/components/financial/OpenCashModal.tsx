'use client';

import React, { useState } from 'react';
import { openCashRegisterAction } from '@/lib/actions/financial';
import { X, DollarSign, AlertCircle } from 'lucide-react';

interface OpenCashModalProps {
  tenantSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function OpenCashModal({ tenantSlug, isOpen, onClose, onSuccess }: OpenCashModalProps) {
  const [terminalName, setTerminalName] = useState('Balcão Principal');
  const [initialBalance, setInitialBalance] = useState('0,00');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Converte string monetária brasileira para número
    const cleanValue = initialBalance.replace(/\./g, '').replace(',', '.');
    const numericBalance = parseFloat(cleanValue);

    if (isNaN(numericBalance) || numericBalance < 0) {
      setErrorMessage('Por favor, informe um valor de troco inicial válido (ex: 50,00 ou 0,00).');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await openCashRegisterAction(tenantSlug, {
        terminal_name: terminalName,
        initial_balance: numericBalance,
        notes: notes.trim() || undefined,
      });

      if (result.error) {
        setErrorMessage(result.error);
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setErrorMessage('Erro inesperado ao abrir o caixa. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border-0 sm:border border-zinc-200 dark:border-zinc-800 rounded-none sm:rounded-xl shadow-2xl w-full sm:max-w-md h-full sm:h-auto sm:max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header Fixo */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">
              Abertura de Caixa
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Terminal / Ponto de Venda
            </label>
            <input
              type="text"
              value={terminalName}
              onChange={(e) => setTerminalName(e.target.value)}
              placeholder="Ex: Balcão Principal, Terminal Recepção"
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Fundo de Troco Inicial (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-zinc-500 font-medium">R$</span>
              <input
                type="text"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="0,00"
                className="w-full pl-9 pr-3 py-2 text-sm font-semibold bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                required
              />
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Informe a quantia física em cédulas e moedas presente na gaveta no momento da abertura.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Observações (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Turno da manhã, responsabilidade Mariana..."
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
              {isSubmitting ? 'Abrindo...' : 'Confirmar Abertura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
