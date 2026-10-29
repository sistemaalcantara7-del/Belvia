'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Appointment, AppointmentStatus, APPOINTMENT_STATUS_MAP } from '@/types/appointments';
import { Service } from '@/types/services';
import { Professional, ProfessionalTimeBlock } from '@/types/professionals';
import { Client } from '@/types/clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppointmentFormModal } from './AppointmentFormModal';
import { TimeBlockModal } from './TimeBlockModal';
import { updateAppointmentStatusAction, checkInAppointmentAction } from '@/lib/actions/appointments';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  User,
  Scissors,
  UserCheck,
  CheckCircle2,
  Filter,
  Check,
  Play,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Ban,
  FileText,
  ExternalLink,
  MapPin,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { WhatsAppModal } from './WhatsAppModal';
import { ConfirmationsCenterModal } from './ConfirmationsCenterModal';
import { WaitingListModal } from './WaitingListModal';
import { ReceivePaymentModal } from '@/components/financial/ReceivePaymentModal';
import { PAYMENT_ORDER_STATUS_MAP } from '@/types/financial';
import { WhatsAppInboundMessage } from '@/types/whatsapp';
import { WaitingListItem } from '@/types/waitingList';

interface AgendaManagerProps {
  initialAppointments: Appointment[];
  initialTimeBlocks: ProfessionalTimeBlock[];
  clients: Client[];
  services: Service[];
  professionals: Professional[];
  tenantSlug: string;
  tenantName: string;
  userRole: string;
  timezone?: string;
  initialInboundMessages?: WhatsAppInboundMessage[];
  initialWaitingList?: WaitingListItem[];
}

type ViewMode = 'day' | 'week' | 'month';

export function AgendaManager({
  initialAppointments,
  initialTimeBlocks,
  clients,
  services,
  professionals,
  tenantSlug,
  tenantName,
  userRole,
  timezone = 'America/Sao_Paulo',
  initialInboundMessages = [],
  initialWaitingList = [],
}: AgendaManagerProps) {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [timeBlocks, setTimeBlocks] = useState<ProfessionalTimeBlock[]>(initialTimeBlocks);
  const [inboundMessages] = useState<WhatsAppInboundMessage[]>(initialInboundMessages);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [waitingList, setWaitingList] = useState<WaitingListItem[]>(initialWaitingList);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedProfFilter, setSelectedProfFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  // Modais de Agendamento
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);

  // Modal Central de Confirmações WhatsApp (Fase 5.7)
  const [confirmationsModalOpen, setConfirmationsModalOpen] = useState(false);

  // Modal Lista de Espera Inteligente (Fase 5.8)
  const [waitingListModalOpen, setWaitingListModalOpen] = useState(false);

  // Modal de WhatsApp
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [selectedWhatsAppAppt, setSelectedWhatsAppAppt] = useState<Appointment | null>(null);

  // Modal de Recebimento de Pagamento (Fase 4.1.3)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPaymentAppt, setSelectedPaymentAppt] = useState<Appointment | null>(null);

  // Modais de Bloqueio
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ProfessionalTimeBlock | null>(null);
  const [defaultBlockTime, setDefaultBlockTime] = useState<string>('12:00');
  const [defaultBlockDate, setDefaultBlockDate] = useState<string>('');

  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canCreate = ['owner', 'admin', 'receptionist'].includes(userRole);
  const canManageBlocks = ['owner', 'admin', 'receptionist', 'professional'].includes(userRole);

  // Formatação de data atual
  const dateStr = currentDate.toISOString().split('T')[0];

  // Navegação de datas
  function handleNavigate(direction: 'prev' | 'next' | 'today') {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const delta = direction === 'next' ? 1 : -1;
    const newDate = new Date(currentDate);

    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + delta);
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + delta * 7);
    } else {
      newDate.setMonth(newDate.getMonth() + delta);
    }
    setCurrentDate(newDate);
  }

  // Filtragem dos agendamentos
  const filteredAppointments = useMemo(() => {
    return appointments.filter((appt) => {
      const apptDate = appt.start_time.split('T')[0];
      let matchesDate = false;

      if (viewMode === 'day') {
        matchesDate = apptDate === dateStr;
      } else if (viewMode === 'week') {
        const curr = new Date(currentDate);
        const firstDay = new Date(curr.setDate(curr.getDate() - curr.getDay()));
        const lastDay = new Date(curr.setDate(curr.getDate() - curr.getDay() + 6));
        const firstStr = firstDay.toISOString().split('T')[0];
        const lastStr = lastDay.toISOString().split('T')[0];
        matchesDate = apptDate >= firstStr && apptDate <= lastStr;
      } else {
        const y = currentDate.getFullYear();
        const m = String(currentDate.getMonth() + 1).padStart(2, '0');
        matchesDate = apptDate.startsWith(`${y}-${m}`);
      }

      const matchesProf =
        selectedProfFilter === 'ALL' || appt.professional_id === selectedProfFilter;

      const matchesStatus =
        selectedStatusFilter === 'ALL' || appt.status === selectedStatusFilter;

      return matchesDate && matchesProf && matchesStatus;
    });
  }, [appointments, dateStr, viewMode, currentDate, selectedProfFilter, selectedStatusFilter]);

  // Filtragem dos bloqueios de horário (visíveis em Day e Week, ou quando filtro de status for ALL ou BLOCK)
  const filteredTimeBlocks = useMemo(() => {
    if (viewMode === 'month') return []; // Bloqueios visíveis nas grades de Dia e Semana
    if (selectedStatusFilter !== 'ALL' && selectedStatusFilter !== 'blocks') return [];

    return timeBlocks.filter((block) => {
      const blockDate = block.start_time.split('T')[0];
      let matchesDate = false;

      if (viewMode === 'day') {
        matchesDate = blockDate === dateStr;
      } else if (viewMode === 'week') {
        const curr = new Date(currentDate);
        const firstDay = new Date(curr.setDate(curr.getDate() - curr.getDay()));
        const lastDay = new Date(curr.setDate(curr.getDate() - curr.getDay() + 6));
        const firstStr = firstDay.toISOString().split('T')[0];
        const lastStr = lastDay.toISOString().split('T')[0];
        matchesDate = blockDate >= firstStr && blockDate <= lastStr;
      }

      const matchesProf =
        selectedProfFilter === 'ALL' || block.professional_id === selectedProfFilter;

      return matchesDate && matchesProf;
    });
  }, [timeBlocks, dateStr, viewMode, currentDate, selectedProfFilter, selectedStatusFilter]);

  // Contadores do dia atual
  const todayAppointments = useMemo(() => {
    return appointments.filter((a) => a.start_time.split('T')[0] === dateStr);
  }, [appointments, dateStr]);

  const todayBlocks = useMemo(() => {
    return timeBlocks.filter((b) => b.start_time.split('T')[0] === dateStr);
  }, [timeBlocks, dateStr]);

  const countTodayTotal = todayAppointments.length;
  const countTodayConfirmed = todayAppointments.filter((a) => a.status === 'confirmed').length;
  const countTodayBlocks = todayBlocks.length;

  async function handleStatusChange(appointmentId: string, newStatus: AppointmentStatus) {
    setActionError(null);
    setUpdatingId(appointmentId);

    const res = await updateAppointmentStatusAction(tenantSlug, appointmentId, newStatus);

    if (res?.error) {
      setActionError(res.error);
    } else if (res?.success) {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? { ...a, status: newStatus } : a))
      );
    }
    setUpdatingId(null);
  }

  async function handleCheckIn(appointmentId: string) {
    setActionError(null);
    setUpdatingId(appointmentId);

    const res = await checkInAppointmentAction(tenantSlug, appointmentId);

    if (res?.error) {
      setActionError(res.error);
    } else if (res?.success && res.appointment) {
      setAppointments((prev) =>
        prev.map((a) =>
          a.id === appointmentId
            ? { ...a, checked_in_at: res.appointment?.checked_in_at, status: res.appointment?.status || 'confirmed' }
            : a
        )
      );
    }
    setUpdatingId(null);
  }

  function handleOpenCreate() {
    setActionError(null);
    setEditingAppointment(null);
    setModalOpen(true);
  }

  function handleOpenEdit(appt: Appointment) {
    setActionError(null);
    setEditingAppointment(appt);
    setModalOpen(true);
  }

  function handleOpenWhatsApp(appt: Appointment) {
    setSelectedWhatsAppAppt(appt);
    setWhatsappModalOpen(true);
  }

  function handleOpenPayment(appt: Appointment) {
    setSelectedPaymentAppt(appt);
    setPaymentModalOpen(true);
  }

  // Abertura do Modal de Bloqueio (novo ou edição)
  function handleOpenCreateBlock(time?: string, date?: string) {
    setActionError(null);
    setEditingBlock(null);
    setDefaultBlockTime(time || '12:00');
    setDefaultBlockDate(date || dateStr);
    setBlockModalOpen(true);
  }

  function handleOpenEditBlock(block: ProfessionalTimeBlock) {
    setActionError(null);
    setEditingBlock(block);
    setBlockModalOpen(true);
  }

  function handleTimeBlockSaved(savedBlock?: ProfessionalTimeBlock, deletedId?: string) {
    if (deletedId) {
      setTimeBlocks((prev) => prev.filter((b) => b.id !== deletedId));
    } else if (savedBlock) {
      setTimeBlocks((prev) => {
        const exists = prev.some((b) => b.id === savedBlock.id);
        if (exists) {
          return prev.map((b) => (b.id === savedBlock.id ? savedBlock : b));
        }
        return [...prev, savedBlock].sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
      });
    }
  }

  function handleAppointmentSaved(savedAppt?: Appointment) {
    if (savedAppt) {
      setAppointments((prev) => {
        const exists = prev.some((a) => a.id === savedAppt.id);
        if (exists) {
          return prev.map((a) => (a.id === savedAppt.id ? savedAppt : a));
        }
        return [...prev, savedAppt];
      });
    }
    startTransition(() => {
      router.refresh();
    });
  }

  // Título dinâmico do período
  const periodTitle = useMemo(() => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } else if (viewMode === 'week') {
      const curr = new Date(currentDate);
      const first = new Date(curr.setDate(curr.getDate() - curr.getDay()));
      const last = new Date(curr.setDate(curr.getDate() - curr.getDay() + 6));
      return `${first.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - ${last.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
  }, [currentDate, viewMode]);

  // Itens unificados e ordenados por horário para visualização mista
  const timelineItems = useMemo(() => {
    type TimelineItem =
      | { type: 'appointment'; data: Appointment; timestamp: number }
      | { type: 'block'; data: ProfessionalTimeBlock; timestamp: number };

    const apptItems: TimelineItem[] = filteredAppointments.map((a) => ({
      type: 'appointment',
      data: a,
      timestamp: new Date(a.start_time).getTime(),
    }));

    const blockItems: TimelineItem[] = filteredTimeBlocks.map((b) => ({
      type: 'block',
      data: b,
      timestamp: new Date(b.start_time).getTime(),
    }));

    return [...apptItems, ...blockItems].sort((a, b) => a.timestamp - b.timestamp);
  }, [filteredAppointments, filteredTimeBlocks]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {tenantName}
            </span>
            <span className="text-xs text-zinc-500">Agenda Operacional & Bloqueios</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 capitalize">
            {periodTitle}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Alternador de Modo de Visualização */}
          <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-100 dark:bg-zinc-900 text-xs">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'day'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'week'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'month'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-xs'
                  : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              Mês
            </button>
          </div>

          {canCreate && (
            <>
              <Button
                variant="outline"
                onClick={() => setWaitingListModalOpen(true)}
                className="border-amber-200 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950/40 h-9 px-3 text-xs font-semibold relative"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                <span>Lista de Espera</span>
                {waitingList.filter((w) => w.status === 'waiting').length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold border border-amber-300">
                    {waitingList.filter((w) => w.status === 'waiting').length}
                  </span>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => setConfirmationsModalOpen(true)}
                className="border-emerald-200 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 h-9 px-3 text-xs font-semibold relative"
              >
                <MessageCircle className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                <span>Central de Confirmações</span>
                {inboundMessages.some((m) =>
                  ['AMBIGUOUS', 'NO_CONTEXT', 'CLIENT_NOT_FOUND'].includes(m.action_taken)
                ) && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-1.5" />
                )}
              </Button>
            </>
          )}

          {canManageBlocks && (
            <Button
              variant="outline"
              onClick={() => handleOpenCreateBlock()}
              className="border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/60 dark:text-amber-400 dark:hover:bg-amber-950/40 h-9 px-3 text-xs"
            >
              <Ban className="w-3.5 h-3.5 mr-1.5 text-amber-600 dark:text-amber-400" />
              Bloquear Horário
            </Button>
          )}

          {canCreate && (
            <Button onClick={handleOpenCreate} className="shadow-md h-9 px-4 text-xs">
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Agendamento
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 text-xs rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs underline font-medium">
            Fechar
          </button>
        </div>
      )}

      {/* Controles de Navegação & Métricas do Dia */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        {/* Controles de Data */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleNavigate('prev')} className="h-9 px-2">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNavigate('today')} className="h-9 px-3 text-xs">
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleNavigate('next')} className="h-9 px-2">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Métricas do Dia */}
        <div className="md:col-span-3 grid grid-cols-3 gap-3">
          <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-zinc-400">Atendimentos Hoje</p>
                <h4 className="text-lg font-bold mt-0.5">{countTodayTotal}</h4>
              </div>
              <CalendarIcon className="w-4 h-4 text-zinc-400" />
            </CardContent>
          </Card>

          <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Confirmados</p>
                <h4 className="text-lg font-bold mt-0.5">{countTodayConfirmed}</h4>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </CardContent>
          </Card>

          <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
            <CardContent className="p-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Bloqueios Hoje</p>
                <h4 className="text-lg font-bold mt-0.5">{countTodayBlocks}</h4>
              </div>
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filtro por Profissional */}
        <div className="relative">
          <select
            value={selectedProfFilter}
            onChange={(e) => setSelectedProfFilter(e.target.value)}
            className="h-9 pl-3 pr-8 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">Todos os Profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.specialty})
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por Status */}
        <div className="relative">
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="h-9 pl-3 pr-8 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">Todos (Atendimentos & Bloqueios)</option>
            <option value="scheduled">Agendados</option>
            <option value="confirmed">Confirmados</option>
            <option value="in_progress">Em Atendimento</option>
            <option value="completed">Concluídos</option>
            <option value="canceled">Cancelados</option>
            <option value="no_show">Não Compareceu</option>
            <option value="blocks">Apenas Bloqueios de Horário</option>
          </select>
        </div>

        {/* Atalho rápido para novo bloqueio no dia selecionado */}
        {canManageBlocks && (
          <button
            onClick={() => handleOpenCreateBlock('12:00', dateStr)}
            className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 font-medium ml-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar pausa rápida hoje
          </button>
        )}
      </div>

      {/* Grid de Atendimentos e Bloqueios */}
      {timelineItems.length === 0 ? (
        <Card className="border-dashed p-12 text-center text-zinc-500 dark:text-zinc-400">
          <Filter className="w-8 h-8 mx-auto mb-3 text-zinc-400 opacity-60" />
          <p className="font-semibold text-base text-zinc-800 dark:text-zinc-200">
            Nenhum atendimento ou bloqueio registrado para este período.
          </p>
          <p className="text-xs mt-1">
            Selecione outra data ou crie um novo agendamento ou bloqueio de agenda.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {canCreate && (
              <Button onClick={handleOpenCreate} variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1.5" />
                Agendar Atendimento
              </Button>
            )}
            {canManageBlocks && (
              <Button onClick={() => handleOpenCreateBlock()} variant="outline" size="sm" className="border-amber-200 text-amber-700">
                <Ban className="w-4 h-4 mr-1.5" />
                Bloquear Horário
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {timelineItems.map((item) => {
            // RENDERIZAÇÃO DE BLOQUEIO DE HORÁRIO (CARD DIFERENCIADO)
            if (item.type === 'block') {
              const block = item.data;
              const startTimeStr = new Date(block.start_time).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const endTimeStr = new Date(block.end_time).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const dateBadge = new Date(block.start_time).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
              });
              const profName =
                block.professional?.full_name ||
                professionals.find((p) => p.id === block.professional_id)?.full_name ||
                'Profissional';

              return (
                <Card
                  key={`block-${block.id}`}
                  className="transition-all hover:shadow-md flex flex-col justify-between border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20"
                >
                  <div className="p-4">
                    {/* Horário & Badge de Bloqueio */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 bg-amber-100/80 dark:bg-amber-900/40 px-2.5 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        {startTimeStr} - {endTimeStr}
                      </span>

                      <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        Horário Bloqueado
                      </span>
                    </div>

                    {/* Informações do Bloqueio */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                        <UserCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="font-semibold">{profName}</span>
                        {viewMode === 'week' && (
                          <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                            {dateBadge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300 mt-2 bg-amber-100/50 dark:bg-amber-950/40 p-2 rounded-md">
                        <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                        <p className="font-medium text-[11px] leading-relaxed">
                          {block.reason ? block.reason : 'Indisponibilidade / Bloqueio Operacional'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Ação de Edição / Remoção do Bloqueio */}
                  {canManageBlocks && (
                    <div className="px-4 py-2 bg-amber-100/30 dark:bg-amber-950/40 border-t border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                        Agenda pausada no intervalo
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEditBlock(block)}
                        className="h-7 px-2.5 text-[11px] border-amber-300 hover:bg-amber-100 dark:border-amber-800"
                      >
                        Gerenciar
                      </Button>
                    </div>
                  )}
                </Card>
              );
            }

            // RENDERIZAÇÃO DE AGENDAMENTO REGULAR
            const appt = item.data;
            const statusConfig = APPOINTMENT_STATUS_MAP[appt.status];
            const startTimeStr = new Date(appt.start_time).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const endTimeStr = new Date(appt.end_time).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
            });
            const dateBadge = new Date(appt.start_time).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
            });

            const clientName = appt.client?.full_name || 'Cliente';
            const serviceName = appt.service?.name || 'Procedimento';
            const profName = appt.professional?.full_name || 'Profissional';

            return (
              <Card
                key={`appt-${appt.id}`}
                className="transition-all hover:shadow-md flex flex-col justify-between bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              >
                <div className="p-4">
                  {/* Horário & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-md">
                      <Clock className="w-3.5 h-3.5 text-rose-500" />
                      {startTimeStr} - {endTimeStr}
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Indicador de Confirmação pelo WhatsApp (Fase 5.6) */}
                      {appt.confirmed_via_whatsapp && appt.status !== 'completed' && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1 shadow-2xs"
                          title={`Confirmado via WhatsApp em ${
                            appt.confirmed_at
                              ? new Date(appt.confirmed_at).toLocaleString('pt-BR')
                              : 'registro oficial'
                          }`}
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-600 fill-emerald-100 dark:fill-emerald-950" />
                          <span>WhatsApp</span>
                        </span>
                      )}

                      {appt.checked_in_at && appt.status !== 'completed' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1" title={`Presença confirmada às ${new Date(appt.checked_in_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}>
                          <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                          Presente
                        </span>
                      )}

                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
                      >
                        {statusConfig.label}
                      </span>

                      {/* Badge Financeiro (Pendente / Parcial / Pago) */}
                      {appt.paymentOrder && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            PAYMENT_ORDER_STATUS_MAP[appt.paymentOrder.status].bg
                          } ${PAYMENT_ORDER_STATUS_MAP[appt.paymentOrder.status].text} ${
                            PAYMENT_ORDER_STATUS_MAP[appt.paymentOrder.status].border
                          }`}
                          title={`Cobrança: ${PAYMENT_ORDER_STATUS_MAP[appt.paymentOrder.status].label} (Pago: R$ ${Number(
                            appt.paymentOrder.paid_amount
                          ).toFixed(2)} de R$ ${Number(appt.paymentOrder.net_amount).toFixed(2)})`}
                        >
                          {PAYMENT_ORDER_STATUS_MAP[appt.paymentOrder.status].label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Informações Centrais */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-900 dark:text-zinc-50">
                      <User className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span className="truncate">{clientName}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      <Scissors className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span className="truncate font-medium">{serviceName}</span>
                      <span className="text-zinc-400">• R$ {Number(appt.price).toFixed(2)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="truncate">{profName}</span>
                      {viewMode === 'week' && (
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded ml-auto">
                          {dateBadge}
                        </span>
                      )}
                    </div>

                    {appt.notes && (
                      <p className="text-[11px] text-zinc-400 italic mt-2 line-clamp-1 bg-zinc-50 dark:bg-zinc-950 p-1.5 rounded">
                        &quot;{appt.notes}&quot;
                      </p>
                    )}

                    {/* INDICADOR DE ANAMNESE CLÍNICA (FASE 3.3.3) */}
                    {appt.anamnesisBadge && (
                      <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${appt.anamnesisBadge.badgeBg} ${appt.anamnesisBadge.badgeText} ${appt.anamnesisBadge.badgeBorder}`}
                            title={appt.anamnesisBadge.label}
                          >
                            {appt.anamnesisBadge.hasAllergiesAlert ? (
                              <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 animate-pulse" />
                            ) : (
                              <FileText className="w-3 h-3 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{appt.anamnesisBadge.label}</span>
                          </span>
                        </div>

                        {/* Atalho para profissional abrir o prontuário via RPC auditada */}
                        {userRole !== 'receptionist' && appt.anamnesisBadge.formId && (
                          <Link
                            href={`/${tenantSlug}/anamnese`}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 hover:underline shrink-0"
                            title="Abrir prontuário auditado do cliente"
                          >
                            <span>Prontuário</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações Operacionais Rápidas de Status */}
                <div className="px-4 py-2.5 bg-zinc-50/80 dark:bg-zinc-950/60 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    {/* Ação de Recepção/Admin: Confirmar Presença / Check-in */}
                    {canCreate && !appt.checked_in_at && ['scheduled', 'confirmed'].includes(appt.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updatingId === appt.id}
                        onClick={() => handleCheckIn(appt.id)}
                        className="h-7 px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 dark:border-emerald-800 text-[11px]"
                        title="Registrar chegada do cliente na clínica"
                      >
                        <MapPin className="w-3 h-3 mr-1 text-emerald-600" />
                        Check-in
                      </Button>
                    )}

                    {/* Ação de Recepção/Admin: Confirmar Agendamento Remoto */}
                    {canCreate && appt.status === 'scheduled' && !appt.checked_in_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updatingId === appt.id}
                        onClick={() => handleStatusChange(appt.id, 'confirmed')}
                        className="h-7 px-2 text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 text-[11px]"
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Confirmar
                      </Button>
                    )}

                    {/* Ação do Profissional / Gestão: Iniciar Atendimento (Exige Check-in) */}
                    {['scheduled', 'confirmed'].includes(appt.status) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updatingId === appt.id || !appt.checked_in_at}
                        onClick={() => handleStatusChange(appt.id, 'in_progress')}
                        className={`h-7 px-2 text-[11px] ${
                          appt.checked_in_at
                            ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-bold'
                            : 'text-zinc-400 opacity-60 cursor-not-allowed'
                        }`}
                        title={
                          appt.checked_in_at
                            ? 'Iniciar procedimento'
                            : 'Aguardando check-in do cliente na recepção'
                        }
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Iniciar
                      </Button>
                    )}

                    {/* Ação do Profissional / Gestão: Finalizar Atendimento */}
                    {appt.status === 'in_progress' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updatingId === appt.id}
                        onClick={() => handleStatusChange(appt.id, 'completed')}
                        className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-[11px]"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Concluir
                      </Button>
                    )}

                    {/* Ação de Não Compareceu */}
                    {canCreate && ['scheduled', 'confirmed'].includes(appt.status) && !appt.checked_in_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={updatingId === appt.id}
                        onClick={() => handleStatusChange(appt.id, 'no_show')}
                        className="h-7 px-2 text-zinc-400 hover:text-zinc-600 text-[11px]"
                        title="Marcar como Não Compareceu"
                      >
                        <AlertTriangle className="w-3 h-3" />
                      </Button>
                    )}
                    {/* Ação de Receber Pagamento */}
                    {canCreate && appt.status !== 'canceled' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenPayment(appt)}
                        className={`h-7 px-2 text-[11px] ${
                          appt.paymentOrder?.status === 'paid'
                            ? 'text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            : 'text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold'
                        }`}
                        title={
                          appt.paymentOrder?.status === 'paid'
                            ? 'Ver comprovante / Detalhes de pagamento'
                            : 'Receber pagamento deste atendimento'
                        }
                      >
                        {appt.paymentOrder?.status === 'paid' ? 'Pago' : 'Receber'}
                      </Button>
                    )}

                    {/* Atalho WhatsApp no Card */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenWhatsApp(appt)}
                      className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-[11px]"
                      title="Enviar mensagem no WhatsApp"
                    >
                      <MessageCircle className="w-3.5 h-3.5 mr-1" />
                      WhatsApp
                    </Button>
                  </div>

                  {canCreate && (
                    <div className="flex items-center gap-1">
                      {['scheduled', 'confirmed'].includes(appt.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updatingId === appt.id}
                          onClick={() => handleStatusChange(appt.id, 'canceled')}
                          className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 text-[11px]"
                          title="Cancelar agendamento"
                        >
                          <XCircle className="w-3 h-3" />
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenEdit(appt)}
                        className="h-7 px-2 text-[11px]"
                      >
                        Editar
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Agendamento */}
      <AppointmentFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantSlug={tenantSlug}
        clients={clients}
        services={services}
        professionals={professionals}
        appointmentToEdit={editingAppointment}
        defaultDate={dateStr}
        onSaved={handleAppointmentSaved}
        onOpenWhatsApp={handleOpenWhatsApp}
      />

      {/* Modal de Bloqueio de Horário */}
      <TimeBlockModal
        isOpen={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        tenantSlug={tenantSlug}
        professionals={professionals}
        blockToEdit={editingBlock}
        defaultDate={defaultBlockDate}
        defaultStartTime={defaultBlockTime}
        defaultProfId={selectedProfFilter !== 'ALL' ? selectedProfFilter : undefined}
        userRole={userRole}
        onSaved={handleTimeBlockSaved}
      />

      {/* Modal de Disparo Manual de WhatsApp */}
      <WhatsAppModal
        isOpen={whatsappModalOpen}
        onClose={() => {
          setWhatsappModalOpen(false);
          setSelectedWhatsAppAppt(null);
        }}
        appointment={selectedWhatsAppAppt}
        tenantName={tenantName}
        timezone={timezone}
      />

      {/* Modal de Recebimento de Pagamento (Fase 4.1.3) */}
      <ReceivePaymentModal
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        userRole={userRole}
        appointment={selectedPaymentAppt}
        isOpen={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false);
          setSelectedPaymentAppt(null);
        }}
        onPaymentSuccess={() => {
          // Atualiza dados na tela via RSC em background sem forçar hard reload
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* Central de Confirmações WhatsApp (Fase 5.7) */}
      <ConfirmationsCenterModal
        isOpen={confirmationsModalOpen}
        onClose={() => setConfirmationsModalOpen(false)}
        tenantSlug={tenantSlug}
        initialInbounds={inboundMessages}
        pendingAppointments={appointments.filter((a) => a.status === 'scheduled')}
        onAppointmentConfirmed={(confirmedId) => {
          // Atualiza o agendamento correspondente no estado local sem recarregar a tela
          setAppointments((prev) =>
            prev.map((a) =>
              a.id === confirmedId
                ? {
                    ...a,
                    status: 'confirmed',
                    confirmed_via_whatsapp: true,
                    confirmed_at: new Date().toISOString(),
                  }
                : a
            )
          );
        }}
      />

      {/* Lista de Espera Inteligente (Fase 5.8) */}
      <WaitingListModal
        isOpen={waitingListModalOpen}
        onClose={() => setWaitingListModalOpen(false)}
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        clients={clients}
        services={services}
        professionals={professionals}
        initialWaitingList={waitingList}
        onAppointmentBooked={(newApptId) => {
          // Atualiza a contagem local marcando a solicitação atendida
          setWaitingList((prev) =>
            prev.map((w) => (w.id === newApptId ? { ...w, status: 'booked' } : w))
          );
        }}
      />
    </div>
  );
}
