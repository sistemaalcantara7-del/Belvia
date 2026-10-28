'use client';

import React, { useState } from 'react';
import {
  Bell,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Radio,
  History,
} from 'lucide-react';
import {
  TenantReminderSettings,
  NotificationQueueItem,
  NOTIFICATION_STATUS_MAP,
  REMINDER_TRIGGER_LABEL,
} from '@/types/reminders';
import { saveReminderSettingsAction } from '@/lib/actions/reminders';

interface RemindersConfigManagerProps {
  tenantSlug: string;
  userRole: string;
  initialSettings: TenantReminderSettings;
  queueItems: NotificationQueueItem[];
}

export function RemindersConfigManager({
  tenantSlug,
  userRole,
  initialSettings,
  queueItems: initialQueue,
}: RemindersConfigManagerProps) {
  const canManage = ['owner', 'admin'].includes(userRole);

  const [activeTab, setActiveTab] = useState<'config' | 'queue'>('config');

  // Form State
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [enable24h, setEnable24h] = useState(initialSettings.enable_24h_reminder);
  const [enable2h, setEnable2h] = useState(initialSettings.enable_2h_reminder);
  const [provider] = useState(initialSettings.provider);
  const [template24h, setTemplate24h] = useState(initialSettings.template_24h);
  const [template2h, setTemplate2h] = useState(initialSettings.template_2h);

  // Status feedback
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Queue filter
  const [queueStatusFilter, setQueueStatusFilter] = useState<string>('ALL');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    try {
      setIsSaving(true);
      setFeedback(null);

      const res = await saveReminderSettingsAction(tenantSlug, {
        enabled,
        enable_24h_reminder: enable24h,
        enable_2h_reminder: enable2h,
        provider,
        template_24h: template24h,
        template_2h: template2h,
      });

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({ type: 'success', message: 'Configurações de lembretes salvas com sucesso!' });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Ocorreu um erro ao salvar as configurações.' });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredQueue = initialQueue.filter((item) => {
    if (queueStatusFilter === 'ALL') return true;
    return item.status === queueStatusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Alternador de Abas */}
      <div className="flex items-center justify-between border-b border-[#EADBCE] pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'config'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'text-[#7D6B65] hover:text-[#2C1810] bg-white border border-[#EADBCE]'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Regras de Lembretes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'queue'
                ? 'bg-[#B87070] text-white shadow-2xs font-bold'
                : 'text-[#7D6B65] hover:text-[#2C1810] bg-white border border-[#EADBCE]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Fila de Notificações</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current">
              {initialQueue.length}
            </span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-bold hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ABA 1: CONFIGURAÇÃO DE LEMBRETES */}
      {activeTab === 'config' && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Status Geral */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#1E1115]">
                  Ativação Geral de Lembretes Automáticos
                </h2>
                <p className="text-xs text-[#7D6B65]">
                  Habilita o agendamento preventivo de mensagens de confirmação e lembrete para clientes
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!canManage}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#B87070]"></div>
              </label>
            </div>

            {/* Provedor Oficial WhatsApp */}
            <div className="pt-4 border-t border-[#F0E5DF] grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#2C1810] mb-1">
                  Provedor Oficial WhatsApp (Meta)
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-xs text-[#66534E]">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold">Meta Cloud API / Oficial BSP</span>
                </div>
                <p className="text-[11px] text-[#7D6B65] mt-1">
                  ZELUNIA opera exclusivamente via API oficial da Meta, prevenindo banimentos e garantindo alta entregabilidade.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#2C1810] mb-1">
                  Disparo de Testes (Simulação Segura)
                </label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  <Radio className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Modo Fila Persistente Ativo (sem disparo real nesta fase)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Antecedência e Templates */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lembrete 24 Horas Antes */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E1115]">
                      Lembrete de 24 Horas
                    </h3>
                    <p className="text-[11px] text-[#7D6B65]">Disparo 1 dia antes do horário agendado</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enable24h}
                  disabled={!canManage || !enabled}
                  onChange={(e) => setEnable24h(e.target.checked)}
                  className="rounded border-[#EADBCE] text-[#B87070] focus:ring-[#B87070] w-4 h-4"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#66534E] mb-1.5">
                  Mensagem Personalizada (Template 24h)
                </label>
                <textarea
                  rows={4}
                  value={template24h}
                  disabled={!canManage || !enabled || !enable24h}
                  onChange={(e) => setTemplate24h(e.target.value)}
                  className="w-full p-3 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none disabled:opacity-60 font-sans"
                />
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[#7D6B65]">
                  <span>Tags disponíveis:</span>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{cliente}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{servico}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{profissional}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{data}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{horario}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{estabelecimento}'}</code>
                </div>
              </div>
            </div>

            {/* Lembrete 2 Horas Antes */}
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E1115]">
                      Lembrete de 2 Horas
                    </h3>
                    <p className="text-[11px] text-[#7D6B65]">Disparo no mesmo dia com aviso imediato</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enable2h}
                  disabled={!canManage || !enabled}
                  onChange={(e) => setEnable2h(e.target.checked)}
                  className="rounded border-[#EADBCE] text-[#B87070] focus:ring-[#B87070] w-4 h-4"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#66534E] mb-1.5">
                  Mensagem Personalizada (Template 2h)
                </label>
                <textarea
                  rows={4}
                  value={template2h}
                  disabled={!canManage || !enabled || !enable2h}
                  onChange={(e) => setTemplate2h(e.target.value)}
                  className="w-full p-3 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none disabled:opacity-60 font-sans"
                />
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[#7D6B65]">
                  <span>Tags disponíveis:</span>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{cliente}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{servico}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{profissional}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{horario}'}</code>
                  <code className="bg-[#FAF0EC] text-[#B87070] px-1 rounded">{'{estabelecimento}'}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Botão de Salvar */}
          {canManage && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B87070] hover:bg-[#a55f5f] text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Salvando...' : 'Salvar Configurações de Lembrete'}</span>
              </button>
            </div>
          )}
        </form>
      )}

      {/* ABA 2: HISTÓRICO DA FILA DE NOTIFICAÇÕES */}
      {activeTab === 'queue' && (
        <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#1E1115]">
                Fila Persistente de Notificações
              </h2>
              <p className="text-xs text-[#7D6B65]">
                Auditoria de envios programados, idempotência e status operacional
              </p>
            </div>

            {/* Filtros de Status */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'pending', 'processing', 'simulated', 'sent', 'failed', 'canceled'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setQueueStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    queueStatusFilter === st
                      ? 'bg-[#B87070] text-white font-bold'
                      : 'bg-[#FAF5F3] text-[#7D6B65] border border-[#EADBCE]'
                  }`}
                >
                  {st === 'ALL' ? 'Todas' : NOTIFICATION_STATUS_MAP[st]?.label || st}
                </button>
              ))}
            </div>
          </div>

          {filteredQueue.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#7D6B65] bg-[#FAF5F3] rounded-xl border border-dashed border-[#EADBCE]">
              Nenhuma notificação na fila para o filtro selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#EADBCE]">
              <table className="w-full text-left text-xs text-[#2C1810]">
                <thead className="bg-[#FAF5F3] text-[11px] font-bold text-[#66534E] uppercase border-b border-[#EADBCE]">
                  <tr>
                    <th className="py-3 px-4">Destinatário</th>
                    <th className="py-3 px-4">Tipo / Gatilho</th>
                    <th className="py-3 px-4">Programado Para</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Conteúdo da Mensagem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0E5DF]">
                  {filteredQueue.map((item) => {
                    const stBadge = NOTIFICATION_STATUS_MAP[item.status] || {
                      label: item.status,
                      bg: 'bg-zinc-100',
                      text: 'text-zinc-600',
                      border: 'border-zinc-200',
                    };

                    return (
                      <tr key={item.id} className="hover:bg-[#FAF0EC]/30 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-[#1E1115]">
                            {item.client?.full_name || 'Cliente'}
                          </p>
                          <p className="text-[11px] font-mono text-[#7D6B65]">
                            {item.recipient_phone}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-[#66534E]">
                          <span className="font-semibold">
                            {REMINDER_TRIGGER_LABEL[item.notification_type] || item.notification_type}
                          </span>
                          <p className="text-[10px] text-[#A8948D] font-mono">
                            {item.channel.toUpperCase()}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-[#66534E] font-mono">
                          {new Date(item.scheduled_for).toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${stBadge.bg} ${stBadge.text} ${stBadge.border}`}
                          >
                            {stBadge.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs truncate text-[11px] text-[#7D6B65]">
                          {item.message_content}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
