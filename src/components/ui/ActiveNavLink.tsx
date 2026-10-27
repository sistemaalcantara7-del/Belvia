'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calendar,
  Users,
  Scissors,
  UserCheck,
  FileText,
  Settings,
  DollarSign,
  TrendingUp,
  LayoutDashboard,
  LucideIcon,
  BarChart3,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  agenda: Calendar,
  clientes: Users,
  servicos: Scissors,
  profissionais: UserCheck,
  anamnese: FileText,
  financeiro: DollarSign,
  caixa: DollarSign,
  comissoes: TrendingUp,
  relatorios: BarChart3,
  configuracoes: Settings,
};

interface ActiveNavLinkProps {
  href: string;
  label: string;
  iconName: string;
}

export function ActiveNavLink({ href, label, iconName }: ActiveNavLinkProps) {
  const pathname = usePathname();
  // Exact match for dashboard root, prefix match for other routes
  const isActive =
    href.split('/').length <= 2
      ? pathname === href
      : pathname === href || pathname.startsWith(href + '/');

  const Icon = ICON_MAP[iconName] || LayoutDashboard;

  return (
    <Link
      href={href}
      className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-[13px] font-medium transition-all ${
        isActive
          ? 'bg-[#B87070] text-white shadow-sm font-semibold'
          : 'text-[#E2D2CB]/80 hover:text-white hover:bg-[#3F2B33]/60'
      }`}
    >
      <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-white' : 'text-[#CDB8B0]'}`} />
      {label && <span className="tracking-wide">{label}</span>}
    </Link>
  );
}