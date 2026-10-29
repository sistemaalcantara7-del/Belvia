'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Client } from '@/types/clients';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClientFormModal } from './ClientFormModal';
import { ClientDetailModal } from './ClientDetailModal';
import { toggleClientStatusAction } from '@/lib/actions/clients';
import { maskPhone, maskCPFPartial, buildWhatsAppLink } from '@/lib/utils/masks';
import {
  UserPlus,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Edit2,
  Power,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  History,
} from 'lucide-react';

interface ClientsManagerProps {
  initialClients: Client[];
  tenantSlug: string;
  tenantName: string;
  userRole: string;
}

const ITEMS_PER_PAGE = 8;

export function ClientsManager({
  initialClients,
  tenantSlug,
  tenantName,
  userRole,
}: ClientsManagerProps) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Modais
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Permissão: owner, admin e receptionist podem criar e editar
  const canManage = ['owner', 'admin', 'receptionist'].includes(userRole);

  // Métricas
  const totalCount = clients.length;
  const activeCount = clients.filter((c) => c.status === 'active').length;
  const inactiveCount = totalCount - activeCount;

  // Filtragem
  const filteredClients = clients.filter((client) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      client.full_name.toLowerCase().includes(term) ||
      (client.whatsapp && client.whatsapp.includes(term)) ||
      (client.phone && client.phone.includes(term)) ||
      (client.email && client.email.toLowerCase().includes(term));

    const matchesStatus =
      selectedStatus === 'ALL' || client.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  // Paginação
  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE) || 1;
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  async function handleToggleStatus(client: Client) {
    if (!canManage) return;
    setUpdatingId(client.id);

    const nextStatus = client.status === 'active' ? 'inactive' : 'active';
    const res = await toggleClientStatusAction(tenantSlug, client.id, client.status);

    if (res?.success) {
      setClients((prev) =>
        prev.map((c) => (c.id === client.id ? { ...c, status: nextStatus } : c))
      );
    }
    setUpdatingId(null);
  }

  function handleOpenCreate() {
    setEditingClient(null);
    setFormModalOpen(true);
  }

  function handleOpenEdit(client: Client) {
    setEditingClient(client);
    setFormModalOpen(true);
  }

  function handleOpenDetail(client: Client) {
    setViewingClient(client);
    setDetailModalOpen(true);
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
            <span className="text-xs text-zinc-500">Base de Clientes</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Cadastro de Clientes
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Gestão rápida de contatos, preferências e canais diretos de atendimento.
          </p>
        </div>

        {canManage && (
          <Button onClick={handleOpenCreate} className="shadow-md h-10 px-4 self-start md:self-auto">
            <UserPlus className="w-4 h-4 mr-2" />
            Novo Cliente
          </Button>
        )}
      </div>

      {/* Cards Indicadores */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total de Clientes</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">
                {totalCount}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 sm:p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ativos</p>
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
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Inativos</p>
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
            placeholder="Buscar por nome, WhatsApp, telefone ou e-mail..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setCurrentPage(1);
            }}
            className="h-10 pl-3 pr-8 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">Todos os Status</option>
            <option value="active">Somente Ativos</option>
            <option value="inactive">Somente Inativos</option>
          </select>
        </div>
      </div>

      {/* Lista / Cards de Clientes */}
      {filteredClients.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-zinc-500 dark:text-zinc-400">
          <Filter className="w-8 h-8 mx-auto mb-3 text-zinc-400 opacity-60" />
          <p className="font-medium text-base text-zinc-800 dark:text-zinc-200">
            Nenhum cliente encontrado.
          </p>
          <p className="text-xs mt-1">
            {searchTerm || selectedStatus !== 'ALL'
              ? 'Tente ajustar os filtros ou o termo pesquisado.'
              : 'Cadastre o primeiro cliente para iniciar os atendimentos.'}
          </p>
          {canManage && (
            <Button onClick={handleOpenCreate} variant="outline" className="mt-4">
              <UserPlus className="w-4 h-4 mr-1.5" />
              Cadastrar Agora
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedClients.map((client) => {
              const isActive = client.status === 'active';
              // Prioriza o WhatsApp; se ausente, recorre ao telefone alternativo
              const contactForWa = client.whatsapp || client.phone;
              const waLink = buildWhatsAppLink(contactForWa, `Olá, ${client.full_name}! Falamos da clínica.`);

              return (
                <Card
                  key={client.id}
                  className={`transition-all hover:shadow-md flex flex-col justify-between ${
                    !isActive ? 'opacity-60 bg-zinc-50 dark:bg-zinc-950/50' : 'bg-white dark:bg-zinc-900'
                  }`}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {isActive ? 'Ativo' : 'Inativo'}
                      </span>

                      <span className="text-[11px] font-mono text-zinc-400">
                        {maskCPFPartial(client.cpf)}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-zinc-900 dark:text-zinc-100 leading-snug">
                      {client.full_name}
                    </h3>

                    {/* Contatos */}
                    <div className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {client.whatsapp && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            {maskPhone(client.whatsapp)}
                          </span>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center text-[11px]"
                            >
                              WhatsApp &rarr;
                            </a>
                          )}
                        </div>
                      )}

                      {!client.whatsapp && client.phone && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-zinc-400" />
                            {maskPhone(client.phone)}
                          </span>
                          {waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center text-[11px]"
                            >
                              WhatsApp &rarr;
                            </a>
                          )}
                        </div>
                      )}

                      {client.email && (
                        <p className="truncate text-zinc-500 text-[11px]">
                          {client.email}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ações do Card */}
                  <div className="px-5 py-2.5 bg-zinc-50/80 dark:bg-zinc-950/60 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDetail(client)}
                        className="text-xs h-7 px-2 text-zinc-600 hover:text-zinc-900"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                        Ficha
                      </Button>
                      <Link
                        href={`/${tenantSlug}/clientes/${client.id}`}
                        className="inline-flex items-center text-xs h-7 px-2 font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-md transition-colors"
                        title="Abrir Histórico 360º"
                      >
                        <History className="w-3.5 h-3.5 mr-1" />
                        360º
                      </Link>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleStatus(client)}
                          disabled={updatingId === client.id}
                          className="text-xs h-7 px-2 text-zinc-500 hover:text-zinc-900"
                          title={isActive ? 'Desativar' : 'Ativar'}
                        >
                          <Power className={`w-3 h-3 ${isActive ? 'text-amber-600' : 'text-emerald-600'}`} />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(client)}
                          className="text-xs h-7 px-2"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Editar
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
              <span>
                Página {currentPage} de {totalPages} ({filteredClients.length} clientes)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-2"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Formulário */}
      <ClientFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        tenantSlug={tenantSlug}
        clientToEdit={editingClient}
        onSaved={(savedClient) => {
          setClients((prev) => {
            const exists = prev.some((c) => c.id === savedClient.id);
            if (exists) {
              return prev.map((c) => (c.id === savedClient.id ? savedClient : c));
            }
            return [savedClient, ...prev];
          });
          startTransition(() => {
            router.refresh();
          });
        }}
      />

      {/* Modal de Detalhes */}
      <ClientDetailModal
        client={viewingClient}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onEdit={(client) => handleOpenEdit(client)}
        canManage={canManage}
        tenantSlug={tenantSlug}
      />
    </div>
  );
}
