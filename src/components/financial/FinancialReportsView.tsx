'use client';

import React, { useState, useTransition, useEffect } from 'react';
import {
  FinancialReportData,
  FinancialReportPeriod,
  getFinancialReportsAction,
} from '@/lib/actions/financialReports';
import { generateFinancialReportPDF } from '@/lib/financialReportPdf';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileDown,
  Layers,
  Sparkles,
  RefreshCw,
  Clock,
  PieChart,
  HelpCircle,
} from 'lucide-react';

interface FinancialReportsViewProps {
  tenantSlug: string;
  userRole: string;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function FinancialReportsView({
  tenantSlug,
}: FinancialReportsViewProps) {
  const [isPending, startTransition] = useTransition();
  const [period, setPeriod] = useState<FinancialReportPeriod>('monthly');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const [reportData, setReportData] = useState<FinancialReportData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Carrega os dados sempre que período, ano ou mês mudam
  const loadReports = (p: FinancialReportPeriod, y: number, m: number) => {
    startTransition(async () => {
      setErrorMessage(null);
      const res = await getFinancialReportsAction(tenantSlug, p, y, m);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.data) {
        setReportData(res.data);
      }
    });
  };

  useEffect(() => {
    loadReports(period, selectedYear, selectedMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, selectedYear, selectedMonth]);

  const handleExportPDF = async () => {
    if (!reportData) return;
    try {
      setIsGeneratingPdf(true);
      await generateFinancialReportPDF(reportData);
    } catch (err) {
      console.error('Falha ao exportar PDF:', err);
      setErrorMessage('Não foi possível gerar o arquivo PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const metrics = reportData?.metrics;
  const isYearly = period === 'yearly';

  return (
    <div className="space-y-6">
      {/* ── 1. BARRA DE FILTROS & SELETORES DO RELATÓRIO ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white border border-[#EADBCE] rounded-2xl p-3 shadow-xs">
        {/* Seletor de Tipo de Período */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            type="button"
            onClick={() => setPeriod('daily')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              period === 'daily'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'bg-[#FAF6F3] text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            Diário (Caixa)
          </button>
          <button
            type="button"
            onClick={() => setPeriod('weekly')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              period === 'weekly'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'bg-[#FAF6F3] text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            Semanal
          </button>
          <button
            type="button"
            onClick={() => setPeriod('monthly')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              period === 'monthly'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'bg-[#FAF6F3] text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setPeriod('yearly')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              period === 'yearly'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'bg-[#FAF6F3] text-[#7D6B65] hover:text-[#2C1810]'
            }`}
          >
            Anual (Consolidado)
          </button>
        </div>

        {/* Seletores Específicos e Botão de Exportar PDF */}
        <div className="flex items-center gap-2.5">
          {period === 'monthly' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-[#FAF6F3] border border-[#EADBCE] text-[#2C1810] focus:border-[#B87070] focus:outline-none"
            >
              {[
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
              ].map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {(period === 'monthly' || period === 'yearly') && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-[#FAF6F3] border border-[#EADBCE] text-[#2C1810] focus:border-[#B87070] focus:outline-none"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => loadReports(period, selectedYear, selectedMonth)}
            disabled={isPending}
            className="p-2 rounded-xl border border-[#EADBCE] bg-[#FAF6F3] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070] transition-colors"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={!reportData || isGeneratingPdf || isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-xs hover:opacity-95 cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: '#B87070' }}
          >
            <FileDown className="w-4 h-4 stroke-[2]" />
            <span>{isGeneratingPdf ? 'Gerando...' : 'Exportar PDF A4'}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-between border bg-[#FDEEEE] text-[#D33E3E] border-[#F8D1D1] shadow-2xs">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs underline ml-4 hover:opacity-80"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ── 2. CARDS DE INDICADORES PRINCIPAIS (COM RIGOR CONTÁBIL) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Receitas Efetivas */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#EBF7F0] text-[#1B873F] flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Receitas Recebidas</span>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {formatCurrency(metrics?.totalRevenueReceived || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-semibold text-[#1B873F] flex items-center justify-between">
            <span>Faturamento de procedimentos e vendas</span>
            {metrics && metrics.totalRefunds > 0 && (
              <span className="text-red-500 text-[10px]">(-{formatCurrency(metrics.totalRefunds)} estornos)</span>
            )}
          </div>
        </div>

        {/* Card 2: Despesas Operacionais Pagas */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FDEEEE] text-[#D33E3E] flex items-center justify-center shrink-0">
              <TrendingDown className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Despesas Pagas</span>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {formatCurrency(metrics?.totalExpensesPaid || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-semibold text-[#D33E3E]">
            Contas quitadas (não inclui sangrias)
          </div>
        </div>

        {/* Card 3: Saldo Líquido Operacional */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FCEFEB] text-[#B87070] flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Saldo Líquido</span>
              <span
                className={`text-2xl sm:text-3xl font-bold tracking-tight block mt-1 ${
                  (metrics?.netCashFlow || 0) >= 0 ? 'text-[#1E1115]' : 'text-red-600'
                }`}
              >
                {formatCurrency(metrics?.netCashFlow || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-semibold text-[#8C7A74]">
            Resultado financeiro do período
          </div>
        </div>

        {/* Card 4: Pendências e Contas em Aberto */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FFF8EB] text-[#C48616] flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">A Receber / A Pagar</span>
              <span className="text-lg sm:text-xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {formatCurrency(metrics?.pendingRevenue || 0)}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-medium text-[#C48616] flex items-center justify-between">
            <span>A pagar: {formatCurrency(metrics?.pendingExpenses || 0)}</span>
          </div>
        </div>
      </div>

      {/* ── 3. DISTRIBUIÇÃO POR MEIO DE PAGAMENTO & INFORMATIVO DE MOVIMENTAÇÕES DE CAIXA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Painel 1: Formas de Pagamento Realizadas (2 colunas) */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#F5EBE6]">
            <div>
              <h3 className="text-sm font-bold text-[#1E1115]">
                Distribuição por Meio de Pagamento
              </h3>
              <p className="text-[11px] text-[#7D6B65]">
                Receitas confirmadas conciliadas no período
              </p>
            </div>
            <PieChart className="w-4 h-4 text-[#B87070]" />
          </div>

          {!reportData || reportData.methodsBreakdown.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8C7A74]">
              Nenhum recebimento registrado neste período.
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {reportData.methodsBreakdown.map((m) => (
                <div key={m.method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-[#2C1810] font-semibold">{m.label} ({m.count})</span>
                    <span className="text-[#7D6B65]">
                      {formatCurrency(m.amount)} <strong className="text-[#2C1810]">({m.percentage.toFixed(1)}%)</strong>
                    </span>
                  </div>
                  <div className="w-full bg-[#FAF0EC] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#B87070] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(2, m.percentage))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Painel 2: Caixa Diário (Suprimentos vs Sangrias - Informativo Separado) */}
        <div className="p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-[#F5EBE6]">
              <div>
                <h3 className="text-sm font-bold text-[#1E1115]">
                  Movimentações de Caixa
                </h3>
                <p className="text-[11px] text-[#7D6B65]">
                  Não contabilizadas no faturamento
                </p>
              </div>
              <Layers className="w-4 h-4 text-[#B87070]" />
            </div>

            <div className="space-y-4 pt-3">
              <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#EADBCE]/70">
                <span className="text-xs text-[#7D6B65] block">Suprimentos de Caixa</span>
                <span className="text-lg font-bold text-[#1E1115] block mt-0.5">
                  {formatCurrency(metrics?.totalSupplies || 0)}
                </span>
                <span className="text-[10px] text-[#7D6B65]">Aportes de troco e reforços de gaveta</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#EADBCE]/70">
                <span className="text-xs text-[#7D6B65] block">Sangrias / Recolhimentos</span>
                <span className="text-lg font-bold text-[#1E1115] block mt-0.5">
                  {formatCurrency(metrics?.totalBleeds || 0)}
                </span>
                <span className="text-[10px] text-[#7D6B65]">Retiradas para cofre ou depósito bancário</span>
              </div>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-[#8C7A74] border-t border-[#F5EBE6] flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-[#B87070] shrink-0" />
            <span>Blindagem contra dupla contagem no faturamento.</span>
          </div>
        </div>
      </div>

      {/* ── 4. PROJEÇÃO ANUAL HISTÓRICA (QUANDO PERÍODO ANUAL SELECIONADO) ── */}
      {isYearly && reportData?.projection && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-[#FAF0EC] to-white border border-[#EADBCE] shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#B87070]/15 text-[#B87070] text-[11px] font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Projeção Anual Estimada ({selectedYear})</span>
              </div>
              <h3 className="text-base font-bold text-[#1E1115]">
                Estimativa Consolidada com Base no Histórico Real
              </h3>
              <p className="text-xs text-[#7D6B65] mt-1 max-w-2xl leading-relaxed">
                {reportData.projection.description}
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-white border border-[#EADBCE] text-xs font-semibold text-[#2C1810] shrink-0">
              Método: {reportData.projection.method}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-white border border-[#EADBCE]/80 shadow-2xs">
              <span className="text-xs text-[#7D6B65] block">Faturamento Anual Projetado</span>
              <span className="text-xl font-bold text-[#1B873F] block mt-1">
                {formatCurrency(reportData.projection.projectedAnnualRevenue)}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-0.5 block">
                Média mensal: {formatCurrency(reportData.projection.monthlyAverageRevenue)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#EADBCE]/80 shadow-2xs">
              <span className="text-xs text-[#7D6B65] block">Despesas Anuais Projetadas</span>
              <span className="text-xl font-bold text-[#D33E3E] block mt-1">
                {formatCurrency(reportData.projection.projectedAnnualExpenses)}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-0.5 block">
                Média mensal: {formatCurrency(reportData.projection.monthlyAverageExpenses)}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#EADBCE]/80 shadow-2xs">
              <span className="text-xs text-[#7D6B65] block">Resultado Líquido Projetado</span>
              <span className="text-xl font-bold text-[#1E1115] block mt-1">
                {formatCurrency(reportData.projection.projectedAnnualNet)}
              </span>
              <span className="text-[10px] text-[#7D6B65] mt-0.5 block">
                Projeção estimada sujeita a variações sazonais
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. TABELA DE EVOLUÇÃO CRONOLÓGICA (TIMELINE) ── */}
      <div className="p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#F5EBE6]">
          <h3 className="text-sm font-bold text-[#1E1115]">
            {isYearly ? 'Evolução Mensal no Ano' : 'Detalhamento Cronológico do Período'}
          </h3>
          <span className="text-xs text-[#7D6B65]">
            {reportData?.timeline.length || 0} registro(s)
          </span>
        </div>

        {!reportData || reportData.timeline.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#8C7A74]">
            Nenhuma movimentação registrada no período selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#EADBCE] text-[#7D6B65]">
                  <th className="py-2.5 px-3 font-semibold">Período / Data</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Receitas Efetivas</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Despesas Operacionais</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Saldo Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5EBE6]">
                {reportData.timeline.map((item, idx) => (
                  <tr key={idx} className="hover:bg-[#FAF6F3] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[#2C1810]">
                      {item.label}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#1B873F] font-medium">
                      {formatCurrency(item.revenue)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#D33E3E] font-medium">
                      {formatCurrency(item.expenses)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        item.net >= 0 ? 'text-[#1E1115]' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(item.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
