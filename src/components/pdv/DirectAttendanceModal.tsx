'use client';

import React, { useState } from 'react';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';
import { saveClientAction } from '@/lib/actions/clients';
import { createDirectPDVAttendanceAction } from '@/lib/actions/pdv';
import { X, ShoppingBag, Plus, Loader2, AlertCircle } from 'lucide-react';

interface DirectAttendanceModalProps {
  tenantSlug: string;
  clients: Array<{ id: string; full_name: string; whatsapp?: string | null }>;
  services: Service[];
  professionals: Professional[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newApptId: string) => void;
}

export function DirectAttendanceModal({
  tenantSlug,
  clients: initialClients,
  services,
  professionals,
  isOpen,
  onClose,
  onSuccess,
}: DirectAttendanceModalProps) {
  const [clientsList, setClientsList] = useState(initialClients);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProfId, setSelectedProfId] = useState('');
  const [notes, setNotes] = useState('');

  // Modo cadastro rápido de novo cliente
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientWhatsapp, setNewClientWhatsapp] = useState('');
  const [clientSaving, setClientSaving] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveQuickClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newClientName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }

    setClientSaving(true);
    try {
      const res = await saveClientAction(tenantSlug, {
        full_name: newClientName.trim(),
        whatsapp: newClientWhatsapp.trim() || undefined,
        status: 'active',
      });

      if (res.error) {
        setError(res.error);
      } else if (res.client) {
        const added = {
          id: res.client.id,
          full_name: res.client.full_name,
          whatsapp: res.client.whatsapp,
        };
        setClientsList([added, ...clientsList]);
        setSelectedClientId(added.id);
        setIsCreatingClient(false);
        setNewClientName('');
        setNewClientWhatsapp('');
      }
    } catch {
      setError('Erro ao salvar novo cliente.');
    } finally {
      setClientSaving(false);
    }
  };

  const handleCreateAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedClientId) {
      setError('Selecione ou cadastre um cliente.');
      return;
    }
    if (!selectedServiceId) {
      setError('Selecione o serviço realizado.');
      return;
    }
    if (!selectedProfId) {
      setError('Selecione o profissional que atendeu.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createDirectPDVAttendanceAction(tenantSlug, {
        client_id: selectedClientId,
        service_id: selectedServiceId,
        professional_id: selectedProfId,
        notes: notes.trim() || undefined,
      });

      if (res.error) {
        setError(res.error);
      } else if (res.data?.appointmentId) {
        onSuccess(res.data.appointmentId);
        onClose();
      }
    } catch {
      setError('Falha ao registrar atendimento direto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedService = services.find((s) => s.id === selectedServiceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div
        className="w-full max-w-lg rounded-2xl bg-white border border-[#EADBCE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#F5EDE8] bg-[#FCF8F5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF0EC] text-[#B87070] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1E1115]">Atendimento Direto no Balcão</h3>
              <p className="text-xs text-[#7D6B65]">Venda avulsa sem agendamento prévio na grade</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || clientSaving}
            className="p-1 rounded-lg text-[#7D6B65] hover:text-[#1E1115] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Seção Cliente */}
          <div className="p-3.5 rounded-xl bg-stone-50 border border-[#EADBCE] space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#2C1810] flex items-center gap-1.5">
                <span>Cliente</span>
              </label>
              <button
                type="button"
                onClick={() => setIsCreatingClient(!isCreatingClient)}
                className="text-[11px] font-bold text-[#B87070] hover:text-[#9E5A5A] flex items-center gap-1"
              >
                {isCreatingClient ? 'Selecionar existente' : '+ Cadastrar novo cliente'}
              </button>
            </div>

            {isCreatingClient ? (
              <div className="space-y-2 pt-1 border-t border-[#EADBCE]">
                <div>
                  <input
                    type="text"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Nome completo do cliente *"
                    className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-lg text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newClientWhatsapp}
                    onChange={(e) => setNewClientWhatsapp(e.target.value)}
                    placeholder="WhatsApp / Telefone (opcional)"
                    className="flex-1 px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-lg text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveQuickClient}
                    disabled={clientSaving || !newClientName.trim()}
                    className="px-3 py-2 text-xs font-bold text-white bg-[#B87070] rounded-lg hover:bg-[#A56363] disabled:opacity-50 shrink-0"
                  >
                    {clientSaving ? 'Salvando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-[#EADBCE] rounded-lg text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              >
                <option value="">Selecione um cliente...</option>
                {clientsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} {c.whatsapp ? `(${c.whatsapp})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Seção Serviço e Profissional */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#66534E] mb-1">
                Serviço Realizado *
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              >
                <option value="">Selecione o serviço...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — R$ {Number(s.price).toFixed(2).replace('.', ',')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#66534E] mb-1">
                Profissional Responsável *
              </label>
              <select
                value={selectedProfId}
                onChange={(e) => setSelectedProfId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none"
              >
                <option value="">Selecione o profissional...</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumo do Valor */}
          {selectedService && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-800">Valor do Atendimento</span>
              <span className="text-base font-bold text-emerald-800">
                R$ {Number(selectedService.price).toFixed(2).replace('.', ',')}
              </span>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-[#66534E] mb-1">
              Observações / Comentários
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Pagamento no balcão, solicitou nota..."
              rows={2}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#F5EDE8] bg-[#FCF8F5] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-[#7D6B65] hover:bg-stone-100 rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreateAttendance}
            disabled={isSubmitting || !selectedClientId || !selectedServiceId || !selectedProfId}
            className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-[#B87070] hover:bg-[#A56363] rounded-xl shadow-xs transition-all active:scale-98 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Abrindo Atendimento...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Abrir Atendimento & Cobrar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
