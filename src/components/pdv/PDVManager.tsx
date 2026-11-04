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
  Scissors,
  CreditCard,
  Banknote,
  Search,
  RefreshCw,
  XCircle,
  FileText,
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
      {/* ── 1. CABEÇALHO DO PDV ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shrink-0 border border-[#EADBCE]/80 shadow-2xs">
              <Store className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1E1115]">
                PDV de Atendimento
              </h1>
              <p className="text-xs sm:text-sm text-[#7D6B65] mt-0.5 font-normal">
                Recepção ágil, check-in e recebimento de serviços em dinheiro, PIX ou cartão
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status do Caixa Diário */}
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border shadow-2xs ${
              activeCashRegister
                ? 'bg-[#EBF7F0] text-[#1B873F] border-[#CEEED7]'
                : 'bg-[#FFF8EB] text-[#C48616] border-[#FCE6BD]'
            }`}
          >
            <Banknote className="w-4 h-4 shrink-0" />
            <span>{activeCashRegister ? 'Caixa Diário Aberto' : 'Caixa Fechado (Dinheiro restrito)'}</span>
          </div>

          <button
            onClick={() => setIsDirectModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white transition-all shadow-sm hover:opacity-95"
            style={{ backgroundColor: '#B87070' }}
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Atendimento Balcão</span>
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-between border shadow-2xs ${
            feedbackMessage.type === 'success'
              ? 'bg-[#EBF7F0] text-[#1B873F] border-[#CEEED7]'
              : 'bg-[#FDEEEE] text-[#D33E3E] border-[#F8D1D1]'
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

      {/* ── 2. CARDS DE INDICADORES / KPIS (ESTILO ZELUNIA DASHBOARD) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {/* KPI 1: Aguardando Pagamento */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FFF8EB] text-[#C48616] flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Aguardando Pagamento</span>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                R$ {totalOpenAmount.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-semibold text-[#8C7A74]">
            {openCount} atendimento(s) em aberto hoje
          </div>
        </div>

        {/* KPI 2: Recebido Hoje (Turno) */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#EBF7F0] text-[#1B873F] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Recebido Hoje (Turno)</span>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                R$ {totalPaidAmount.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-semibold text-[#1B873F]">
            Dinheiro, PIX e cartões conciliados
          </div>
        </div>

        {/* KPI 3: Total de Atendimentos */}
        <div className="p-5 rounded-2xl bg-white border border-[#EADBCE]/80 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-[#B87070]/60 transition-all">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-full bg-[#FCEFEB] text-[#B87070] flex items-center justify-center shrink-0">
              <Store className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="text-right flex-1 pl-3">
              <span className="text-xs font-medium text-[#7D6B65] block">Total de Atendimentos</span>
              <span className="text-2xl sm:text-3xl font-bold text-[#1E1115] tracking-tight block mt-1">
                {initialAttendances.length}
              </span>
            </div>
          </div>
          <div className="mt-4 pt-2 border-t border-[#F5EBE6] text-[11px] font-semibold text-[#8C7A74]">
            Agendados e atendimentos de balcão
          </div>
        </div>
      </div>

      {/* ── 3. BARRA DE BUSCA, DATA E FILTROS COM CONTRASTE APERFEIÇOADO ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white border border-[#EADBCE]/90 rounded-2xl p-3 shadow-xs">
        <div className="flex flex-1 items-center gap-2.5">
          {/* Campo de Busca Estilizado */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A3928B]" />
            <input
              type="text"
              placeholder="Buscar por cliente, serviço ou profissional..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-[#FAF6F3] border border-[#EADBCE] text-[#2C1810] focus:border-[#B87070] focus:bg-white focus:outline-none transition-all placeholder:text-[#A3928B]"
            />
          </div>

          {/* Seletor de Data */}
          <div className="relative shrink-0">
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium bg-[#FAF6F3] border border-[#EADBCE] text-[#2C1810] focus:border-[#B87070] focus:bg-white focus:outline-none transition-all cursor-pointer"
            />
          </div>
        </div>

        {/* Botões de Filtro */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-[#B87070] text-white shadow-2xs'
                : 'bg-[#FAF6F3] border border-[#EADBCE] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070]/60'
            }`}
          >
            Todos ({initialAttendances.length})
          </button>
          <button
            onClick={() => setStatusFilter('open')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'open'
                ? 'bg-[#C48616] text-white shadow-2xs'
                : 'bg-[#FAF6F3] border border-[#EADBCE] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070]/60'
            }`}
          >
            Em Aberto ({openCount})
          </button>
          <button
            onClick={() => setStatusFilter('deferred')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'deferred'
                ? 'bg-[#3A68B8] text-white shadow-2xs'
                : 'bg-[#FAF6F3] border border-[#EADBCE] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070]/60'
            }`}
          >
            Pagar Depois
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === 'paid'
                ? 'bg-[#1B873F] text-white shadow-2xs'
                : 'bg-[#FAF6F3] border border-[#EADBCE] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070]/60'
            }`}
          >
            Pagos
          </button>

          <button
            onClick={handleRefresh}
            title="Atualizar lista"
            className="p-2 rounded-xl border border-[#EADBCE] bg-[#FAF6F3] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── 4. LISTAGEM DOS ATENDIMENTOS (ESTILO DASHBOARD CARDS) ── */}
      <div className="space-y-4">
        {filteredAttendances.length === 0 ? (
          <div className="bg-white border border-[#EADBCE]/80 rounded-2xl p-12 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF0EC] text-[#B87070] mx-auto flex items-center justify-center mb-4 border border-[#EADBCE]/80">
              <Store className="w-7 h-7 stroke-[2]" />
            </div>
            <h3 className="text-base font-bold text-[#1E1115]">Nenhum atendimento encontrado</h3>
            <p className="text-xs sm:text-sm text-[#7D6B65] mt-1.5 max-w-md mx-auto leading-relaxed">
              {search || statusFilter !== 'all'
                ? 'Nenhum registro corresponde aos filtros ou à busca selecionada.'
                : 'Nenhum agendamento para esta data. Clique no botão "+ Atendimento Balcão" acima para registrar um atendimento avulso presencial.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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
                  className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-sm ${
                    isPaid
                      ? 'border-[#CEEED7] hover:border-[#1B873F]/60'
                      : isDeferred
                      ? 'border-[#DCE7F7] hover:border-[#3A68B8]/60'
                      : 'border-[#EADBCE]/90 hover:border-[#B87070]/60'
                  }`}
                >
                  <div>
                    {/* Header Card: Time + Status Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#7D6B65]">
                        <Clock className="w-3.5 h-3.5 text-[#B87070]" />
                        <span>{timeStr}</span>
                        {item.isDirectWalkIn && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF0EC] text-[#B87070] border border-[#EADBCE]">
                            Balcão
                          </span>
                        )}
                      </div>

                      {/* Badges de Status */}
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EAF7EE] text-[#1B873F] border border-[#CEEED7]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Pago
                        </span>
                      ) : isDeferred ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#EFF4FB] text-[#3A68B8] border border-[#DCE7F7]">
                          <Clock className="w-3.5 h-3.5" />
                          Pagar Depois
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFF8EB] text-[#C48616] border border-[#FCE6BD]">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Aguardando Pagamento
                        </span>
                      )}
                    </div>

                    {/* Cliente e Contato */}
                    <div className="mb-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#FAF0EC] text-[#B87070] flex items-center justify-center font-bold text-xs shrink-0 border border-[#EADBCE]/80">
                          {item.client.full_name ? item.client.full_name.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <h4 className="font-bold text-[#1E1115] text-sm truncate">
                          {item.client.full_name}
                        </h4>
                      </div>
                      {(item.client.whatsapp || item.client.phone) && (
                        <p className="text-[11px] text-[#8C7A74] ml-9 truncate">
                          {item.client.whatsapp || item.client.phone}
                        </p>
                      )}
                    </div>

                    {/* Detalhes do Serviço & Profissional */}
                    <div className="space-y-2 text-xs bg-[#FAF6F3] border border-[#F0E4DE] p-3 rounded-xl mb-4">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 truncate text-[#2C1810] font-semibold">
                          <Scissors className="w-3.5 h-3.5 text-[#B87070] shrink-0" />
                          {item.service.name}
                        </span>
                        <span className="font-bold text-[#1E1115]">
                          R$ {totalAmount.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#7D6B65]">
                        <span>Profissional:</span>
                        <span className="text-[#2C1810] font-medium truncate max-w-[150px]">
                          {item.professional.full_name}
                        </span>
                      </div>
                      {item.paymentOrder && Number(item.paymentOrder.discount_amount) > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-[#1B873F] font-medium">
                          <span>Desconto aplicado:</span>
                          <span>- R$ {Number(item.paymentOrder.discount_amount).toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rodapé do Card: Ações */}
                  <div className="pt-3 border-t border-[#F5EBE6] flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-[#8C7A74] tracking-wider">
                        {isPaid ? 'Total Quitado' : 'Saldo a Receber'}
                      </div>
                      <div className={`text-base font-bold ${isPaid ? 'text-[#1B873F]' : 'text-[#1E1115]'}`}>
                        R$ {(isPaid ? totalAmount : balanceDue).toFixed(2).replace('.', ',')}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isPaid ? (
                        <button
                          onClick={() => handleOpenPayment(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#EADBCE] text-[#4A3B36] hover:bg-[#FAF6F3] hover:border-[#B87070] transition shadow-2xs"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#7D6B65]" />
                          Ver Recibo
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleDeferPayment(item)}
                            title="Marcar para pagamento posterior ('Pagar Depois')"
                            disabled={isPending}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white border border-[#EADBCE] text-[#7D6B65] hover:text-[#2C1810] hover:border-[#B87070] transition shadow-2xs"
                          >
                            Pagar Depois
                          </button>

                          <button
                            onClick={() => handleOpenPayment(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white shadow-2xs hover:opacity-95 transition"
                            style={{ backgroundColor: '#B87070' }}
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            Receber
                          </button>

                          <button
                            onClick={() => handleCancelAttendance(item)}
                            title="Cancelar atendimento"
                            disabled={isPending}
                            className="p-1.5 rounded-xl text-[#A3928B] hover:text-[#D33E3E] hover:bg-[#FDEEEE] transition"
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
