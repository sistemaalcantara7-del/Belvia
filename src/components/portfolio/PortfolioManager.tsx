'use client';

import React, { useState, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertTriangle,
  ArrowUpDown,
  Search,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import { PortfolioItem } from '@/types/publicBooking';
import { Service } from '@/types/services';
import { PortfolioFormModal } from './PortfolioFormModal';
import {
  deletePortfolioItemAction,
  togglePortfolioStatusAction,
} from '@/lib/actions/portfolio';
import { deleteEntityImageAction } from '@/lib/actions/storage';

interface PortfolioManagerProps {
  initialItems: PortfolioItem[];
  services: Service[];
  tenantSlug: string;
  tenantName: string;
  userRole: string;
}

export function PortfolioManager({
  initialItems,
  services,
  tenantSlug,
  tenantName,
  userRole,
}: PortfolioManagerProps) {
  const [items, setItems] = useState<PortfolioItem[]>(initialItems);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const canManage = userRole === 'owner' || userRole === 'admin';

  // Categorias únicas
  const categories = Array.from(
    new Set(items.map((i) => i.category || 'Geral').filter(Boolean))
  );

  // Filtragem
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.service_name && item.service_name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' || (item.category || 'Geral') === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const activeCount = items.filter((i) => i.is_active && i.client_consent).length;
  const draftCount = items.length - activeCount;

  const handleOpenCreate = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (item: PortfolioItem) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleToggleStatus = async (item: PortfolioItem) => {
    if (!canManage) return;
    setActionError(null);
    setActionSuccess(null);
    setProcessingId(item.id);

    const res = await togglePortfolioStatusAction(tenantSlug, item.id, item.is_active);

    if (res.error) {
      setActionError(res.error);
    } else {
      const updatedStatus = res.is_active ?? !item.is_active;
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_active: updatedStatus } : i))
      );
      setActionSuccess(
        updatedStatus
          ? 'Trabalho publicado no carrossel da vitrine com sucesso.'
          : 'Trabalho ocultado da vitrine pública imediatamente.'
      );
      startTransition(() => {
        router.refresh();
      });
    }
    setProcessingId(null);
  };

  const handleDelete = async (item: PortfolioItem) => {
    if (!canManage) return;
    const confirmDelete = window.confirm(
      `Deseja realmente excluir o trabalho "${item.title}"? Esta ação removerá a foto da vitrine pública.`
    );
    if (!confirmDelete) return;

    setActionError(null);
    setActionSuccess(null);
    setProcessingId(item.id);

    const res = await deletePortfolioItemAction(tenantSlug, item.id);

    if (!res.success) {
      setActionError(res.error || 'Erro ao excluir trabalho.');
    } else {
      // Remove do storage para evitar arquivos órfãos
      if (item.image_url) {
        deleteEntityImageAction(tenantSlug, item.image_url).catch(() => {});
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setActionSuccess('Trabalho removido do portfólio com sucesso.');
      startTransition(() => {
        router.refresh();
      });
    }
    setProcessingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Banner Superior */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-[#EADBCE] dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FAF0ED] text-[#BD7165]">
              {tenantName}
            </span>
            <span className="text-xs text-zinc-500">Vitrine Digital Pública</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#2C1810] dark:text-zinc-50">
            Portfólio de Trabalhos
          </h1>
          <p className="text-sm text-[#7D6B65] dark:text-zinc-400 mt-0.5">
            Gerencie os resultados de procedimentos exibidos no carrossel da página pública com consentimento seguro.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <a
            href={`/p/${tenantSlug}#portfolio`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl bg-white dark:bg-zinc-900 border border-[#EADBCE] dark:border-zinc-800 text-xs font-semibold text-[#2C1810] dark:text-zinc-200 hover:bg-[#FAF0EC] transition-all shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#BD7165]" />
            <span>Ver Vitrine Pública</span>
          </a>

          {canManage && (
            <Button
              onClick={handleOpenCreate}
              className="shadow-sm h-10 px-4 bg-[#BD7165] hover:bg-[#a65f54] text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Trabalho
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <ActionFeedbackAlert
          error={actionError}
          tenantSlug={tenantSlug}
          onDismiss={() => setActionError(null)}
        />
      )}

      {actionSuccess && (
        <div className="p-3 rounded-xl text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
          <span>{actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="font-bold hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cards Indicadores */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white/80 dark:bg-zinc-900/80 border-[#EADBCE] dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-500">Total de Trabalhos</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-[#2C1810] dark:text-zinc-100">
                {items.length}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FAF0ED] text-[#BD7165] flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-zinc-900/80 border-[#EADBCE] dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-500">Publicados no Carrossel</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-emerald-600">
                {activeCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/80 dark:bg-zinc-900/80 border-[#EADBCE] dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-500">Ocultos / Sem Consentimento</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-amber-600">
                {draftCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <EyeOff className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-[#EADBCE] dark:border-zinc-800 shadow-2xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por título, serviço ou descrição..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 hidden sm:inline">Categoria:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#BD7165]"
          >
            <option value="ALL">Todas as Categorias</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid de Trabalhos do Portfólio */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-dashed border-[#EADBCE] dark:border-zinc-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF0ED] text-[#BD7165] mx-auto flex items-center justify-center">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#2C1810] dark:text-zinc-100">
            Nenhum trabalho encontrado
          </h3>
          <p className="text-xs text-[#7D6B65] dark:text-zinc-400 max-w-md mx-auto">
            {searchTerm || selectedCategory !== 'ALL'
              ? 'Tente ajustar os filtros ou o termo de busca.'
              : 'Adicione suas primeiras fotografias de procedimentos para encantar clientes na vitrine pública online.'}
          </p>
          {canManage && (
            <Button
              onClick={handleOpenCreate}
              className="mt-2 bg-[#BD7165] hover:bg-[#a65f54] text-white text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Publicar Primeiro Trabalho
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item) => {
            const isAuthorized = item.client_consent === true;
            const isPubliclyVisible = item.is_active && isAuthorized;

            return (
              <Card
                key={item.id}
                className="overflow-hidden border-[#EADBCE] dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-between shadow-2xs hover:shadow-md transition-all group"
              >
                <div>
                  {/* Foto do Trabalho */}
                  <div className="relative w-full h-48 bg-[#F5EDE8] overflow-hidden">
                    <Image
                      src={item.image_url}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 300px"
                    />

                    {/* Badge de Status / Consentimento */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
                      {isPubliclyVisible ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-xs">
                          <Eye className="w-3 h-3" />
                          <span>No Carrossel</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-600 text-white shadow-xs">
                          <EyeOff className="w-3 h-3" />
                          <span>Oculto</span>
                        </span>
                      )}

                      {!isAuthorized && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white shadow-xs" title="Sem consentimento do cliente (LGPD)">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Sem Consentimento</span>
                        </span>
                      )}
                    </div>

                    {/* Ordem */}
                    <div className="absolute top-2 right-2 z-10">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-black/60 text-white backdrop-blur-xs">
                        <ArrowUpDown className="w-2.5 h-2.5" />
                        <span>#{item.sort_order}</span>
                      </span>
                    </div>
                  </div>

                  {/* Informações */}
                  <div className="p-4 space-y-2">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#BD7165]">
                        {item.category || 'Geral'}
                      </span>
                      <h3 className="text-sm font-bold text-[#2C1810] dark:text-zinc-100 line-clamp-1">
                        {item.title}
                      </h3>
                    </div>

                    {item.service_name && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Serviço: <strong className="text-[#2C1810] dark:text-zinc-200">{item.service_name}</strong>
                      </p>
                    )}

                    {item.description && (
                      <p className="text-xs text-[#7D6B65] dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    <div className="pt-2 border-t border-[#F5EDE8] dark:border-zinc-800 flex items-center justify-between text-[11px] text-[#7D6B65]">
                      <span className="inline-flex items-center gap-1">
                        <ShieldCheck className={`w-3.5 h-3.5 ${isAuthorized ? 'text-emerald-600' : 'text-red-500'}`} />
                        <span>{isAuthorized ? 'LGPD Autorizado' : 'Não Autorizado'}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                {canManage && (
                  <div className="p-3 bg-[#FAF6F3]/60 dark:bg-zinc-800/50 border-t border-[#EADBCE] dark:border-zinc-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={processingId === item.id}
                      onClick={() => handleToggleStatus(item)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                        item.is_active
                          ? 'text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-950/40'
                          : 'text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-950/40'
                      }`}
                    >
                      {item.is_active ? 'Ocultar' : 'Publicar'}
                    </button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEdit(item)}
                        className="h-7 w-7 p-0 text-zinc-600 dark:text-zinc-300 hover:text-[#BD7165]"
                        title="Editar trabalho"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={processingId === item.id}
                        onClick={() => handleDelete(item)}
                        className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        title="Excluir trabalho"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro / Edição com chave única para remontagem limpa */}
      {modalOpen && (
        <PortfolioFormModal
          key={editingItem ? `edit-${editingItem.id}` : 'create-new'}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingItem(null);
          }}
          tenantSlug={tenantSlug}
          services={services}
          itemToEdit={editingItem}
          defaultSortOrder={items.length}
          onSaved={(savedItem) => {
            setItems((prev) => {
              const exists = prev.some((i) => i.id === savedItem.id);
              if (exists) {
                return prev.map((i) => (i.id === savedItem.id ? savedItem : i));
              }
              return [savedItem, ...prev];
            });
            setActionSuccess('Trabalho salvo com sucesso no portfólio!');
            setModalOpen(false);
            setEditingItem(null);
            startTransition(() => {
              router.refresh();
            });
          }}
        />
      )}
    </div>
  );
}
