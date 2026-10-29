'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Client, ClientFormData } from '@/types/clients';
import { saveClientAction } from '@/lib/actions/clients';
import { maskPhone, maskCPF } from '@/lib/utils/masks';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import { X, UserPlus } from 'lucide-react';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  clientToEdit?: Client | null;
  onSaved: (client: Client) => void;
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
    } else if (res?.client) {
      setLoading(false);
      onSaved(res.client);
      onClose();
    } else {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <Card className="w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl relative rounded-none sm:rounded-2xl border-0 sm:border animate-in fade-in-0 zoom-in-95 overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 flex items-start justify-between relative">
          <div>
            <div className="flex items-center gap-2 text-rose-600 mb-1">
              <UserPlus className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {clientToEdit ? 'Atualizar Cliente' : 'Novo Cliente'}
              </span>
            </div>
            <CardTitle className="text-lg sm:text-xl">
              {clientToEdit ? clientToEdit.full_name : 'Cadastrar Cliente'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Informações cadastrais e canais de contato preferenciais.
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

          <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
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
          </form>
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs sm:text-sm">
            Cancelar
          </Button>
          <Button type="submit" form="client-form" disabled={loading} className="text-xs sm:text-sm shadow-sm bg-rose-600 hover:bg-rose-700 text-white">
            {loading ? 'Salvando...' : clientToEdit ? 'Atualizar Cliente' : 'Cadastrar Cliente'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
