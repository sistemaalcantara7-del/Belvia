'use client';

import React, { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink,
  Ban,
} from 'lucide-react';
import { SubscriptionOverviewData } from '@/types/subscriptions';
import { PlanType } from '@/types/tenant';
import { PLAN_CONFIGS } from '@/types/plans';
import {
  subscribeToPlanAction,
  changePlanAction,
  cancelSubscriptionAction,
} from '@/lib/actions/saasSubscriptions';

interface SubscriptionTabProps {
  tenantSlug: string;
  initialData: SubscriptionOverviewData;
}

const STATUS_BADGES: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ElementType }
> = {
  trial: {
    label: 'Período de Testes (Trial)',
    bg: 'bg-amber-50 text-amber-800 border-amber-200',
    text: 'text-amber-700',
    icon: Clock,
  },
  active: {
    label: 'Assinatura Ativa',
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    text: 'text-emerald-700',
    icon: CheckCircle2,
  },
  overdue: {
    label: 'Pagamento Pendente / Tolerância',
    bg: 'bg-orange-50 text-orange-800 border-orange-200',
    text: 'text-orange-700',
    icon: AlertTriangle,
  },
  suspended: {
    label: 'Acesso Suspenso',
    bg: 'bg-red-50 text-red-800 border-red-200',
    text: 'text-red-700',
    icon: AlertTriangle,
  },
  canceled: {
    label: 'Cancelada',
    bg: 'bg-gray-100 text-gray-700 border-gray-200',
    text: 'text-gray-600',
    icon: Ban,
  },
};

export function SubscriptionTab({ tenantSlug, initialData }: SubscriptionTabProps) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sub = data.subscription;
  const statusInfo = STATUS_BADGES[sub.status] || STATUS_BADGES.trial;
  const StatusIcon = statusInfo.icon;

  const currentPlanConfig = PLAN_CONFIGS[sub.plan];
  const isEssential = sub.plan === 'essential';

  const formatDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
    } catch {
      return '—';
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Contratar / Ativar assinatura
  async function handleSubscribe(billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO') {
    if (!data.canManage) return;
    setLoading(true);
    setMessage(null);

    const res = await subscribeToPlanAction(tenantSlug, sub.plan, billingType);
    if (res.success) {
      setMessage({
        type: 'success',
        text: 'Assinatura gerada com sucesso via Asaas! O status foi sincronizado.',
      });
      // Atualização otimista
      setData((prev) => ({
        ...prev,
        subscription: { ...prev.subscription, status: 'active' },
      }));
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao processar assinatura.' });
    }
    setLoading(false);
  }

  // Alterar plano (Upgrade / Downgrade)
  async function handleChangePlan(targetPlan: PlanType) {
    if (!data.canManage || targetPlan === sub.plan) return;
    setLoading(true);
    setMessage(null);

    const res = await changePlanAction(tenantSlug, targetPlan);
    if (res.success) {
      setMessage({
        type: 'success',
        text: `Plano alterado para ${PLAN_CONFIGS[targetPlan].name} com sucesso!`,
      });
      setData((prev) => ({
        ...prev,
        subscription: {
          ...prev.subscription,
          plan: targetPlan,
          amount: PLAN_CONFIGS[targetPlan].priceMonthly,
        },
      }));
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao mudar de plano.' });
    }
    setLoading(false);
  }

  // Cancelar assinatura
  async function handleCancel() {
    if (!confirm('Deseja realmente cancelar a assinatura da plataforma? Os dados do seu estabelecimento continuarão preservados.')) {
      return;
    }
    setLoading(true);
    setMessage(null);

    const res = await cancelSubscriptionAction(tenantSlug, 'Solicitado pelo painel administrativo');
    if (res.success) {
      setMessage({ type: 'success', text: 'Assinatura cancelada com sucesso.' });
      setData((prev) => ({
        ...prev,
        subscription: { ...prev.subscription, status: 'canceled' },
      }));
    } else {
      setMessage({ type: 'error', text: res.error || 'Erro ao cancelar assinatura.' });
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      {/* Mensagens de feedback */}
      {message && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm font-medium border flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Cartão de Status Atual da Assinatura */}
      <div className="p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shrink-0">
              <CreditCard className="w-6 h-6 stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-serif font-bold text-[#1E1115]">
                  Plano {currentPlanConfig.name}
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusInfo.bg}`}
                >
                  <StatusIcon className="w-3.5 h-3.5" />
                  <span>{statusInfo.label}</span>
                </span>
              </div>
              <p className="text-xs text-[#7D6B65] mt-0.5">
                {formatCurrency(sub.amount)} / mês • Faturamento seguro via Asaas
              </p>
            </div>
          </div>

          {data.isSandBox && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-200 w-fit">
              Modo Sandbox Ativo
            </span>
          )}
        </div>

        {/* Grade de Detalhes Operacionais */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#F5EBE6]">
          <div className="p-3.5 rounded-xl bg-[#FAF6F4] border border-[#EADBCE]/50">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Vencimento Atual</span>
            <span className="text-sm font-bold text-[#1E1115] mt-0.5 block">
              {formatDate(sub.current_period_end)}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF6F4] border border-[#EADBCE]/50">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Limite de Profissionais</span>
            <span className="text-sm font-bold text-[#1E1115] mt-0.5 block">
              {currentPlanConfig.limits.maxProfessionals} ativo{currentPlanConfig.limits.maxProfessionals > 1 ? 's' : ''}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#FAF6F4] border border-[#EADBCE]/50">
            <span className="text-[11px] font-medium text-[#7D6B65] block">Último Pagamento</span>
            <span className="text-sm font-bold text-[#1E1115] mt-0.5 block">
              {formatDate(sub.last_payment_at)}
            </span>
          </div>
        </div>

        {/* Ações de Gestão da Assinatura */}
        {data.canManage && (
          <div className="pt-2 flex flex-wrap items-center gap-3">
            {sub.status === 'trial' || sub.status === 'overdue' ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSubscribe('PIX')}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#B87070] hover:opacity-95 shadow-2xs transition-all disabled:opacity-50"
                >
                  Ativar Assinatura via Pix
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSubscribe('CREDIT_CARD')}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#4A3B36] bg-white border border-[#EADBCE] hover:border-[#B87070] shadow-2xs transition-all disabled:opacity-50"
                >
                  Cartão de Crédito
                </button>
              </div>
            ) : null}

            {sub.status === 'active' && isEssential && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleChangePlan('smart')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-[#B87070] hover:opacity-95 shadow-2xs transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Fazer Upgrade para Plano Inteligente</span>
              </button>
            )}

            {sub.status === 'active' && !isEssential && (
              <button
                type="button"
                disabled={loading}
                onClick={() => handleChangePlan('essential')}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#7D6B65] bg-white border border-[#EADBCE] hover:text-[#2C1810] shadow-2xs transition-all disabled:opacity-50"
              >
                Mudar para Plano Essencial
              </button>
            )}

            {sub.status === 'active' && (
              <button
                type="button"
                disabled={loading}
                onClick={handleCancel}
                className="ml-auto text-xs font-medium text-red-600 hover:text-red-700 hover:underline transition-colors"
              >
                Cancelar Assinatura
              </button>
            )}
          </div>
        )}
      </div>

      {/* Histórico de Faturas / Cobranças Asaas */}
      <div className="p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
        <h3 className="text-base font-serif font-bold text-[#1E1115]">
          Histórico de Mensalidades
        </h3>

        {data.invoices.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#FAF6F4] text-center border border-[#EADBCE]/50">
            <p className="text-xs text-[#7D6B65]">
              Nenhuma cobrança registrada até o momento. As faturas geradas pelo Asaas aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#F5EBE6] text-[#7D6B65] font-semibold">
                  <th className="py-2.5 px-3">Vencimento</th>
                  <th className="py-2.5 px-3">Valor</th>
                  <th className="py-2.5 px-3">Forma</th>
                  <th className="py-2.5 px-3">Situação</th>
                  <th className="py-2.5 px-3 text-right">Comprovante / Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5EBE6]">
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#FAF6F4]/60 transition-colors">
                    <td className="py-3 px-3 font-medium text-[#2C1810]">
                      {formatDate(inv.due_date)}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[#1E1115]">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="py-3 px-3 text-[#7D6B65]">
                      {inv.billing_type}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-800'
                            : inv.status === 'overdue'
                            ? 'bg-red-50 text-red-800'
                            : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {inv.status === 'paid' ? 'Pago' : inv.status === 'overdue' ? 'Vencido' : 'Pendente'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {inv.invoice_url ? (
                        <a
                          href={inv.invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#B87070] font-semibold hover:underline"
                        >
                          <span>Visualizar</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-[#A3928B]">—</span>
                      )}
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
