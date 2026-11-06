'use client';

import React, { useState } from 'react';
import { FinancialCategory, FinancialCategoryType } from '@/types/financial';
import { createFinancialCategoryAction } from '@/lib/actions/financial';
import { X, Tag, Plus, Loader2, AlertCircle } from 'lucide-react';

interface QuickNewCategoryModalProps {
  tenantSlug: string;
  type: FinancialCategoryType;
  isOpen: boolean;
  onClose: () => void;
  onCategoryCreated: (newCategory: FinancialCategory) => void;
}

const TYPE_DESCRIPTIONS: Record<FinancialCategoryType, { title: string; subtitle: string }> = {
  supply: {
    title: 'Nova Categoria de Suprimento',
    subtitle: 'Categorize aportes de dinheiro na gaveta do caixa.',
  },
  bleed: {
    title: 'Nova Categoria de Sangria',
    subtitle: 'Categorize retiradas de espécie da gaveta (cofre, depósito, etc.).',
  },
  expense: {
    title: 'Nova Categoria de Despesa em Dinheiro',
    subtitle: 'Categorize pagamentos rápidos realizados com a gaveta de caixa.',
  },
  operating_expense: {
    title: 'Nova Categoria de Despesa Operacional',
    subtitle: 'Categorize contas a pagar, custos fixos e despesas gerais.',
  },
};

export function QuickNewCategoryModal({
  tenantSlug,
  type,
  isOpen,
  onClose,
  onCategoryCreated,
}: QuickNewCategoryModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const config = TYPE_DESCRIPTIONS[type] || {
    title: 'Nova Categoria Financeira',
    subtitle: 'Cadastre uma categoria para sua gestão.',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) {
      setError('O nome da categoria deve possuir pelo menos 2 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createFinancialCategoryAction(tenantSlug, {
        name: cleanName,
        type,
      });

      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        onCategoryCreated(res.data);
        setName('');
        onClose();
      }
    } catch {
      setError('Erro ao salvar categoria. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div
        className="w-full max-w-sm rounded-2xl bg-white border border-[#EADBCE] shadow-2xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#F5EDE8] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shrink-0">
              <Tag className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1E1115]">{config.title}</h3>
              <p className="text-[11px] text-[#7D6B65]">{config.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#7D6B65] hover:text-[#1E1115] hover:bg-stone-100 transition-colors"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
              Nome da Categoria *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Embalagens Premium, Farmácia..."
              maxLength={80}
              autoFocus
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F5EDE8]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[40px] px-3.5 py-2 text-xs font-semibold text-[#7D6B65] hover:bg-stone-100 rounded-xl transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[40px] flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#B87070] hover:bg-[#A56363] rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-60 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Cadastrar Categoria</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
