'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Appointment, AppointmentFormData, AppointmentStatus } from '@/types/appointments';
import { Service } from '@/types/services';
import { Professional } from '@/types/professionals';
import { Client } from '@/types/clients';
import { saveAppointmentAction } from '@/lib/actions/appointments';
import { X, Calendar as CalendarIcon, Clock, Scissors, User, UserCheck, MessageCircle } from 'lucide-react';

interface AppointmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  clients: Client[];
  services: Service[];
  professionals: Professional[];
  appointmentToEdit?: Appointment | null;
  defaultDate?: string;
  onSaved: (appointment?: Appointment) => void;
  onOpenWhatsApp?: (appt: Appointment) => void;
}

export function AppointmentFormModal({
  isOpen,
  onClose,
  tenantSlug,
  clients,
  services,
  professionals,
  appointmentToEdit,
  defaultDate,
  onSaved,
  onOpenWhatsApp,
}: AppointmentFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    appointmentToEdit?.service_id || (services.length > 0 ? services[0].id : '')
  );
  const [selectedClientId, setSelectedClientId] = useState<string>(
    appointmentToEdit?.client_id || (clients.length > 0 ? clients[0].id : '')
  );
  const [selectedDate, setSelectedDate] = useState<string>(
    appointmentToEdit
      ? appointmentToEdit.start_time.split('T')[0]
      : defaultDate || new Date().toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState<string>(
    appointmentToEdit
      ? new Date(appointmentToEdit.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '09:00'
  );

  // Filtra profissionais habilitados para o serviço selecionado
  const eligibleProfessionals = useMemo(() => {
    if (!selectedServiceId) return professionals;
    return professionals.filter(
      (p) => p.status === 'active' && (!p.service_ids || p.service_ids.length === 0 || p.service_ids.includes(selectedServiceId))
    );
  }, [selectedServiceId, professionals]);

  const [selectedProfId, setSelectedProfId] = useState<string>(
    appointmentToEdit?.professional_id || (eligibleProfessionals.length > 0 ? eligibleProfessionals[0].id : '')
  );

  // Detalhes do serviço selecionado
  const selectedService = services.find((s) => s.id === selectedServiceId);

  // Cálculo automático do horário de término
  const calculatedEndTime = useMemo(() => {
    if (!startTime || !selectedService) return '';
    const [h, m] = startTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';

    const totalMinutes = selectedService.duration_minutes + (selectedService.break_minutes || 0);
    const dateObj = new Date(2000, 0, 1, h, m + totalMinutes);
    return `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
  }, [startTime, selectedService]);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: AppointmentFormData = {
      id: appointmentToEdit?.id,
      client_id: selectedClientId,
      service_id: selectedServiceId,
      professional_id: selectedProfId,
      date: selectedDate,
      start_time: startTime,
      status: (formData.get('status') as AppointmentStatus) || appointmentToEdit?.status || 'scheduled',
      notes: (formData.get('notes') as string)?.trim() || '',
    };

    const res = await saveAppointmentAction(tenantSlug, payload);

    if (res?.error) {
      setErrorMessage(res.error);
      setLoading(false);
    } else {
      setLoading(false);
      onSaved(res?.appointment);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="w-full max-w-lg shadow-2xl relative my-8 animate-in fade-in-0 zoom-in-95">
        <button
          onClick={onClose}
          type="button"
          aria-label="Fechar"
          className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <CardHeader>
          <div className="flex items-center gap-2 text-rose-600 mb-1">
            <CalendarIcon className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {appointmentToEdit ? 'Editar Agendamento' : 'Novo Agendamento'}
            </span>
          </div>
          <CardTitle className="text-xl">
            {appointmentToEdit ? 'Reagendar Atendimento' : 'Marcar Atendimento'}
          </CardTitle>
          <CardDescription>
            Defina o cliente, o procedimento, o especialista e o horário.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMessage && (
            <div className="mb-4 p-3 text-xs rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Seleção do Cliente */}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1.5" htmlFor="client">
                <User className="w-4 h-4 text-rose-500" />
                Cliente *
              </label>
              <select
                id="client"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} {c.whatsapp ? `(${c.whatsapp})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Seleção do Serviço */}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1.5" htmlFor="service">
                <Scissors className="w-4 h-4 text-rose-500" />
                Serviço / Procedimento *
              </label>
              <select
                id="service"
                value={selectedServiceId}
                onChange={(e) => {
                  setSelectedServiceId(e.target.value);
                  // Reseta o profissional se o atual não for elegível
                  const newEligible = professionals.filter(
                    (p) => p.status === 'active' && (!p.service_ids || p.service_ids.length === 0 || p.service_ids.includes(e.target.value))
                  );
                  if (newEligible.length > 0 && !newEligible.some((p) => p.id === selectedProfId)) {
                    setSelectedProfId(newEligible[0].id);
                  }
                }}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes} min — R$ {Number(s.price).toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            {/* Seleção do Profissional Habilitado */}
            <div>
              <label className="block text-sm font-medium mb-1 flex items-center gap-1.5" htmlFor="professional">
                <UserCheck className="w-4 h-4 text-rose-500" />
                Profissional Habilitado *
              </label>
              <select
                id="professional"
                value={selectedProfId}
                onChange={(e) => setSelectedProfId(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              >
                {eligibleProfessionals.length === 0 ? (
                  <option value="">Nenhum profissional habilitado para este serviço</option>
                ) : (
                  eligibleProfessionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.specialty})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Data e Horário */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="date">
                  Data do Atendimento *
                </label>
                <input
                  id="date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="time">
                  Horário Inicial *
                </label>
                <input
                  id="time"
                  type="time"
                  step="300"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
            </div>

            {/* Card informativo de duração calculada */}
            {selectedService && (
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-xs flex items-center justify-between text-zinc-600 dark:text-zinc-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-500" />
                  <span>
                    Duração: <strong>{selectedService.duration_minutes} min</strong>
                    {selectedService.break_minutes > 0 ? ` (+${selectedService.break_minutes} min intervalo)` : ''}
                  </span>
                </div>
                <span>
                  Término previsto: <strong className="text-zinc-900 dark:text-zinc-100">{calculatedEndTime}</strong>
                </span>
              </div>
            )}

            {/* Status (em edição) */}
            {appointmentToEdit && (
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="status">
                  Status do Atendimento
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={appointmentToEdit.status}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="scheduled">Agendado</option>
                  <option value="confirmed">Confirmado</option>
                  <option value="in_progress">Em Atendimento</option>
                  <option value="completed">Concluído</option>
                  <option value="canceled">Cancelado</option>
                  <option value="no_show">Não Compareceu</option>
                </select>
              </div>
            )}

            {/* Observações */}
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="notes">
                Observações do Atendimento (Opcional)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={appointmentToEdit?.notes || ''}
                placeholder="Ex: Primeira sessão do tratamento; cliente prefere água sem gás."
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-3">
              {appointmentToEdit && onOpenWhatsApp ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onOpenWhatsApp(appointmentToEdit);
                  }}
                  className="text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                  Enviar WhatsApp
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading || eligibleProfessionals.length === 0}>
                  {loading ? 'Processando...' : appointmentToEdit ? 'Atualizar Horário' : 'Confirmar Agendamento'}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
