'use client';

import React, { useState } from 'react';
import { ProfessionalCommission } from '@/types/financial';
import { settleCommissionAction } from '@/lib/actions/financial';
import { X, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';

interface SettleCommissionModalProps {
  tenantSlug: string;
  commission: ProfessionalCommission | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SettleCommissionModal({
  tenantSlug,
  commission,
  isOpen,
  onClose,
  onSuccess,
}: SettleCommissionModalProps) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !commission) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await settleCommissionAction(tenantSlug, {
        commission_id: commission.id,
        notes: notes.trim() || undefined,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setErrorMessage('Erro inesperado ao liquidar comissão.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                Confirmar Repasse de Comissão
              </h3>
              <p className="text-xs text-zinc-500">
                {commission.professional?.full_name || 'Profissional'}
              </p>
            </div>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Dados do Procedimento e Comissão */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-500">Serviço Realizado:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {commission.service?.name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Valor Base do Serviço:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                R$ {Number(commission.base_amount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Percentual Histórico:</span>
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {Number(commission.rate_percentage).toFixed(1)}%
              </span>
            </div>
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700 flex justify-between items-center">
              <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                Valor do Repasse:
              </span>
              <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                R$ {Number(commission.commission_amount).toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Observações / Comprovante do Repasse (Opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Transferência Pix realizada pelo Itaú..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSubmitting ? 'Repassando...' : 'Confirmar Quitação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
