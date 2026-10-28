'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { signOutAction } from '@/lib/actions/auth';
import { ActiveNavLink } from '@/components/ui/ActiveNavLink';
import { PlanType } from '@/types/tenant';

interface NavItem {
  href: string;
  label: string;
  iconName: string;
}

interface DashboardSidebarProps {
  tenantSlug: string;
  tenantName: string;
  roleLabel: string;
  plan?: PlanType;
  initials: string;
  navLinks?: NavItem[]; // retrocompatibilidade caso passe direto
  primaryLinks?: NavItem[];
  secondaryLinks?: NavItem[];
}

export function DashboardSidebar({
  tenantSlug,
  tenantName,
  roleLabel,
  plan = 'smart',
  initials,
  navLinks,
  primaryLinks = [],
  secondaryLinks = [],
}: DashboardSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Se foram passados grupos estruturados, use-os. Senão, use navLinks como principal.
  const mainItems = primaryLinks.length > 0 ? primaryLinks : (navLinks ?? []);
  const extraItems = secondaryLinks;

  const isEssential = plan === 'essential';

  return (
    <>
      {/* ── Topbar Mobile Hamburger ─────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-16 bg-[#35272D] border-b border-[#433139]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg text-[#F2E0DC] hover:bg-[#433139] transition-colors"
            aria-label="Abrir Menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="flex items-center gap-2">
            <Image
              src="/img/logoz3.png"
              alt="ZELUNIA"
              width={110}
              height={36}
              className="h-8 w-auto object-contain"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              isEssential ? 'bg-[#5A454D] text-[#E0D0D5]' : 'bg-[#B87070] text-white'
            }`}
          >
            {isEssential ? 'Essencial' : 'Inteligente'}
          </span>
        </div>
      </div>

      {/* ── Overlay Mobile ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar Desktop / Drawer Mobile ────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-[#35272D] border-r border-[#433139] transition-all duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        } ${
          mobileOpen
            ? 'translate-x-0 shadow-2xl'
            : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Topo: Logo ZELUNIA com flor e tipografia da referência */}
        <div className="pt-6 pb-4 px-5 flex flex-col items-center justify-center border-b border-[#433139]/80 shrink-0 relative">
          {!collapsed ? (
            <Link href={`/${tenantSlug}`} className="flex flex-col items-center text-center group">
              <Image
                src="/img/logoz3.png"
                alt="ZELUNIA"
                width={160}
                height={60}
                priority
                className="h-14 w-auto object-contain brightness-105 transition-transform group-hover:scale-105"
              />
            </Link>
          ) : (
            <div className="mx-auto py-2">
              <span className="font-serif font-bold text-2xl text-[#E8D1CA]">Z</span>
            </div>
          )}

          {/* Botão de Toggle Desktop */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex absolute right-2 top-3 p-1 rounded-md text-[#A8948D] hover:text-white hover:bg-[#433139] transition-colors"
            title={collapsed ? 'Expandir Sidebar' : 'Recolher Sidebar'}
          >
            {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Links de Navegação */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {/* Seção 1: Rotina Operacional Diária */}
          <div>
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9E8580]">
                Operacional
              </p>
            )}
            <div className="space-y-1">
              {mainItems.map((link) => (
                <div key={link.href} onClick={() => setMobileOpen(false)}>
                  <ActiveNavLink
                    href={link.href}
                    label={collapsed ? '' : link.label}
                    iconName={link.iconName}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Seção 2: Gestão & Configurações */}
          {extraItems.length > 0 && (
            <div className="pt-2 border-t border-[#433139]/50">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9E8580]">
                  Gestão & Avançado
                </p>
              )}
              <div className="space-y-1">
                {extraItems.map((link) => (
                  <div key={link.href} onClick={() => setMobileOpen(false)}>
                    <ActiveNavLink
                      href={link.href}
                      label={collapsed ? '' : link.label}
                      iconName={link.iconName}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Rodapé: Perfil da Clínica / Estabelecimento e Logout */}
        <div className="p-3.5 border-t border-[#433139]/80 shrink-0 space-y-2.5 bg-[#2E2126]">
          <div className={`flex items-center gap-3 p-2 rounded-xl ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-full bg-[#B87070] flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-semibold text-[#F7ECE8] truncate">
                    {tenantName}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-[#A8948D] truncate">
                    {roleLabel}
                  </span>
                  <span className="text-[#6D5A61] text-[10px]">•</span>
                  <span
                    className={`text-[9px] font-semibold px-1.5 py-0.2 rounded ${
                      isEssential
                        ? 'bg-[#433139] text-[#DEC5BC]'
                        : 'bg-[#B87070]/30 text-[#FFD6D6]'
                    }`}
                  >
                    {isEssential ? 'Essencial' : 'Inteligente'}
                  </span>
                </div>
              </div>
            )}
            {!collapsed && (
              <ChevronDown className="w-4 h-4 text-[#A8948D] shrink-0" />
            )}
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-[#A8948D] hover:text-red-300 hover:bg-red-950/25 transition-all cursor-pointer ${
                collapsed ? 'justify-center' : ''
              }`}
              title="Sair da Conta"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Sair da Conta</span>}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}