'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  Filter,
  DollarSign,
  RotateCcw,
  TrendingUp,
  CheckCircle2,
  Receipt,
  PieChart,
  UserCheck,
  Scissors,
  Layers,
  FileSpreadsheet,
  AlertCircle,
  FileText,
  FileDown,
  Users,
  Clock,
  UserPlus,
  RefreshCw,
  ExternalLink,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { exportReportToPDF, exportReportToExcel } from '@/lib/reportsExporter';
import {
  ClientRetentionMetrics,
  ClientInactivityItem,
  ClientMonthlyEvolutionItem,
} from '@/types/retention';

interface ReportsViewProps {
  tenantSlug: string;
  tenantName: string;
  role: string;
  canViewFinancial: boolean;
  startDate: string;
  endDate: string;
  selectedProfessionalId: string;
  selectedServiceId: string;
  professionals: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string }>;
  metrics: {
    totalGrossReceived: number;
    totalRefunds: number;
    netReceived: number;
    totalCompletedCount: number;
    averageTicket: number;
    totalCommissionsPaid: number;
    totalCommissionsPending: number;
    totalExpensesPaidCash: number;
    totalExpensesIncurredCompetence: number;
    billedRevenueCompetence: number;
  };
  dailyEvolution: Array<{
    dateStr: string;
    label: string;
    received: number;
    refunded: number;
    net: number;
  }>;
  serviceDistribution: Array<{
    name: string;
    count: number;
    totalAmount: number;
  }>;
  retentionMetrics?: ClientRetentionMetrics;
  inactivityList?: ClientInactivityItem[];
  clientMonthlyEvolution?: ClientMonthlyEvolutionItem[];
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function ReportsView({
  tenantSlug,
  tenantName,
  role,
  canViewFinancial,
  startDate,
  endDate,
  selectedProfessionalId,
  selectedServiceId,
  professionals,
  services,
  metrics,
  dailyEvolution,
  serviceDistribution,
  retentionMetrics,
  inactivityList = [],
  clientMonthlyEvolution = [],
}: ReportsViewProps) {
  const router = useRouter();

  // Aba ativa: 'overview' (Visão Geral), 'dre' (DRE Gerencial) ou 'retention' (Clientes & Retenção)
  const [activeTab, setActiveTab] = useState<'overview' | 'dre' | 'retention'>('overview');

  // Filtro de inatividade na aba de retenção: 'ALL' | '30+' | '60+' | '90+'
  const [inactivityFilter, setInactivityFilter] = useState<'ALL' | '30+' | '60+' | '90+'>('ALL');
  const [inactivitySearch, setInactivitySearch] = useState('');

  // Regime de apuração do DRE: 'caixa' (recebimentos/liquidação) ou 'competencia' (faturamento de serviços concluídos)
  const [accountingRegime, setAccountingRegime] = useState<'caixa' | 'competencia'>('caixa');

  // Estados locais dos filtros
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [profId, setProfId] = useState(selectedProfessionalId);
  const [servId, setServId] = useState(selectedServiceId);

  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const selectedProfObj = professionals.find((p) => p.id === profId);
  const selectedServObj = services.find((s) => s.id === servId);

  const handleExportPDF = async () => {
    try {
      setIsExporting('pdf');
      setExportError(null);
      exportReportToPDF({
        tenantName,
        startDate: start,
        endDate: end,
        professionalName: selectedProfObj?.name,
        serviceName: selectedServObj?.name,
        activeTab,
        accountingRegime,
        metrics,
        dailyEvolution,
        serviceDistribution,
      });
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      setExportError('Falha ao gerar o arquivo PDF. Tente novamente.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting('excel');
      setExportError(null);
      exportReportToExcel({
        tenantName,
        startDate: start,
        endDate: end,
        professionalName: selectedProfObj?.name,
        serviceName: selectedServObj?.name,
        activeTab,
        accountingRegime,
        metrics,
        dailyEvolution,
        serviceDistribution,
      });
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      setExportError('Falha ao gerar a planilha Excel. Tente novamente.');
    } finally {
      setIsExporting(null);
    }
  };

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (start) params.set('startDate', start);
    if (end) params.set('endDate', end);
    if (profId && profId !== 'ALL') params.set('professionalId', profId);
    if (servId && servId !== 'ALL') params.set('serviceId', servId);
    router.push(`/${tenantSlug}/relatorios?${params.toString()}`);
  };

  const handleResetFilters = () => {
    router.push(`/${tenantSlug}/relatorios`);
  };

  // Cálculo de máximos para os gráficos de barras normalizados
  const maxNetEvolution = Math.max(
    ...dailyEvolution.map((d) => Math.abs(d.net)),
    100
  );

  const totalServiceCount = serviceDistribution.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── 1. CABEÇALHO DO MÓDULO DE RELATÓRIOS ───────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
              <BarChart3 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1E1115] tracking-tight">
                Relatórios Gerenciais
              </h1>
              <p className="text-xs sm:text-sm text-[#7D6B65]">
                {tenantName} • Indicadores financeiros e operacionais consolidados
              </p>
            </div>
          </div>
        </div>

        {/* Ações e Abas Superiores ZELUNIA */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botões de Exportação */}
          {canViewFinancial && (
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#EADBCE] shadow-2xs">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExporting !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#66534E] hover:text-[#B87070] hover:bg-[#FAF0EC] transition-all disabled:opacity-50"
                title="Exportar documento PDF (A4 formatado)"
              >
                <FileText className="w-3.5 h-3.5 text-[#B87070]" />
                <span>{isExporting === 'pdf' ? 'Gerando...' : 'Exportar PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                disabled={isExporting !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#66534E] hover:text-[#2E7D32] hover:bg-emerald-50 transition-all disabled:opacity-50"
                title="Exportar planilha Excel (.xlsx)"
              >
                <FileDown className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isExporting === 'excel' ? 'Gerando...' : 'Exportar Excel'}</span>
              </button>
            </div>
          )}

          {/* Abas Superiores ZELUNIA */}
          <div className="flex items-center p-1 rounded-xl bg-white border border-[#EADBCE] shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'overview'
                  ? 'bg-[#B87070] text-white shadow-2xs'
                  : 'text-[#7D6B65] hover:text-[#2C1810]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Visão Geral</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dre')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'dre'
                  ? 'bg-[#B87070] text-white shadow-2xs'
                  : 'text-[#7D6B65] hover:text-[#2C1810]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>DRE Gerencial</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('retention')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'retention'
                  ? 'bg-[#B87070] text-white shadow-2xs'
                  : 'text-[#7D6B65] hover:text-[#2C1810]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Clientes & Retenção</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alerta de Erro de Exportação */}
      {exportError && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{exportError}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-[11px] font-bold text-red-800 hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ── 2. BARRA DE FILTROS AVANÇADOS ─────────────────────────────── */}
      <form
        onSubmit={handleApplyFilters}
        className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4"
      >
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#B87070]">
          <Filter className="w-4 h-4" />
          <span>Filtros de Apuração</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Data Inicial */}
          <div>
            <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
              Data Inicial
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-[#A8948D] absolute left-3 top-2.5" />
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              />
            </div>
          </div>

          {/* Data Final */}
          <div>
            <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
              Data Final
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-[#A8948D] absolute left-3 top-2.5" />
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              />
            </div>
          </div>

          {/* Profissional */}
          <div>
            <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
              Profissional
            </label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-[#A8948D] absolute left-3 top-2.5" />
              <select
                value={profId}
                disabled={role === 'professional'}
                onChange={(e) => setProfId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none disabled:opacity-60"
              >
                {role !== 'professional' && <option value="ALL">Todos os Profissionais</option>}
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Serviço */}
          <div>
            <label className="block text-[11px] font-semibold text-[#66534E] mb-1">
              Serviço
            </label>
            <div className="relative">
              <Scissors className="w-4 h-4 text-[#A8948D] absolute left-3 top-2.5" />
              <select
                value={servId}
                onChange={(e) => setServId(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              >
                <option value="ALL">Todos os Serviços</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#F5EBE6]">
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-4 py-2 text-xs font-semibold text-[#7D6B65] hover:bg-[#F5EBE6] rounded-xl transition-colors"
          >
            Limpar Filtros
          </button>
          <button
            type="submit"
            className="px-5 py-2 text-xs font-bold text-white bg-[#B87070] hover:bg-[#A35D5D] rounded-xl shadow-xs transition-colors"
          >
            Filtrar Resultados
          </button>
        </div>
      </form>

      {/* ── CONTEÚDO DA ABA SELECIONADA ────────────────────────────── */}
      {activeTab === 'overview' ? (
        <>
          {/* ── 3. CARDS DE INDICADORES (KPIS GERENCIAIS) ─────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Receita Líquida Recebida */}
            <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#7D6B65] uppercase">Receita Líquida</span>
                <div className="w-7 h-7 rounded-lg bg-[#EBF7F0] text-[#1B873F] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <span className="text-xl font-bold text-[#1E1115] tracking-tight block">
                {canViewFinancial ? formatCurrency(metrics.netReceived) : '••••••'}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-1 block">Entradas - Estornos</span>
            </div>

            {/* Recebimentos Brutos */}
            <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#7D6B65] uppercase">Recebimentos</span>
                <div className="w-7 h-7 rounded-lg bg-[#FFF8EB] text-[#C48616] flex items-center justify-center">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <span className="text-xl font-bold text-[#1E1115] tracking-tight block">
                {canViewFinancial ? formatCurrency(metrics.totalGrossReceived) : '••••••'}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-1 block">Pagamentos confirmados</span>
            </div>

            {/* Estornos e Devoluções */}
            <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#7D6B65] uppercase">Estornos</span>
                <div className="w-7 h-7 rounded-lg bg-[#FDF0EE] text-[#D33D29] flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
              </div>
              <span className="text-xl font-bold text-[#D33D29] tracking-tight block">
                {canViewFinancial ? `- ${formatCurrency(metrics.totalRefunds)}` : '••••••'}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-1 block">Compensações no período</span>
            </div>

            {/* Atendimentos Concluídos */}
            <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#7D6B65] uppercase">Atendimentos</span>
                <div className="w-7 h-7 rounded-lg bg-[#FCEFEB] text-[#B87070] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <span className="text-xl font-bold text-[#1E1115] tracking-tight block">
                {metrics.totalCompletedCount}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-1 block">Procedimentos finalizados</span>
            </div>

            {/* Ticket Médio */}
            <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#7D6B65] uppercase">Ticket Médio</span>
                <div className="w-7 h-7 rounded-lg bg-[#EEF4FD] text-[#2D73D5] flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>
              <span className="text-xl font-bold text-[#1E1115] tracking-tight block">
                {canViewFinancial ? formatCurrency(metrics.averageTicket) : '••••••'}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-1 block">Por atendimento concluído</span>
            </div>

            {/* Comissões Pagas / Devidas */}
            <div className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#7D6B65] uppercase">Comissões</span>
                <div className="w-7 h-7 rounded-lg bg-[#F3EBF9] text-[#8637B3] flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
              </div>
              <span className="text-lg font-bold text-[#1E1115] tracking-tight block">
                {formatCurrency(metrics.totalCommissionsPaid)}
              </span>
              <span className="text-[10px] text-[#8637B3] mt-1 block">
                + {formatCurrency(metrics.totalCommissionsPending)} pendentes
              </span>
            </div>
          </div>

          {/* ── 4. GRÁFICOS GERENCIAIS (EVOLUÇÃO E DISTRIBUIÇÃO) ───────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico 1: Evolução Financeira Diária (Recebimentos Líquidos) */}
            <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1E1115]">Evolução Financeira Diária</h3>
                    <p className="text-xs text-[#7D6B65]">Recebimentos líquidos por data efetiva de liquidação</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#7D6B65]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1B873F]" /> Positivo
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-[#7D6B65]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#D33D29]" /> Negativo
                  </span>
                </div>
              </div>

              {canViewFinancial ? (
                dailyEvolution.length > 0 ? (
                  <div className="pt-4">
                    <div className="h-56 flex items-end gap-1.5 sm:gap-2 pb-6 border-b border-[#F0E5DF] overflow-x-auto">
                      {dailyEvolution.map((d) => {
                        const isNeg = d.net < 0;
                        const heightPercent = Math.min(
                          100,
                          Math.max(8, Math.round((Math.abs(d.net) / maxNetEvolution) * 100))
                        );

                        return (
                          <div
                            key={d.dateStr}
                            className="flex-1 min-w-[28px] max-w-[42px] flex flex-col items-center justify-end h-full group relative"
                          >
                            <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-[#2C1810] text-white text-[10px] py-1 px-2 rounded-md shadow-md whitespace-nowrap pointer-events-none">
                              <span className="font-bold">{d.label}</span>
                              <span>Líquido: {formatCurrency(d.net)}</span>
                              <span>Entrada: {formatCurrency(d.received)} | Estorno: {formatCurrency(d.refunded)}</span>
                            </div>

                            <div
                              style={{ height: `${heightPercent}%` }}
                              className={`w-full rounded-t-md transition-all ${
                                isNeg
                                  ? 'bg-[#D33D29] group-hover:bg-[#B72C19]'
                                  : 'bg-[#B87070] group-hover:bg-[#9B5353]'
                              }`}
                            />
                            <span className="text-[10px] text-[#7D6B65] mt-1.5 transform -rotate-45 sm:rotate-0 origin-center truncate">
                              {d.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-[#7D6B65]">
                    Nenhuma movimentação financeira registrada no período selecionado.
                  </div>
                )
              ) : (
                <div className="p-8 text-center text-xs text-[#7D6B65]">
                  Você não possui permissão para visualizar o detalhamento financeiro diário.
                </div>
              )}
            </div>

            {/* Gráfico 2: Distribuição por Procedimentos Mais Realizados */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1E1115]">Mix de Procedimentos</h3>
                  <p className="text-xs text-[#7D6B65]">Serviços concluídos no período</p>
                </div>
              </div>

              {serviceDistribution.length > 0 ? (
                <div className="space-y-4 pt-1">
                  {serviceDistribution.map((serv, index) => {
                    const percent = totalServiceCount > 0
                      ? Math.round((serv.count / totalServiceCount) * 100)
                      : 0;

                    return (
                      <div key={serv.name} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#2C1810] truncate max-w-[160px]">
                            {index + 1}. {serv.name}
                          </span>
                          <div className="text-right">
                            <span className="font-bold text-[#1E1115]">{serv.count}</span>
                            <span className="text-[11px] text-[#7D6B65] ml-1">({percent}%)</span>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[#FAF0EC] overflow-hidden">
                          <div
                            style={{ width: `${percent}%` }}
                            className="h-full rounded-full bg-[#B87070] transition-all"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-[#7D6B65]">
                  Nenhum procedimento concluído registrado no intervalo selecionado.
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── ABA 2: DRE GERENCIAL ESTRUTURADO ───────────────────────── */
        <div className="space-y-6">
          {/* Seletor de Regime Contábil & Informações */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#1E1115]">
                  Demonstrativo do Resultado do Exercício (DRE)
                </h3>
                <p className="text-xs text-[#7D6B65]">
                  Apuração contábil segregada entre entradas efetivas e competência operacional
                </p>
              </div>
            </div>

            {/* Alternador de Regime */}
            <div className="flex items-center p-1 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]">
              <button
                type="button"
                onClick={() => setAccountingRegime('caixa')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  accountingRegime === 'caixa'
                    ? 'bg-white text-[#B87070] shadow-2xs font-bold'
                    : 'text-[#7D6B65] hover:text-[#2C1810]'
                }`}
              >
                Regime de Caixa (Liquidação)
              </button>
              <button
                type="button"
                onClick={() => setAccountingRegime('competencia')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  accountingRegime === 'competencia'
                    ? 'bg-white text-[#B87070] shadow-2xs font-bold'
                    : 'text-[#7D6B65] hover:text-[#2C1810]'
                }`}
              >
                Regime de Competência (Faturamento)
              </button>
            </div>
          </div>

          {/* DRE - Tabela Estruturada de Rubricas */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-6">
            <div className="border border-[#F0E5DF] rounded-xl overflow-hidden divide-y divide-[#F0E5DF]">
              {/* 1. RECEITA BRUTA */}
              <div className="p-4 bg-[#FAF5F3] flex items-center justify-between">
                <div>
                  <span className="text-xs font-black tracking-wider uppercase text-[#2C1810]">
                    (+) 1. {accountingRegime === 'caixa' ? 'Receita Operacional Recebida (Caixa)' : 'Faturamento Bruto Gerado (Competência)'}
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    {accountingRegime === 'caixa'
                      ? 'Total de pagamentos liquidados (dinheiro, pix, cartões)'
                      : 'Valor total contratado em atendimentos concluídos no período'}
                  </p>
                </div>
                <span className="text-sm sm:text-base font-bold font-mono text-[#1E1115]">
                  {canViewFinancial
                    ? formatCurrency(
                        accountingRegime === 'caixa'
                          ? metrics.totalGrossReceived
                          : metrics.billedRevenueCompetence
                      )
                    : '••••••'}
                </span>
              </div>

              {/* 2. DEDUÇÕES E ESTORNOS */}
              <div className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#D33D29]">
                    (-) 2. Deduções da Receita Bruta (Estornos e Devoluções)
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    Lançamentos compensatórios (payment_refunds) e estornos confirmados
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-[#D33D29]">
                  {canViewFinancial ? `- ${formatCurrency(metrics.totalRefunds)}` : '••••••'}
                </span>
              </div>

              {/* 3. RECEITA OPERACIONAL LÍQUIDA */}
              <div className="p-4 bg-[#FAF0EC]/60 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black tracking-wider uppercase text-[#B87070]">
                    (=) 3. Receita Operacional Líquida
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    Receita Bruta deduzida das devoluções do período
                  </p>
                </div>
                <span className="text-sm sm:text-base font-black font-mono text-[#B87070]">
                  {canViewFinancial
                    ? formatCurrency(
                        accountingRegime === 'caixa'
                          ? metrics.netReceived
                          : metrics.billedRevenueCompetence - metrics.totalRefunds
                      )
                    : '••••••'}
                </span>
              </div>

              {/* 4. CUSTOS DE SERVIÇOS PRESTADOS: COMISSÕES */}
              <div className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#66534E]">
                    (-) 4. Custos Diretos de Serviços (Comissões e Repasses)
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    {accountingRegime === 'caixa'
                      ? 'Comissões efetivamente pagas no período (status = paid)'
                      : 'Comissões incorridas nos atendimentos do período (pagas + devidas)'}
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-[#66534E]">
                  {formatCurrency(
                    accountingRegime === 'caixa'
                      ? metrics.totalCommissionsPaid
                      : metrics.totalCommissionsPaid + metrics.totalCommissionsPending
                  )}
                </span>
              </div>

              {/* 5. MARGEM OPERACIONAL BRUTA */}
              <div className="p-4 bg-[#FAF5F3] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#2C1810]">
                    (=) 5. Margem Operacional Bruta
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    Receita Líquida deduzida das comissões operacionais
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-[#1E1115]">
                  {canViewFinancial
                    ? formatCurrency(
                        (accountingRegime === 'caixa'
                          ? metrics.netReceived
                          : metrics.billedRevenueCompetence - metrics.totalRefunds) -
                          (accountingRegime === 'caixa'
                            ? metrics.totalCommissionsPaid
                            : metrics.totalCommissionsPaid + metrics.totalCommissionsPending)
                      )
                    : '••••••'}
                </span>
              </div>

              {/* 6. DESPESAS OPERACIONAIS E CONTAS A PAGAR */}
              <div className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#D33D29]">
                    (-) 6. Despesas Operacionais (Contas a Pagar + Caixa)
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    {accountingRegime === 'caixa'
                      ? 'Despesas liquidadas no período via conta bancária ou caixa físico'
                      : 'Despesas incorridas com mês de competência no período'}
                  </p>
                </div>
                <span className="text-sm font-bold font-mono text-[#D33D29]">
                  {canViewFinancial
                    ? `- ${formatCurrency(
                        accountingRegime === 'caixa'
                          ? metrics.totalExpensesPaidCash
                          : metrics.totalExpensesIncurredCompetence
                      )}`
                    : '••••••'}
                </span>
              </div>

              {/* 7. RESULTADO OPERACIONAL GERENCIAL APURADO */}
              <div className="p-5 bg-[#FAF0EC] flex items-center justify-between">
                <div>
                  <span className="text-sm font-black tracking-wider uppercase text-[#B87070]">
                    (=) 7. Resultado Operacional Gerencial Apurado
                  </span>
                  <p className="text-[11px] text-[#7D6B65]">
                    {accountingRegime === 'caixa'
                      ? 'Sobra líquida de caixa após deduções, comissões pagas e despesas liquidadas'
                      : 'Lucro/Resultado econômico da operação apurado por competência'}
                  </p>
                </div>
                <span className="text-lg sm:text-xl font-black font-mono text-[#B87070]">
                  {canViewFinancial
                    ? formatCurrency(
                        (accountingRegime === 'caixa'
                          ? metrics.netReceived
                          : metrics.billedRevenueCompetence - metrics.totalRefunds) -
                          (accountingRegime === 'caixa'
                            ? metrics.totalCommissionsPaid
                            : metrics.totalCommissionsPaid + metrics.totalCommissionsPending) -
                          (accountingRegime === 'caixa'
                            ? metrics.totalExpensesPaidCash
                            : metrics.totalExpensesIncurredCompetence)
                      )
                    : '••••••'}
                </span>
              </div>
            </div>

            {/* Aviso Contábil de Integridade */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Princípio Contábil da Não Estimativa:</p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Conforme as diretrizes ZELUNIA, indicadores sem fonte de dados financeira estruturada no banco são expressamente reportados como <strong>Indisponíveis</strong>, em vez de estimados arbitrariamente. As despesas operacionais exibidas acima correspondem estritamente aos lançamentos reais de Contas a Pagar (<code>operating_expenses</code>) e Caixa Diário (<code>cash_movements</code>).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. ABA: CLIENTES & INTELIGÊNCIA DE RETENÇÃO ────────────────── */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          {/* Header da Aba */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-serif font-bold text-[#1E1115]">
                  Inteligência de Clientes e Retenção
                </h2>
                <p className="text-xs text-[#7D6B65]">
                  Apuração de fidelização, frequência de retorno e monitoramento preventivo de inatividade
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#7D6B65] bg-[#FAF5F3] px-3 py-1.5 rounded-lg border border-[#EADBCE]">
                Filtro: {startDate.split('-').reverse().join('/')} até {endDate.split('-').reverse().join('/')}
              </span>
            </div>
          </div>

          {/* Cards de Métricas Principais de Retenção */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Clientes Novos vs Recorrentes */}
            <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7D6B65]">
                  Perfil do Período
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-[#1E1115]">
                    {retentionMetrics?.newClientsCount ?? 0}
                  </span>
                  <span className="text-xs font-semibold text-[#7D6B65]">novos</span>
                  <span className="text-zinc-300">|</span>
                  <span className="text-2xl font-bold font-mono text-[#B87070]">
                    {retentionMetrics?.recurringClientsCount ?? 0}
                  </span>
                  <span className="text-xs font-semibold text-[#7D6B65]">recorrentes</span>
                </div>
                <p className="text-[11px] text-[#7D6B65] mt-1">
                  Total de {retentionMetrics?.activeClientsCount ?? 0} clientes atendidos no intervalo
                </p>
              </div>
            </div>

            {/* Taxa de Retorno */}
            <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7D6B65]">
                  Taxa de Retorno
                </span>
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <RefreshCw className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono text-emerald-700">
                  {retentionMetrics?.returnRatePercentage ?? 0}%
                </span>
                <p className="text-[11px] text-[#7D6B65] mt-1">
                  Proporção de clientes com mais de 1 atendimento histórico
                </p>
              </div>
            </div>

            {/* Frequência Média */}
            <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7D6B65]">
                  Frequência Média
                </span>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono text-blue-700">
                  {retentionMetrics?.averageFrequencyPerClient ?? 0}x
                </span>
                <p className="text-[11px] text-[#7D6B65] mt-1">
                  Média de atendimentos concluídos por cliente no período
                </p>
              </div>
            </div>

            {/* Tempo Médio Desde Última Visita */}
            <div className="p-5 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7D6B65]">
                  Tempo Médio de Retorno
                </span>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div>
                <span className="text-2xl font-bold font-mono text-amber-700">
                  {retentionMetrics?.averageDaysSinceLastVisit ?? 0} dias
                </span>
                <p className="text-[11px] text-[#7D6B65] mt-1">
                  Média geral de dias decorridos desde a última visita
                </p>
              </div>
            </div>
          </div>

          {/* Gráfico de Evolução Mensal: Novos vs Recorrentes */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1E1115]">
                  Evolução Mensal: Novos vs Recorrentes (Últimos 6 Meses)
                </h3>
                <p className="text-xs text-[#7D6B65]">
                  Comportamento da carteira de clientes ativos por mês de competência
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-[#B87070]" />
                  <span className="text-[#66534E]">Novos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-[#2C1810]" />
                  <span className="text-[#66534E]">Recorrentes</span>
                </div>
              </div>
            </div>

            {clientMonthlyEvolution.length > 0 ? (
              <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {clientMonthlyEvolution.map((m) => {
                  const totalMonth = m.newClients + m.recurringClients;
                  return (
                    <div
                      key={m.monthKey}
                      className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] flex flex-col justify-between space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1E1115] capitalize">{m.monthLabel}</span>
                        <span className="text-[10px] font-mono font-bold text-[#7D6B65]">
                          {totalMonth} clientes
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {/* Barra Novos */}
                        <div>
                          <div className="flex justify-between text-[10px] text-[#66534E] mb-0.5">
                            <span>Novos</span>
                            <span className="font-bold text-[#B87070]">{m.newClients}</span>
                          </div>
                          <div className="w-full bg-[#EADBCE]/50 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-[#B87070] h-full rounded-full transition-all"
                              style={{
                                width: totalMonth > 0 ? `${(m.newClients / totalMonth) * 100}%` : '0%',
                              }}
                            />
                          </div>
                        </div>

                        {/* Barra Recorrentes */}
                        <div>
                          <div className="flex justify-between text-[10px] text-[#66534E] mb-0.5">
                            <span>Recorrentes</span>
                            <span className="font-bold text-[#2C1810]">{m.recurringClients}</span>
                          </div>
                          <div className="w-full bg-[#EADBCE]/50 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-[#2C1810] h-full rounded-full transition-all"
                              style={{
                                width: totalMonth > 0 ? `${(m.recurringClients / totalMonth) * 100}%` : '0%',
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#7D6B65] text-center py-6">
                Histórico insuficiente de atendimentos para gerar a evolução mensal.
              </p>
            )}
          </div>

          {/* Monitoramento de Inatividade & Busca */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#1E1115]">
                  Monitoramento Preventivo de Retenção
                </h3>
                <p className="text-xs text-[#7D6B65]">
                  Clientes sem agendamentos concluídos há mais de 30 dias (oportunidade de reativação)
                </p>
              </div>

              {/* Filtro por Faixas de Inatividade */}
              <div className="flex flex-wrap items-center gap-2">
                {(['ALL', '30+', '60+', '90+'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setInactivityFilter(tier)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      inactivityFilter === tier
                        ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                        : 'bg-[#FAF5F3] text-[#7D6B65] border border-[#EADBCE] hover:text-[#2C1810]'
                    }`}
                  >
                    {tier === 'ALL' ? 'Todos sem retorno' : `${tier.replace('+', '')}+ dias`}
                  </button>
                ))}
              </div>
            </div>

            {/* Barra de Pesquisa de Cliente */}
            <div className="relative">
              <Search className="w-4 h-4 text-[#A8948D] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar cliente por nome ou telefone..."
                value={inactivitySearch}
                onChange={(e) => setInactivitySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              />
            </div>

            {/* Tabela de Inatividade com Acesso ao Perfil 360º */}
            {(() => {
              const filteredList = inactivityList.filter((item) => {
                if (inactivityFilter !== 'ALL' && item.inactivityTier !== inactivityFilter) return false;
                if (inactivitySearch) {
                  const q = inactivitySearch.toLowerCase();
                  const matchName = item.name.toLowerCase().includes(q);
                  const matchPhone = item.phone ? item.phone.includes(q) : false;
                  if (!matchName && !matchPhone) return false;
                }
                return true;
              });

              if (filteredList.length === 0) {
                return (
                  <div className="py-8 text-center text-xs text-[#7D6B65] bg-[#FAF5F3] rounded-xl border border-dashed border-[#EADBCE]">
                    Nenhum cliente encontrado para os critérios de inatividade selecionados.
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto rounded-xl border border-[#EADBCE]">
                  <table className="w-full text-left text-xs text-[#2C1810]">
                    <thead className="bg-[#FAF5F3] text-[11px] font-bold text-[#66534E] uppercase border-b border-[#EADBCE]">
                      <tr>
                        <th className="py-3 px-4">Cliente</th>
                        <th className="py-3 px-4">Telefone</th>
                        <th className="py-3 px-4">Última Visita</th>
                        <th className="py-3 px-4 text-center">Dias Sem Retorno</th>
                        <th className="py-3 px-4 text-center">Total de Visitas</th>
                        <th className="py-3 px-4">Serviço Habitual</th>
                        <th className="py-3 px-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0E5DF]">
                      {filteredList.map((c) => {
                        let badgeBg = 'bg-amber-100 text-amber-800 border-amber-300';
                        if (c.inactivityTier === '90+') {
                          badgeBg = 'bg-red-100 text-red-800 border-red-300';
                        } else if (c.inactivityTier === '60+') {
                          badgeBg = 'bg-orange-100 text-orange-800 border-orange-300';
                        }

                        return (
                          <tr key={c.id} className="hover:bg-[#FAF0EC]/40 transition-colors">
                            <td className="py-3 px-4 font-semibold text-[#1E1115]">
                              {c.name}
                            </td>
                            <td className="py-3 px-4 text-[#7D6B65] font-mono">
                              {c.phone || 'Não informado'}
                            </td>
                            <td className="py-3 px-4 text-[#66534E]">
                              {new Date(c.lastVisitDate).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}
                              >
                                {c.daysSinceLastVisit} dias
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-bold font-mono">
                              {c.totalCompletedVisits}
                            </td>
                            <td className="py-3 px-4 text-[#7D6B65]">
                              {c.favoriteService || '-'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/${tenantSlug}/clientes/${c.id}`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF0EC] hover:bg-[#B87070] text-[#B87070] hover:text-white font-semibold text-[11px] transition-all"
                                title="Acessar Perfil 360º do Cliente"
                              >
                                <span>Ver 360º</span>
                                <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Aviso Contábil e Ético */}
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Critério Técnico de Inatividade:</p>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  A ausência de retorno no período não constitui cancelamento ou desligamento definitivo do cliente. O indicador reflete exclusivamente o intervalo de dias corridos desde o último agendamento com status <strong>concluído</strong> no estabelecimento, servindo para direcionar estratégias de relacionamento e reativação responsável (LGPD compliant).
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
