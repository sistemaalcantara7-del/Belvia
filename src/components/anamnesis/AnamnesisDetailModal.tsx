'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AnamnesisForm } from '@/types/anamnesis';
import { getAnamnesisFormDetail } from '@/lib/actions/anamnesis';
import { X, ShieldCheck, AlertTriangle, Clock, History, FileText, User, Loader2 } from 'lucide-react';

interface AnamnesisDetailModalProps {
  tenantSlug: string;
  formId: string;
  currentRole: string;
  onClose: () => void;
  onUpdateVersion: (form: AnamnesisForm) => void;
}

export function AnamnesisDetailModal({
  tenantSlug,
  formId,
  currentRole,
  onClose,
  onUpdateVersion,
}: AnamnesisDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<AnamnesisForm | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDetail() {
      setLoading(true);
      const res = await getAnamnesisFormDetail(tenantSlug, formId);
      setLoading(false);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setForm(res.data);
      }
    }
    loadDetail();
  }, [tenantSlug, formId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl max-w-2xl w-full my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                <FileText className="w-5 h-5 text-rose-600" />
                Prontuário de Anamnese
              </h2>
              {form && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                  v{form.version}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Registro clínico individual sob proteção da LGPD.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="overflow-y-auto p-5 space-y-6 flex-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin text-rose-600" />
              <span className="text-xs">Carregando dados protegidos...</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-900 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {form && !loading && (
            <>
              {/* Metadados e Titular */}
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-rose-600" />
                    {form.client?.full_name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    WhatsApp: {form.client?.whatsapp || 'Não informado'} | Nascimento: {form.client?.birth_date ? new Date(form.client.birth_date).toLocaleDateString('pt-BR') : 'Não informado'}
                  </p>
                </div>

                <div className="text-xs text-zinc-500 dark:text-zinc-400 text-left sm:text-right">
                  <p><strong>Modelo:</strong> {form.template?.title} ({form.template?.category})</p>
                  <p><strong>Responsável:</strong> {form.professional?.full_name || 'Equipe'}</p>
                  <p className="flex items-center gap-1 sm:justify-end mt-1">
                    <Clock className="w-3.5 h-3.5 text-zinc-400" />
                    {new Date(form.filled_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              {/* Alergias e Contraindicações (Destaque Vermelho se houver) */}
              {form.allergies && form.allergies.trim() !== '' ? (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    Alergias e Contraindicações Clínicas
                  </div>
                  <p className="text-sm">{form.allergies}</p>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Nenhuma alergia ou contraindicação relatada pelo cliente.</span>
                </div>
              )}

              {/* Informações Clínicas Estruturadas */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600">
                  Condições e Medicamentos
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Medicamentos em uso:</span>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{form.medications || 'Nenhum medicamento informado.'}</p>
                  </div>

                  <div className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Condições relevantes:</span>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{form.relevant_conditions || 'Nenhuma condição especial informada.'}</p>
                  </div>

                  <div className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 col-span-full">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Histórico de saúde / Cirurgias:</span>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{form.health_history || 'Sem cirurgias ou histórico prévio.'}</p>
                  </div>

                  <div className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 col-span-full">
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">Objetivo / Queixa Principal:</span>
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{form.treatment_goal || 'Não especificado.'}</p>
                  </div>

                  {form.professional_notes && (
                    <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 col-span-full">
                      <span className="font-semibold text-amber-800 dark:text-amber-300">Observações Clínicas do Profissional:</span>
                      <p className="mt-1 text-zinc-700 dark:text-zinc-300">{form.professional_notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Respostas do Questionário */}
              {form.answers && form.answers.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600">
                    Respostas do Questionário ({form.template?.title})
                  </h4>

                  <div className="space-y-2">
                    {form.answers.map((ans) => (
                      <div key={ans.id} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-100 dark:border-zinc-800 text-xs">
                        <p className="font-medium text-zinc-800 dark:text-zinc-200">
                          {ans.question?.question_text || 'Pergunta'}
                        </p>
                        <p className="mt-1 text-zinc-600 dark:text-zinc-400 font-semibold">
                          {ans.answer_text || (ans.answer_json ? JSON.stringify(ans.answer_json) : 'Não respondido')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Termo e Consentimento LGPD */}
              {form.legal_consent && (
                <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Registro de Base Legal & Consentimento
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase">
                      {form.legal_consent.legal_basis}
                    </span>
                  </div>

                  <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                    {form.legal_consent.consent_terms_text}
                  </p>

                  <div className="text-[10px] text-zinc-400 pt-1 border-t border-zinc-200 dark:border-zinc-700 flex justify-between">
                    <span>Consentimento formalizado em: {new Date(form.legal_consent.accepted_at).toLocaleString('pt-BR')}</span>
                    <span>Status: Válido e Verificável</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>

          {form && ['owner', 'admin', 'receptionist', 'professional'].includes(currentRole) && (
            <Button
              onClick={() => onUpdateVersion(form)}
              className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 text-xs"
            >
              <History className="w-3.5 h-3.5" />
              Criar Nova Versão (Reavaliação)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
