'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Service, ServiceFormData, DEFAULT_SERVICE_CATEGORIES } from '@/types/services';
import { saveServiceAction } from '@/lib/actions/services';
import { X, Sparkles } from 'lucide-react';

interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  serviceToEdit?: Service | null;
  onSaved: (savedService: Service) => void;
}

export function ServiceFormModal({
  isOpen,
  onClose,
  tenantSlug,
  serviceToEdit,
  onSaved,
}: ServiceFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: ServiceFormData = {
      id: serviceToEdit?.id,
      name: (formData.get('name') as string).trim(),
      description: (formData.get('description') as string)?.trim() || '',
      category: formData.get('category') as string,
      duration_minutes: Number(formData.get('duration_minutes')),
      break_minutes: Number(formData.get('break_minutes') || 0),
      price: Number(formData.get('price')),
      status: (formData.get('status') as 'active' | 'inactive') || 'active',
    };

    const res = await saveServiceAction(tenantSlug, payload);

    if (res?.error) {
      setErrorMessage(res.error);
      setLoading(false);
    } else {
      setLoading(false);
      if (res.service) { onSaved(res.service); }
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <Card className="w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl relative rounded-none sm:rounded-2xl border-0 sm:border animate-in fade-in-0 zoom-in-95 overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 flex items-start justify-between relative">
          <div>
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {serviceToEdit ? 'Atualizar Serviço' : 'Novo Serviço'}
              </span>
            </div>
            <CardTitle className="text-lg sm:text-xl">
              {serviceToEdit ? serviceToEdit.name : 'Cadastrar Serviço'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Configure durações, preço e tempos de preparação para a sua agenda.
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
            <div className="mb-4 p-3 text-xs rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <form id="service-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">
                Nome do Serviço *
              </label>
              <input
                id="name"
                name="name"
                type="text"
                defaultValue={serviceToEdit?.name || ''}
                placeholder="Ex: Limpeza de Pele Profunda"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="category">
                  Categoria *
                </label>
                <select
                  id="category"
                  name="category"
                  defaultValue={serviceToEdit?.category || 'Facial'}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  {DEFAULT_SERVICE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="price">
                  Preço (R$) *
                </label>
                <input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={serviceToEdit?.price ?? 120.0}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="duration_minutes">
                  Duração do Procedimento *
                </label>
                <div className="flex items-center">
                  <input
                    id="duration_minutes"
                    name="duration_minutes"
                    type="number"
                    min="5"
                    step="5"
                    defaultValue={serviceToEdit?.duration_minutes || 60}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  />
                  <span className="ml-2 text-xs text-zinc-500">min</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="break_minutes">
                  Intervalo / Higienização
                </label>
                <div className="flex items-center">
                  <input
                    id="break_minutes"
                    name="break_minutes"
                    type="number"
                    min="0"
                    step="5"
                    defaultValue={serviceToEdit?.break_minutes ?? 10}
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <span className="ml-2 text-xs text-zinc-500">min</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="description">
                Descrição e Orientações (opcional)
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={serviceToEdit?.description || ''}
                placeholder="Ex: Inclui higienização, extração com ozônio e máscara calmante."
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="status">
                Status do Serviço
              </label>
              <select
                id="status"
                name="status"
                defaultValue={serviceToEdit?.status || 'active'}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="active">Ativo (visível na agenda)</option>
                <option value="inactive">Inativo (desabilitado)</option>
              </select>
            </div>
          </form>
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs sm:text-sm">
            Cancelar
          </Button>
          <Button type="submit" form="service-form" disabled={loading} className="text-xs sm:text-sm shadow-sm bg-rose-600 hover:bg-rose-700 text-white">
            {loading ? 'Salvando...' : serviceToEdit ? 'Atualizar Serviço' : 'Cadastrar Serviço'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
