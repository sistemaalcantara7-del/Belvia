import Link from 'next/link';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { redirect } from 'next/navigation';
import { Calendar, Users, Scissors, UserCheck, FileText, Settings, LogOut, DollarSign, TrendingUp } from 'lucide-react';
import { signOutAction } from '@/lib/actions/auth';

export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps) {
  const { tenantSlug } = await params;

  // Validação estrita de contexto
  const context = await getAuthenticatedTenantContext(tenantSlug);
  if (!context) {
    redirect('/login');
  }

  const navLinks = [
    { href: `/${tenantSlug}/agenda`, label: 'Agenda', icon: Calendar },
    { href: `/${tenantSlug}/servicos`, label: 'Serviços', icon: Scissors },
    { href: `/${tenantSlug}/profissionais`, label: 'Profissionais', icon: UserCheck },
    { href: `/${tenantSlug}/clientes`, label: 'Clientes', icon: Users },
    { href: `/${tenantSlug}/anamnese`, label: 'Anamnese', icon: FileText },
    ...(context.role !== 'professional'
      ? [{ href: `/${tenantSlug}/caixa`, label: 'Caixa Diário', icon: DollarSign }]
      : []),
    ...(context.role !== 'receptionist'
      ? [{ href: `/${tenantSlug}/comissoes`, label: 'Comissões', icon: TrendingUp }]
      : []),
    { href: `/${tenantSlug}/configuracoes`, label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Sidebar Desktop / Topbar Mobile */}
      <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between shrink-0">
        <div>
          {/* Header do Tenant */}
          <div className="p-4 sm:p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent">
                BELVIA
              </span>
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[170px] mt-0.5">
                {context.tenantName}
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {context.role}
            </span>
          </div>

          {/* Navegação */}
          <nav className="p-3 space-y-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <Icon className="w-4 h-4 text-rose-500" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair da Conta
            </button>
          </form>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
