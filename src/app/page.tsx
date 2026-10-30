import Link from 'next/link';
import Image from 'next/image';
import {
  Calendar,
  Users,
  CreditCard,
  TrendingUp,
  ArrowRight,
  Play,
  ShieldCheck,
  Headphones,
  Sparkles,
  Check,
} from 'lucide-react';
import { PLAN_CONFIGS } from '@/types/plans';

export default function HomePage() {
  const essential = PLAN_CONFIGS.essential;
  const smart = PLAN_CONFIGS.smart;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--belvia-cream)' }}>
      {/* ── 1. CABEÇALHO COM EFEITO FROSTED GLASS (TRANSLÚCIDO) ──── */}
      <header className="w-full sticky top-0 z-50 bg-[#FAF4EE]/70 backdrop-blur-md border-b border-[#EAD9D3]/40 shadow-xs transition-all">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          {/* Logo & Marca */}
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src="/img/logoz2.png"
              alt="ZELUNIA — Beleza · Gestão · Bem-estar"
              width={260}
              height={70}
              priority
              className="h-14 md:h-16 w-auto object-contain transition-transform group-hover:scale-[1.02]"
            />
          </Link>

          {/* Menu Central */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#7D6B65]">
            <Link
              href="#inicio"
              className="text-[#2C1810] font-semibold transition-colors hover:text-[#C4837A]"
            >
              Início
            </Link>
            <Link
              href="#solucoes"
              className="hover:text-[#2C1810] transition-colors"
            >
              Soluções
            </Link>
            <Link
              href="#planos"
              className="hover:text-[#2C1810] transition-colors"
            >
              Planos
            </Link>
            <Link
              href="#contato"
              className="hover:text-[#2C1810] transition-colors"
            >
              Contato
            </Link>
          </nav>

          {/* Botões Direita */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-5 py-2 rounded-xl text-sm font-medium text-[#4A3B36] bg-white/80 backdrop-blur-xs border border-[#EAD9D3] hover:bg-white hover:border-[#C4837A] hover:text-[#2C1810] transition-all shadow-2xs"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-all shadow-xs hover:opacity-95"
              style={{ backgroundColor: 'var(--belvia-rose)' }}
            >
              <span>Começar agora</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── 2. HERO SECTION ────────────────────────────────────────── */}
      <section
        id="inicio"
        className="relative w-full overflow-hidden bg-[#FAF4EE] md:bg-no-repeat md:bg-cover md:bg-center"
        style={{
          // No desktop (md+): mantém a imagem de fundo integrada com min-height de 800px
          // No mobile (< md): usa fundo com gradiente sutil elegante com layout em pilha vertical
        }}
      >
        {/* Camada desktop com a imagem de fundo original exatamente como desenhada */}
        <div
          className="hidden md:block absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: "url('/img/bg_hero.png')" }}
        />

        {/* Gradiente sutil no topo/fundo mobile para suavizar a transição com o header */}
        <div className="md:hidden absolute inset-0 bg-gradient-to-b from-[#FAF4EE] via-[#FBF6F2] to-[#FAF4EE] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full md:h-[800px] md:min-h-[800px] flex flex-col md:flex-row md:items-center pt-8 pb-10 md:pt-0 md:pb-0">
          {/* Coluna Esquerda: Texto e CTAs */}
          <div className="w-full md:max-w-lg lg:max-w-xl z-10 space-y-4 sm:space-y-6 lg:-ml-4 text-left">
            <div className="inline-block">
              <span className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] sm:tracking-[0.25em] uppercase text-[#9B8985] font-sans">
                Mais organização para o seu negócio
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl lg:text-[46px] font-serif leading-[1.2] sm:leading-[1.18] text-[#2C1810] font-normal tracking-tight">
              Seu tempo vale mais para o que realmente{' '}
              <span className="italic font-normal" style={{ color: 'var(--belvia-rose)' }}>
                importa.
              </span>
            </h1>

            <p className="text-xs sm:text-sm md:text-base text-[#6B5A54] leading-relaxed max-w-[360px] sm:max-w-[380px] lg:max-w-[400px] font-sans">
              O ZELUNIA é a plataforma completa para clínicas de estética, beleza e bem-estar.
              <br className="hidden sm:inline" />
              {' '}Organize sua agenda, seus clientes, seu financeiro e toda a rotina do seu estabelecimento em um só lugar.
            </p>

            {/* CTAs */}
            <div className="pt-2 flex flex-col xs:flex-row items-stretch xs:items-center gap-3 sm:gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2.5 px-6 py-3 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-95"
                style={{ backgroundColor: 'var(--belvia-rose)' }}
              >
                <span>Começar agora</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <a
                href="#solucoes"
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium text-[#4A3B36] bg-white/80 hover:bg-white border border-[#EAD9D3] transition-all shadow-2xs"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#F2E0DC] text-[#C4837A] shrink-0">
                  <Play className="w-3 h-3 fill-current ml-0.5" />
                </div>
                <span>Conheça os recursos</span>
              </a>
            </div>
          </div>

          {/* Bloco Mobile dos Mockups (Notebook & Celular) — Posicionado abaixo dos botões sem sobreposição */}
          <div className="md:hidden mt-8 sm:mt-10 w-full flex justify-center items-center overflow-hidden">
            <div className="relative w-full max-w-[420px] px-2 flex justify-center">
              <Image
                src="/img/hero_devices.png"
                alt="ZELUNIA — Gestão em Notebook e Celular"
                width={1164}
                height={809}
                priority
                className="w-full h-auto object-contain drop-shadow-md select-none pointer-events-none"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. RECURSOS — SEÇÃO ENXUTA EM UMA FAIXA ELEGANTE ────────── */}
      <section
        id="solucoes"
        className="w-full py-10 md:py-12 border-y border-[#EAD9D3]/70 bg-white"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {/* 1. Agenda Inteligente */}
            <div className="flex items-start gap-4 p-3 rounded-2xl hover:bg-[#FAF6F3] transition-colors">
              <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-[#F2E0DC] text-[#C4837A] border border-[#EAD9D3]/80">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm md:text-base text-[#2C1810]">
                  Agenda Inteligente
                </h3>
                <p className="text-xs text-[#7D6B65] leading-relaxed">
                  Organize seus atendimentos com praticidade.
                </p>
              </div>
            </div>

            {/* 2. Gestão de Clientes */}
            <div className="flex items-start gap-4 p-3 rounded-2xl hover:bg-[#FAF6F3] transition-colors">
              <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-[#F2E0DC] text-[#C4837A] border border-[#EAD9D3]/80">
                <Users className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm md:text-base text-[#2C1810]">
                  Gestão de Clientes
                </h3>
                <p className="text-xs text-[#7D6B65] leading-relaxed">
                  Histórico completo e relacionamento em um só lugar.
                </p>
              </div>
            </div>

            {/* 3. Financeiro Integrado */}
            <div className="flex items-start gap-4 p-3 rounded-2xl hover:bg-[#FAF6F3] transition-colors">
              <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-[#F2E0DC] text-[#C4837A] border border-[#EAD9D3]/80">
                <CreditCard className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm md:text-base text-[#2C1810]">
                  Financeiro Integrado
                </h3>
                <p className="text-xs text-[#7D6B65] leading-relaxed">
                  Caixa, comissões e relatórios em tempo real.
                </p>
              </div>
            </div>

            {/* 4. Mais Resultados */}
            <div className="flex items-start gap-4 p-3 rounded-2xl hover:bg-[#FAF6F3] transition-colors">
              <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center bg-[#F2E0DC] text-[#C4837A] border border-[#EAD9D3]/80">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm md:text-base text-[#2C1810]">
                  Mais Resultados
                </h3>
                <p className="text-xs text-[#7D6B65] leading-relaxed">
                  Tenha uma visão clara do crescimento do seu negócio.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. SEÇÃO INSTITUCIONAL FINAL ───────────────────────────── */}
      <section className="relative w-full py-16 md:py-20 bg-gradient-to-b from-[#FDF9F6] to-[#FAF4EE] overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10">
            {/* Texto */}
            <div className="max-w-2xl space-y-4">
              <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-[#9B8985] font-sans">
                Para profissionais que transformam vidas
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-serif text-[#2C1810] leading-tight font-normal">
                Mais que um sistema,
                <br />
                uma parceria para o seu crescimento.
              </h2>
              <p className="text-sm md:text-base text-[#6B5A54] leading-relaxed max-w-xl">
                O ZELUNIA foi criado para simplificar a sua rotina e dar mais tempo para você cuidar do que realmente importa: as suas clientes.
              </p>
            </div>

            {/* Ação e Diferenciais */}
            <div className="flex flex-col sm:items-end gap-6 w-full lg:w-auto">
              <a
                href="#planos"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-medium text-white transition-all shadow-sm hover:opacity-95"
                style={{ backgroundColor: 'var(--belvia-rose)' }}
              >
                <span>Conheça nossos planos</span>
                <ArrowRight className="w-4 h-4" />
              </a>

              {/* Selos discretos */}
              <div className="flex flex-wrap items-center gap-6 pt-2 text-[#7D6B65]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#C4837A]" />
                  <span className="text-xs font-medium">Seguro e confiável</span>
                </div>
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-[#C4837A]" />
                  <span className="text-xs font-medium">Suporte humanizado</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#C4837A]" />
                  <span className="text-xs font-medium">Em constante evolução</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. PLANOS E NAVEGAÇÃO ──────────────────────────────────── */}
      <section id="planos" className="py-20 px-6 max-w-6xl mx-auto w-full">
        <div className="text-center mb-14 space-y-2">
          <span className="text-[11px] font-semibold tracking-[0.25em] uppercase text-[#9B8985]">
            Planos transparentes
          </span>
          <h2 className="text-3xl md:text-4xl font-serif text-[#2C1810] font-normal">
            Escolha o plano ideal para a sua fase
          </h2>
          <p className="text-sm text-[#7D6B65] max-w-md mx-auto">
            Sem fidelidade ou surpresas. Evolua quando sua clínica precisar.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
          {/* Plano Essencial */}
          <div className="flex flex-col justify-between p-8 rounded-2xl bg-white border border-[#EAD9D3] shadow-xs hover:border-[#C4837A]/50 transition-all">
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-serif font-medium text-[#2C1810]">{essential.name}</h3>
                <p className="text-xs text-[#9B8985] mt-1">
                  Ideal para profissionais autônomos e pequenos estúdios
                </p>
              </div>

              <div>
                <span className="text-4xl font-serif font-medium text-[#2C1810]">R$ 59,90</span>
                <span className="text-xs text-[#9B8985]"> / mês</span>
              </div>

              <ul className="space-y-3 pt-2 text-xs md:text-sm text-[#5D4E48]">
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#FAF0ED] text-[#C4837A] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>1 Profissional atendendo</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#FAF0ED] text-[#C4837A] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Agenda completa & Histórico de Clientes</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#FAF0ED] text-[#C4837A] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Fichas de anamnese padrão</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#FAF0ED] text-[#C4837A] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Controle de Caixa Diário</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <Link
                href="/register?plan=essential"
                className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-medium text-[#2C1810] bg-[#FAF6F3] border border-[#EAD9D3] hover:bg-white hover:border-[#C4837A] transition-all"
              >
                Começar no Essencial
              </Link>
            </div>
          </div>

          {/* Plano Inteligente */}
          <div className="relative flex flex-col justify-between p-8 rounded-2xl bg-white border-2 border-[#C4837A] shadow-md">
            <div className="absolute -top-3 right-6 bg-[#C4837A] text-white text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-full shadow-2xs">
              Mais Escolhido
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-serif font-medium text-[#2C1810]">{smart.name}</h3>
                <p className="text-xs text-[#9B8985] mt-1">
                  Para clínicas consolidadas e equipes em crescimento
                </p>
              </div>

              <div>
                <span className="text-4xl font-serif font-medium text-[#2C1810]">R$ 99,90</span>
                <span className="text-xs text-[#9B8985]"> / mês</span>
              </div>

              <ul className="space-y-3 pt-2 text-xs md:text-sm text-[#5D4E48]">
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#C4837A] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span className="font-medium text-[#2C1810]">Até 10 profissionais na equipe</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#C4837A] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Agendamentos com encaixes e bloqueios flexíveis</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#C4837A] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Anamnese avançada e acompanhamento clínico</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#C4837A] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Comissões automáticas de profissionais</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full bg-[#C4837A] text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>Histórico 360º de Clientes completo</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <Link
                href="/register?plan=smart"
                className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-medium text-white transition-all shadow-xs hover:opacity-95"
                style={{ backgroundColor: 'var(--belvia-rose)' }}
              >
                Assinar Inteligente
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. RODAPÉ INSTITUCIONAL ─────────────────────────────────── */}
      <footer id="contato" className="border-t border-[#EAD9D3] bg-[#FAF6F3] py-14 text-sm text-[#7D6B65]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image
              src="/img/logoz.png"
              alt="ZELUNIA"
              width={400}
              height={110}
              className="h-20 md:h-24 w-auto object-contain"
            />
          </div>

          <p className="text-xs text-[#9B8985]">
            © {new Date().getFullYear()} ZELUNIA. Todos os direitos reservados. Plataforma em conformidade com a LGPD.
          </p>

          <div className="flex items-center gap-6 text-xs text-[#7D6B65]">
            <Link href="/login" className="hover:text-[#2C1810] transition-colors">
              Acessar Clínica
            </Link>
            <Link href="/register" className="hover:text-[#2C1810] transition-colors">
              Cadastrar
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}