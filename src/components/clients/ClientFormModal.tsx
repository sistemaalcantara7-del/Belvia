'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Client, ClientFormData } from '@/types/clients';
import { saveClientAction } from '@/lib/actions/clients';
import { maskPhone, maskCPF } from '@/lib/utils/masks';
import { X, UserPlus } from 'lucide-react';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  clientToEdit?: Client | null;
  onSaved: () => void;
}

export function ClientFormModal({
  isOpen,
  onClose,
  tenantSlug,
  clientToEdit,
  onSaved,
}: ClientFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Estados com máscaras controladas
  const [whatsapp, setWhatsapp] = useState(maskPhone(clientToEdit?.whatsapp || ''));
  const [phone, setPhone] = useState(maskPhone(clientToEdit?.phone || ''));
  const [cpf, setCpf] = useState(maskCPF(clientToEdit?.cpf || ''));

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const payload: ClientFormData = {
      id: clientToEdit?.id,
      full_name: (formData.get('full_name') as string).trim(),
      whatsapp: whatsapp,
      phone: phone,
      email: (formData.get('email') as string)?.trim() || '',
      birth_date: (formData.get('birth_date') as string) || '',
      cpf: cpf,
      notes: (formData.get('notes') as string)?.trim() || '',
      status: (formData.get('status') as 'active' | 'inactive') || 'active',
      address: {
        street: (formData.get('street') as string)?.trim() || '',
        number: (formData.get('number') as string)?.trim() || '',
        complement: (formData.get('complement') as string)?.trim() || '',
        neighborhood: (formData.get('neighborhood') as string)?.trim() || '',
        city: (formData.get('city') as string)?.trim() || '',
        state: (formData.get('state') as string)?.trim() || '',
        zip_code: (formData.get('zip_code') as string)?.trim() || '',
      },
    };

    const res = await saveClientAction(tenantSlug, payload);

    if (res?.error) {
      setErrorMessage(res.error);
      setLoading(false);
    } else {
      setLoading(false);
      onSaved();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl shadow-2xl relative my-8 animate-in fade-in-0 zoom-in-95">
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
            <UserPlus className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {clientToEdit ? 'Atualizar Cliente' : 'Novo Cliente'}
            </span>
          </div>
          <CardTitle className="text-xl">
            {clientToEdit ? clientToEdit.full_name : 'Cadastrar Cliente'}
          </CardTitle>
          <CardDescription>
            Informações cadastrais e canais de contato preferenciais.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMessage && (
            <div className="mb-4 p-3 text-xs rounded bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Dados Principais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" htmlFor="full_name">
                  Nome Completo *
                </label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  defaultValue={clientToEdit?.full_name || ''}
                  placeholder="Ex: Ana Clara Santos"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="whatsapp">
                  WhatsApp (Principal)
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
                <label className="block text-sm font-medium mb-1" htmlFor="phone">
                  Telefone Alternativo
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(11) 3456-7890"
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
                  defaultValue={clientToEdit?.email || ''}
                  placeholder="anaclara@email.com"
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="birth_date">
                  Data de Nascimento
                </label>
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  defaultValue={clientToEdit?.birth_date || ''}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="cpf">
                  CPF (Opcional)
                </label>
                <input
                  id="cpf"
                  name="cpf"
                  type="text"
                  value={cpf}
                  onChange={(e) => setCpf(maskCPF(e.target.value))}
                  placeholder="000.000.000-00"
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
                  defaultValue={clientToEdit?.status || 'active'}
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>
            </div>

            {/* Endereço Opcional */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-3">
                Endereço Residencial (Opcional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    name="street"
                    type="text"
                    defaultValue={clientToEdit?.address?.street || ''}
                    placeholder="Logradouro / Rua"
                    className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <input
                    name="number"
                    type="text"
                    defaultValue={clientToEdit?.address?.number || ''}
                    placeholder="Número"
                    className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <input
                    name="neighborhood"
                    type="text"
                    defaultValue={clientToEdit?.address?.neighborhood || ''}
                    placeholder="Bairro"
                    className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <input
                    name="city"
                    type="text"
                    defaultValue={clientToEdit?.address?.city || ''}
                    placeholder="Cidade"
                    className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
                <div>
                  <input
                    name="state"
                    type="text"
                    defaultValue={clientToEdit?.address?.state || ''}
                    placeholder="UF (Ex: SP)"
                    className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* Observações Administrativas */}
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="notes">
                Observações Administrativas (Preferências, alertas de contato)
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={2}
                defaultValue={clientToEdit?.notes || ''}
                placeholder="Ex: Prefere atendimento à tarde; prefere contato por WhatsApp."
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-md bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : clientToEdit ? 'Atualizar Cliente' : 'Cadastrar Cliente'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
