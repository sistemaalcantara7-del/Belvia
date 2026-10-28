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

  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  // FASE 7.1 — SIMPLIFICAÇÃO E USABILIDADE:
  // Reorganizar a experiência priorizando a rotina diária e separando Gestão & Configuração
  const primaryLinks = [
    { href: `/${tenantSlug}`, label: 'Dashboard', iconName: 'dashboard' },
    { href: `/${tenantSlug}/agenda`, label: 'Agenda', iconName: 'agenda' },
    { href: `/${tenantSlug}/clientes`, label: 'Clientes', iconName: 'clientes' },
    { href: `/${tenantSlug}/servicos`, label: 'Serviços', iconName: 'servicos' },
    { href: `/${tenantSlug}/anamnese`, label: 'Atendimento & Anamnese', iconName: 'anamnese' },
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