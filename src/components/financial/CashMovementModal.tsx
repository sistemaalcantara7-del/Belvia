'use client';

import React, { useState } from 'react';
import { createCashMovementAction } from '@/lib/actions/financial';
import { CashMovementType } from '@/types/financial';
import { X, ArrowDownRight, ArrowUpRight, ShoppingBag, AlertCircle } from 'lucide-react';

interface CashMovementModalProps {
  tenantSlug: string;
  cashRegisterId: string;
  type: CashMovementType;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CashMovementModal({
  tenantSlug,
  cashRegisterId,
  type,
  isOpen,
  onClose,
  onSuccess,
}: CashMovementModalProps) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(
    type === 'supply' ? 'troco' : type === 'bleed' ? 'recolhimento_cofre' : 'insumos'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const typeConfig = {
    supply: {
      title: 'Suprimento de Caixa (Entrada)',
      desc: 'Adicionar dinheiro em espécie à gaveta (reforço de troco).',
      icon: ArrowDownRight,
      color: 'emerald',
      categories: [
        { value: 'troco', label: 'Reforço de Troco' },
        { value: 'outros', label: 'Outro Suprimento' },
      ],
    },
    bleed: {
      title: 'Sangria de Caixa (Retirada)',
      desc: 'Retirar dinheiro em espécie para depósito ou cofre.',
      icon: ArrowUpRight,
      color: 'amber',
      categories: [
        { value: 'recolhimento_cofre', label: 'Recolhimento para Cofre' },
        { value: 'deposito_bancario', label: 'Depósito Bancário' },
        { value: 'outros', label: 'Outra Retirada' },
      ],
    },
    expense: {
      title: 'Despesa Operacional em Dinheiro',
      desc: 'Pagamento imediato de conta/insumo utilizando o dinheiro da gaveta.',
      icon: ShoppingBag,
      color: 'rose',
      categories: [
        { value: 'insumos', label: 'Insumos de Consumo / Café / Limpeza' },
        { value: 'transporte', label: 'Frete / Transporte / Correios' },
        { value: 'manutencao', label: 'Manutenção Rápida' },
        { value: 'outros', label: 'Outras Despesas' },
      ],
    },
  }[type];

  const Icon = typeConfig.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanValue = amount.replace(/\./g, '').replace(',', '.');
    const numericAmount = parseFloat(cleanValue);

    if (isNaN(numericAmount) || numericAmount <= 0) {
      setErrorMessage('Informe um valor monetário positivo maior que zero.');
      return;
    }

    if (!description.trim()) {
      setErrorMessage('A descrição/justificativa é obrigatória.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createCashMovementAction(tenantSlug, {
        cash_register_id: cashRegisterId,
        type,
        amount: numericAmount,
        category,
        description: description.trim(),
      });

      if (result.error) {
        setErrorMessage(result.error);
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setErrorMessage('Erro ao registrar movimentação.');
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
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                type === 'supply'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : type === 'bleed'
                  ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                  : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">
                {typeConfig.title}
              </h3>
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

        {/* Form com Scroll Interno */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          <p className="text-xs text-zinc-500">{typeConfig.desc}</p>

          {errorMessage && (
            <div className="flex items-start gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Valor (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-sm text-zinc-500 font-medium">R$</span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-9 pr-3 py-2 text-sm font-semibold bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Categoria
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
            >
              {typeConfig.categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
              Justificativa / Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Compra de pó de café e açúcar para a recepção..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-300 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none resize-none"
              required
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
              {isSubmitting ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
