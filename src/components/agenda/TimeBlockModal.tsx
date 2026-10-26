'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Professional, ProfessionalTimeBlock, TimeBlockFormData } from '@/types/professionals';
import { saveTimeBlockAction, deleteTimeBlockAction } from '@/lib/actions/time-blocks';
import { X, Clock, UserCheck, ShieldAlert, Trash2 } from 'lucide-react';

interface TimeBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  professionals: Professional[];
  blockToEdit?: ProfessionalTimeBlock | null;
  defaultDate?: string;
  defaultStartTime?: string;
  defaultProfId?: string;
  userRole: string;
  onSaved: (savedBlock?: ProfessionalTimeBlock, deletedId?: string) => void;
}

export function TimeBlockModal({
  isOpen,
  onClose,
  tenantSlug,
  professionals,
  blockToEdit,
  defaultDate,
  defaultStartTime,
  defaultProfId,
  userRole,
  onSaved,
}: TimeBlockModalProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedProfId, setSelectedProfId] = useState<string>(
    blockToEdit?.professional_id || defaultProfId || (professionals.length > 0 ? professionals[0].id : '')
  );

  const [selectedDate, setSelectedDate] = useState<string>(
    blockToEdit
      ? blockToEdit.start_time.split('T')[0]
      : defaultDate || new Date().toISOString().split('T')[0]
  );

  const [startTime, setStartTime] = useState<string>(
    blockToEdit
      ? new Date(blockToEdit.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : defaultStartTime || '12:00'
  );

  const [endTime, setEndTime] = useState<string>(() => {
    if (blockToEdit) {
      return new Date(blockToEdit.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    // Default 1 hora após o startTime
    const [h, m] = (defaultStartTime || '12:00').split(':').map(Number);
    const endH = (h + 1) % 24;
    return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });

  const [reason, setReason] = useState<string>(blockToEdit?.reason || '');

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const payload: TimeBlockFormData = {
      id: blockToEdit?.id,
      professional_id: selectedProfId,
      date: selectedDate,
      start_time: startTime,
      end_time: endTime,
      reason: reason.trim() || undefined,
    };

    const res = await saveTimeBlockAction(tenantSlug, payload);

    setLoading(false);
    if (res?.error) {
      setErrorMessage(res.error);
    } else if (res?.success) {
      onSaved(res.timeBlock);
      onClose();
    }
  }

  async function handleDelete() {
    if (!blockToEdit?.id) return;
    if (!confirm('Deseja realmente remover este bloqueio de horário?')) return;

    setDeleting(true);
    setErrorMessage(null);

    const res = await deleteTimeBlockAction(tenantSlug, blockToEdit.id);
    setDeleting(false);

    if (res?.error) {
      setErrorMessage(res.error);
    } else if (res?.success) {
      onSaved(undefined, blockToEdit.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <Card className="w-full max-w-md shadow-2xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <CardTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              {blockToEdit ? 'Editar Bloqueio de Horário' : 'Novo Bloqueio de Horário'}
            </CardTitle>
            <CardDescription className="text-xs text-zinc-500 mt-0.5">
              Impeça novos agendamentos neste intervalo (almoço, folga, consulta ou reunião).
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-zinc-700">
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {errorMessage && (
              <div className="p-3 text-xs rounded-md bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
                {errorMessage}
              </div>
            )}

            {/* Profissional */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Profissional *
              </label>
              <div className="relative">
                <select
                  disabled={Boolean(blockToEdit) || (userRole === 'professional' && professionals.length <= 1)}
                  value={selectedProfId}
                  onChange={(e) => setSelectedProfId(e.target.value)}
                  required
                  className="w-full h-10 pl-3 pr-8 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-60"
                >
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.specialty})
                    </option>
                  ))}
                </select>
                <UserCheck className="absolute right-2.5 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Data do Bloqueio *
              </label>
              <input
                type="date"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-10 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {/* Horários Início e Término */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Início *
                </label>
                <div className="relative">
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <Clock className="absolute right-2.5 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Término *
                </label>
                <div className="relative">
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <Clock className="absolute right-2.5 top-2.5 w-4 h-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Motivo (Opcional) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Motivo / Justificativa (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex.: Intervalo de almoço, Consulta médica, Férias..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={100}
                className="w-full h-10 px-3 text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </CardContent>

          <div className="flex items-center justify-between p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
            {blockToEdit?.id ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleting || loading}
                onClick={handleDelete}
                className="text-xs h-9 px-3"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {deleting ? 'Excluindo...' : 'Excluir'}
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={loading || deleting} className="text-xs h-9">
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={loading || deleting} className="text-xs h-9 px-4">
                {loading ? 'Salvando...' : blockToEdit ? 'Atualizar Bloqueio' : 'Criar Bloqueio'}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
