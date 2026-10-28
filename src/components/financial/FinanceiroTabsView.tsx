'use client';

import React, { useState } from 'react';
import { CashRegister, CashMovement, OperatingExpense } from '@/types/financial';
import { CashRegisterManager } from '@/components/financial/CashRegisterManager';
import { OperatingExpensesManager } from '@/components/financial/OperatingExpensesManager';
import { DollarSign, Receipt } from 'lucide-react';

interface FinanceiroTabsViewProps {
  tenantSlug: string;
  userRole: string;
  plan: string;
  activeRegister: CashRegister | null;
  movements: CashMovement[];
  closedRegisters: CashRegister[];
  summary: {
    initialBalance: number;
    totalSupplies: number;
    totalBleeds: number;
    totalExpenses: number;
    totalCashReceived: number;
    expectedBalance: number;
    totalPixReceived: number;
    totalCardReceived: number;
    totalOtherReceived: number;
  };
  initialExpenses: OperatingExpense[];
}

export function FinanceiroTabsView({
  tenantSlug,
  userRole,
  plan,
  activeRegister,
  movements,
  closedRegisters,
  summary,
  initialExpenses,
}: FinanceiroTabsViewProps) {
  const [activeTab, setActiveTab] = useState<'caixa' | 'despesas'>('caixa');

  return (
    <div className="space-y-6">
      {/* Seletor de Abas no Topo do Financeiro */}
      <div className="flex items-center justify-between border-b border-[#EADBCE] pb-3 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1115] tracking-tight">
            Gestão Financeira
          </h1>
          <p className="text-xs sm:text-sm text-[#7D6B65]">
            Controle integrado de caixa diário, sangrias, suprimentos e contas a pagar
          </p>
        </div>

        <div className="flex items-center p-1 rounded-xl bg-white border border-[#EADBCE] shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab('caixa')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'caixa'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Caixa Diário (Gaveta)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('despesas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'despesas'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Despesas & Contas a Pagar</span>
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba */}
      {activeTab === 'caixa' ? (
        <CashRegisterManager
          tenantSlug={tenantSlug}
          userRole={userRole}
          plan={plan}
          activeRegister={activeRegister}
          movements={movements}
          closedRegisters={closedRegisters}
          summary={summary}
        />
      ) : (
        <OperatingExpensesManager
          tenantSlug={tenantSlug}
          userRole={userRole}
          initialExpenses={initialExpenses}
          activeCashRegister={activeRegister}
        />
      )}
    </div>
  );
}
