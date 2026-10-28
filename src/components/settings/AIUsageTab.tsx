'use client';

import React from 'react';
import { Bot, ShieldCheck, AlertCircle } from 'lucide-react';
import { AIUsageLogItem } from '@/types/aiReceptionist';

interface AIUsageTabProps {
  tenantSlug?: string;
  data: {
    plan: string;
    monthlyLimit: number;
    usedTokens: number;
    remainingTokens: number;
    percentageUsed: number;
    estimatedCostUsd: number;
    recentLogs: AIUsageLogItem[];
  };
}

export function AIUsageTab({ data }: AIUsageTabProps) {
  const isSmart = data.plan === 'smart';
  const isHighUsage = data.percentageUsed >= 85;

  const formatDate = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch {
      return '—';
    }
  };

  return (
    <div className="space-y-6">
      {/* ── CARD PRINCIPAL: VISÃO GERAL DA COTA ── */}
      <div className="p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F0F5FE] text-[#2B72D4] flex items-center justify-center shrink-0">
              <Bot className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif font-bold text-[#1E1115]">
                  Consumo de Inteligência Artificial
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  OpenAI gpt-4o-mini
                </span>
              </div>
              <p className="text-xs text-[#7D6B65] mt-0.5">
                Plano {isSmart ? 'Inteligente' : 'Essencial'} • Controle centralizado de tokens e custos da Recepcionista Virtual
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Custo Estimado no Mês</span>
            <span className="text-xl font-bold text-[#1E1115]">
              ${data.estimatedCostUsd.toFixed(4)} USD
            </span>
          </div>
        </div>

        {/* BARRA DE PROGRESSO DE CONSUMO */}
        {isSmart ? (
          <div className="space-y-2 pt-2 border-t border-[#F5EBE6]">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[#2C1810]">
                Tokens Utilizados: {data.usedTokens.toLocaleString('pt-BR')} / {data.monthlyLimit.toLocaleString('pt-BR')}
              </span>
              <span className={isHighUsage ? 'text-red-600 font-bold' : 'text-[#7D6B65]'}>
                {data.percentageUsed}% consumido
              </span>
            </div>

            <div className="w-full h-3 rounded-full bg-[#FAF0EC] overflow-hidden border border-[#EADBCE]/50">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isHighUsage ? 'bg-red-500' : 'bg-[#B87070]'
                }`}
                style={{ width: `${Math.min(100, data.percentageUsed)}%` }}
              />
            </div>

            {isHighUsage && (
              <div className="flex items-center gap-1.5 text-xs text-red-600 font-medium pt-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Atenção: A cota de IA está próxima do limite. Ao esgotar, o sistema ativará o atendimento determinístico seguro sem interromper seus agendamentos.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <span>Plano Essencial — Atendimento Determinístico Nativo</span>
            </p>
            <p className="text-amber-700">
              O plano Essencial conta com a Recepcionista Virtual determinística integrada (catálogo, horários, preços e agendamentos). Para habilitar respostas livres com IA generativa (OpenAI gpt-4o-mini), faça upgrade para o Plano Inteligente.
            </p>
          </div>
        )}

        {/* INDICADORES EM GRADE */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-[#FAF6F4] border border-[#EADBCE]/50">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Saldo de Tokens Restantes</span>
            <span className="text-base font-bold text-[#1E1115] mt-0.5 block">
              {isSmart ? `${data.remainingTokens.toLocaleString('pt-BR')} tokens` : '0 tokens (Nativo)'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF6F4] border border-[#EADBCE]/50">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Franquia Mensal do Plano</span>
            <span className="text-base font-bold text-[#1E1115] mt-0.5 block">
              {isSmart ? `${data.monthlyLimit.toLocaleString('pt-BR')} tokens/mês` : 'Sem cota generativa'}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF6F4] border border-[#EADBCE]/50">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Proteção de Privacidade</span>
            <div className="flex items-center gap-1 mt-0.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold text-emerald-700">Zero Conteúdo Gravado</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── HISTÓRICO DE ATIVIDADE DE CONSUMO ── */}
      <div className="p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
        <h3 className="text-base font-serif font-bold text-[#1E1115]">
          Últimas Interações com o Modelo
        </h3>

        {data.recentLogs.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#FAF6F4] text-center border border-[#EADBCE]/50">
            <p className="text-xs text-[#7D6B65]">
              Nenhum registro de consumo até o momento. As consultas à OpenAI serão registradas aqui de forma agregada.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F5EBE6] text-[#7D6B65] font-semibold">
                  <th className="py-2.5 px-3">Data / Hora</th>
                  <th className="py-2.5 px-3">Modelo</th>
                  <th className="py-2.5 px-3 text-right">Prompt</th>
                  <th className="py-2.5 px-3 text-right">Completion</th>
                  <th className="py-2.5 px-3 text-right">Total Tokens</th>
                  <th className="py-2.5 px-3 text-right">Custo Est. (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5EBE6]">
                {data.recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FAF6F4]/60 transition-colors">
                    <td className="py-2.5 px-3 text-[#2C1810]">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#1E1115]">
                      {log.model}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#7D6B65]">
                      {log.prompt_tokens}
                    </td>
                    <td className="py-2.5 px-3 text-right text-[#7D6B65]">
                      {log.completion_tokens}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#1E1115]">
                      {log.total_tokens}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-mono">
                      ${Number(log.estimated_cost_usd).toFixed(6)}
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
