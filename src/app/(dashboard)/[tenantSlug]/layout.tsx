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

  // Lista com ícones e nomes conforme exatamente exibido no Mockup
  const navLinks = [
    { href: `/${tenantSlug}`, label: 'Dashboard', iconName: 'dashboard' },
    { href: `/${tenantSlug}/agenda`, label: 'Agenda', iconName: 'agenda' },
    { href: `/${tenantSlug}/clientes`, label: 'Clientes', iconName: 'clientes' },
    { href: `/${tenantSlug}/servicos`, label: 'Serviços', iconName: 'servicos' },
    { href: `/${tenantSlug}/profissionais`, label: 'Profissionais', iconName: 'profissionais' },
    { href: `/${tenantSlug}/anamnese`, label: 'Anamnese', iconName: 'anamnese' },
    ...(context.role !== 'professional'
      ? [{ href: `/${tenantSlug}/caixa`, label: 'Financeiro', iconName: 'financeiro' }]
      : []),
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
        initials={initials}
        navLinks={navLinks}
      />

      {/* ── Área de Conteúdo Principal ─────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-64 transition-all duration-300">
        <main className="flex-1 pt-16 md:pt-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}