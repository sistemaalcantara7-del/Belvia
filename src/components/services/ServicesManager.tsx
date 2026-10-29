'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Service, DEFAULT_SERVICE_CATEGORIES } from '@/types/services';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ServiceFormModal } from './ServiceFormModal';
import { toggleServiceStatusAction } from '@/lib/actions/services';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import {
  Plus,
  Search,
  Filter,
  Clock,
  Coffee,
  CheckCircle2,
  XCircle,
  Edit2,
  Power,
  Sparkles,
} from 'lucide-react';

interface ServicesManagerProps {
  initialServices: Service[];
  tenantSlug: string;
  tenantName: string;
  userRole: string;
}

export function ServicesManager({
  initialServices,
  tenantSlug,
  tenantName,
  userRole,
}: ServicesManagerProps) {
  const [services, setServices] = useState<Service[]>(initialServices);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const canManage = userRole === 'owner' || userRole === 'admin';

  // Métricas rápidas
  const totalCount = services.length;
  const activeCount = services.filter((s) => s.status === 'active').length;
  const inactiveCount = totalCount - activeCount;

  // Filtragem combinada
  const filteredServices = services.filter((service) => {
    const matchesSearch =
      service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (service.description && service.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategory === 'ALL' || service.category === selectedCategory;

    const matchesStatus =
      selectedStatus === 'ALL' || service.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  async function handleToggleStatus(service: Service) {
    if (!canManage) return;
    setActionError(null);
    setUpdatingId(service.id);

    const nextStatus = service.status === 'active' ? 'inactive' : 'active';
    const res = await toggleServiceStatusAction(tenantSlug, service.id, service.status);

    if (res?.error) {
      setActionError(res.error);
    } else if (res?.success) {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, status: nextStatus } : s))
      );
    }
    setUpdatingId(null);
  }

  function handleOpenCreate() {
    setEditingService(null);
    setModalOpen(true);
  }

  function handleOpenEdit(service: Service) {
    setEditingService(service);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Resumo */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
              {tenantName}
            </span>
            <span className="text-xs text-zinc-500">Catálogo Oficial</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Catálogo de Serviços
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Gerencie os procedimentos, durações, tempos de preparação e valores da sua clínica.
          </p>
        </div>

        {canManage && (
          <Button onClick={handleOpenCreate} className="shadow-md h-10 px-4 self-start md:self-auto">
            <Plus className="w-4 h-4 mr-2" />
            Novo Serviço
          </Button>
        )}
      </div>

      {actionError && (
        <ActionFeedbackAlert
          error={actionError}
          tenantSlug={tenantSlug}
          onDismiss={() => setActionError(null)}
        />
      )}

      {/* Cards Indicadores */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total Cadastrado</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">
                {totalCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <Sparkles className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ativos na Agenda</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">
                {activeCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Desativados</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">
                {inactiveCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500">
              <XCircle className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome ou palavras da descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-10 pl-3 pr-8 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="ALL">Todas as Categorias</option>
              {DEFAULT_SERVICE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-10 pl-3 pr-8 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="ALL">Todos os Status</option>
              <option value="active">Somente Ativos</option>
              <option value="inactive">Somente Inativos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Serviços */}
      {filteredServices.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-zinc-500 dark:text-zinc-400">
          <Filter className="w-8 h-8 mx-auto mb-3 text-zinc-400 opacity-60" />
          <p className="font-medium text-base text-zinc-800 dark:text-zinc-200">
            Nenhum serviço encontrado.
          </p>
          <p className="text-xs mt-1">
            {searchTerm || selectedCategory !== 'ALL' || selectedStatus !== 'ALL'
              ? 'Tente ajustar os filtros ou o termo de busca.'
              : 'Cadastre o primeiro serviço para começar a usar a agenda.'}
          </p>
          {canManage && (
            <Button onClick={handleOpenCreate} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-1.5" />
              Cadastrar Agora
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => {
            const isActive = service.status === 'active';
            const formattedPrice = new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(service.price);

            return (
              <Card
                key={service.id}
                className={`transition-all hover:shadow-md flex flex-col justify-between ${
                  !isActive ? 'opacity-60 bg-zinc-50 dark:bg-zinc-950/50' : 'bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {service.category}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Ativo
                        </>
                      ) : (
                        'Inativo'
                      )}
                    </span>
                  </div>

                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-snug">
                    {service.name}
                  </h3>

                  {service.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {service.description}
                    </p>
                  )}

                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1" title="Duração do procedimento">
                        <Clock className="w-3.5 h-3.5 text-rose-500" />
                        {service.duration_minutes} min
                      </span>
                      {service.break_minutes > 0 && (
                        <span className="flex items-center gap-1" title="Intervalo para higienização">
                          <Coffee className="w-3.5 h-3.5 text-amber-500" />
                          +{service.break_minutes} min
                        </span>
                      )}
                    </div>
                    <span className="text-base font-extrabold text-zinc-900 dark:text-zinc-50">
                      {formattedPrice}
                    </span>
                  </div>
                </div>

                {canManage && (
                  <div className="px-5 py-3 bg-zinc-50/80 dark:bg-zinc-950/60 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(service)}
                      disabled={updatingId === service.id}
                      className="text-xs h-8 text-zinc-600 hover:text-zinc-900"
                      title={isActive ? 'Desativar da agenda' : 'Ativar na agenda'}
                    >
                      <Power className={`w-3.5 h-3.5 mr-1 ${isActive ? 'text-amber-600' : 'text-emerald-600'}`} />
                      {isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(service)}
                      className="text-xs h-8"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                      Editar
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Formulário */}
      <ServiceFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantSlug={tenantSlug}
        serviceToEdit={editingService}
        onSaved={(savedService) => {
          // Atualiza o estado local imediatamente sem interrupção de streaming HTTP/2
          setServices((prev) => {
            const exists = prev.some((s) => s.id === savedService.id);
            if (exists) {
              return prev.map((s) => (s.id === savedService.id ? savedService : s));
            }
            return [savedService, ...prev];
          });
          // Sincroniza o cache do servidor em background via RSC sem forçar hard reload
          startTransition(() => {
            router.refresh();
          });
        }}
      />
    </div>
  );
}
