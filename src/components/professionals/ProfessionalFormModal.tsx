'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Professional, ProfessionalFormData, ProfessionalSchedule, DAYS_OF_WEEK } from '@/types/professionals';
import { Service } from '@/types/services';
import { saveProfessionalAction } from '@/lib/actions/professionals';
import { maskPhone } from '@/lib/utils/masks';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import { X, UserCheck, Clock, Scissors } from 'lucide-react';

interface ProfessionalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  professionalToEdit?: Professional | null;
  availableServices: Service[];
  onSaved: (professional: Professional) => void;
}

const DEFAULT_SCHEDULES: ProfessionalSchedule[] = [
  { day_of_week: 1, start_time: '09:00', end_time: '18:00', break_start: '12:00', break_end: '13:00', is_active: true },
  { day_of_week: 2, start_time: '09:00', end_time: '18:00', break_start: '12:00', break_end: '13:00', is_active: true },
  { day_of_week: 3, start_time: '09:00', end_time: '18:00', break_start: '12:00', break_end: '13:00', is_active: true },
  { day_of_week: 4, start_time: '09:00', end_time: '18:00', break_start: '12:00', break_end: '13:00', is_active: true },
  { day_of_week: 5, start_time: '09:00', end_time: '18:00', break_start: '12:00', break_end: '13:00', is_active: true },
  { day_of_week: 6, start_time: '09:00', end_time: '14:00', break_start: null, break_end: null, is_active: true },
  { day_of_week: 0, start_time: '09:00', end_time: '18:00', break_start: null, break_end: null, is_active: false },
];

export function ProfessionalFormModal({
  isOpen,
  onClose,
  tenantSlug,
  professionalToEdit,
  availableServices,
  onSaved,
}: ProfessionalFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [whatsapp, setWhatsapp] = useState(maskPhone(professionalToEdit?.whatsapp || ''));
  const [selectedServices, setSelectedServices] = useState<string[]>(
    professionalToEdit?.service_ids || []
  );

  // Inicializa a grade de horários
  const [schedules, setSchedules] = useState<ProfessionalSchedule[]>(() => {
    if (professionalToEdit?.schedules && professionalToEdit.schedules.length > 0) {
      return DAYS_OF_WEEK.map((day) => {
        const found = professionalToEdit.schedules?.find((s) => s.day_of_week === day.value);
        return (
          found || {
            day_of_week: day.value,
            start_time: '09:00',
            end_time: '18:00',
            break_start: '12:00',
            break_end: '13:00',
            is_active: false,
          }
        );
      });
    }
    return DEFAULT_SCHEDULES;
  });

  if (!isOpen) return null;

  function toggleService(id: string) {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((sId) => sId !== id) : [...prev, id]
    );
  }

  function updateSchedule(dayOfWeek: number, field: keyof ProfessionalSchedule, value: unknown) {
    setSchedules((prev) =>
      prev.map((s) => (s.day_of_week === dayOfWeek ? { ...s, [field]: value } : s))
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: ProfessionalFormData = {
      id: professionalToEdit?.id,
      full_name: (formData.get('full_name') as string).trim(),
      whatsapp: whatsapp,
      email: (formData.get('email') as string)?.trim() || '',
      specialty: (formData.get('specialty') as string)?.trim() || 'Geral',
      bio: (formData.get('bio') as string)?.trim() || '',
      status: (formData.get('status') as 'active' | 'inactive') || 'active',
      service_ids: selectedServices,
      schedules: schedules,
    };

    const res = await saveProfessionalAction(tenantSlug, payload);

    if (res?.error) {
      setErrorMessage(res.error);
      setLoading(false);
    } else if (res?.professional) {
      setLoading(false);
      onSaved(res.professional);
      onClose();
    } else {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <Card className="w-full sm:max-w-3xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl relative rounded-none sm:rounded-2xl border-0 sm:border animate-in fade-in-0 zoom-in-95 overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 flex items-start justify-between relative">
          <div>
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <UserCheck className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {professionalToEdit ? 'Atualizar Profissional' : 'Novo Profissional'}
              </span>
            </div>
            <CardTitle className="text-lg sm:text-xl">
              {professionalToEdit ? professionalToEdit.full_name : 'Cadastrar Profissional'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Defina dados de contato, especialidade, serviços habilitados e grade de horários.
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Fechar"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Rolagem Interna */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {errorMessage && (
            <div className="mb-4">
              <ActionFeedbackAlert
                error={errorMessage}
                tenantSlug={tenantSlug}
                onDismiss={() => setErrorMessage(null)}
              />
            </div>
          )}

          <form id="professional-form" onSubmit={handleSubmit} className="space-y-6">
            {/* Dados Pessoais e Função */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" htmlFor="full_name">
                  Nome Completo *
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  defaultValue={professionalToEdit?.full_name || ''}
                  placeholder="Ex: Dra. Mariana Costa"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="specialty">
                  Especialidade / Função *
                </label>
                <input
                  id="specialty"
                  name="specialty"
                  type="text"
                  defaultValue={professionalToEdit?.specialty || ''}
                  placeholder="Ex: Biomédica Esteta, Massoterapeuta"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="whatsapp">
                  WhatsApp Profissional
                </label>
                <input
                  id="whatsapp"
                  name="whatsapp"
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                  placeholder="(11) 98765-4321"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="email">
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={professionalToEdit?.email || ''}
                  placeholder="mariana@clinica.com.br"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={professionalToEdit?.status || 'active'}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="active">Ativo (recebe agendamentos)</option>
                  <option value="inactive">Inativo (pausado)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" htmlFor="bio">
                  Breve Apresentação (Bio / Experiência)
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  rows={2}
                  defaultValue={professionalToEdit?.bio || ''}
                  placeholder="Ex: Especialista em harmonização e estética facial com 8 anos de experiência."
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Serviços Habilitados */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="w-4 h-4 text-rose-600" />
                <h4 className="font-semibold text-sm">Serviços que o profissional realiza</h4>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Selecione os procedimentos disponíveis na agenda para este profissional:
              </p>

              {availableServices.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">
                  Nenhum serviço cadastrado no catálogo. Cadastre serviços previamente.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                  {availableServices.map((srv) => {
                    const isSelected = selectedServices.includes(srv.id);
                    return (
                      <label
                        key={srv.id}
                        className={`flex items-center gap-2 p-2 rounded-md text-xs cursor-pointer border transition-colors ${
                          isSelected
                            ? 'bg-rose-50 border-rose-300 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200'
                            : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleService(srv.id)}
                          className="rounded text-rose-600 focus:ring-rose-500"
                        />
                        <span className="truncate font-medium">{srv.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Grade Habitual de Horários */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-rose-600" />
                <h4 className="font-semibold text-sm">Horários Habitual de Trabalho</h4>
              </div>
              <p className="text-xs text-zinc-500 mb-3">
                Configure os dias da semana e turnos de expediente:
              </p>

              <div className="space-y-2">
                {DAYS_OF_WEEK.map((day) => {
                  const s = schedules.find((item) => item.day_of_week === day.value) || {
                    day_of_week: day.value,
                    start_time: '09:00',
                    end_time: '18:00',
                    break_start: null,
                    break_end: null,
                    is_active: false,
                  };

                  return (
                    <div
                      key={day.value}
                      className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border text-xs transition-colors ${
                        s.is_active
                          ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                          : 'bg-zinc-50/60 dark:bg-zinc-950/40 border-dashed border-zinc-200 dark:border-zinc-800/80 opacity-60'
                      }`}
                    >
                      <label className="flex items-center gap-2 font-medium w-32 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={s.is_active}
                          onChange={(e) => updateSchedule(day.value, 'is_active', e.target.checked)}
                          className="rounded text-rose-600 focus:ring-rose-500"
                        />
                        <span>{day.label}</span>
                      </label>

                      {s.is_active ? (
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto mt-1 sm:mt-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                          <div className="flex items-center gap-1.5">
                            <span className="text-zinc-500 text-[11px]">Turno:</span>
                            <input
                              type="time"
                              value={s.start_time}
                              onChange={(e) => updateSchedule(day.value, 'start_time', e.target.value)}
                              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                            <span className="text-zinc-400">às</span>
                            <input
                              type="time"
                              value={s.end_time}
                              onChange={(e) => updateSchedule(day.value, 'end_time', e.target.value)}
                              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                          </div>

                          <div className="flex items-center gap-1.5 sm:pl-2 sm:border-l border-zinc-200 dark:border-zinc-800">
                            <span className="text-zinc-500 text-[11px]">Intervalo:</span>
                            <input
                              type="time"
                              value={s.break_start || ''}
                              onChange={(e) => updateSchedule(day.value, 'break_start', e.target.value || null)}
                              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                            <span className="text-zinc-400">-</span>
                            <input
                              type="time"
                              value={s.break_end || ''}
                              onChange={(e) => updateSchedule(day.value, 'break_end', e.target.value || null)}
                              className="px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs"
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-zinc-400 italic text-[11px]">Não atende neste dia</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </form>
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs sm:text-sm">
            Cancelar
          </Button>
          <Button type="submit" form="professional-form" disabled={loading} className="text-xs sm:text-sm shadow-sm bg-rose-600 hover:bg-rose-700 text-white">
            {loading ? 'Salvando...' : professionalToEdit ? 'Atualizar Profissional' : 'Cadastrar Profissional'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
