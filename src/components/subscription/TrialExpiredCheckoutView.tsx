'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Check,
  CreditCard,
  QrCode,
  Copy,
  ExternalLink,
  RefreshCw,
  LogOut,
  Sparkles,
  Zap,
  Database,
  CalendarCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { PlanType } from '@/types/tenant';
import { PLAN_CONFIGS } from '@/types/plans';
import {
  subscribeToPlanAction,
  getSubscriptionOverviewAction,
} from '@/lib/actions/saasSubscriptions';
import { signOutAction } from '@/lib/actions/auth';

interface TrialExpiredCheckoutViewProps {
  tenantSlug: string;
  tenantName: string;
  currentPlan: PlanType;
  trialEndsAt?: string | null;
  canManage: boolean;
}

export function TrialExpiredCheckoutView({
  tenantSlug,
  tenantName,
  currentPlan,
  trialEndsAt,
  canManage,
}: TrialExpiredCheckoutViewProps) {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(currentPlan || 'smart');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modal de pagamento Asaas (Pix / Cartão)
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    billingType: 'PIX' | 'CREDIT_CARD';
    plan: PlanType;
    result?: {
      invoiceUrl?: string;
      bankSlipUrl?: string;
      pixQrCodePayload?: string;
      pixQrCodeImage?: string;
    };
  }>({
    open: false,
    billingType: 'PIX',
    plan: currentPlan || 'smart',
  });

  const [copiedPix, setCopiedPix] = useState(false);

  const formattedTrialDate = trialEndsAt
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(trialEndsAt))
    : 'recentemente';

  // Aciona o checkout do Asaas
  async function handleCheckout(targetPlan: PlanType, billingType: 'PIX' | 'CREDIT_CARD') {
    if (!canManage) {
      setMessage({
        type: 'error',
        text: 'Apenas administradores ou proprietários podem realizar a contratação do plano.',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await subscribeToPlanAction(tenantSlug, targetPlan, billingType);

      if (res.success) {
        setPaymentModal({
          open: true,
          billingType,
          plan: targetPlan,
          result: res,
        });
        setMessage({
          type: 'info',
          text: `Cobrança do Plano ${PLAN_CONFIGS[targetPlan].name} gerada com sucesso! Conclua o pagamento para liberação automática.`,
        });
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Não foi possível gerar a cobrança. Tente novamente em instantes.',
        });
      }
    } catch {
      setMessage({
        type: 'error',
        text: 'Erro de conexão com o gateway de pagamento. Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  }

  // Consulta manual do status do pagamento
  async function handleCheckPayment() {
    setVerifying(true);
    setMessage(null);

    try {
      const res = await getSubscriptionOverviewAction(tenantSlug);
      if (res.success && res.data) {
        const sub = res.data.subscription;
        if (sub.status === 'active') {
          setMessage({
            type: 'success',
            text: 'Pagamento confirmado com sucesso! Redirecionando para o seu dashboard...',
          });
          setTimeout(() => {
            router.push(`/${tenantSlug}`);
            router.refresh();
          }, 1500);
          return;
        } else {
          setMessage({
            type: 'info',
            text: 'O pagamento ainda está sendo processado pela compensação bancária. Se já efetuou o Pix ou cartão, aguarde alguns instantes e verifique novamente.',
          });
        }
      } else {
        setMessage({
          type: 'error',
          text: 'Não foi possível verificar o pagamento no momento. Tente novamente.',
        });
      }
    } catch {
      setMessage({
        type: 'error',
        text: 'Erro ao consultar status da assinatura.',
      });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6F4] text-[#2C1810]">
      {/* ── Topbar Institucional com Logo ZELUNIA e Logout ─────── */}
      <header className="w-full bg-[#2D1F27] border-b border-[#433139] px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <Image
            src="/img/logoz3.png"
            alt="ZELUNIA"
            width={130}
            height={44}
            priority
            className="h-9 w-auto object-contain brightness-110"
          />
          <span className="hidden sm:inline-block text-xs text-[#C4837A] font-medium border-l border-[#433139] pl-3">
            Gestão Inteligente de Estética
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-[#FCF8F5] leading-tight">{tenantName}</p>
            <p className="text-[10px] text-[#A8948D]">Acesso temporariamente em espera</p>
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#D8C4BC] hover:text-white hover:bg-white/10 transition-colors border border-transparent hover:border-white/15"
              title="Sair da Conta"
            >
              <LogOut className="w-3.5 h-3.5 text-[#C4837A]" />
              <span>Sair</span>
            </button>
          </form>
        </div>
      </header>

      {/* ── Conteúdo Principal ───────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center">
        {/* Banner de Boas-Vindas & Reafirmação */}
        <div className="text-center max-w-3xl space-y-4 mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B87070]/15 border border-[#B87070]/30 text-[#B87070] text-xs font-bold tracking-wide uppercase">
            <Clock className="w-3.5 h-3.5" />
            <span>Demonstração de 7 Dias Concluída</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-serif font-bold text-[#2D1F27] leading-tight">
            Seu período gratuito chegou ao fim.<br className="hidden sm:inline" /> Vamos continuar juntos?
          </h1>

          <p className="text-sm sm:text-base text-[#6B5A54] leading-relaxed">
            O período de avaliação gratuita do <strong className="font-semibold text-[#2D1F27]">{tenantName}</strong> encerrou-se em {formattedTrialDate}. Escolha o plano perfeito para o seu momento e continue impulsionando seus atendimentos.
          </p>
        </div>

        {/* Card de Segurança de Dados Preservados (Requisito 3) */}
        <div className="w-full max-w-4xl bg-white border border-[#EADBCE] rounded-2xl p-4 sm:p-5 shadow-xs mb-10 flex flex-col sm:flex-row items-center sm:items-start gap-4 bg-gradient-to-r from-white via-[#FCF8F5] to-white">
          <div className="w-12 h-12 rounded-xl bg-[#5C8A5E]/15 border border-[#5C8A5E]/30 flex items-center justify-center shrink-0 text-[#4D7A4F]">
            <ShieldCheck className="w-6 h-6 stroke-[2]" />
          </div>
          <div className="flex-1 text-center sm:text-left space-y-1">
            <h3 className="text-sm sm:text-base font-semibold text-[#2D1F27] flex items-center justify-center sm:justify-start gap-2">
              <span>Seus dados continuam 100% seguros e preservados</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#5C8A5E]/15 text-[#3D693F]">
                Sem perda de dados
              </span>
            </h3>
            <p className="text-xs sm:text-sm text-[#6B5A54] leading-relaxed">
              Todos os seus clientes cadastrados, histórico de agendamentos, catálogo de serviços, configurações e fichas de anamnese permanecem intactos. Assim que sua assinatura for confirmada, seu acesso ao dashboard será restabelecido imediatamente.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-[#7D6B65]">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-[#5C8A5E]" /> Clientes seguros</span>
              <span className="flex items-center gap-1.5"><CalendarCheck className="w-3.5 h-3.5 text-[#5C8A5E]" /> Agendamentos preservados</span>
              <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-[#5C8A5E]" /> Configurações salvas</span>
            </div>
          </div>
        </div>

        {/* Notificações em caso de sucesso/erro/aviso */}
        {message && (
          <div
            className={`w-full max-w-4xl mb-6 p-4 rounded-xl text-xs sm:text-sm flex items-start gap-3 border shadow-xs animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : message.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            ) : message.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
            ) : (
              <RefreshCw className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            )}
            <div className="flex-1 font-medium leading-relaxed">{message.text}</div>
          </div>
        )}

        {/* ── Comparativo de Planos (Requisitos 4 e 5: PLAN_CONFIGS) ── */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mb-10 items-stretch">
          {/* PLANO ESSENCIAL */}
          <div
            className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all bg-white relative border-2 ${
              selectedPlan === 'essential'
                ? 'border-[#B87070] shadow-xl ring-2 ring-[#B87070]/20'
                : 'border-[#EADBCE] shadow-md hover:border-[#D8C4BC]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#FAF0ED] text-[#B87070] border border-[#EADBCE]">
                  Para Autônomos & Estúdios
                </span>
                <span className="text-xs text-[#7D6B65] font-medium">1 Profissional</span>
              </div>

              <h2 className="text-2xl font-serif font-bold text-[#2D1F27]">
                Plano {PLAN_CONFIGS.essential.name}
              </h2>
              <p className="text-xs sm:text-sm text-[#6B5A54] mt-1.5">
                Organização fundamental, agenda rápida e controle financeiro essencial.
              </p>

              <div className="mt-5 pb-5 border-b border-[#EADBCE]">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-[#7D6B65]">R$</span>
                  <span className="text-4xl font-serif font-bold text-[#2D1F27]">
                    {PLAN_CONFIGS.essential.priceMonthly.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-xs text-[#7D6B65]">/mês</span>
                </div>
                <p className="text-[11px] text-[#9E8580] mt-1">Cobrança recorrente mensal sem fidelidade</p>
              </div>

              {/* Funcionalidades */}
              <div className="mt-6 space-y-3 text-xs sm:text-sm text-[#4A3B35]">
                <p className="text-xs font-bold uppercase tracking-wider text-[#9E8580]">
                  O que está incluso:
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#5C8A5E] shrink-0 mt-0.5" />
                    <span><strong>1 Profissional</strong> atendendo no sistema</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#5C8A5E] shrink-0 mt-0.5" />
                    <span>Até <strong>500 clientes</strong> na base cadastrada</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#5C8A5E] shrink-0 mt-0.5" />
                    <span>Agenda completa, histórico e ficha do cliente</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#5C8A5E] shrink-0 mt-0.5" />
                    <span>Controle de Caixa Diário e recebimentos</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#5C8A5E] shrink-0 mt-0.5" />
                    <span>Agendamento online público via link</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Ações de Contratação Essencial */}
            <div className="mt-8 pt-6 border-t border-[#EADBCE] space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setSelectedPlan('essential');
                    handleCheckout('essential', 'PIX');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-bold text-white bg-[#5C8A5E] hover:bg-[#4D754F] transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Assinar no Pix</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setSelectedPlan('essential');
                    handleCheckout('essential', 'CREDIT_CARD');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-bold text-[#2D1F27] bg-[#FAF6F4] border border-[#D8C4BC] hover:border-[#B87070] hover:bg-white transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#B87070]" />
                  <span>No Cartão</span>
                </button>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setSelectedPlan('essential');
                  handleCheckout('essential', 'PIX');
                }}
                className="w-full py-2.5 text-xs text-center font-semibold text-[#B87070] hover:underline"
              >
                Assinar Essencial (R$ 59,90) →
              </button>
            </div>
          </div>

          {/* PLANO INTELIGENTE (RECOMENDADO) */}
          <div
            className={`rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all relative overflow-hidden bg-white border-2 ${
              selectedPlan === 'smart'
                ? 'border-[#B87070] shadow-2xl ring-2 ring-[#B87070]/30'
                : 'border-[#EADBCE] shadow-md hover:border-[#B87070]'
            }`}
          >
            {/* Tag Recomendado */}
            <div className="absolute top-0 right-0 bg-[#B87070] text-white text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-bl-xl shadow-xs flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Mais Escolhido</span>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pr-24">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-[#B87070]/15 text-[#B87070] border border-[#B87070]/30">
                  Completo com Automação
                </span>
                <span className="text-xs text-[#7D6B65] font-medium">Até 10 Profissionais</span>
              </div>

              <h2 className="text-2xl font-serif font-bold text-[#2D1F27] flex items-center gap-2">
                <span>Plano {PLAN_CONFIGS.smart.name}</span>
                <Zap className="w-4 h-4 text-[#B87070] fill-current" />
              </h2>
              <p className="text-xs sm:text-sm text-[#6B5A54] mt-1.5">
                Multi-profissionais, comissões avançadas, IA e anamnese personalizada.
              </p>

              <div className="mt-5 pb-5 border-b border-[#EADBCE]">
                <div className="flex items-baseline gap-1">
                  <span className="text-xs font-bold text-[#7D6B65]">R$</span>
                  <span className="text-4xl font-serif font-bold text-[#2D1F27]">
                    {PLAN_CONFIGS.smart.priceMonthly.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="text-xs text-[#7D6B65]">/mês</span>
                </div>
                <p className="text-[11px] text-[#9E8580] mt-1">Cobrança recorrente mensal sem fidelidade</p>
              </div>

              {/* Funcionalidades */}
              <div className="mt-6 space-y-3 text-xs sm:text-sm text-[#4A3B35]">
                <p className="text-xs font-bold uppercase tracking-wider text-[#9E8580]">
                  Tudo do Essencial, mais:
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#B87070] shrink-0 mt-0.5" />
                    <span><strong>Até 10 profissionais</strong> simultâneos na equipe</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#B87070] shrink-0 mt-0.5" />
                    <span>Até <strong>10.000 clientes</strong> na base</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#B87070] shrink-0 mt-0.5" />
                    <span><strong>Fichas de Anamnese personalizadas</strong> e evolução</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#B87070] shrink-0 mt-0.5" />
                    <span><strong>Cálculo automático de comissões</strong> e relatórios DRE</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#B87070] shrink-0 mt-0.5" />
                    <span>Lembretes automáticos e notificações WhatsApp</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#B87070] shrink-0 mt-0.5" />
                    <span><strong>Recepcionista Virtual com IA Generativa</strong> (300k tokens)</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Ações de Contratação Inteligente */}
            <div className="mt-8 pt-6 border-t border-[#EADBCE] space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setSelectedPlan('smart');
                    handleCheckout('smart', 'PIX');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-bold text-white bg-[#B87070] hover:bg-[#A86060] transition-all shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Assinar no Pix</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setSelectedPlan('smart');
                    handleCheckout('smart', 'CREDIT_CARD');
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl text-xs font-bold text-[#2D1F27] bg-[#FAF6F4] border border-[#B87070]/40 hover:border-[#B87070] hover:bg-white transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5 text-[#B87070]" />
                  <span>No Cartão</span>
                </button>
              </div>

              <button
                type="button"
                disabled={loading}
                onClick={() => {
                  setSelectedPlan('smart');
                  handleCheckout('smart', 'PIX');
                }}
                className="w-full py-2.5 text-xs text-center font-semibold text-[#B87070] hover:underline"
              >
                Assinar Inteligente (R$ 99,90) →
              </button>
            </div>
          </div>
        </div>

        {/* ── Barra de Status e Consulta de Pagamento (Requisito 8) ── */}
        <div className="w-full max-w-4xl bg-white border border-[#EADBCE] rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-sm font-semibold text-[#2D1F27] flex items-center justify-center sm:justify-start gap-2">
              <Clock className="w-4 h-4 text-[#B87070]" />
              <span>Já realizou o pagamento via Pix ou Cartão?</span>
            </h4>
            <p className="text-xs text-[#7D6B65]">
              O Asaas processa a compensação de forma automática. Clique para verificar e liberar seu acesso instantaneamente.
            </p>
          </div>

          <button
            type="button"
            disabled={verifying}
            onClick={handleCheckPayment}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#2D1F27] hover:bg-[#433139] transition-all shadow-xs shrink-0 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#C4837A] ${verifying ? 'animate-spin' : ''}`} />
            <span>{verifying ? 'Consultando Asaas...' : 'Verificar Pagamento'}</span>
          </button>
        </div>
      </main>

      {/* ── Modal Oficial de Pagamento ASAAS ─────────────────────── */}
      {paymentModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-[#EADBCE] relative animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            {/* Fechar modal */}
            <button
              type="button"
              onClick={() => setPaymentModal((prev) => ({ ...prev, open: false }))}
              className="absolute top-4 right-4 text-[#7D6B65] hover:text-[#2D1F27] p-2 rounded-full hover:bg-[#FAF6F4] transition-colors"
              aria-label="Fechar modal"
            >
              ✕
            </button>

            {/* Cabeçalho do Modal */}
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-[#B87070]/15 text-[#B87070] flex items-center justify-center mx-auto mb-2">
                {paymentModal.billingType === 'PIX' ? (
                  <QrCode className="w-6 h-6 stroke-[2]" />
                ) : (
                  <CreditCard className="w-6 h-6 stroke-[2]" />
                )}
              </div>
              <h3 className="text-xl font-serif font-bold text-[#2D1F27]">
                {paymentModal.billingType === 'PIX' ? 'Pagamento Instantâneo via Pix' : 'Assinatura via Cartão de Crédito'}
              </h3>
              <p className="text-xs text-[#7D6B65]">
                Plano {PLAN_CONFIGS[paymentModal.plan].name} • R$ {PLAN_CONFIGS[paymentModal.plan].priceMonthly.toFixed(2).replace('.', ',')} / mês
              </p>
            </div>

            {/* Conteúdo Pix */}
            {paymentModal.billingType === 'PIX' ? (
              <div className="mt-6 space-y-4">
                {paymentModal.result?.pixQrCodeImage ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-[#EADBCE] shadow-2xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${paymentModal.result.pixQrCodeImage}`}
                      alt="QR Code Pix Asaas"
                      className="w-48 h-48 object-contain"
                    />
                    <span className="text-[10px] text-[#7D6B65] mt-2">
                      Abra o app do seu banco e aponte a câmera para o QR Code
                    </span>
                  </div>
                ) : null}

                {paymentModal.result?.pixQrCodePayload && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-[#7D6B65] uppercase tracking-wider block">
                      Pix Copia e Cola
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={paymentModal.result.pixQrCodePayload}
                        className="flex-1 px-3 py-2 text-xs bg-[#FAF6F4] rounded-xl border border-[#EADBCE] text-[#2C1810] font-mono truncate select-all focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(paymentModal.result?.pixQrCodePayload || '');
                          setCopiedPix(true);
                          setTimeout(() => setCopiedPix(false), 3000);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#B87070] text-white hover:bg-[#A86060] transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        {copiedPix ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-[#FAF0ED] border border-[#EADBCE] text-[11px] text-[#7D6B65] space-y-1">
                  <p className="font-semibold text-[#2D1F27]">
                    ⚡ Confirmação Automática e Imediata
                  </p>
                  <p>
                    Assim que o pagamento for concluído em seu banco, o webhook oficial do Asaas atualizará sua assinatura e seu dashboard será liberado automaticamente.
                  </p>
                </div>
              </div>
            ) : (
              /* Conteúdo Cartão */
              <div className="mt-6 space-y-4">
                <p className="text-xs text-[#7D6B65] text-center leading-relaxed">
                  Para efetuar a assinatura por cartão com segurança certificada PCI, acesse o link oficial da fatura no gateway Asaas:
                </p>

                {paymentModal.result?.invoiceUrl && (
                  <a
                    href={paymentModal.result.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl text-xs font-bold text-white bg-[#B87070] hover:bg-[#A86060] shadow-sm transition-all"
                  >
                    <span>Abrir Fatura Asaas no Cartão</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                <div className="p-3.5 rounded-xl bg-[#FAF0ED] border border-[#EADBCE] text-[11px] text-[#7D6B65] space-y-1">
                  <p className="font-semibold text-[#2D1F27]">
                    🔒 Segurança Bancária PCI
                  </p>
                  <p>
                    A transação é realizada em ambiente criptografado Asaas. Assim que aprovada, seu acesso ao ZELUNIA será ativado na mesma hora.
                  </p>
                </div>
              </div>
            )}

            {/* Ações no Rodapé do Modal */}
            <div className="mt-6 pt-4 border-t border-[#EADBCE] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPaymentModal((prev) => ({ ...prev, open: false }))}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#7D6B65] hover:bg-[#FAF6F4] transition-all"
              >
                Fechar
              </button>

              <button
                type="button"
                disabled={verifying}
                onClick={handleCheckPayment}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#2D1F27] hover:bg-[#433139] transition-all shadow-xs cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#C4837A] ${verifying ? 'animate-spin' : ''}`} />
                <span>Já Paguei, Verificar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
