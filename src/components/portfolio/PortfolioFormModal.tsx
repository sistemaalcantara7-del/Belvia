'use client';

import React, { useState } from 'react';
import { X, Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import { PortfolioItem } from '@/types/publicBooking';
import { Service } from '@/types/services';
import { savePortfolioItemAction } from '@/lib/actions/portfolio';

interface PortfolioFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantSlug: string;
  services: Service[];
  itemToEdit?: PortfolioItem | null;
  defaultSortOrder?: number;
  onSaved: (item: PortfolioItem) => void;
}

export function PortfolioFormModal({
  isOpen,
  onClose,
  tenantSlug,
  services,
  itemToEdit,
  defaultSortOrder = 0,
  onSaved,
}: PortfolioFormModalProps) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(itemToEdit?.image_url || null);
  const [title, setTitle] = useState(itemToEdit?.title || '');
  const [description, setDescription] = useState(itemToEdit?.description || '');
  const [serviceId, setServiceId] = useState<string>(itemToEdit?.service_id || '');
  const [category, setCategory] = useState(itemToEdit?.category || 'Geral');
  const [sortOrder, setSortOrder] = useState<number>(itemToEdit?.sort_order ?? defaultSortOrder);
  const [clientConsent, setClientConsent] = useState<boolean>(itemToEdit?.client_consent ?? false);
  const [isActive, setIsActive] = useState<boolean>(itemToEdit ? (itemToEdit.is_active ?? true) : false);

  const [prevEditId, setPrevEditId] = useState<string | null | undefined>(itemToEdit ? itemToEdit.id : null);

  // Sincronização segura de props: aciona tanto quando itemToEdit muda quanto quando vira null
  const currentEditId = itemToEdit ? itemToEdit.id : null;
  if (currentEditId !== prevEditId) {
    setPrevEditId(currentEditId);
    setImageUrl(itemToEdit?.image_url || null);
    setTitle(itemToEdit?.title || '');
    setDescription(itemToEdit?.description || '');
    setServiceId(itemToEdit?.service_id || '');
    setCategory(itemToEdit?.category || 'Geral');
    setSortOrder(itemToEdit?.sort_order ?? defaultSortOrder);
    setClientConsent(itemToEdit?.client_consent ?? false);
    setIsActive(itemToEdit ? (itemToEdit.is_active ?? true) : false);
  }

  // Se o serviço vinculado for alterado e possuir categoria, sincroniza a categoria caso ainda não preenchida
  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setServiceId(selectedId);
    if (selectedId) {
      const found = services.find((s) => s.id === selectedId);
      if (found?.category) {
        setCategory(found.category);
      }
    }
  };

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!imageUrl) {
      setErrorMessage('É obrigatório enviar uma fotografia do trabalho para o portfólio.');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('Informe um título identificador para este trabalho.');
      return;
    }

    if (!clientConsent && isActive) {
      setErrorMessage(
        'A publicação pública exige o registro de consentimento expresso do cliente (LGPD). Marque a caixa de confirmação de consentimento ou defina o status como Rascunho / Oculto.'
      );
      return;
    }

    setLoading(true);

    const payload: Partial<PortfolioItem> = {
      id: itemToEdit?.id,
      title: title.trim(),
      description: description.trim() || null,
      image_url: imageUrl,
      category: category.trim() || 'Geral',
      service_id: serviceId || null,
      sort_order: Number(sortOrder) || 0,
      client_consent: clientConsent,
      is_active: clientConsent ? isActive : false,
    };

    const res = await savePortfolioItemAction(tenantSlug, payload);

    if (!res.success || !res.item) {
      setErrorMessage(res.error || 'Falha ao salvar trabalho do portfólio.');
      setLoading(false);
    } else {
      setLoading(false);
      onSaved(res.item);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <Card className="w-full sm:max-w-xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col shadow-2xl relative rounded-none sm:rounded-2xl border-0 sm:border animate-in fade-in-0 zoom-in-95 overflow-hidden">
        {/* Cabeçalho Fixo */}
        <div className="p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 flex items-start justify-between relative">
          <div>
            <div className="flex items-center gap-2 text-[#BD7165] mb-1">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {itemToEdit ? 'Editar Trabalho' : 'Novo Trabalho no Portfólio'}
              </span>
            </div>
            <CardTitle className="text-lg sm:text-xl">
              {itemToEdit ? itemToEdit.title : 'Publicar Trabalho'}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              Exiba resultados de procedimentos e conquiste novos clientes na sua vitrine digital.
            </CardDescription>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Fechar"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Rolagem Interna */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {errorMessage && (
            <ActionFeedbackAlert
              error={errorMessage}
              tenantSlug={tenantSlug}
              onDismiss={() => setErrorMessage(null)}
            />
          )}

          <form id="portfolio-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Campo de Upload de Foto com Prévia Otimizada */}
            <ImageUploadField
              tenantSlug={tenantSlug}
              entityType="portfolio"
              currentImageUrl={imageUrl}
              onImageChanged={(newUrl) => setImageUrl(newUrl)}
              aspectRatioLabel="Máx 1200×1200"
              maxDimensionsLabel="Máx 350 KB em WebP"
              label="Fotografia do Trabalho *"
            />

            {/* Título do Trabalho */}
            <div>
              <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200 mb-1" htmlFor="port-title">
                Título ou Procedimento Realizado *
              </label>
              <input
                id="port-title"
                name="title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Transformação Mechas & Tratamento Reconstrutor"
                className="w-full px-3 py-2 border border-[#EADBCE] dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
              />
            </div>

            {/* Serviço Vinculado do Catálogo & Categoria */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200 mb-1" htmlFor="port-service">
                  Serviço Vinculado (Catálogo)
                </label>
                <select
                  id="port-service"
                  value={serviceId}
                  onChange={handleServiceChange}
                  className="w-full px-3 py-2 border border-[#EADBCE] dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
                >
                  <option value="">Nenhum (trabalho geral/destaque)</option>
                  {services.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} ({srv.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200 mb-1" htmlFor="port-category">
                  Categoria / Especialidade
                </label>
                <input
                  id="port-category"
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex: Cabelo, Facial, Unhas"
                  className="w-full px-3 py-2 border border-[#EADBCE] dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
                />
              </div>
            </div>

            {/* Descrição / Comentário da Especialista */}
            <div>
              <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200 mb-1" htmlFor="port-description">
                Comentário ou Descrição dos Resultados (opcional)
              </label>
              <textarea
                id="port-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Cliente buscava fios mais iluminados com preservação total da fibra. Realizamos teste de mecha, neutralização e cronograma de hidratação profunda."
                className="w-full px-3 py-2 border border-[#EADBCE] dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
              />
              <span className="text-[11px] text-[#7D6B65] mt-1 block">
                Privacidade garantida: não inclua nome completo, telefone ou dados confidenciais do cliente.
              </span>
            </div>

            {/* Ordem de Exibição e Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200 mb-1" htmlFor="port-order">
                  Ordem no Carrossel (menor = primeiro)
                </label>
                <input
                  id="port-order"
                  type="number"
                  min="0"
                  step="1"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-[#EADBCE] dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2C1810] dark:text-zinc-200 mb-1" htmlFor="port-status">
                  Status de Publicação
                </label>
                <select
                  id="port-status"
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(e) => setIsActive(e.target.value === 'active')}
                  className="w-full px-3 py-2 border border-[#EADBCE] dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
                >
                  <option value="active">Publicado (visível no carrossel da vitrine)</option>
                  <option value="inactive">Oculto / Rascunho</option>
                </select>
              </div>
            </div>

            {/* Termo de Consentimento LGPD Específico */}
            <div className={`p-4 rounded-2xl border transition-all ${
              clientConsent
                ? 'bg-[#FAF6F3] border-[#BD7165]/50 dark:bg-zinc-900/80 dark:border-[#BD7165]'
                : 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40'
            }`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clientConsent}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setClientConsent(checked);
                    if (!checked) {
                      setIsActive(false);
                    }
                  }}
                  className="mt-0.5 w-4 h-4 text-[#BD7165] rounded border-zinc-300 focus:ring-[#BD7165] cursor-pointer"
                />
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#2C1810] dark:text-zinc-100">
                    <ShieldCheck className="w-4 h-4 text-[#BD7165]" />
                    <span>Consentimento do Cliente Registrado (LGPD)</span>
                  </div>
                  <p className="text-[11px] text-[#7D6B65] dark:text-zinc-400 leading-relaxed">
                    Confirmo que o(a) cliente autorizou expressamente a divulgação pública da fotografia do procedimento na vitrine online. Se o consentimento for revogado a qualquer momento, o trabalho poderá ser retirado imediatamente.
                  </p>
                </div>
              </label>
            </div>
          </form>
        </div>

        {/* Rodapé Fixo */}
        <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80 shrink-0 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="text-xs sm:text-sm">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="portfolio-form"
            disabled={
              loading ||
              !imageUrl ||
              !title.trim() ||
              (isActive ? !clientConsent : false) ||
              (!itemToEdit && !clientConsent)
            }
            className="text-xs sm:text-sm shadow-sm bg-[#BD7165] hover:bg-[#a65f54] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Salvando...' : itemToEdit ? 'Atualizar Trabalho' : 'Publicar no Portfólio'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
