'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CashRegister, CashMovement, CashMovementType } from '@/types/financial';
import { OpenCashModal } from './OpenCashModal';
import { CashMovementModal } from './CashMovementModal';
import { CloseCashModal } from './CloseCashModal';
import {
  DollarSign,
  Lock,
  PlusCircle,
  ArrowDownRight,
  ArrowUpRight,
  ShoppingBag,
  CreditCard,
  QrCode,
  Clock,
  History,
  CheckCircle2,
  Receipt,
} from 'lucide-react';

interface CashRegisterManagerProps {
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
}

export function CashRegisterManager({
  tenantSlug,
  userRole,
  plan,
  activeRegister,
  movements,
  closedRegisters,
  summary,
}: CashRegisterManagerProps) {
  const router = useRouter();

  // Modais
  const [isOpenCashModalOpen, setIsOpenCashModalOpen] = useState(false);
  const [isCloseCashModalOpen, setIsCloseCashModalOpen] = useState(false);
  const [movementModalConfig, setMovementModalConfig] = useState<{
    isOpen: boolean;
    type: CashMovementType;
  }>({
    isOpen: false,
    type: 'supply',
  });

  const isOperator = ['owner', 'admin', 'receptionist'].includes(userRole);

  const handleRefresh = () => {
    router.refresh();
  };

  const openMovementModal = (type: CashMovementType) => {
    setMovementModalConfig({ isOpen: true, type });
  };

  return (
    <div className="space-y-6">
      {/* Barra de Ações do Topo */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-rose-500" />
              Caixa Diário
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Plano: {plan === 'intelligent' ? 'Inteligente (Multi-caixas)' : 'Essencial (Caixa Único)'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Controle de fluxo de gaveta física, sangrias, suprimentos e conferência cega.
          </p>
        </div>

        {/* Botão de Abertura / Fechamento */}
        {isOperator && (
          <div className="flex items-center gap-2">
            {!activeRegister ? (
              <button
                onClick={() => setIsOpenCashModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                Abrir Novo Caixa
              </button>
            ) : (
              <button
                onClick={() => setIsCloseCashModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-900 rounded-lg transition-colors"
              >
                <Lock className="w-4 h-4" />
                Fechar Caixa (Conferência Cega)
              </button>
            )}
          </div>
        )}
      </div>

      {/* Caixa Ativo ou Mensagem de Nenhum Aberto */}
      {activeRegister ? (
        <div className="space-y-6">
          {/* Card de Status do Caixa Aberto */}
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 dark:border-emerald-500/20 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {activeRegister.terminal_name}
                  </h3>
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Aberto
                  </span>
                </div>
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  Aberto em {new Date(activeRegister.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • Fundo inicial: R$ {Number(activeRegister.initial_balance).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Ações Rápidas de Movimentação */}
            {isOperator && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => openMovementModal('supply')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <ArrowDownRight className="w-3.5 h-3.5" />
                  + Suprimento
                </button>
                <button
                  onClick={() => openMovementModal('bleed')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-sm"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  - Sangria
                </button>
                <button
                  onClick={() => openMovementModal('expense')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-colors shadow-sm"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  - Despesa Dinheiro
                </button>
              </div>
            )}
          </div>

          {/* Cards de Resumo da Gaveta e Métodos Eletrônicos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Saldo Físico Esperado */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-1">
                Saldo Físico da Gaveta
              </span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                R$ {summary.expectedBalance.toFixed(2)}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Dinheiro em espécie presente na gaveta
              </p>
            </div>

            {/* Entradas e Suprimentos */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-1">
                Entradas em Dinheiro
              </span>
              <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                R$ {(summary.totalCashReceived + summary.totalSupplies).toFixed(2)}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Recebimentos: R$ {summary.totalCashReceived.toFixed(2)} | Suprim: R$ {summary.totalSupplies.toFixed(2)}
              </p>
            </div>

            {/* Sangrias e Despesas */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-1">
                Saídas em Dinheiro
              </span>
              <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                R$ {(summary.totalBleeds + summary.totalExpenses).toFixed(2)}
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Sangrias: R$ {summary.totalBleeds.toFixed(2)} | Despesas: R$ {summary.totalExpenses.toFixed(2)}
              </p>
            </div>

            {/* Total Eletrônico (Informativo - NÃO entra na gaveta) */}
            <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-4 shadow-sm">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-1">
                Meios Eletrônicos (Informativo)
              </span>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                R$ {(summary.totalPixReceived + summary.totalCardReceived + summary.totalOtherReceived).toFixed(2)}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1">
                <span className="flex items-center gap-0.5">
                  <QrCode className="w-3 h-3 text-emerald-500" /> Pix: R$ {summary.totalPixReceived.toFixed(2)}
                </span>
                <span className="flex items-center gap-0.5">
                  <CreditCard className="w-3 h-3 text-blue-500" /> Cartão: R$ {summary.totalCardReceived.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Histórico de Movimentações do Caixa Atual */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm flex items-center gap-2">
                <Receipt className="w-4 h-4 text-rose-500" />
                Lançamentos e Movimentações da Gaveta
              </h3>
              <span className="text-xs text-zinc-500">
                {movements.length} lançamento(s) registrado(s)
              </span>
            </div>

            {movements.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-xs">
                Nenhuma movimentação manual lançada neste caixa até o momento.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {movements.map((m) => {
                  const isSupply = m.type === 'supply';
                  const isBleed = m.type === 'bleed';

                  return (
                    <div
                      key={m.id}
                      className="p-4 flex items-center justify-between hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isSupply
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : isBleed
                              ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400'
                              : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}
                        >
                          {isSupply ? (
                            <ArrowDownRight className="w-4 h-4" />
                          ) : isBleed ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ShoppingBag className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                              {isSupply ? 'Suprimento' : isBleed ? 'Sangria' : 'Despesa em Dinheiro'}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-mono">
                              {m.category}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                            {m.description}
                          </p>
                          <span className="text-[10px] text-zinc-400">
                            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-sm font-bold ${
                            isSupply
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isSupply ? '+' : '-'} R$ {Number(m.amount).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Estado Vazio - Caixa Fechado */
        <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200">
            Nenhum Caixa Aberto no Momento
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Para iniciar o registro de pagamentos balcão, despesas e conferência física, realize a abertura do caixa informando o fundo de troco inicial.
          </p>
          {isOperator && (
            <button
              onClick={() => setIsOpenCashModalOpen(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Abrir Caixa Agora
            </button>
          )}
        </div>
      )}

      {/* Histórico de Caixas Fechados Anteriores */}
      {closedRegisters.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-400" />
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
              Histórico de Caixas Encerrados
            </h3>
          </div>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {closedRegisters.map((reg) => (
              <div
                key={reg.id}
                className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-xs hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {reg.terminal_name}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[10px] font-semibold">
                      Fechado
                    </span>
                  </div>
                  <p className="text-zinc-500 text-[11px] mt-0.5">
                    Aberto em {new Date(reg.opened_at).toLocaleDateString('pt-BR')} às {new Date(reg.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • Fechado às {reg.closed_at ? new Date(reg.closed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <span className="text-zinc-400 block text-[10px] uppercase">Físico Contado</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      R$ {Number(reg.closing_balance || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-zinc-400 block text-[10px] uppercase">Diferença</span>
                    <span
                      className={`font-bold ${
                        Number(reg.difference) === 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : Number(reg.difference) > 0
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {Number(reg.difference) === 0
                        ? 'R$ 0,00'
                        : `${Number(reg.difference) > 0 ? '+' : ''} R$ ${Number(reg.difference).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modais Operacionais */}
      <OpenCashModal
        tenantSlug={tenantSlug}
        isOpen={isOpenCashModalOpen}
        onClose={() => setIsOpenCashModalOpen(false)}
        onSuccess={handleRefresh}
      />

      {activeRegister && (
        <>
          <CashMovementModal
            tenantSlug={tenantSlug}
            cashRegisterId={activeRegister.id}
            type={movementModalConfig.type}
            isOpen={movementModalConfig.isOpen}
            onClose={() => setMovementModalConfig((prev) => ({ ...prev, isOpen: false }))}
            onSuccess={handleRefresh}
          />

          <CloseCashModal
            tenantSlug={tenantSlug}
            register={activeRegister}
            isOpen={isCloseCashModalOpen}
            onClose={() => setIsCloseCashModalOpen(false)}
            onSuccess={handleRefresh}
          />
        </>
      )}
    </div>
  );
}
