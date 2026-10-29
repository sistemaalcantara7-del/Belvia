'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Professional, DAYS_OF_WEEK } from '@/types/professionals';
import { Service } from '@/types/services';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ProfessionalFormModal } from './ProfessionalFormModal';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import { toggleProfessionalStatusAction } from '@/lib/actions/professionals';
import { maskPhone, buildWhatsAppLink } from '@/lib/utils/masks';
import {
  UserPlus,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Edit2,
  Power,
  Clock,
  Scissors,
  Filter,
  Sparkles,
  AlertTriangle,
  ArrowUpRight,
  Lock,
} from 'lucide-react';

interface ProfessionalsManagerProps {
  initialProfessionals: Professional[];
  availableServices: Service[];
  tenantSlug: string;
  tenantName: string;
  userRole: string;
  planName: string;
  maxProfessionals: number;
}

export function ProfessionalsManager({
  initialProfessionals,
  availableServices,
  tenantSlug,
  tenantName,
  userRole,
  planName,
  maxProfessionals,
}: ProfessionalsManagerProps) {
  const [professionals, setProfessionals] = useState<Professional[]>(initialProfessionals);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Modais
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState<Professional | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Apenas owner ou admin podem gerenciar
  const canManage = userRole === 'owner' || userRole === 'admin';

  // Métricas
  const totalCount = professionals.length;
  const activeCount = professionals.filter((p) => p.status === 'active').length;
  const inactiveCount = totalCount - activeCount;
  const isAtLimit = activeCount >= maxProfessionals;

  // Lista de especialidades únicas para filtro
  const specialties = Array.from(new Set(professionals.map((p) => p.specialty).filter(Boolean)));

  // Filtragem
  const filteredProfessionals = professionals.filter((prof) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      prof.full_name.toLowerCase().includes(term) ||
      prof.specialty.toLowerCase().includes(term) ||
      (prof.email && prof.email.toLowerCase().includes(term));

    const matchesSpecialty =
      selectedSpecialty === 'ALL' || prof.specialty === selectedSpecialty;

    const matchesStatus =
      selectedStatus === 'ALL' || prof.status === selectedStatus;

    return matchesSearch && matchesSpecialty && matchesStatus;
  });

  async function handleToggleStatus(prof: Professional) {
    if (!canManage) return;
    setActionError(null);
    setUpdatingId(prof.id);

    const nextStatus = prof.status === 'active' ? 'inactive' : 'active';
    const res = await toggleProfessionalStatusAction(tenantSlug, prof.id, prof.status);

    if (res?.error) {
      setActionError(res.error);
    } else if (res?.success) {
      setProfessionals((prev) =>
        prev.map((p) => (p.id === prof.id ? { ...p, status: nextStatus } : p))
      );
    }
    setUpdatingId(null);
  }

  function handleOpenCreate() {
    setActionError(null);
    if (isAtLimit) {
      setActionError(
        `Limite do plano ${planName} atingido (${activeCount}/${maxProfessionals} vagas ativas ocupadas). Faça upgrade para o Plano Inteligente para adicionar mais profissionais.`
      );
      return;
    }
    setEditingProfessional(null);
    setModalOpen(true);
  }

  function handleOpenEdit(prof: Professional) {
    setActionError(null);
    setEditingProfessional(prof);
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
            <span className="text-xs text-zinc-500">
              Plano {planName} (Capacidade: {activeCount}/{maxProfessionals} profissionais ativos)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            Equipe & Profissionais
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            Cadastre os especialistas do seu espaço, configure serviços habilitados e turnos habituais.
          </p>
        </div>

        {canManage && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 self-start md:self-auto">
            {isAtLimit && (
              <Link
                href={`/${tenantSlug}/configuracoes`}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Liberar mais vagas
                <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
              </Link>
            )}
            <Button
              onClick={handleOpenCreate}
              disabled={isAtLimit}
              variant={isAtLimit ? 'outline' : 'default'}
              className={`shadow-md h-10 px-4 transition-all ${
                isAtLimit
                  ? 'border-amber-300 bg-amber-50/50 text-amber-800 hover:bg-amber-100/70 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300 cursor-not-allowed opacity-80'
                  : ''
              }`}
              title={
                isAtLimit
                  ? `Limite de ${maxProfessionals} profissional(is) ativos atingido no plano ${planName}. Faça upgrade para adicionar mais vagas.`
                  : 'Cadastrar novo profissional'
              }
            >
              {isAtLimit ? (
                <>
                  <Lock className="w-4 h-4 mr-2 text-amber-600 dark:text-amber-400" />
                  Limite Atingido ({activeCount}/{maxProfessionals})
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Novo Profissional
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Banner de Aviso de Limite do Plano */}
      {isAtLimit && (
        <div className="p-4 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50/20 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-transparent dark:border-amber-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                  Todas as {maxProfessionals} {maxProfessionals === 1 ? 'vaga' : 'vagas'} do seu plano estão ativas
                </h4>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                  Plano {planName}
                </span>
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-300/80 mt-1 max-w-2xl leading-relaxed">
                Você pode continuar editando, visualizando ou desativando qualquer membro da equipe. Para adicionar novos especialistas e habilitar múltiplos atendimentos simultâneos, faça upgrade para o <strong>Plano Inteligente (até 10 profissionais)</strong>.
              </p>
            </div>
          </div>

          <Link
            href={`/${tenantSlug}/configuracoes`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors shrink-0 self-end md:self-auto"
          >
            Conhecer Plano Inteligente
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      )}

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
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Total na Equipe</p>
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
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ativos na Agenda</p>
              <h3 className="text-xl sm:text-2xl font-bold mt-1 text-zinc-900 dark:text-zinc-100">
                {activeCount} <span className="text-xs text-zinc-400 font-normal">/ {maxProfessionals}</span>
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
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Pausados / Inativos</p>
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
            placeholder="Buscar por nome, especialidade ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <div className="flex gap-2">
          {specialties.length > 0 && (
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="h-10 pl-3 pr-8 text-xs font-medium border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="ALL">Todas Especialidades</option>
              {specialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>
          )}

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

      {/* Lista de Cards de Profissionais */}
      {filteredProfessionals.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-zinc-500 dark:text-zinc-400">
          <Filter className="w-8 h-8 mx-auto mb-3 text-zinc-400 opacity-60" />
          <p className="font-medium text-base text-zinc-800 dark:text-zinc-200">
            Nenhum profissional encontrado.
          </p>
          <p className="text-xs mt-1">
            {searchTerm || selectedSpecialty !== 'ALL' || selectedStatus !== 'ALL'
              ? 'Ajuste os filtros para encontrar os membros da equipe.'
              : 'Cadastre o primeiro profissional para habilitar a agenda.'}
          </p>
          {canManage && (
            <Button onClick={handleOpenCreate} variant="outline" className="mt-4">
              <UserPlus className="w-4 h-4 mr-1.5" />
              Cadastrar Agora
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProfessionals.map((prof) => {
            const isActive = prof.status === 'active';
            const waLink = buildWhatsAppLink(prof.whatsapp, `Olá, ${prof.full_name}!`);

            // Serviços associados
            const assignedServices = (availableServices || []).filter((s) =>
              (prof.service_ids || []).includes(s.id)
            );

            // Dias ativos de atendimento
            const activeDays = (prof.schedules || [])
              .filter((s) => s.is_active)
              .map((s) => DAYS_OF_WEEK.find((d) => d.value === s.day_of_week)?.label.slice(0, 3))
              .filter(Boolean);

            return (
              <Card
                key={prof.id}
                className={`transition-all hover:shadow-md flex flex-col justify-between ${
                  !isActive ? 'opacity-60 bg-zinc-50 dark:bg-zinc-950/50' : 'bg-white dark:bg-zinc-900'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                      {prof.specialty}
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
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          Ativo
                        </>
                      ) : (
                        'Pausado'
                      )}
                    </span>
                  </div>

                  <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-snug">
                    {prof.full_name}
                  </h3>

                  {prof.bio && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                      {prof.bio}
                    </p>
                  )}

                  {/* Serviços Habilitados */}
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                    <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1 mb-1.5">
                      <Scissors className="w-3 h-3 text-rose-500" />
                      Serviços ({assignedServices.length})
                    </span>
                    {assignedServices.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {assignedServices.slice(0, 3).map((srv) => (
                          <span
                            key={srv.id}
                            className="text-[10px] px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded"
                          >
                            {srv.name}
                          </span>
                        ))}
                        {assignedServices.length > 3 && (
                          <span className="text-[10px] px-1.5 py-0.5 text-zinc-400">
                            +{assignedServices.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-400 italic">Nenhum serviço vinculado</p>
                    )}
                  </div>

                  {/* Dias de Atendimento */}
                  <div className="mt-2.5">
                    <span className="text-[11px] font-medium text-zinc-400 flex items-center gap-1 mb-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      Expediente Semanal
                    </span>
                    {activeDays.length > 0 ? (
                      <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium">
                        {activeDays.join(', ')}
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-400 italic">Sem grade cadastrada</p>
                    )}
                  </div>

                  {/* WhatsApp */}
                  {prof.whatsapp && (
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-zinc-500">{maskPhone(prof.whatsapp)}</span>
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-1"
                        >
                          <MessageSquare className="w-3 h-3" />
                          WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {canManage && (
                  <div className="px-5 py-3 bg-zinc-50/80 dark:bg-zinc-950/60 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(prof)}
                      disabled={updatingId === prof.id}
                      className="text-xs h-8 text-zinc-600 hover:text-zinc-900"
                      title={isActive ? 'Pausar agendamentos' : 'Ativar agendamentos'}
                    >
                      <Power className={`w-3.5 h-3.5 mr-1 ${isActive ? 'text-amber-600' : 'text-emerald-600'}`} />
                      {isActive ? 'Pausar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(prof)}
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
      <ProfessionalFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tenantSlug={tenantSlug}
        professionalToEdit={editingProfessional}
        availableServices={availableServices}
        onSaved={(savedProf) => {
          setProfessionals((prev) => {
            const exists = prev.some((p) => p.id === savedProf.id);
            if (exists) {
              return prev.map((p) => (p.id === savedProf.id ? savedProf : p));
            }
            return [savedProf, ...prev];
          });
          startTransition(() => {
            router.refresh();
          });
        }}
      />
    </div>
  );
}
