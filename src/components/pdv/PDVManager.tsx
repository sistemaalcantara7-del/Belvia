'use client';

import React, { useState, useTransition } from 'react';
import { PDVAttendanceItem, deferPaymentOrderAction, cancelPDVAttendanceAction } from '@/lib/actions/pdv';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';
import { Client } from '@/types/clients';
import { CashRegister } from '@/types/financial';
import { DirectAttendanceModal } from './DirectAttendanceModal';
import { ReceivePaymentModal } from '@/components/financial/ReceivePaymentModal';
import { Appointment, AppointmentStatus } from '@/types/appointments';
import {
  Store,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  User,
  Scissors,
  CreditCard,
  Banknote,
  Search,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PDVManagerProps {
  tenantSlug: string;
  tenantName: string;
  userRole: string;
  initialAttendances: PDVAttendanceItem[];
  services: Service[];
  professionals: Professional[];
  clients: Client[];
  activeCashRegister: CashRegister | null;
  selectedDate: string;
}

export function PDVManager({
  tenantSlug,
  tenantName,
  userRole,
  initialAttendances,
  services,
  professionals,
  clients,
  activeCashRegister,
  selectedDate: initialDate,
}: PDVManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [date, setDate] = useState(initialDate);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'paid' | 'deferred'>('all');

  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState<PDVAttendanceItem | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    startTransition(() => {
      router.push(`/${tenantSlug}/pdv?date=${newDate}`);
    });
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // Filtragem
  const filteredAttendances = initialAttendances.filter((item) => {
    const matchesSearch =
      item.client.full_name.toLowerCase().includes(search.toLowerCase()) ||
      item.service.name.toLowerCase().includes(search.toLowerCase()) ||
      item.professional.full_name.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    const orderStatus = item.paymentOrder?.status;
    const isPaid = orderStatus === 'paid';
    const isDeferred = item.status === 'completed' && orderStatus === 'pending';
    const isOpen = !isPaid && !isDeferred;

    if (statusFilter === 'open') return isOpen;
    if (statusFilter === 'paid') return isPaid;
    if (statusFilter === 'deferred') return isDeferred;

    return true;
  });

  // Métricas
  const totalOpenAmount = initialAttendances
    .filter((item) => item.paymentOrder?.status !== 'paid' && item.status !== 'canceled')
    .reduce((acc, curr) => acc + (curr.paymentOrder ? Number(curr.paymentOrder.balance_due) : Number(curr.price || 0)), 0);

  const totalPaidAmount = initialAttendances
    .filter((item) => item.paymentOrder?.status === 'paid')
    .reduce((acc, curr) => acc + Number(curr.paymentOrder?.net_amount || curr.price || 0), 0);

  const openCount = initialAttendances.filter(
    (item) => item.paymentOrder?.status !== 'paid' && item.status !== 'canceled'
  ).length;

  const handleOpenPayment = (item: PDVAttendanceItem) => {
    setSelectedForPayment(item);
    setPaymentModalOpen(true);
  };

  const handleDeferPayment = async (item: PDVAttendanceItem) => {
    if (!window.confirm(`Deseja adiar o pagamento de ${item.client.full_name} ("Pagar depois")? O atendimento será marcado como concluído e permanecerá pendente de quitação.`)) {
      return;
    }

    startTransition(async () => {
      setFeedbackMessage(null);
      const res = await deferPaymentOrderAction(tenantSlug, item.id);
      if (res.error) {
        setFeedbackMessage({ type: 'error', text: res.error });
      } else {
        setFeedbackMessage({ type: 'success', text: 'Atendimento atualizado: pagamento em aberto para quitação posterior.' });
        router.refresh();
      }
    });
  };

  const handleCancelAttendance = async (item: PDVAttendanceItem) => {
    if (!window.confirm(`Tem certeza que deseja cancelar o agendamento/atendimento de ${item.client.full_name}?`)) {
      return;
    }

    startTransition(async () => {
      setFeedbackMessage(null);
      const res = await cancelPDVAttendanceAction(tenantSlug, item.id);
      if (res.error) {
        setFeedbackMessage({ type: 'error', text: res.error });
      } else {
        setFeedbackMessage({ type: 'success', text: 'Atendimento cancelado com sucesso.' });
        router.refresh();
      }
    });
  };

  // Converte PDVAttendanceItem para o tipo Appointment aceito pelo ReceivePaymentModal
  const appointmentForPayment: Appointment | null = selectedForPayment
    ? {
        id: selectedForPayment.id,
        tenant_id: selectedForPayment.tenant_id,
        client_id: selectedForPayment.client_id,
        service_id: selectedForPayment.service_id,
        professional_id: selectedForPayment.professional_id,
        start_time: selectedForPayment.start_time,
        end_time: selectedForPayment.end_time,
        price: selectedForPayment.price,
        status: (selectedForPayment.status as AppointmentStatus) || 'confirmed',
        notes: selectedForPayment.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        client: {
          id: selectedForPayment.client.id,
          tenant_id: selectedForPayment.tenant_id,
          full_name: selectedForPayment.client.full_name,
          whatsapp: selectedForPayment.client.whatsapp || null,
          phone: selectedForPayment.client.phone || null,
          email: null,
          birth_date: null,
          cpf: null,
          address: null,
          notes: null,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        service: {
          id: selectedForPayment.service.id,
          tenant_id: selectedForPayment.tenant_id,
          name: selectedForPayment.service.name,
          description: null,
          category: 'Geral',
          price: selectedForPayment.service.price,
          duration_minutes: selectedForPayment.service.duration_minutes,
          break_minutes: 0,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        professional: {
          id: selectedForPayment.professional.id,
          tenant_id: selectedForPayment.tenant_id,
          user_id: null,
          full_name: selectedForPayment.professional.full_name,
          whatsapp: null,
          email: null,
          specialty: selectedForPayment.professional.specialty || '',
          bio: null,
          avatar_url: null,
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <Store className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                PDV de Atendimento
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Recepção ágil, check-in e recebimento de serviços em dinheiro, PIX ou cartão
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Caixa */}
          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 border ${
              activeCashRegister
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            {activeCashRegister ? 'Caixa Diário Aberto' : 'Caixa Fechado (Dinheiro restrito)'}
          </div>

          <button
            onClick={() => setIsDirectModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            + Atendimento Balcão
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs sm:text-sm font-medium flex items-center justify-between border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-xs underline ml-4 hover:opacity-80"
          >
            Fechar
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border/40 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Aguardando Pagamento</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            R$ {totalOpenAmount.toFixed(2).replace('.', ',')}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {openCount} atendimento(s) em aberto hoje
          </div>
        </div>

        <div className="bg-card border border-border/40 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Recebido Hoje (Turno)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            R$ {totalPaidAmount.toFixed(2).replace('.', ',')}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Dinheiro, PIX e cartões conciliados
          </div>
        </div>

        <div className="bg-card border border-border/40 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Total de Atendimentos</span>
            <Store className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {initialAttendances.length}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Agendados e atendimentos de balcão
          </div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-card border border-border/40 rounded-2xl p-3 shadow-sm">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por cliente, serviço ou profissional..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-3 py-2 rounded-xl border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Todos ({initialAttendances.length})
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              statusFilter === 'open'
                ? 'bg-amber-500 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Em Aberto ({openCount})
          </button>
          <button
            onClick={() => setStatusFilter('deferred')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              statusFilter === 'deferred'
                ? 'bg-sky-500 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Pagar Depois
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
              statusFilter === 'paid'
                ? 'bg-emerald-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            Pagos
          </button>

          <button
            onClick={handleRefresh}
            title="Atualizar lista"
            className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground transition hover:bg-muted"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Lista de Atendimentos */}
      <div className="space-y-3">
        {filteredAttendances.length === 0 ? (
          <div className="bg-card border border-border/40 rounded-2xl p-12 text-center">
            <Store className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">Nenhum atendimento encontrado</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {search || statusFilter !== 'all'
                ? 'Nenhum registro corresponde aos filtros selecionados.'
                : 'Nenhum agendamento confirmado para esta data. Clique em "+ Atendimento Balcão" para iniciar um atendimento direto.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAttendances.map((item) => {
              const orderStatus = item.paymentOrder?.status;
              const isPaid = orderStatus === 'paid';
              const isDeferred = item.status === 'completed' && orderStatus === 'pending';
              const totalAmount = item.paymentOrder ? Number(item.paymentOrder.net_amount) : Number(item.price || 0);
              const balanceDue = item.paymentOrder ? Number(item.paymentOrder.balance_due) : Number(item.price || 0);

              const timeStr = item.start_time
                ? new Date(item.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                : '--:--';

              return (
                <div
                  key={item.id}
                  className={`bg-card border rounded-2xl p-4 shadow-sm flex flex-col justify-between transition-all hover:border-primary/40 ${
                    isPaid
                      ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
                      : isDeferred
                      ? 'border-sky-500/30 bg-sky-500/[0.02]'
                      : 'border-border/60'
                  }`}
                >
                  <div>
                    {/* Header Card: Time + Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{timeStr}</span>
                        {item.isDirectWalkIn && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                            Balcão
                          </span>
                        )}
                      </div>

                      {/* Badges de Status */}
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Pago
                        </span>
                      ) : isDeferred ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                          <Clock className="w-3 h-3" />
                          Pagar Depois
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          <AlertCircle className="w-3 h-3" />
                          Aguardando Pagamento
                        </span>
                      )}
                    </div>

                    {/* Cliente e Contato */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-primary shrink-0" />
                        <h4 className="font-semibold text-foreground text-sm truncate">
                          {item.client.full_name}
                        </h4>
                      </div>
                      {(item.client.whatsapp || item.client.phone) && (
                        <p className="text-[11px] text-muted-foreground ml-6 truncate">
                          {item.client.whatsapp || item.client.phone}
                        </p>
                      )}
                    </div>

                    {/* Detalhes do Serviço & Profissional */}
                    <div className="space-y-1.5 text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl mb-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 truncate text-foreground font-medium">
                          <Scissors className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {item.service.name}
                        </span>
                        <span className="font-bold text-foreground">
                          R$ {totalAmount.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>Profissional:</span>
                        <span className="text-foreground font-medium truncate max-w-[150px]">
                          {item.professional.full_name}
                        </span>
                      </div>
                      {item.paymentOrder && Number(item.paymentOrder.discount_amount) > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400">
                          <span>Desconto aplicado:</span>
                          <span>- R$ {Number(item.paymentOrder.discount_amount).toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé do Card: Ações */}
                  <div className="pt-3 border-t border-border/40 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        {isPaid ? 'Total Quitado' : 'Saldo a Receber'}
                      </div>
                      <div className={`text-base font-bold ${isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'}`}>
                        R$ {(isPaid ? totalAmount : balanceDue).toFixed(2).replace('.', ',')}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isPaid ? (
                        <button
                          onClick={() => handleOpenPayment(item)}
                          className="px-3 py-1.5 rounded-xl text-xs font-medium border border-border bg-background hover:bg-muted text-foreground transition"
                        >
                          Ver Recibo
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleDeferPayment(item)}
                            title="Marcar para pagamento posterior ('Pagar Depois')"
                            disabled={isPending}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition"
                          >
                            Pagar Depois
                          </button>

                          <button
                            onClick={() => handleOpenPayment(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition shadow-sm"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Receber
                          </button>

                          <button
                            onClick={() => handleCancelAttendance(item)}
                            title="Cancelar atendimento"
                            disabled={isPending}
                            className="p-1.5 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Atendimento Direto Balcão */}
      <DirectAttendanceModal
        isOpen={isDirectModalOpen}
        onClose={() => setIsDirectModalOpen(false)}
        tenantSlug={tenantSlug}
        services={services}
        professionals={professionals}
        clients={clients}
        onSuccess={() => {
          setIsDirectModalOpen(false);
          router.refresh();
        }}
      />

      {/* Modal de Recebimento Financeiro Existente */}
      {selectedForPayment && (
        <ReceivePaymentModal
          tenantSlug={tenantSlug}
          tenantName={tenantName}
          userRole={userRole}
          appointment={appointmentForPayment}
          isOpen={paymentModalOpen}
          onClose={() => {
            setPaymentModalOpen(false);
            setSelectedForPayment(null);
          }}
          onPaymentSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
