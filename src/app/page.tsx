import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Calendar, Users, ShieldCheck, Check } from 'lucide-react';
import { PLAN_CONFIGS } from '@/types/plans';

export default function HomePage() {
  const essential = PLAN_CONFIGS.essential;
  const smart = PLAN_CONFIGS.smart;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent">
              BELVIA
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              SaaS Estética
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button>Criar Minha Clínica</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Plataforma Multi-Tenant para Estética, Beleza & Bem-Estar
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6">
          Gestão inteligente para sua clínica de estética e salão
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl mx-auto">
          Agenda sem conflitos, prontuários e fichas de anamnese em conformidade total com a LGPD, gestão de comissões e atendimento profissional em uma única plataforma.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="h-12 px-8 text-base">
              Experimentar Agora
            </Button>
          </Link>
          <a href="#planos">
            <Button size="lg" variant="outline" className="h-12 px-8 text-base">
              Ver Planos
            </Button>
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 px-6 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Calendar className="w-8 h-8 text-rose-600 mb-2" />
              <CardTitle>Agenda Inteligente</CardTitle>
              <CardDescription>
                Organize atendimentos, bloqueie choques de horários e receba confirmações de clientes.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheck className="w-8 h-8 text-rose-600 mb-2" />
              <CardTitle>Anamnese & LGPD</CardTitle>
              <CardDescription>
                Fichas médicas e estéticas dinâmicas, fotos de antes/depois privadas e consentimento seguro.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Users className="w-8 h-8 text-rose-600 mb-2" />
              <CardTitle>Multi-Tenant & Equipe</CardTitle>
              <CardDescription>
                Isolamento estrito de dados por clínica e níveis de acesso (Owner, Admin, Profissional, Recepcionista).
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planos" className="py-16 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Planos transparentes para cada etapa</h2>
          <p className="text-zinc-600 dark:text-zinc-400">Escolha o plano ideal para seu estúdio ou clínica.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Plano Essencial */}
          <Card className="flex flex-col justify-between border-zinc-200 dark:border-zinc-800">
            <CardHeader>
              <CardTitle className="text-xl">{essential.name}</CardTitle>
              <CardDescription>Ideal para profissionais autônomos e pequenos estúdios</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-extrabold">R$ 59,90</span>
                <span className="text-zinc-500 text-sm"> / mês</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>1 Profissional</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Agenda completa & Clientes (até 500)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Fichas de anamnese padrão</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Histórico de atendimentos</span>
                </li>
              </ul>
              <Link href="/register?plan=essential" className="block pt-4">
                <Button variant="outline" className="w-full">Assinar Essencial</Button>
              </Link>
            </CardContent>
          </Card>

          {/* Plano Inteligente */}
          <Card className="flex flex-col justify-between border-rose-500 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-rose-600 text-white text-xs font-bold px-3 py-1 rounded-bl">
              Mais Escolhido
            </div>
            <CardHeader>
              <CardTitle className="text-xl">{smart.name}</CardTitle>
              <CardDescription>Para clínicas consolidadas e equipes em crescimento</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-extrabold">R$ 99,90</span>
                <span className="text-zinc-500 text-sm"> / mês</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2.5 text-sm">
                <li className="flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Até 10 Profissionais simultâneos</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Encaixes inteligentes na agenda</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Fichas de anamnese 100% personalizáveis</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Histórico fotográfico de evolução clínica</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>DRE e comissões automáticas de profissionais</span>
                </li>
              </ul>
              <Link href="/register?plan=smart" className="block pt-4">
                <Button className="w-full">Assinar Inteligente</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 text-center text-sm text-zinc-500">
        <p>© 2026 BELVIA. Todos os direitos reservados. Plataforma em conformidade com a LGPD.</p>
      </footer>
    </div>
  );
}
