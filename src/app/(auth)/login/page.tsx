'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, EyeOff, Check, Mail, Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import { loginAction } from '@/lib/actions/auth';

const benefits = [
  'Agendamentos inteligentes',
  'Histórico completo do cliente',
  'Financeiro integrado',
  'Comissões e relatórios',
  'Tudo em um só lugar',
];

export default function LoginPage() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const result = await loginAction(formData);

    if (result?.error) {
      setErrorMessage(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 md:p-8 bg-[#F6EEEC]">
      {/* Botão de retorno discreto ao site */}
      <Link
        href="/"
        className="fixed top-6 left-6 z-50 inline-flex items-center gap-1.5 text-xs font-medium text-[#7D6B65] hover:text-[#2C1810] bg-white/70 backdrop-blur-xs px-3.5 py-1.5 rounded-full border border-[#EAD9D3] shadow-2xs transition-all"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar ao site
      </Link>

      {/* ── CARD PRINCIPAL CENTRALIZADO COM 3 COLUNAS ────────────── */}
      <div className="w-full max-w-[1080px] bg-white rounded-3xl shadow-xl border border-[#EAD9D3]/70 overflow-hidden flex flex-col lg:flex-row min-h-[580px] lg:min-h-[620px]">
        {/* ── COLUNA 1: APRESENTAÇÃO INSTITUCIONAL ZELUNIA (ESQUERDA) ── */}
        <div className="hidden lg:flex lg:w-[35%] p-8 xl:p-10 flex-col justify-between bg-gradient-to-br from-[#FDF8F7] via-[#F7ECE9] to-[#F1E0DC] relative border-r border-[#EAD9D3]/60">
          <div className="space-y-6">
            {/* Logomarca ZELUNIA */}
            <div className="pt-2">
              <Image
                src="/img/logoz.png"
                alt="ZELUNIA — Beleza · Gestão · Bem-estar"
                width={264}
                height={172}
                priority
                className="w-auto h-24 md:h-28 object-contain"
              />
            </div>

            {/* Título */}
            <h1 className="text-2xl xl:text-[28px] font-serif text-[#2C1810] leading-tight font-normal">
              Gestão completa
              <br />
              para o seu
              <br />
              estabelecimento
              <br />
              de estética
            </h1>

            {/* Lista de Benefícios */}
            <ul className="space-y-3 pt-2">
              {benefits.map((b) => (
                <li key={b} className="flex items-center gap-2.5 text-xs font-medium text-[#4A3B36]">
                  <div className="w-4 h-4 rounded-full bg-[#C4837A] text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[11px] text-[#9B8985] pt-6 font-sans">
            © {new Date().getFullYear()} ZELUNIA. Todos os direitos reservados.
          </p>
        </div>

        {/* ── COLUNA 2: FOTOGRAFIA DA RECEPÇÃO ESTÉTICA (CENTRO) ───────── */}
        <div className="hidden lg:block lg:w-[33%] relative bg-[#FAF4EE] border-r border-[#EAD9D3]/60 overflow-hidden">
          <Image
            src="/img/reception_zelunia.png"
            alt="Ambiente estético sofisticado ZELUNIA"
            fill
            priority
            sizes="(max-width: 1200px) 33vw, 360px"
            className="object-cover object-center"
          />
        </div>

        {/* ── COLUNA 3: FORMULÁRIO LIMPO (DIREITA) ────────────────────── */}
        <div className="w-full lg:w-[32%] p-8 sm:p-10 flex flex-col justify-center bg-white">
          <div className="w-full max-w-sm mx-auto space-y-6">
            {/* Header Mobile com Marca */}
            <div className="lg:hidden text-center pb-2">
              <Image
                src="/img/logoz.png"
                alt="ZELUNIA"
                width={200}
                height={130}
                priority
                className="w-auto h-20 mx-auto object-contain"
              />
            </div>

            {/* Cabeçalho do Formulário */}
            <div className="space-y-1">
              <h2 className="text-3xl font-serif text-[#2C1810] font-normal tracking-tight">
                Bem-vindo
              </h2>
              <p className="text-xs text-[#7D6B65]">
                Acesse sua conta para continuar
              </p>
            </div>

            {/* Mensagem de Erro */}
            {errorMessage && (
              <div className="p-3 text-xs rounded-xl bg-red-50 border border-red-200 text-red-700">
                {errorMessage}
              </div>
            )}

            {/* Formulário de Acesso */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* E-mail */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#2C1810]" htmlFor="email">
                  E-mail
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9B8985]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors placeholder:text-[#B5A5A0]"
                  />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[#2C1810]" htmlFor="password">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#9B8985]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Sua senha"
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl text-xs sm:text-sm text-[#2C1810] bg-white border border-[#EAD9D3] focus:border-[#C4837A] focus:outline-none transition-colors placeholder:text-[#B5A5A0]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#9B8985] hover:text-[#2C1810] transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Lembrar e Recuperar */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[#6B5A54] select-none">
                  <input
                    type="checkbox"
                    name="remember"
                    className="w-4 h-4 rounded border-[#EAD9D3] text-[#C4837A] accent-[#C4837A]"
                  />
                  <span>Lembrar de mim</span>
                </label>

                <Link
                  href="/esqueci-senha"
                  className="text-[#C4837A] hover:underline transition-colors"
                >
                  Esqueceu a senha?
                </Link>
              </div>

              {/* Botão Entrar */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-95 disabled:opacity-60"
                style={{ backgroundColor: 'var(--belvia-rose)' }}
              >
                <span>{loading ? 'Entrando...' : 'Entrar'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Separador / Rodapé */}
            <div className="pt-2 text-center text-xs text-[#7D6B65]">
              <span>Não tem uma conta? </span>
              <Link href="/register" className="font-medium text-[#C4837A] hover:underline">
                Cadastre-se
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}