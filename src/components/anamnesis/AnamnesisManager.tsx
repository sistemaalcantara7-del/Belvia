'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AnamnesisForm, AnamnesisTemplate } from '@/types/anamnesis';
import { Client } from '@/types/clients';
import { Professional } from '@/types/professionals';
import { Plus, Search, FileText, CheckCircle2, Clock, History, AlertTriangle, ShieldCheck, User, Eye, Lock } from 'lucide-react';
import { AnamnesisFormModal } from './AnamnesisFormModal';
import { AnamnesisDetailModal } from './AnamnesisDetailModal';

interface AnamnesisManagerProps {
  tenantSlug: string;
  initialForms: AnamnesisForm[];
  templates: AnamnesisTemplate[];
  clients: Client[];
  professionals: Professional[];
  currentRole: string;
}

export function AnamnesisManager({
  tenantSlug,
  initialForms,
  templates,
  clients,
  professionals,
  currentRole,
}: AnamnesisManagerProps) {
  const [forms] = useState<AnamnesisForm[]>(initialForms);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState('all');
  
  // Modais
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState<AnamnesisForm | null>(null);

  const isReceptionist = currentRole === 'receptionist';

  // Filtros
  const filteredForms = forms.filter((f) => {
    const matchesSearch =
      searchTerm === '' ||
      f.client?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (f.allergies && f.allergies.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (f.treatment_goal && f.treatment_goal.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesTemplate =
      selectedTemplateFilter === 'all' || f.template_id === selectedTemplateFilter || f.template?.title === selectedTemplateFilter;

    return matchesSearch && matchesTemplate;
  });

  // Indicadores
  const totalCompleted = forms.filter(f => f.status === 'completed').length;
  const clientsWithAnamnesisCount = new Set(forms.map(f => f.client_id)).size;
  const pendingClientsCount = Math.max(0, clients.length - clientsWithAnamnesisCount);
  const hasAllergiesCount = forms.filter(f => f.has_allergies_alert || (f.allergies && f.allergies.trim().length > 0)).length;

  return (
    <div className="space-y-6">
      {/* Header com Ação Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <FileText className="w-6 h-6 text-rose-600" />
            Fichas de Anamnese
            {isReceptionist && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-normal">
                Modo Triagem Administrativa
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            {isReceptionist
              ? 'Status de preenchimento, validade e alertas de triagem (conteúdo clínico confidencial preservado sob LGPD).'
              : 'Prontuários de saúde, histórico clínico e termos LGPD integrados aos atendimentos.'}
          </p>
        </div>

        <Button
          onClick={() => {
            setEditingForm(null);
            setIsCreateOpen(true);
          }}
          className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Preencher Nova Anamnese
        </Button>
      </div>

      {/* Indicadores Clínicos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Fichas Preenchidas</p>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{totalCompleted}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Clientes sem Anamnese</p>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{pendingClientsCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Com Alerta de Alergia</p>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{hasAllergiesCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Segregação LGPD</p>
              <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {isReceptionist ? 'Acesso Restrito' : 'Auditado'}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="border-zinc-200 dark:border-zinc-800">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={isReceptionist ? "Buscar cliente por nome..." : "Buscar por nome do cliente, alergia ou objetivo..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={selectedTemplateFilter}
              onChange={(e) => setSelectedTemplateFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <option value="all">Todos os Modelos</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Listagem de Fichas de Anamnese */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredForms.map((form) => (
          <Card
            key={form.id}
            className={`border-zinc-200 dark:border-zinc-800 transition-all shadow-sm flex flex-col justify-between ${
              isReceptionist
                ? 'cursor-default'
                : 'hover:border-rose-300 dark:hover:border-rose-900/60 cursor-pointer'
            }`}
            onClick={() => {
              if (!isReceptionist) {
                setSelectedDetailId(form.id);
              }
            }}
          >
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-rose-700 dark:text-rose-300 font-semibold text-xs">
                      {form.client?.full_name?.charAt(0) || 'C'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 line-clamp-1">
                        {form.client?.full_name || 'Cliente'}
                      </h3>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {form.template?.title || 'Ficha de Anamnese'}
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0">
                    v{form.version}
                  </span>
                </div>

                {/* Exibição condicional de Alergias e Condições */}
                <div className="mt-3 space-y-1.5 text-xs">
                  {isReceptionist ? (
                    // MODO RECEPÇÃO: Alerta binário sem detalhes clínicos confidenciais
                    form.has_allergies_alert ? (
                      <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span><strong>Alerta de Triagem:</strong> Possui restrições registradas. Avise o profissional.</span>
                      </div>
                    ) : (
                      <p className="text-zinc-500 italic">Sem restrições declaradas.</p>
                    )
                  ) : (
                    // MODO CLÍNICO (Owner / Admin / Professional): Detalhes completos
                    <>
                      {form.allergies && form.allergies.trim() !== '' ? (
                        <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span className="line-clamp-2"><strong>Alergias:</strong> {form.allergies}</span>
                        </div>
                      ) : (
                        <p className="text-zinc-500 italic">Sem alergias relatadas.</p>
                      )}

                      {form.treatment_goal && (
                        <p className="text-zinc-600 dark:text-zinc-400 line-clamp-1">
                          <strong>Objetivo:</strong> {form.treatment_goal}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Rodapé do Card */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-zinc-400" />
                  {form.professional?.full_name || 'Equipe'}
                </span>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <History className="w-3 h-3 text-zinc-400" />
                    {new Date(form.filled_at).toLocaleDateString('pt-BR')}
                  </span>

                  {!isReceptionist ? (
                    <span className="text-rose-600 dark:text-rose-400 flex items-center gap-0.5 font-medium">
                      <Eye className="w-3 h-3" />
                      Ver
                    </span>
                  ) : (
                    <span className="text-zinc-400 flex items-center gap-0.5">
                      <Lock className="w-3 h-3" />
                      Restrito
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredForms.length === 0 && (
          <div className="col-span-full text-center py-12 bg-white dark:bg-zinc-900 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
            <FileText className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
            <h3 className="font-semibold text-zinc-800 dark:text-zinc-200">Nenhuma ficha de anamnese encontrada</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1">
              Cadastre e preencha a primeira avaliação clínica dos seus clientes de forma padronizada e segura.
            </p>
          </div>
        )}
      </div>

      {/* Modal de Criação / Nova Versão */}
      {isCreateOpen && (
        <AnamnesisFormModal
          tenantSlug={tenantSlug}
          templates={templates}
          clients={clients}
          professionals={professionals}
          parentForm={editingForm}
          onClose={() => {
            setIsCreateOpen(false);
            setEditingForm(null);
          }}
        />
      )}

      {/* Modal de Visualização Detalhada (Apenas perfis clínicos autorizados) */}
      {selectedDetailId && !isReceptionist && (
        <AnamnesisDetailModal
          tenantSlug={tenantSlug}
          formId={selectedDetailId}
          currentRole={currentRole}
          onClose={() => setSelectedDetailId(null)}
          onUpdateVersion={(form) => {
            setSelectedDetailId(null);
            setEditingForm(form);
            setIsCreateOpen(true);
          }}
        />
      )}
    </div>
  );
}
