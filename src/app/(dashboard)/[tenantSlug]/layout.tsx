import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';

export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  receptionist: 'Recepcionista',
  professional: 'Profissional',
};

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps) {
  const { tenantSlug } = await params;

  // Tenta autenticação do usuário para este tenant
  const context = await getAuthenticatedTenantContext(tenantSlug);

  // MODO PÚBLICO (DUAL-NATURE):
  // Se não houver sessão autenticada ou o visitante for um cliente anônimo da página pública,
  // permite a renderização limpa dos filhos (onde a página raiz exibirá a Vitrine Pública)
  if (!context) {
    return <>{children}</>;
  }

  // Intercepta qualquer rota dentro do layout do dashboard se o trial expirou sem assinatura ativa
  if (context.isSubscriptionValid === false) {
    redirect(`/${tenantSlug}/assinar`);
  }

  // Links do painel administrativo (Seção Operacional na ordem solicitada)
  const primaryLinks = [
    { href: `/${tenantSlug}`, label: 'Dashboard', iconName: 'dashboard' },
    { href: `/${tenantSlug}/servicos`, label: 'Serviços', iconName: 'servicos' },
    { href: `/${tenantSlug}/portfolio`, label: 'Portfólio', iconName: 'portfolio' },
    { href: `/${tenantSlug}/clientes`, label: 'Clientes', iconName: 'clientes' },
    { href: `/${tenantSlug}/anamnese`, label: 'Atendimento & Anamnese', iconName: 'anamnese' },
    { href: `/${tenantSlug}/agenda`, label: 'Agenda', iconName: 'agenda' },
    ...(context.role !== 'professional'
      ? [{ href: `/${tenantSlug}/pdv`, label: 'PDV de Atendimento', iconName: 'pdv' }]
      : []),
    ...(context.role !== 'professional'
      ? [{ href: `/${tenantSlug}/caixa`, label: 'Financeiro', iconName: 'financeiro' }]
      : []),
  ];

  const secondaryLinks = [
    { href: `/${tenantSlug}/profissionais`, label: 'Profissionais', iconName: 'profissionais' },
    ...(context.role !== 'receptionist'
      ? [{ href: `/${tenantSlug}/comissoes`, label: 'Comissões', iconName: 'comissoes' }]
      : []),
    { href: `/${tenantSlug}/relatorios`, label: 'Relatórios', iconName: 'relatorios' },
    { href: `/${tenantSlug}/configuracoes`, label: 'Configurações', iconName: 'configuracoes' },
  ];

  const roleLabel = ROLE_LABELS[context.role] ?? context.role;

  const initials = context.tenantName
    ? context.tenantName.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'Z';

  return (
    <div className="min-h-screen flex bg-[#FAF5F3] text-[#2C1810]">
      {/* ── Sidebar ZELUNIA (Desktop Recolhível + Mobile Drawer) ───── */}
      <DashboardSidebar
        tenantSlug={tenantSlug}
        tenantName={context.tenantName}
        roleLabel={roleLabel}
        plan={context.plan}
        initials={initials}
        primaryLinks={primaryLinks}
        secondaryLinks={secondaryLinks}
      />

      {/* ── Área de Conteúdo Principal ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64 transition-all duration-300">
        {context.tenantStatus === 'suspended' && (
          <div className="bg-amber-600 text-white px-4 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xs z-30">
            <span>
              ⚠️ Assinatura em atraso: O estabelecimento está temporariamente suspenso. Seus dados estão preservados.
            </span>
            <a
              href={`/${tenantSlug}/configuracoes`}
              className="underline font-bold hover:text-amber-100 ml-4 shrink-0"
            >
              Regularizar Minha Assinatura →
            </a>
          </div>
        )}
        <main className="flex-1 pt-16 md:pt-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
