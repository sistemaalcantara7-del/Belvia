'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Bell,
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  Sparkles,
  Scissors,
  DollarSign,
  Users,
  CheckCircle2,
  X,
  ChevronDown,
  BarChart2,
  CalendarDays,
  UserPlus,
  MoreVertical,
} from 'lucide-react';

interface AppointmentItem {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  client: { id?: string; full_name?: string } | null;
  service: { id?: string; name?: string } | null;
  professional: { id?: string; full_name?: string } | null;
}

interface TopServiceItem {
  name: string;
  count: number;
}

interface RecentClientItem {
  id: string;
  full_name: string;
  created_at: string;
}

interface RevenueDayItem {
  dateStr: string;
  label: string;
  amount: number;
}

interface DashboardViewProps {
  tenantSlug: string;
  tenantName: string;
  roleLabel: string;
  initials: string;
  timezone: string;
  totalToday: number;
  completedToday: number;
  revenueToday: number;
  activeClientsCount: number;
  appointments: AppointmentItem[];
  recentClients: RecentClientItem[];
  topServices: TopServiceItem[];
  revenueWeek: RevenueDayItem[];
  canViewFinancial: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  scheduled: { label: 'Agendado', bg: '#EFF4FB', color: '#3A68B8', border: '#DCE7F7' },
  confirmed: { label: 'Confirmado', bg: '#EAF7EE', color: '#1B873F', border: '#CEEED7' },
  in_progress: { label: 'Em andamento', bg: '#EBF3FC', color: '#2B72D4', border: '#D3E5FA' },
  completed: { label: 'Concluído', bg: '#EDF8F0', color: '#2E854B', border: '#D5EFE0' },
  canceled: { label: 'Cancelado', bg: '#FDEEEE', color: '#D33E3E', border: '#F8D1D1' },
  no_show: { label: 'Não Compareceu', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
};

function formatTime(iso: string, tz: string) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function DashboardView({
  tenantSlug,
  tenantName,
  roleLabel,
  initials,
  timezone,
  totalToday,
  completedToday,
  revenueToday,
  activeClientsCount,
  appointments,
  recentClients,
  topServices,
  revenueWeek,
  canViewFinancial,
}: DashboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showTip, setShowTip] = useState(true);

  // Calendário interativo
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const today = new Date();
  const todayFormatted = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(today);

  // Dados do calendário
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(currentMonth);

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(d);
  }

  // Escala para o gráfico de receita
  const maxRevenue = Math.max(...revenueWeek.map((r) => r.amount), 500);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1520px] mx-auto">
      {/* ── 1. TOPBAR REFINADA (BUSCA COM CAMPO CLEAN + NOTIFICAÇÕES + USUÁRIO) ── */}
      <div className="flex items-center justify-between gap-4">
        {/* Barra de Busca arredondada e suave */}
        <div className="relative w-full max-w-md">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#A3928B]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar clientes, agendamentos, serviços..."
            className="w-full pl-11 pr-4 py-2.5 rounded-full text-xs sm:text-sm bg-white/90 border border-[#EADBCE]/80 shadow-2xs focus:border-[#B87070] focus:bg-white focus:outline-none transition-all placeholder:text-[#A3928B]"
          />
        </div>

        {/* Notificação com Sino e Perfil com Foto/Avatar */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative p-2.5 rounded-full bg-white border border-[#EADBCE]/80 text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070] transition-colors shadow-2xs"
            title="Notificações"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#B87070] text-white text-[9px] font-bold flex items-center justify-center shadow-xs">
              {totalToday > 0 ? totalToday : 3}
            </span>
          </button>

          {/* Perfil Estabelecimento */}
          <div className="flex items-center gap-3 pl-3">
            <div className="w-9 h-9 rounded-full bg-[#B87070] text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0 ring-2 ring-white">
              {initials}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-[#2C1810] leading-tight">
                {tenantName}
              </p>
              <p className="text-[11px] text-[#8C7A74]">
                {roleLabel}
              </p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#8C7A74] hidden sm:block" />
          </div>
        </div>
      </div>

      {/* ── 2. CABEÇALHO DO DASHBOARD + AÇÕES RÁPIDAS (FASE 7.1) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E1115]">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-[#7D6B65] mt-1 font-normal">
            Aqui está um resumo da rotina da sua clínica hoje.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#EADBCE] text-xs font-medium text-[#4A3B36] shadow-2xs">
            <CalendarDays className="w-4 h-4 text-[#B87070]" />
            <span className="capitalize">{todayFormatted}</span>
          </div>

          <Link
            href={`/${tenantSlug}/agenda`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all shadow-sm hover:opacity-95"
            style={{ backgroundColor: '#B87070' }}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Novo Agendamento</span>
          </Link>
        </div>
      </div>

      {/* ── BARRA DE AÇÕES RÁPIDAS DA ROTINA (FASE 7.1) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href={`/${tenantSlug}/agenda`}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-[#EADBCE]/80 hover:border-[#B87070] hover:shadow-xs transition-all group"
        >
          <div className="w-9 h-9 rounded-lg bg-[#FCEFEB] text-[#B87070] group-hover:bg-[#B87070] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#2C1810] truncate">Novo Agendamento</p>
            <p className="text-[11px] text-[#8C7A74] truncate">Abrir agenda / marcar</p>
          </div>
        </Link>

        <Link
          href={`/${tenantSlug}/clientes`}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-[#EADBCE]/80 hover:border-[#B87070] hover:shadow-xs transition-all group"
        >
          <div className="w-9 h-9 rounded-lg bg-[#F3EFEF] text-[#4A3B36] group-hover:bg-[#B87070] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
            <UserPlus className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#2C1810] truncate">Cadastrar Cliente</p>
            <p className="text-[11px] text-[#8C7A74] truncate">Novo cadastro rápido</p>
          </div>
        </Link>

        <Link
          href={`/${tenantSlug}/anamnese`}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-[#EADBCE]/80 hover:border-[#B87070] hover:shadow-xs transition-all group"
        >
          <div className="w-9 h-9 rounded-lg bg-[#EAF7EE] text-[#1B873F] group-hover:bg-[#1B873F] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#2C1810] truncate">Atendimento</p>
            <p className="text-[11px] text-[#8C7A74] truncate">Anamnese e prontuário</p>
          </div>
        </Link>

        <Link
          href={canViewFinancial ? `/${tenantSlug}/caixa` : `/${tenantSlug}/agenda`}
          className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-[#EADBCE]/80 hover:border-[#B87070] hover:shadow-xs transition-all group"
        >
          <div className="w-9 h-9 rounded-lg bg-[#EBF3FC] text-[#2B72D4] group-hover:bg-[#2B72D4] group-hover:text-white transition-colors flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#2C1810] truncate">
              {canViewFinancial ? 'Lançar Pagamento' : 'Consultar Agenda'}
            </p>
            <p className="text-[11px] text-[#8C7A74] truncate">
              {canViewFinancial ? 'Fluxo de caixa' : 'Horários do dia'}
            </p>
          </div>
        </Link>
      </div>

      {/* ── 3. QUATRO INDICADORES SUPERIORES (KPIS IDÊNTICOS AO MOCKUP) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* KPI 1: Agendamentos Hoje */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FCEFEB] text-[#B87070] flex items-center justify-center shrink-0">
              <CalendarIcon className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Agendamentos Hoje</span>
              <span className="text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {totalToday}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] flex items-center gap-1.5 text-[11px] font-semibold text-[#1B873F]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+14% vs. ontem</span>
          </div>
        </div>

        {/* KPI 2: Atendimentos Concluídos */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#EBF7F0] text-[#1B873F] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Atendimentos Concluídos</span>
              <span className="text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {completedToday}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] flex items-center gap-1.5 text-[11px] font-semibold text-[#1B873F]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+20% vs. semana passada</span>
          </div>
        </div>

        {/* KPI 3: Receita do Dia */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FFF8EB] text-[#C48616] flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Receita do Dia</span>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {canViewFinancial ? formatCurrency(revenueToday) : '••••••'}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] flex items-center gap-1.5 text-[11px] font-semibold text-[#1B873F]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+18% vs. ontem</span>
          </div>
        </div>

        {/* KPI 4: Clientes Ativos */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#EEF4FD] text-[#2D73D5] flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 stroke-[2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Clientes Ativos</span>
              <span className="text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {activeClientsCount}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] flex items-center gap-1.5 text-[11px] font-semibold text-[#1B873F]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+12% vs. mês passado</span>
          </div>
        </div>
      </div>

      {/* ── 4. ÁREA CENTRAL (AGENDA DE HOJE + CALENDÁRIO + AÇÕES RÁPIDAS) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Agenda de Hoje (Card Grande da Esquerda - 7 colunas) */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-[#F5EBE6]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FCEFEB] text-[#B87070] flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#1E1115]">
                    Agenda de Hoje
                  </h2>
                  <p className="text-xs text-[#8C7A74]">Seus próximos atendimentos</p>
                </div>
              </div>

              <Link
                href={`/${tenantSlug}/agenda`}
                className="text-xs font-semibold text-[#B87070] hover:underline flex items-center gap-1"
              >
                <span>Ver agenda completa</span>
                <span>→</span>
              </Link>
            </div>

            {/* Linha do tempo dos atendimentos */}
            <div className="pt-4 space-y-2">
              {appointments.length === 0 ? (
                <div className="py-14 text-center">
                  <CalendarDays className="w-10 h-10 mx-auto text-[#D9C7BF] mb-3" />
                  <p className="text-sm font-semibold text-[#4A3B36]">
                    Nenhum agendamento para hoje
                  </p>
                  <p className="text-xs text-[#8C7A74] mt-1">
                    Utilize o botão &quot;Novo Agendamento&quot; acima para registrar atendimentos.
                  </p>
                </div>
              ) : (
                appointments.slice(0, 5).map((appt) => {
                  const statusInfo = STATUS_CONFIG[appt.status] || STATUS_CONFIG.scheduled;
                  const clientName = appt.client?.full_name || 'Cliente';
                  const serviceName = appt.service?.name || 'Procedimento';

                  return (
                    <div
                      key={appt.id}
                      className="py-3 px-3 flex items-center justify-between gap-3 hover:bg-[#FAF5F3] rounded-xl transition-colors border border-transparent hover:border-[#EADBCE]/60"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Horário */}
                        <div className="text-xs font-bold text-[#1E1115] w-12 shrink-0">
                          {formatTime(appt.start_time, timezone)}
                        </div>

                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full bg-[#F5EBE6] text-[#B87070] flex items-center justify-center text-xs font-bold shrink-0 border border-[#EADBCE]">
                          {clientName[0]?.toUpperCase()}
                        </div>

                        {/* Dados do Cliente e Serviço */}
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-[#1E1115] truncate">
                            {clientName}
                          </p>
                          <p className="text-[11px] text-[#7D6B65] truncate">
                            {serviceName}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Badge de Status conforme o Mockup */}
                        <span
                          className="text-[11px] font-semibold px-3 py-1 rounded-full border shadow-2xs"
                          style={{
                            backgroundColor: statusInfo.bg,
                            color: statusInfo.color,
                            borderColor: statusInfo.border,
                          }}
                        >
                          {statusInfo.label}
                        </span>

                        <button
                          type="button"
                          className="p-1 rounded-md text-[#A3928B] hover:text-[#1E1115] hover:bg-white"
                          title="Opções"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Coluna da Direita: Calendário + Ações Rápidas (5 colunas) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Calendário Mensal Estilizado */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm">
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm font-bold text-[#1E1115] capitalize">
                {monthName}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
                  className="p-1.5 rounded-lg text-[#7D6B65] hover:bg-[#FAF5F3] transition-colors"
                  aria-label="Mês Anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
                  className="p-1.5 rounded-lg text-[#7D6B65] hover:bg-[#FAF5F3] transition-colors"
                  aria-label="Próximo Mês"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Grade dos Dias */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dia, idx) => (
                <span key={idx} className="text-[11px] font-bold text-[#A3928B] py-1">
                  {dia}
                </span>
              ))}

              {calendarDays.map((d, idx) => {
                if (!d) return <div key={idx} className="h-7" />;
                const isToday =
                  d === today.getDate() &&
                  month === today.getMonth() &&
                  year === today.getFullYear();
                const isSelected =
                  d === selectedDate.getDate() &&
                  month === selectedDate.getMonth() &&
                  year === selectedDate.getFullYear();

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDate(new Date(year, month, d))}
                    className={`h-7 w-7 mx-auto rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
                      isSelected
                        ? 'bg-[#B87070] text-white shadow-2xs'
                        : isToday
                        ? 'bg-[#B87070] text-white'
                        : 'text-[#4A3B36] hover:bg-[#FAF5F3]'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ações Rápidas em Grid Clean */}
          <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E1115]">
              <Sparkles className="w-3.5 h-3.5 text-[#B87070]" />
              <span>Ações Rápidas</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Link
                href={`/${tenantSlug}/agenda`}
                className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]/70 hover:border-[#B87070] hover:bg-white transition-all text-center group"
              >
                <CalendarIcon className="w-5 h-5 mx-auto text-[#B87070] mb-2 group-hover:scale-110 transition-transform stroke-[2]" />
                <span className="text-xs font-semibold text-[#2C1810] block">Novo Agendamento</span>
              </Link>

              <Link
                href={`/${tenantSlug}/clientes`}
                className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]/70 hover:border-[#B87070] hover:bg-white transition-all text-center group"
              >
                <UserPlus className="w-5 h-5 mx-auto text-[#B87070] mb-2 group-hover:scale-110 transition-transform stroke-[2]" />
                <span className="text-xs font-semibold text-[#2C1810] block">Novo Cliente</span>
              </Link>

              <Link
                href={`/${tenantSlug}/servicos`}
                className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]/70 hover:border-[#B87070] hover:bg-white transition-all text-center group"
              >
                <Scissors className="w-5 h-5 mx-auto text-[#B87070] mb-2 group-hover:scale-110 transition-transform stroke-[2]" />
                <span className="text-xs font-semibold text-[#2C1810] block">Novo Serviço</span>
              </Link>

              <Link
                href={`/${tenantSlug}/caixa`}
                className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]/70 hover:border-[#B87070] hover:bg-white transition-all text-center group"
              >
                <BarChart2 className="w-5 h-5 mx-auto text-[#B87070] mb-2 group-hover:scale-110 transition-transform stroke-[2]" />
                <span className="text-xs font-semibold text-[#2C1810] block">Relatório Financeiro</span>
              </Link>
            </div>
          </div>

          {/* Dica de hoje */}
          {showTip && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#FCEFEB] to-[#FAF5F3] border border-[#EADBCE] relative flex items-start gap-3 shadow-2xs">
              <div className="w-8 h-8 rounded-xl bg-[#B87070] text-white flex items-center justify-center shrink-0 shadow-2xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="pr-6">
                <p className="text-xs font-bold text-[#1E1115]">Dica de hoje</p>
                <p className="text-[11px] text-[#7D6B65] mt-0.5 leading-relaxed">
                  Mantenha sua agenda sempre atualizada para reduzir faltas e aumentar sua receita.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTip(false)}
                className="absolute top-3 right-3 text-[#A3928B] hover:text-[#1E1115] transition-colors"
                title="Fechar dica"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. SEÇÃO INFERIOR COM OS TRÊS CARDS CONFORME O MOCKUP ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Painel 1: Receita dos Últimos 7 Dias (Gráfico de Barras) */}
        <div className="p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#F5EBE6]">
            <h3 className="text-sm font-bold text-[#1E1115]">
              Receita dos Últimos 7 Dias
            </h3>
            {canViewFinancial && (
              <Link
                href={`/${tenantSlug}/caixa`}
                className="text-xs font-semibold text-[#B87070] hover:underline"
              >
                Ver relatório →
              </Link>
            )}
          </div>

          {canViewFinancial ? (
            <div className="pt-2">
              <div className="h-44 flex items-end justify-between gap-2 px-1 pb-2 border-b border-[#EADBCE]/60">
                {revenueWeek.map((item, idx) => {
                  const barHeight = Math.max(12, Math.round((item.amount / maxRevenue) * 100));
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                      <span className="text-[10px] font-semibold text-[#B87070] opacity-0 group-hover:opacity-100 transition-opacity">
                        R${item.amount}
                      </span>
                      <div
                        className="w-full max-w-[26px] rounded-t-md transition-all duration-300"
                        style={{
                          height: `${barHeight}%`,
                          backgroundColor: item.amount > 0 ? '#B87070' : '#EADBCE',
                        }}
                      />
                      <span className="text-[10px] font-semibold text-[#7D6B65]">
                        {item.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-xs text-[#8C7A74]">
              Disponível para administradores
            </div>
          )}
        </div>

        {/* Painel 2: Serviços Mais Realizados (Barras de Ranking) */}
        <div className="p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#F5EBE6]">
            <div>
              <h3 className="text-sm font-bold text-[#1E1115]">
                Serviços Mais Realizados
              </h3>
              <p className="text-[10px] text-[#8C7A74]">Últimos 30 dias</p>
            </div>
            <Link
              href={`/${tenantSlug}/servicos`}
              className="text-xs font-semibold text-[#B87070] hover:underline"
            >
              Ver todos →
            </Link>
          </div>

          <div className="space-y-3.5 pt-1">
            {topServices.length === 0 ? (
              <p className="text-xs text-[#8C7A74] py-8 text-center">
                Nenhum atendimento registrado no período
              </p>
            ) : (
              topServices.map((service, idx) => {
                const maxCount = topServices[0]?.count || 1;
                const widthPercent = Math.max(18, Math.round((service.count / maxCount) * 100));

                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1E1115] truncate max-w-[190px]">
                        {idx + 1}. {service.name}
                      </span>
                      <span className="text-[#1E1115] font-bold">{service.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#F5EBE6] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${widthPercent}%`,
                          backgroundColor: '#B87070',
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel 3: Novos Clientes (Lista com Navegação para Histórico 360º) */}
        <div className="p-6 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#F5EBE6]">
            <div>
              <h3 className="text-sm font-bold text-[#1E1115]">
                Novos Clientes
              </h3>
              <p className="text-[10px] text-[#8C7A74]">Últimos 7 dias</p>
            </div>
            <Link
              href={`/${tenantSlug}/clientes`}
              className="text-xs font-semibold text-[#B87070] hover:underline"
            >
              Ver todos →
            </Link>
          </div>

          <div className="space-y-2.5 pt-1 divide-y divide-[#F5EBE6]">
            {recentClients.length === 0 ? (
              <p className="text-xs text-[#8C7A74] py-8 text-center">
                Nenhum cliente cadastrado
              </p>
            ) : (
              recentClients.map((client) => (
                <Link
                  key={client.id}
                  href={`/${tenantSlug}/clientes/${client.id}`}
                  className="pt-2.5 flex items-center justify-between hover:bg-[#FAF5F3] p-1.5 rounded-xl transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#FCEFEB] text-[#B87070] flex items-center justify-center text-xs font-bold shrink-0 border border-[#EADBCE]">
                      {client.full_name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#1E1115] truncate group-hover:text-[#B87070] transition-colors">
                        {client.full_name}
                      </p>
                      <p className="text-[10px] text-[#8C7A74]">
                        {new Intl.DateTimeFormat('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        }).format(new Date(client.created_at))}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A3928B] group-hover:translate-x-1 group-hover:text-[#B87070] transition-all" />
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}