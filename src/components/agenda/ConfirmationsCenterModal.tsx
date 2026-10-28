'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  User,
  Calendar,
  Check,
  Phone,
  Scissors,
  ArrowRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  WhatsAppInboundMessage,
  WHATSAPP_INBOUND_ACTION_MAP,
} from '@/types/whatsapp';
import { Appointment } from '@/types/appointments';
import { manualLinkInboundConfirmationAction } from '@/lib/actions/whatsapp';

interface ConfirmationsCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  initialInbounds: WhatsAppInboundMessage[];
  pendingAppointments: Appointment[];
  onAppointmentConfirmed?: (appointmentId: string) => void;
}

export function ConfirmationsCenterModal({
  isOpen,
  onClose,
  tenantSlug,
  initialInbounds,
  pendingAppointments,
  onAppointmentConfirmed,
}: ConfirmationsCenterModalProps) {
  const [inbounds, setInbounds] = useState<WhatsAppInboundMessage[]>(initialInbounds);
  const [filterAction, setFilterAction] = useState<string>('ATTENTION'); // 'ATTENTION' | 'ALL' | specific
  const [selectedInbound, setSelectedInbound] = useState<WhatsAppInboundMessage | null>(null);
  const [selectedApptId, setSelectedApptId] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  if (!isOpen) return null;

  // Filtra as mensagens de acordo com a seleção
  const filteredMessages = inbounds.filter((item) => {
    if (filterAction === 'ATTENTION') {
      return ['AMBIGUOUS', 'NO_CONTEXT', 'CLIENT_NOT_FOUND'].includes(item.action_taken);
    }
    if (filterAction === 'ALL') return true;
    return item.action_taken === filterAction;
  });

  // Métricas do painel
  const metrics = {
    total: inbounds.length,
    confirmed: inbounds.filter((i) => i.action_taken === 'CONFIRMED').length,
    attentionNeeded: inbounds.filter((i) =>
      ['AMBIGUOUS', 'NO_CONTEXT', 'CLIENT_NOT_FOUND'].includes(i.action_taken)
    ).length,
    ambiguous: inbounds.filter((i) => i.action_taken === 'AMBIGUOUS').length,
    noContext: inbounds.filter((i) => i.action_taken === 'NO_CONTEXT').length,
  };

  const handleManualConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInbound || !selectedApptId) return;

    try {
      setIsLinking(true);
      setFeedback(null);

      const res = await manualLinkInboundConfirmationAction(tenantSlug, {
        inboundMessageId: selectedInbound.id,
        appointmentId: selectedApptId,
      });

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        // Atualiza a lista local sem recarregar toda a página
        setInbounds((prev) =>
          prev.map((item) =>
            item.id === selectedInbound.id
              ? {
                  ...item,
                  action_taken: 'CONFIRMED',
                  appointment_id: selectedApptId,
                }
              : item
          )
        );

        if (onAppointmentConfirmed) {
          onAppointmentConfirmed(selectedApptId);
        }

        setFeedback({
          type: 'success',
          message: 'Agendamento vinculado e confirmado com sucesso!',
        });
        setSelectedInbound(null);
        setSelectedApptId('');
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao vincular confirmação.' });
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-[#EADBCE] overflow-hidden">
        {/* Cabeçalho */}
        <div className="p-4 sm:p-5 border-b border-[#F0E5DF] flex items-center justify-between bg-[#FAF5F3]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1E1115]">
                  Central de Confirmações WhatsApp
                </h2>
                {metrics.attentionNeeded > 0 && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    {metrics.attentionNeeded} Exige(m) Atenção
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7D6B65]">
                Auditoria de respostas de clientes, confirmações automáticas e intervenção manual da recepção
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

        {/* Métricas e Filtros Rápidos */}
        <div className="p-4 border-b border-[#F0E5DF] flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterAction('ATTENTION')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterAction === 'ATTENTION'
                  ? 'bg-amber-600 text-white font-bold shadow-2xs'
                  : 'bg-[#FAF5F3] text-amber-800 border border-amber-200 hover:bg-amber-100/50'
              }`}
            >
              Exigem Intervenção ({metrics.attentionNeeded})
            </button>

            <button
              type="button"
              onClick={() => setFilterAction('CONFIRMED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterAction === 'CONFIRMED'
                  ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                  : 'bg-[#FAF5F3] text-emerald-800 border border-emerald-200 hover:bg-emerald-100/50'
              }`}
            >
              Confirmados ({metrics.confirmed})
            </button>

            <button
              type="button"
              onClick={() => setFilterAction('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterAction === 'ALL'
                  ? 'bg-[#B87070] text-white font-bold shadow-2xs'
                  : 'bg-[#FAF5F3] text-[#7D6B65] border border-[#EADBCE] hover:text-[#1E1115]'
              }`}
            >
              Todas as Mensagens ({metrics.total})
            </button>
          </div>

          <div className="text-[11px] text-[#7D6B65] font-mono">
            {filteredMessages.length} registro(s) exibido(s)
          </div>
        </div>

        {/* Conteúdo Principal: Lista de Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 bg-[#FAF5F3]/50">
          {filteredMessages.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#7D6B65] bg-white rounded-2xl border border-dashed border-[#EADBCE] space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-70" />
              <p className="font-semibold text-sm text-[#1E1115]">Nenhuma pendência na central de confirmações!</p>
              <p>Todas as respostas recentes foram processadas ou não há mensagens para o filtro selecionado.</p>
            </div>
          ) : (
            filteredMessages.map((item) => {
              const actionMeta =
                WHATSAPP_INBOUND_ACTION_MAP[item.action_taken] ||
                WHATSAPP_INBOUND_ACTION_MAP.IGNORED;

              const isRequiresAttention = ['AMBIGUOUS', 'NO_CONTEXT', 'CLIENT_NOT_FOUND'].includes(
                item.action_taken
              );

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl bg-white border transition-all ${
                    isRequiresAttention
                      ? 'border-amber-300 shadow-xs'
                      : 'border-[#EADBCE]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${actionMeta.bg} ${actionMeta.text} ${actionMeta.border}`}
                      >
                        {actionMeta.label}
                      </span>
                      <span className="text-[11px] text-[#7D6B65] font-mono">
                        {new Date(item.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isRequiresAttention && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInbound(item);
                            setSelectedApptId('');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-2xs"
                        >
                          <span>Vincular Agendamento</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Informações da Mensagem e do Remetente */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#FAF5F3] p-3 rounded-xl border border-[#EADBCE]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[#1E1115] font-semibold">
                        <User className="w-3.5 h-3.5 text-[#B87070]" />
                        <span>{item.client?.full_name || 'Cliente Não Identificado'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#7D6B65] font-mono text-[11px]">
                        <Phone className="w-3 h-3 text-[#A8948D]" />
                        <span>{item.sender_phone}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7D6B65] block">
                        Texto da Resposta Recebida:
                      </span>
                      <p className="font-semibold text-[#1E1115] bg-white p-1.5 rounded-lg border border-[#EADBCE]">
                        &quot;{item.message_text || item.button_payload || '(Botão ou resposta vazia)'}&quot;
                      </p>
                    </div>
                  </div>

                  {/* Detalhes do Agendamento Vinculado (se houver) */}
                  {item.appointment && (
                    <div className="mt-2.5 pt-2 border-t border-[#F0E5DF] flex flex-wrap items-center gap-3 text-xs text-[#66534E]">
                      <div className="flex items-center gap-1 text-[#1E1115] font-semibold">
                        <Scissors className="w-3.5 h-3.5 text-rose-500" />
                        <span>{item.appointment.service?.name || 'Procedimento'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[#7D6B65]">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" />
                        <span>
                          {new Date(item.appointment.start_time).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[#7D6B65]">
                        <span>Com {item.appointment.professional?.full_name || 'Profissional'}</span>
                      </div>
                    </div>
                  )}

                  {/* Alerta explicativo em casos que exigem atenção */}
                  {isRequiresAttention && (
                    <p className="text-[11px] text-amber-800 mt-2 flex items-center gap-1">
                      <HelpCircle className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>{actionMeta.desc}</span>
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* SUBMODAL: VINCULAÇÃO MANUAL PELA RECEPÇÃO */}
        {selectedInbound && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <form
              onSubmit={handleManualConfirm}
              className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-[#EADBCE]"
            >
              <div className="flex items-center justify-between border-b border-[#F0E5DF] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-[#1E1115]">
                    Vincular e Confirmar Agendamento
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInbound(null)}
                  className="text-xs font-bold text-[#7D6B65] hover:text-[#1E1115]"
                >
                  Cancelar
                </button>
              </div>

              <div className="p-3 bg-[#FAF5F3] rounded-xl border border-[#EADBCE] text-xs space-y-1">
                <p className="text-[#7D6B65]">
                  Mensagem de: <strong>{selectedInbound.sender_phone}</strong> ({selectedInbound.client?.full_name || 'Cliente'})
                </p>
                <p className="text-[#1E1115] font-semibold">
                  Resposta: &quot;{selectedInbound.message_text || selectedInbound.button_payload}&quot;
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E1115] mb-1.5">
                  Selecione o Agendamento Correto a Confirmar:
                </label>
                {pendingAppointments.length === 0 ? (
                  <p className="text-xs text-rose-700 bg-rose-50 p-3 rounded-xl border border-rose-200">
                    Nenhum agendamento futuro com status &quot;Agendado&quot; está disponível para este estabelecimento.
                  </p>
                ) : (
                  <select
                    value={selectedApptId}
                    onChange={(e) => setSelectedApptId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  >
                    <option value="">Selecione um agendamento pendente...</option>
                    {pendingAppointments.map((appt) => (
                      <option key={appt.id} value={appt.id}>
                        {new Date(appt.start_time).toLocaleDateString('pt-BR')} às{' '}
                        {new Date(appt.start_time).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        - {appt.client?.full_name} ({appt.service?.name}) com {appt.professional?.full_name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-[#7D6B65] mt-1">
                  A confirmação registrará a origem como &quot;Vinculação Manual pela Recepção&quot; mantendo auditoria completa.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F0E5DF]">
                <button
                  type="button"
                  onClick={() => setSelectedInbound(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#66534E] hover:bg-[#FAF5F3] transition-all"
                >
                  Voltar
                </button>

                <button
                  type="submit"
                  disabled={!selectedApptId || isLinking}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isLinking ? 'Confirmando...' : 'Confirmar Presença'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
