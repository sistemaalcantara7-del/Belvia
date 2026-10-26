'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Client360History,
  ClientTimelineAppointmentItem,
  ClientTimelinePaymentItem,
  ClientTimelineAnamnesisItem,
} from '@/types/clients';
import { PaymentOrder } from '@/types/financial';
import { Appointment } from '@/types/appointments';
import { getClient360HistoryAction, getReceiptDataForAppointmentAction } from '@/lib/actions/clients';
import { PaymentReceiptModal } from '@/components/financial/PaymentReceiptModal';
import { AnamnesisDetailModal } from '@/components/anamnesis/AnamnesisDetailModal';
import { maskPhone, maskCPFPartial, buildWhatsAppLink } from '@/lib/utils/masks';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Phone,
  MessageSquare,
  Mail,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Receipt,
  FileText,
  DollarSign,
  TrendingUp,
  Percent,
  Wallet,
  CalendarDays,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface ClientHistory360ViewProps {
  initialData: Client360History;
  tenantSlug: string;
  tenantName: string;
  userRole: string;
}

export function ClientHistory360View({
  initialData,
  tenantSlug,
  tenantName,
  userRole,
}: ClientHistory360ViewProps) {
  const [data, setData] = useState<Client360History>(initialData);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modais de Recibo e Anamnese Auditada
  const [receiptData, setReceiptData] = useState<{ order: PaymentOrder; appointment: Appointment } | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [anamnesisDetailId, setAnamnesisDetailId] = useState<string | null>(null);

  const { client, metrics, timeline, pagination } = data;
  const isActive = client.status === 'active';
  const canAccessFinancial = userRole !== 'professional';
  const canAccessClinical = ['owner', 'admin', 'professional'].includes(userRole);

  const contactForWa = client.whatsapp || client.phone;
  const waLink = buildWhatsAppLink(contactForWa, `Olá, ${client.full_name}! Falamos da clínica ${tenantName}.`);

  // Carregar página da timeline
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages || isPending) return;

    startTransition(async () => {
      setErrorMessage(null);
      const res = await getClient360HistoryAction(tenantSlug, client.id, {
        page: newPage,
        pageSize: pagination.pageSize,
      });

      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.data) {
        setData(res.data);
      }
    });
  };

  // Abrir comprovante de pagamento
  const handleOpenReceipt = async (appointmentId: string) => {
    setReceiptLoading(true);
    setErrorMessage(null);
    try {
      const res = await getReceiptDataForAppointmentAction(tenantSlug, appointmentId);
      if (res.error) {
        setErrorMessage(res.error);
      } else if (res.data) {
        setReceiptData(res.data);
      }
    } catch {
      setErrorMessage('Falha ao carregar comprovante de pagamento.');
    } finally {
      setReceiptLoading(false);
    }
  };

  // Cores de status de agendamento
  const getAppointmentStatusBadge = (status: string, checkedInAt: string | null) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Concluído
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <Clock className="w-3.5 h-3.5" />
            Confirmado {checkedInAt ? '(Check-in realizado)' : ''}
          </span>
        );
      case 'scheduled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <Calendar className="w-3.5 h-3.5" />
            Agendado
          </span>
        );
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5" />
            Não Compareceu (Falta)
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <XCircle className="w-3.5 h-3.5" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600">
            {status}
          </span>
        );
    }
  };

  // Cores de status financeiro
  const getFinancialStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            Quitado
          </span>
        );
      case 'partially_paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <Clock className="w-3 h-3" />
            Parcialmente Pago
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <AlertTriangle className="w-3 h-3" />
            Pendente
          </span>
        );
      case 'canceled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-zinc-100 text-zinc-500">
            Cancelado
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior de Navegação */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/${tenantSlug}/clientes`}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors shadow-xs"
            title="Voltar para a lista de clientes"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
                Histórico 360º do Cliente
              </h1>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {isActive ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Visão integrada de atendimentos, procedimentos, comparecimento e financeiro.
            </p>
          </div>
        </div>

        {/* Atalhos Rápidos */}
        <div className="flex items-center gap-2">
          <Link
            href={`/${tenantSlug}/agenda`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-xs"
          >
            <CalendarDays className="w-4 h-4 text-rose-600" />
            Ir para Agenda
          </Link>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* Alerta de Erro */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-center justify-between text-xs text-rose-800 dark:text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. CABEÇALHO DO CLIENTE & DADOS CADASTRAIS */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Identificação Principal */}
          <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 pb-4 md:pb-0 md:pr-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400 font-black text-lg">
                {client.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                  {client.full_name}
                </h2>
                <p className="text-xs font-mono text-zinc-400">
                  CPF: {maskCPFPartial(client.cpf)}
                </p>
              </div>
            </div>

            {/* Selo de Anamnese (Metadados Administrativos) */}
            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-[11px] font-medium text-zinc-500 block mb-1">
                Ficha de Anamnese:
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${
                    metrics.anamnesisBadge.hasAllergiesAlert
                      ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      : metrics.anamnesisBadge.status === 'up_to_date'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {metrics.anamnesisBadge.label}
                </span>

                {canAccessClinical && metrics.anamnesisBadge.status !== 'pending' && (
                  <Link
                    href={`/${tenantSlug}/anamnese`}
                    className="text-xs text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    Prontuários &rarr;
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Contatos e Endereço */}
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-zinc-400 font-medium block">WhatsApp:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 mt-0.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                {client.whatsapp ? maskPhone(client.whatsapp) : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 font-medium block">Telefone Secundário:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 mt-0.5">
                <Phone className="w-3.5 h-3.5 text-zinc-400" />
                {client.phone ? maskPhone(client.phone) : 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 font-medium block">E-mail:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 mt-0.5 truncate">
                <Mail className="w-3.5 h-3.5 text-zinc-400" />
                {client.email || 'Não informado'}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 font-medium block">Data de Nascimento:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                {client.birth_date
                  ? new Date(client.birth_date + 'T12:00:00').toLocaleDateString('pt-BR')
                  : 'Não informada'}
              </span>
            </div>

            {/* Endereço */}
            <div className="sm:col-span-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 font-medium flex items-center gap-1 mb-0.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                Endereço Cadastrado:
              </span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                {client.address && (client.address.street || client.address.city)
                  ? [
                      client.address.street,
                      client.address.number,
                      client.address.neighborhood,
                      client.address.city,
                      client.address.state,
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : 'Nenhum endereço informado.'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. INDICADORES CONSOLIDADOS (MÉTRICAS 360º) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Assiduidade */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-semibold">Assiduidade</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
            {metrics.attendanceRatePercentage}%
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {metrics.completedAppointments} comparecimentos / {metrics.noShowAppointments} faltas
          </p>
        </div>

        {/* LTV Recebido */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-semibold">Total Recebido (LTV)</span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
            {canAccessFinancial
              ? `R$ ${metrics.totalSpentLTV.toFixed(2).replace('.', ',')}`
              : '***'}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {canAccessFinancial ? 'Valores efetivamente pagos' : 'Acesso administrativo'}
          </p>
        </div>

        {/* Saldo Devedor Pendente */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-semibold">Saldo Pendente</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className={`text-2xl font-black tracking-tight ${metrics.totalPendingBalance > 0 ? 'text-amber-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
            {canAccessFinancial
              ? `R$ ${metrics.totalPendingBalance.toFixed(2).replace('.', ',')}`
              : '***'}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {canAccessFinancial
              ? (metrics.totalPendingBalance > 0 ? 'Cobranças em aberto' : 'Em dia (sem pendências)')
              : 'Acesso administrativo'}
          </p>
        </div>

        {/* Ticket Médio */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-zinc-500 mb-1">
            <span className="text-xs font-semibold">Ticket Médio</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center text-blue-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
            {canAccessFinancial
              ? `R$ ${metrics.averageTicket.toFixed(2).replace('.', ',')}`
              : '***'}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">
            {canAccessFinancial ? 'Média por procedimento' : 'Acesso administrativo'}
          </p>
        </div>
      </div>

      {/* 3. LINHA DO TEMPO CRONOLÓGICA (TIMELINE) */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Linha do Tempo de Atendimentos e Eventos
            </h2>
            <p className="text-xs text-zinc-500">
              Histórico cronológico consolidado (mais recente primeiro).
            </p>
          </div>
          {isPending && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Atualizando...</span>
            </div>
          )}
        </div>

        {/* Estado Vazio */}
        {timeline.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 text-zinc-300 dark:text-zinc-700" />
            <p className="font-semibold text-base text-zinc-800 dark:text-zinc-200">
              Nenhum evento registrado até o momento.
            </p>
            <p className="text-xs mt-1">
              Os agendamentos, pagamentos e atualizações deste cliente aparecerão aqui cronologicamente.
            </p>
            <Link
              href={`/${tenantSlug}/agenda`}
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Agendar Primeiro Atendimento
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {timeline.map((item) => {
              const formattedDate = new Date(item.date).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              // Caso 1: Item de Agendamento
              if (item.type === 'appointment') {
                const apptItem = item as ClientTimelineAppointmentItem;
                return (
                  <div
                    key={`appt-${apptItem.id}`}
                    className="p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                            {apptItem.serviceName}
                          </span>
                          {getAppointmentStatusBadge(apptItem.status, apptItem.checkedInAt)}
                          {canAccessFinancial && getFinancialStatusBadge(apptItem.paymentStatus)}
                        </div>

                        <div className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5">
                          <p className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-zinc-400" />
                            {formattedDate}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-zinc-400" />
                            Profissional: <strong className="text-zinc-700 dark:text-zinc-300">{apptItem.professionalName}</strong>
                          </p>
                          {apptItem.notes && (
                            <p className="text-[11px] text-zinc-500 italic mt-1 bg-white dark:bg-zinc-900 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                              &ldquo;{apptItem.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Lado Direito: Valores e Atalhos */}
                    <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between md:justify-center gap-2 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-800">
                      {canAccessFinancial && (
                        <div className="text-left md:text-right">
                          <div className="text-sm font-black text-zinc-900 dark:text-zinc-100">
                            R$ {apptItem.price.toFixed(2).replace('.', ',')}
                          </div>
                          {apptItem.paidAmount > 0 && (
                            <div className="text-[11px] text-emerald-600 font-semibold">
                              Pago: R$ {apptItem.paidAmount.toFixed(2).replace('.', ',')}
                            </div>
                          )}
                          {apptItem.balanceDue > 0 && apptItem.status !== 'canceled' && (
                            <div className="text-[11px] text-amber-600 font-semibold">
                              Pendente: R$ {apptItem.balanceDue.toFixed(2).replace('.', ',')}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Botão de Comprovante Não Fiscal */}
                      {apptItem.paidAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(apptItem.id)}
                          disabled={receiptLoading}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
                        >
                          <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                          Comprovante
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // Caso 2: Item de Transação de Pagamento
              if (item.type === 'payment' && canAccessFinancial) {
                const payItem = item as ClientTimelinePaymentItem;
                const isRefunded = payItem.status === 'refunded';
                return (
                  <div
                    key={`pay-${payItem.id}`}
                    className="p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-950/40 bg-emerald-50/30 dark:bg-emerald-950/10 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            {isRefunded ? 'Estorno de Pagamento' : 'Pagamento Confirmado'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 uppercase">
                            {payItem.method}
                          </span>
                          {isRefunded && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                              Estornado
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-500 text-[11px] mt-0.5">
                          {formattedDate} {payItem.serviceName ? `• Ref: ${payItem.serviceName}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-black text-sm ${isRefunded ? 'text-zinc-400 line-through' : 'text-emerald-600'}`}>
                        R$ {payItem.amount.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                );
              }

              // Caso 3: Item de Atualização de Anamnese (Metadados Administrativos)
              if (item.type === 'anamnesis_update') {
                const anItem = item as ClientTimelineAnamnesisItem;
                return (
                  <div
                    key={`an-${anItem.id}`}
                    className="p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100">
                            Atualização de Ficha de Anamnese
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                            v{anItem.version}
                          </span>
                          {anItem.hasAllergiesAlert && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Alerta de Alergia
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-500 text-[11px] mt-0.5">
                          Preenchida em: {formattedDate}
                        </p>
                      </div>
                    </div>

                    {/* Apenas profissionais e admins podem abrir o prontuário auditado */}
                    {canAccessClinical ? (
                      <button
                        type="button"
                        onClick={() => setAnamnesisDetailId(anItem.id)}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-rose-600 hover:text-rose-700 transition-colors"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Ver Prontuário
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400 italic">
                        Sigilo Clínico Protegido
                      </span>
                    )}
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}

        {/* 4. PAGINAÇÃO ESTÁVEL */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-6 mt-6 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
            <span>
              Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong> ({pagination.totalItems} eventos no total)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pagination.page <= 1 || isPending}
                onClick={() => handlePageChange(pagination.page - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <button
                type="button"
                disabled={!pagination.hasNextPage || isPending}
                onClick={() => handlePageChange(pagination.page + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-2xs"
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. MODAL DE COMPROVANTE NÃO FISCAL */}
      {receiptData && (
        <PaymentReceiptModal
          isOpen={Boolean(receiptData)}
          onClose={() => setReceiptData(null)}
          order={receiptData.order}
          appointment={receiptData.appointment}
          tenantName={tenantName}
        />
      )}

      {/* 6. MODAL DE PRONTUÁRIO CLÍNICO AUDITADO (Apenas para profissionais/admins) */}
      {anamnesisDetailId && canAccessClinical && (
        <AnamnesisDetailModal
          tenantSlug={tenantSlug}
          formId={anamnesisDetailId}
          currentRole={userRole}
          onClose={() => setAnamnesisDetailId(null)}
          onUpdateVersion={() => {
            setAnamnesisDetailId(null);
          }}
        />
      )}
    </div>
  );
}
