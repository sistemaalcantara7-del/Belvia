'use client';

import React, { useState } from 'react';
import {
  ListFilter,
  Plus,
  Calendar,
  User,
  Scissors,
  CheckCircle2,
  ArrowRight,
  X,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import {
  WaitingListItem,
  WaitingListPriority,
  WaitingListStatus,
  WAITING_LIST_PRIORITY_MAP,
  WAITING_LIST_STATUS_MAP,
  CreateWaitingListInput,
} from '@/types/waitingList';
import { Client } from '@/types/clients';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';
import {
  createWaitingListEntryAction,
  updateWaitingListStatusAction,
  convertWaitingListToAppointmentAction,
} from '@/lib/actions/waitingList';

const getDefaultDateRange = () => {
  const start = new Date().toISOString().split('T')[0];
  const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { start, end };
};

interface WaitingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  tenantName: string;
  clients: Client[];
  services: Service[];
  professionals: Professional[];
  initialWaitingList: WaitingListItem[];
  onAppointmentBooked?: (appointmentId: string) => void;
}

export function WaitingListModal({
  isOpen,
  onClose,
  tenantSlug,
  tenantName,
  clients,
  services,
  professionals,
  initialWaitingList,
  onAppointmentBooked,
}: WaitingListModalProps) {
  const [items, setItems] = useState<WaitingListItem[]>(initialWaitingList);
  const [filterStatus, setFilterStatus] = useState<string>('waiting');
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Estados do formulário de inclusão
  const [clientId, setClientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [dateStart, setDateStart] = useState(() => getDefaultDateRange().start);
  const [dateEnd, setDateEnd] = useState(() => getDefaultDateRange().end);
  const [timeStart, setTimeStart] = useState('08:00');
  const [timeEnd, setTimeEnd] = useState('20:00');
  const [priority, setPriority] = useState<WaitingListPriority>('normal');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Estado para conversão rápida em agendamento
  const [convertingItem, setConvertingItem] = useState<WaitingListItem | null>(null);
  const [convertDate, setConvertDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [convertTime, setConvertTime] = useState('09:00');
  const [convertProfId, setConvertProfId] = useState('');
  const [isConverting, setIsConverting] = useState(false);

  if (!isOpen) return null;

  const filteredItems = items.filter((item) => {
    if (filterStatus === 'ALL') return true;
    return item.status === filterStatus;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setFeedback(null);

      const input: CreateWaitingListInput = {
        client_id: clientId,
        service_id: serviceId,
        professional_id: professionalId || null,
        preferred_date_start: dateStart,
        preferred_date_end: dateEnd,
        preferred_time_start: `${timeStart}:00`,
        preferred_time_end: `${timeEnd}:00`,
        priority,
        notes: notes || undefined,
      };

      const res = await createWaitingListEntryAction(tenantSlug, input);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else if (res.data) {
        setItems((prev) => [res.data!, ...prev]);
        setFeedback({
          type: 'success',
          message: 'Cliente incluído com sucesso na Lista de Espera Inteligente!',
        });
        setActiveTab('list');
        // Reset form
        setClientId('');
        setServiceId('');
        setProfessionalId('');
        setNotes('');
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao incluir na lista de espera.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (itemId: string, newStatus: WaitingListStatus) => {
    try {
      setFeedback(null);
      const res = await updateWaitingListStatusAction(tenantSlug, itemId, newStatus);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i))
        );
        setFeedback({
          type: 'success',
          message: `Status atualizado para: ${WAITING_LIST_STATUS_MAP[newStatus]?.label || newStatus}.`,
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao atualizar status.' });
    }
  };

  const handleOpenConvert = (item: WaitingListItem) => {
    setConvertingItem(item);
    setConvertProfId(item.professional_id || professionals[0]?.id || '');
    setConvertDate(item.preferred_date_start || new Date().toISOString().split('T')[0]);
    setConvertTime(item.preferred_time_start?.slice(0, 5) || '09:00');
  };

  const handleExecuteConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingItem || !convertProfId) return;

    try {
      setIsConverting(true);
      setFeedback(null);

      const startIso = new Date(`${convertDate}T${convertTime}:00`).toISOString();

      const res = await convertWaitingListToAppointmentAction(tenantSlug, {
        waitingListId: convertingItem.id,
        professionalId: convertProfId,
        startTime: startIso,
      });

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else if (res.data) {
        setItems((prev) =>
          prev.map((i) => (i.id === convertingItem.id ? { ...i, status: 'booked' } : i))
        );

        if (onAppointmentBooked) {
          onAppointmentBooked(res.data.appointmentId);
        }

        setFeedback({
          type: 'success',
          message: 'Vaga preenchida! Agendamento confirmado com sucesso na Agenda.',
        });
        setConvertingItem(null);
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao converter agendamento.' });
    } finally {
      setIsConverting(false);
    }
  };

  const handleWhatsAppOfferMessage = (item: WaitingListItem) => {
    const clientPhone = item.client?.whatsapp || item.client?.phone;
    if (!clientPhone) return;

    const cleanPhone = clientPhone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    const text = `Olá, ${item.client?.full_name}! Aqui é da ${tenantName}. Surgiu uma vaga em nossa agenda para o procedimento de ${item.service?.name || 'atendimento'}. Você ainda tem interesse? Responda SIM para confirmarmos seu horário!`;

    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-[#EADBCE] overflow-hidden">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-[#F0E5DF] flex items-center justify-between bg-[#FAF5F3]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1E1115]">
                  Lista de Espera Inteligente
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  {items.filter((i) => i.status === 'waiting').length} Aguardando Vaga
                </span>
              </div>
              <p className="text-xs text-[#7D6B65]">
                Captação de demanda reprimida, preenchimento ágil de desistências e conversão em agendamentos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl text-[#7D6B65] hover:text-[#1E1115] hover:bg-white flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-4 py-2.5 text-xs flex items-center justify-between border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : 'bg-rose-50 text-rose-900 border-rose-200'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="font-bold underline text-[11px]"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Alternador de Abas e Filtros */}
        <div className="p-4 border-b border-[#F0E5DF] flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'list'
                  ? 'bg-[#B87070] text-white font-bold shadow-2xs'
                  : 'bg-[#FAF5F3] text-[#7D6B65] border border-[#EADBCE]'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Solicitações ({items.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'create'
                  ? 'bg-[#B87070] text-white font-bold shadow-2xs'
                  : 'bg-[#FAF5F3] text-[#7D6B65] border border-[#EADBCE]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Solicitação</span>
            </button>
          </div>

          {activeTab === 'list' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {(['waiting', 'offered', 'booked', 'canceled', 'ALL'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filterStatus === st
                      ? 'bg-zinc-800 text-white font-bold'
                      : 'bg-[#FAF5F3] text-[#7D6B65] border border-[#EADBCE]'
                  }`}
                >
                  {st === 'ALL' ? 'Todos' : WAITING_LIST_STATUS_MAP[st]?.label || st}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conteúdo: Lista ou Formulário */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#FAF5F3]/50">
          {activeTab === 'create' ? (
            /* Formulário de Inclusão */
            <form onSubmit={handleCreate} className="max-w-2xl mx-auto bg-white p-5 rounded-2xl border border-[#EADBCE] shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-[#1E1115] border-b border-[#F0E5DF] pb-2">
                Cadastrar Cliente na Lista de Espera
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Cliente *</label>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  >
                    <option value="">Selecione o cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.whatsapp || c.phone || 'sem telefone'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Procedimento / Serviço *</label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  >
                    <option value="">Selecione o serviço...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.duration_minutes} min - R$ {Number(s.price).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Profissional Preferencial</label>
                  <select
                    value={professionalId}
                    onChange={(e) => setProfessionalId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  >
                    <option value="">Qualquer profissional disponível</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.specialty})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as WaitingListPriority)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  >
                    <option value="urgent">Urgente (alta demanda / urgência clínica)</option>
                    <option value="high">Alta prioridade</option>
                    <option value="normal">Normal</option>
                    <option value="low">Baixa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Janela de Datas Desejadas</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={dateStart}
                      onChange={(e) => setDateStart(e.target.value)}
                      required
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                    />
                    <input
                      type="date"
                      value={dateEnd}
                      onChange={(e) => setDateEnd(e.target.value)}
                      required
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Faixa de Horários Aceitos</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={timeStart}
                      onChange={(e) => setTimeStart(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                    />
                    <input
                      type="time"
                      value={timeEnd}
                      onChange={(e) => setTimeEnd(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1115] mb-1">Observações da Recepção</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Cliente tem preferência pelas tardes de quinta ou sexta."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#F0E5DF]">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#66534E] hover:bg-[#FAF5F3]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#B87070] hover:bg-[#a55f5f] shadow-xs transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvando...' : 'Salvar na Lista de Espera'}
                </button>
              </div>
            </form>
          ) : (
            /* Lista de Solicitações */
            <div className="space-y-3">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#7D6B65] bg-white rounded-2xl border border-dashed border-[#EADBCE] space-y-2">
                  <ListFilter className="w-8 h-8 text-amber-500 mx-auto opacity-70" />
                  <p className="font-semibold text-sm text-[#1E1115]">Nenhum cliente na lista de espera para o filtro selecionado.</p>
                  <p>Cadastre clientes interessados em horários cheios para preencher desistências automaticamente.</p>
                </div>
              ) : (
                filteredItems.map((item) => {
                  const prioBadge = WAITING_LIST_PRIORITY_MAP[item.priority] || WAITING_LIST_PRIORITY_MAP.normal;
                  const statusBadge = WAITING_LIST_STATUS_MAP[item.status] || WAITING_LIST_STATUS_MAP.waiting;

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl bg-white border border-[#EADBCE] shadow-2xs space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F0E5DF] pb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${prioBadge.bg} ${prioBadge.text} ${prioBadge.border}`}
                          >
                            Prioridade {prioBadge.label}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.bg} ${statusBadge.text} ${statusBadge.border}`}
                          >
                            {statusBadge.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.status === 'waiting' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleWhatsAppOfferMessage(item)}
                                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold transition-all"
                                title="Abrir conversa no WhatsApp Web com mensagem pré-preenchida"
                              >
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Oferecer Vaga</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenConvert(item)}
                                className="flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-2xs"
                              >
                                <span>Agendar Vaga</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {item.status !== 'canceled' && item.status !== 'booked' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(item.id, 'canceled')}
                              className="text-[11px] text-zinc-500 hover:text-rose-600 px-2 py-1"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Informações da Demanda */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-[#1E1115]">
                            <User className="w-3.5 h-3.5 text-[#B87070]" />
                            <span>{item.client?.full_name || 'Cliente'}</span>
                          </div>
                          <p className="text-[#7D6B65] text-[11px] font-mono">
                            {item.client?.whatsapp || item.client?.phone || 'Sem telefone'}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 font-semibold text-[#1E1115]">
                            <Scissors className="w-3.5 h-3.5 text-rose-500" />
                            <span>{item.service?.name || 'Procedimento'}</span>
                          </div>
                          <p className="text-[#7D6B65] text-[11px]">
                            Profissional: {item.professional?.full_name || 'Qualquer habilitado'}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-[#1E1115] font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-amber-500" />
                            <span>
                              {new Date(item.preferred_date_start + 'T00:00:00').toLocaleDateString('pt-BR')} até{' '}
                              {new Date(item.preferred_date_end + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                          <p className="text-[#7D6B65] text-[11px]">
                            Faixa: {item.preferred_time_start?.slice(0, 5)} às {item.preferred_time_end?.slice(0, 5)}
                          </p>
                        </div>
                      </div>

                      {item.notes && (
                        <p className="text-[11px] text-[#7D6B65] bg-[#FAF5F3] p-2 rounded-lg border border-[#EADBCE]">
                          Nota: {item.notes}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* SUBMODAL: CONVERSÃO ATÔMICA EM AGENDAMENTO */}
        {convertingItem && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <form
              onSubmit={handleExecuteConvert}
              className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#EADBCE]"
            >
              <div className="flex items-center justify-between border-b border-[#F0E5DF] pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-[#1E1115]">
                    Confirmar Agendamento da Vaga
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setConvertingItem(null)}
                  className="text-xs font-bold text-[#7D6B65] hover:text-[#1E1115]"
                >
                  Cancelar
                </button>
              </div>

              <div className="p-3 bg-[#FAF5F3] rounded-xl border border-[#EADBCE] text-xs space-y-1">
                <p className="text-[#7D6B65]">
                  Cliente: <strong>{convertingItem.client?.full_name}</strong>
                </p>
                <p className="text-[#1E1115] font-semibold">
                  Serviço: {convertingItem.service?.name}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-[#1E1115] mb-1">Profissional Executor</label>
                  <select
                    value={convertProfId}
                    onChange={(e) => setConvertProfId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                  >
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name} ({p.specialty})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-[#1E1115] mb-1">Data</label>
                    <input
                      type="date"
                      value={convertDate}
                      onChange={(e) => setConvertDate(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#1E1115] mb-1">Horário de Início</label>
                    <input
                      type="time"
                      value={convertTime}
                      onChange={(e) => setConvertTime(e.target.value)}
                      required
                      className="w-full px-3 py-1.5 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0E5DF]">
                <button
                  type="button"
                  onClick={() => setConvertingItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#66534E] hover:bg-[#FAF5F3]"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isConverting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all disabled:opacity-50"
                >
                  {isConverting ? 'Convertendo...' : 'Criar Agendamento'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
