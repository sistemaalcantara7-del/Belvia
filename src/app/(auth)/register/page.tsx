'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { registerTenantAction } from '@/lib/actions/auth';
import { MailCheck, ArrowLeft, Check, Sparkles, ShieldCheck } from 'lucide-react';
import { PlanType } from '@/types/tenant';
import { PLAN_CONFIGS } from '@/types/plans';

function RegisterForm() {
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get('plan');
  const initialPlan: PlanType = requestedPlan === 'smart' ? 'smart' : 'essential';

  const [selectedPlan, setSelectedPlan] = useState<PlanType>(initialPlan);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    formData.set('plan', selectedPlan);
    const result = await registerTenantAction(formData);

    if (result?.error) {
      setErrorMessage(result.error);
      setLoading(false);
    } else if (result?.emailConfirmationRequired && result?.message) {
      setSuccessInfo(result.message);
      setLoading(false);
    }
  }

  const currentPlanConfig = PLAN_CONFIGS[selectedPlan];

  return (
    <Card className="w-full max-w-[500px] bg-white rounded-3xl shadow-xl border border-[#EAD9D3]/70 overflow-hidden">
      <CardHeader className="text-center pt-8 pb-4">
        <Link href="/" className="inline-flex justify-center mb-4 group">
          <Image
            src="/img/logoz.png"
            alt="ZELUNIA"
            width={220}
            height={140}
            priority
            className="w-auto h-20 md:h-24 object-contain transition-transform group-hover:scale-[1.02]"
          />
        </Link>
        <CardTitle className="text-2xl font-serif text-[#2C1810] font-normal">
          Cadastrar Clínica
        </CardTitle>
        <CardDescription className="text-xs text-[#7D6B65] mt-1">
          Crie sua conta multi-tenant e inicie a gestão do seu espaço
        </CardDescription>
      </CardHeader>
      <CardContent className="px-8 pb-8 pt-2">
        {successInfo ? (
          <div className="space-y-4 text-center py-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-[#FAF0ED] flex items-center justify-center text-[#C4837A] border border-[#EAD9D3]">
              <MailCheck className="w-6 h-6" />
            </div>
            <h4 className="font-serif text-lg text-[#2C1810]">Confirmação de E-mail Enviada</h4>
            <p className="text-xs text-[#6B5A54] leading-relaxed">
              {successInfo}
            </p>
            <div className="pt-2">
              <Link href="/login">
                <Button className="w-full" style={{ backgroundColor: 'var(--belvia-rose)' }}>
                  Ir para Login
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700">
                {errorMessage}
              </div>
            )}

            {/* SELEÇÃO E DESTAQUE VISUAL DO PLANO COM TRIAL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-[#2C1810]">
                  Plano Escolhido
                </label>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#8C4F47] bg-[#FAF0ED] px-2.5 py-0.5 rounded-full border border-[#EAD9D3]">
                  <Sparkles className="w-3 h-3 text-[#C4837A]" />
                  7 dias grátis, sem cartão de crédito
                </span>
              </div>

              {/* Seletor de Abas dos Planos */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#FAF6F3] rounded-2xl border border-[#EAD9D3]">
                <button
                  type="button"
                  onClick={() => setSelectedPlan('essential')}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-all text-center flex flex-col items-center justify-center ${
                    selectedPlan === 'essential'
                      ? 'bg-white text-[#2C1810] shadow-2xs font-semibold border border-[#EAD9D3]'
                      : 'text-[#7D6B65] hover:text-[#2C1810]'
                  }`}
                >
                  <span>{PLAN_CONFIGS.essential.name}</span>
                  <span className="text-[11px] text-[#A86B62]">R$ 59,90/mês</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan('smart')}
                  className={`relative py-2 px-3 rounded-xl text-xs font-medium transition-all text-center flex flex-col items-center justify-center ${
                    selectedPlan === 'smart'
                      ? 'bg-white text-[#2C1810] shadow-2xs font-semibold border-2 border-[#C4837A]'
                      : 'text-[#7D6B65] hover:text-[#2C1810]'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {PLAN_CONFIGS.smart.name}
                    <span className="text-[9px] bg-[#C4837A] text-white px-1.5 py-0.2 rounded-full uppercase font-bold tracking-tight">Top</span>
                  </span>
                  <span className="text-[11px] text-[#A86B62]">R$ 99,90/mês</span>
                </button>
              </div>

              {/* Card Resumo do Plano Selecionado */}
              <div className="p-3.5 rounded-2xl bg-[#FAF0ED]/60 border border-[#EAD9D3] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#2C1810]">
                    {currentPlanConfig.name} — R$ {currentPlanConfig.priceMonthly.toFixed(2).replace('.', ',')}/mês
                  </span>
                  <span className="text-[11px] text-[#5C8A5E] font-medium flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Trial Ativo
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#6B5A54]">
                  <Check className="w-3.5 h-3.5 text-[#C4837A] shrink-0" />
                  <span>
                    {selectedPlan === 'smart'
                      ? 'Até 10 profissionais, agendamentos ilimitados, IA e comissões automáticas.'
                      : 'Ideal para 1 profissional autônomo com agenda completa e controle de caixa.'}
                  </span>
                </div>
                <p className="text-[10px] text-[#9B8985] pt-0.5">
                  Cobrança iniciada somente após o período de teste de 7 dias se optar pela continuidade.
                </p>
              </div>

              {/* Campo oculto com valor garantido para o formulário */}
              <input type="hidden" name="plan" value={selectedPlan} />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#2C1810]" htmlFor="clinicName">
                Nome da Clínica ou Estúdio
              </label>
              <input
                id="clinicName"
                name="clinicName"
                type="text"
                placeholder="Ex: Studio Bella Estética"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors placeholder:text-[#B5A5A0]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#2C1810]" htmlFor="fullName">
                Seu Nome Completo
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                placeholder="Ex: Dra. Mariana Silva"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors placeholder:text-[#B5A5A0]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#2C1810]" htmlFor="email">
                E-mail Profissional
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="mariana@studiobella.com.br"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors placeholder:text-[#B5A5A0]"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[#2C1810]" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors placeholder:text-[#B5A5A0]"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-95 disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--belvia-rose)' }}
              >
                <span>{loading ? 'Cadastrando...' : 'Começar 7 Dias Grátis'}</span>
              </button>
              <p className="text-[10px] text-center text-[#9B8985] mt-2">
                Ao se cadastrar, você concorda com os termos de uso e política de privacidade.
              </p>
            </div>
          </form>
        )}
        <div className="mt-6 text-center text-xs text-[#7D6B65]">
          Já possui uma conta?{' '}
          <Link href="/login" className="text-[#C4837A] hover:underline font-medium">
            Fazer Login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function RegisterFallback() {
  return (
    <Card className="w-full max-w-[500px] bg-white rounded-3xl shadow-xl border border-[#EAD9D3]/70 p-12 text-center">
      <div className="animate-pulse space-y-4">
        <div className="h-12 w-32 bg-[#FAF0ED] rounded-xl mx-auto" />
        <div className="h-6 w-48 bg-[#FAF0ED] rounded-lg mx-auto" />
        <div className="h-4 w-64 bg-[#FAF0ED] rounded-md mx-auto" />
      </div>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#F6EEEC]">
      {/* Botão de retorno ao site */}
      <Link
        href="/"
        className="fixed top-6 left-6 z-50 inline-flex items-center gap-1.5 text-xs font-medium text-[#7D6B65] hover:text-[#2C1810] bg-white/70 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-[#EAD9D3] shadow-2xs transition-all"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar ao site
      </Link>

      <Suspense fallback={<RegisterFallback />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}