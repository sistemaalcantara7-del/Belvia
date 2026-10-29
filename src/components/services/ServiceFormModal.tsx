'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
            <Sparkles className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {serviceToEdit ? 'Atualizar Serviço' : 'Novo Serviço'}
            </span>
          </div>
          <CardTitle className="text-xl">
            {serviceToEdit ? serviceToEdit.name : 'Cadastrar Serviço'}
          </CardTitle>
          <CardDescription>
            Configure durações, preço e tempos de preparação para a sua agenda.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMessage && (
            <div className="mb-4 p-3 text-xs rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : serviceToEdit ? 'Atualizar Serviço' : 'Cadastrar Serviço'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
