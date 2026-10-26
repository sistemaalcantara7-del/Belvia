'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ProfessionalCommission,
  CommissionStatus,
  COMMISSION_STATUS_MAP,
} from '@/types/financial';
import { Professional } from '@/types/professionals';
import { SettleCommissionModal } from './SettleCommissionModal';
import {
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Calendar,
  User,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

interface CommissionManagerProps {
  tenantSlug: string;
  userRole: string;
  initialCommissions: ProfessionalCommission[];
  initialSummary: {
    totalForecast: number;
    totalPayable: number;
    totalPaid: number;
    totalCanceled: number;
  };
  professionals: Professional[];
}

export function CommissionManager({
  tenantSlug,
  userRole,
  initialCommissions,
  initialSummary,
  professionals,
}: CommissionManagerProps) {
  const router = useRouter();

  // Filtros
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | 'ALL'>('ALL');
  const [profFilter, setProfFilter] = useState<string>('ALL');

  // Modal de Repasse
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedCommission, setSelectedCommission] = useState<ProfessionalCommission | null>(null);

  const canManage = ['owner', 'admin'].includes(userRole);
  const isProfessional = userRole === 'professional';

  // Filtragem local
  const filteredCommissions = initialCommissions.filter((c) => {
    const matchStatus = statusFilter === 'ALL' || c.status === statusFilter;
    const matchProf = profFilter === 'ALL' || c.professional_id === profFilter;
    return matchStatus && matchProf;
  });

  const handleOpenSettle = (comm: ProfessionalCommission) => {
    setSelectedCommission(comm);
    setSettleModalOpen(true);
  };

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Topo / Título */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {isProfessional ? 'Minhas Comissões' : 'Gestão de Comissões e Repasses'}
              </h1>
              <p className="text-xs text-zinc-500">
                {isProfessional
                  ? 'Acompanhe suas comissões previstas, liberadas para saque e repasses recebidos.'
                  : 'Controle de comissões da equipe, snapshots históricos e auditoria de repasses.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 rounded-full font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            {canManage ? 'Acesso Gestão Total' : 'Acesso Pessoal'}
          </span>
        </div>
      </div>

      {/* Cards de Métricas e Totais Consolidados */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Comissões Previstas */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Previstas</span>
            <Clock className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-black text-zinc-800 dark:text-zinc-200">
            R$ {initialSummary.totalForecast.toFixed(2)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Procedimentos agendados</p>
        </div>

        {/* Devidas (A Repassar) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">A Repassar (Devidas)</span>
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            R$ {initialSummary.totalPayable.toFixed(2)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Atendimentos concluídos e quitados</p>
        </div>

        {/* Repassadas (Pagas) */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Pagas (Quitadas)</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            R$ {initialSummary.totalPaid.toFixed(2)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Repasses efetuados e auditados</p>
        </div>

        {/* Canceladas */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-zinc-400 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Canceladas</span>
            <XCircle className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold text-zinc-400">
            R$ {initialSummary.totalCanceled.toFixed(2)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Agendamentos cancelados</p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-500 font-medium">
            <Filter className="w-3.5 h-3.5" /> Filtrar por:
          </div>

          {/* Filtro de Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CommissionStatus | 'ALL')}
            className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-rose-500 font-medium"
          >
            <option value="ALL">Todos os Status</option>
            <option value="forecast">Previstas</option>
            <option value="payable">Devidas (A Pagar)</option>
            <option value="paid">Pagas</option>
            <option value="canceled">Canceladas</option>
          </select>

          {/* Filtro de Profissional (apenas para Admin/Owner) */}
          {canManage && (
            <select
              value={profFilter}
              onChange={(e) => setProfFilter(e.target.value)}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-300 dark:border-zinc-700 rounded-lg outline-none focus:ring-1 focus:ring-rose-500 font-medium"
            >
              <option value="ALL">Toda a Equipe</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} ({p.specialty})
                </option>
              ))}
            </select>
          )}
        </div>

        <span className="text-zinc-400 text-[11px]">
          Exibindo {filteredCommissions.length} registro(s)
        </span>
      </div>

      {/* Lista / Tabela de Comissões */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
        {filteredCommissions.length === 0 ? (
          <div className="p-12 text-center text-zinc-400 text-xs">
            Nenhuma comissão localizada para os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filteredCommissions.map((comm) => {
              const statusCfg = COMMISSION_STATUS_MAP[comm.status];
              const isPayable = comm.status === 'payable';

              return (
                <div
                  key={comm.id}
                  className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors text-xs"
                >
                  {/* Informações Centrais do Procedimento */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                        {comm.service?.name || 'Procedimento'}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      >
                        {statusCfg.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-500 text-[11px]">
                      {canManage && (
                        <span className="flex items-center gap-1 font-medium text-zinc-700 dark:text-zinc-300">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          {comm.professional?.full_name || 'Profissional'}
                        </span>
                      )}

                      {comm.appointment?.client && (
                        <span>Cliente: {comm.appointment.client.full_name}</span>
                      )}

                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-400" />
                        {new Date(comm.created_at).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(comm.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>

                      {comm.settled_at && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Repassado em {new Date(comm.settled_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Valores e Botão de Quitação */}
                  <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
                    <div className="text-right">
                      <span className="text-zinc-400 block text-[10px] uppercase font-mono">
                        Base: R$ {Number(comm.base_amount).toFixed(2)} ({Number(comm.rate_percentage).toFixed(1)}%)
                      </span>
                      <span className="text-base font-black text-zinc-900 dark:text-zinc-100 font-mono">
                        R$ {Number(comm.commission_amount).toFixed(2)}
                      </span>
                    </div>

                    {/* Botão de Repasse (apenas Owner/Admin e status 'payable') */}
                    {canManage && isPayable && (
                      <button
                        onClick={() => handleOpenSettle(comm)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Repassar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Repasse */}
      <SettleCommissionModal
        tenantSlug={tenantSlug}
        commission={selectedCommission}
        isOpen={settleModalOpen}
        onClose={() => {
          setSettleModalOpen(false);
          setSelectedCommission(null);
        }}
        onSuccess={handleRefresh}
      />
    </div>
  );
}
