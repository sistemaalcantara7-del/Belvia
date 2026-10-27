'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { registerTenantAction } from '@/lib/actions/auth';
import { MailCheck, ArrowLeft } from 'lucide-react';

export default function RegisterPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessInfo(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const result = await registerTenantAction(formData);

    if (result?.error) {
      setErrorMessage(result.error);
      setLoading(false);
    } else if (result?.emailConfirmationRequired && result?.message) {
      setSuccessInfo(result.message);
      setLoading(false);
    }
  }

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

      <Card className="w-full max-w-[460px] bg-white rounded-3xl shadow-xl border border-[#EAD9D3]/70 overflow-hidden">
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
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#2C1810]" htmlFor="plan">
                  Plano Selecionado
                </label>
                <select
                  id="plan"
                  name="plan"
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors"
                >
                  <option value="essential">Essencial (R$ 59,90/mês)</option>
                  <option value="smart">Inteligente (R$ 99,90/mês)</option>
                </select>
              </div>
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-95 disabled:opacity-60"
                  style={{ backgroundColor: 'var(--belvia-rose)' }}
                >
                  {loading ? 'Cadastrando...' : 'Criar Conta da Clínica'}
                </button>
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
    </div>
  );
}