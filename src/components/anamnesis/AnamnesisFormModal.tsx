'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AnamnesisTemplate, AnamnesisForm, AnamnesisFormData, LgpdLegalBasis } from '@/types/anamnesis';
import { Client } from '@/types/clients';
import { Professional } from '@/types/professionals';
import { saveAnamnesisFormAction } from '@/lib/actions/anamnesis';
import { ActionFeedbackAlert } from '@/components/ui/ActionFeedbackAlert';
import { X, ShieldAlert, CheckSquare, Loader2, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface AnamnesisFormModalProps {
  tenantSlug: string;
  templates: AnamnesisTemplate[];
  clients: Client[];
  professionals: Professional[];
  parentForm?: AnamnesisForm | null;
  onClose: () => void;
}

export function AnamnesisFormModal({
  tenantSlug,
  templates,
  clients,
  professionals,
  parentForm,
  onClose,
}: AnamnesisFormModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados do formulário
  const [selectedClientId, setSelectedClientId] = useState(parentForm?.client_id || (clients[0]?.id || ''));
  const [selectedTemplateId, setSelectedTemplateId] = useState(parentForm?.template_id || (templates[0]?.id || ''));
  const [selectedProfId, setSelectedProfId] = useState(parentForm?.professional_id || (professionals[0]?.id || ''));

  // Campos estruturados
  const [healthHistory, setHealthHistory] = useState(parentForm?.health_history || '');
  const [allergies, setAllergies] = useState(parentForm?.allergies || '');
  const [medications, setMedications] = useState(parentForm?.medications || '');
  const [relevantConditions, setRelevantConditions] = useState(parentForm?.relevant_conditions || '');
  const [treatmentGoal, setTreatmentGoal] = useState(parentForm?.treatment_goal || '');
  const [professionalNotes, setProfessionalNotes] = useState(parentForm?.professional_notes || '');

  // Base Legal & Termos
  const [legalBasis, setLegalBasis] = useState<LgpdLegalBasis>('consent');
  const [isAccepted, setIsAccepted] = useState(true);

  // Respostas dinâmicas das perguntas do template
  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];
  const [dynamicAnswers, setDynamicAnswers] = useState<Record<string, { text?: string; json?: unknown }>>({});

  const handleTextAnswerChange = (questionId: string, val: string) => {
    setDynamicAnswers(prev => ({
      ...prev,
      [questionId]: { text: val }
    }));
  };

  const handleBooleanAnswerChange = (questionId: string, val: boolean) => {
    setDynamicAnswers(prev => ({
      ...prev,
      [questionId]: { text: val ? 'Sim' : 'Não', json: val }
    }));
  };

  const handleMultipleChoiceChange = (questionId: string, option: string, checked: boolean) => {
    setDynamicAnswers(prev => {
      const currentList = Array.isArray(prev[questionId]?.json) ? (prev[questionId]?.json as string[]) : [];
      let updated: string[];
      if (checked) {
        updated = [...currentList, option];
      } else {
        updated = currentList.filter(item => item !== option);
      }
      return {
        ...prev,
        [questionId]: { text: updated.join(', '), json: updated }
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      setError('Selecione o cliente atendido.');
      return;
    }
    if (!selectedTemplateId) {
      setError('Selecione o modelo da anamnese.');
      return;
    }
    if (!isAccepted) {
      setError('É obrigatório registrar o aceite do termo de consentimento/base legal.');
      return;
    }

    setLoading(true);
    setError(null);

    // Formata o array de respostas
    const answersArray = (currentTemplate?.questions || []).map(q => {
      const ans = dynamicAnswers[q.id];
      return {
        questionId: q.id,
        answerText: ans?.text || '',
        answerJson: ans?.json !== undefined ? ans?.json : null,
      };
    });

    const payload: AnamnesisFormData = {
      clientId: selectedClientId,
      templateId: selectedTemplateId,
      professionalId: selectedProfId || null,
      healthHistory,
      allergies,
      medications,
      relevantConditions,
      treatmentGoal,
      professionalNotes,
      legalBasis,
      consentTermsText: 'Declaro que as informações de saúde prestadas são verdadeiras e completas. Autorizo o tratamento destes dados sensíveis exclusivamente para fins de avaliação clínica e execução segura dos procedimentos estéticos, nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).',
      isAccepted,
      answers: answersArray,
      parentFormId: parentForm ? parentForm.id : null,
    };

    const res = await saveAnamnesisFormAction(tenantSlug, payload);
    setLoading(false);

    if (res.error) {
      setError(res.error);
    } else {
      router.refresh();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl max-w-2xl w-full my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-600" />
              {parentForm ? `Atualizar Anamnese (Nova Versão v${(parentForm.version || 1) + 1})` : 'Nova Ficha de Anamnese'}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Coleta de dados clínicos, alergias e consentimento informado (LGPD).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário com Scroll Interno */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-6 flex-1">
          {error && (
            <div className="p-3 text-xs bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 rounded-md border border-red-200 dark:border-red-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Seleção de Cliente e Profissional */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Cliente *
              </label>
              <select
                disabled={!!parentForm}
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name} ({c.whatsapp || 'Sem Whats'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Profissional Responsável
              </label>
              <select
                value={selectedProfId}
                onChange={(e) => setSelectedProfId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
              >
                <option value="">Selecione um profissional...</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.specialty})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Seleção de Modelo Clínico */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Modelo de Anamnese *
            </label>
            <select
              disabled={!!parentForm}
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.title} ({tpl.category})
                </option>
              ))}
            </select>
          </div>

          {/* Bloco 1: Campos de Saúde Essenciais */}
          <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600">
              1. Histórico de Saúde e Restrições
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Alergias e Contraindicações
                </label>
                <textarea
                  rows={2}
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  placeholder="Ex: Alergia a iodo, látex, anestésicos tópicos..."
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Medicamentos em Uso
                </label>
                <textarea
                  rows={2}
                  value={medications}
                  onChange={(e) => setMedications(e.target.value)}
                  placeholder="Ex: Roacutan, anticoagulantes, corticoides..."
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Condições Relevantes ao Procedimento
                </label>
                <textarea
                  rows={2}
                  value={relevantConditions}
                  onChange={(e) => setRelevantConditions(e.target.value)}
                  placeholder="Ex: Gestante/lactante, hipertensão, diabetes, próteses metálicas..."
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Histórico de Saúde / Cirurgias Prévias
                </label>
                <textarea
                  rows={2}
                  value={healthHistory}
                  onChange={(e) => setHealthHistory(e.target.value)}
                  placeholder="Ex: Cirurgias recentes, cicatrizes, histórico oncológico..."
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>
          </div>

          {/* Bloco 2: Objetivo e Observações do Profissional */}
          <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600">
              2. Objetivo do Atendimento & Avaliação
            </h3>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Objetivo do Atendimento / Queixa Principal
              </label>
              <input
                type="text"
                value={treatmentGoal}
                onChange={(e) => setTreatmentGoal(e.target.value)}
                placeholder="Ex: Tratamento de manchas e hidratação profunda"
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Observações Clínicas e Conduta Profissional
              </label>
              <textarea
                rows={2}
                value={professionalNotes}
                onChange={(e) => setProfessionalNotes(e.target.value)}
                placeholder="Ex: Avaliação tátil realizada, sem lesões aparentes..."
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* Bloco 3: Perguntas Dinâmicas do Modelo */}
          {currentTemplate && currentTemplate.questions && currentTemplate.questions.length > 0 && (
            <div className="space-y-4 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600">
                3. Questionário Específico ({currentTemplate.title})
              </h3>

              {currentTemplate.questions.map((q) => (
                <div key={q.id} className="space-y-1.5 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                  <label className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {q.question_text} {q.is_required && <span className="text-red-500">*</span>}
                  </label>

                  {/* Resposta Sim / Não */}
                  {q.question_type === 'boolean' && (
                    <div className="flex items-center gap-4 text-xs pt-1">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          checked={dynamicAnswers[q.id]?.json === true}
                          onChange={() => handleBooleanAnswerChange(q.id, true)}
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span>Sim</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`q_${q.id}`}
                          checked={dynamicAnswers[q.id]?.json === false}
                          onChange={() => handleBooleanAnswerChange(q.id, false)}
                          className="text-rose-600 focus:ring-rose-500"
                        />
                        <span>Não</span>
                      </label>
                    </div>
                  )}

                  {/* Resposta Seleção Única */}
                  {q.question_type === 'single_choice' && (
                    <div className="flex flex-wrap gap-3 text-xs pt-1">
                      {(q.options || []).map((opt) => (
                        <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`q_${q.id}`}
                            value={opt}
                            checked={dynamicAnswers[q.id]?.text === opt}
                            onChange={(e) => handleTextAnswerChange(q.id, e.target.value)}
                            className="text-rose-600 focus:ring-rose-500"
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Resposta Múltipla Escolha */}
                  {q.question_type === 'multiple_choice' && (
                    <div className="flex flex-wrap gap-3 text-xs pt-1">
                      {(q.options || []).map((opt) => {
                        const checked = Array.isArray(dynamicAnswers[q.id]?.json) &&
                          (dynamicAnswers[q.id]?.json as string[]).includes(opt);
                        return (
                          <label key={opt} className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => handleMultipleChoiceChange(q.id, opt, e.target.checked)}
                              className="text-rose-600 rounded focus:ring-rose-500"
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Resposta Data */}
                  {q.question_type === 'date' && (
                    <input
                      type="date"
                      value={dynamicAnswers[q.id]?.text || ''}
                      onChange={(e) => handleTextAnswerChange(q.id, e.target.value)}
                      className="px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
                    />
                  )}

                  {/* Resposta Texto Livre */}
                  {q.question_type === 'text' && (
                    <input
                      type="text"
                      placeholder="Sua resposta..."
                      value={dynamicAnswers[q.id]?.text || ''}
                      onChange={(e) => handleTextAnswerChange(q.id, e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Bloco 4: LGPD e Base Legal */}
          <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600">
              4. Conformidade LGPD & Base Legal de Tratamento
            </h3>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                Base Legal Aplicável (Art. 11 LGPD)
              </label>
              <select
                value={legalBasis}
                onChange={(e) => setLegalBasis(e.target.value as LgpdLegalBasis)}
                className="w-full px-3 py-2 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md focus:ring-2 focus:ring-rose-500"
              >
                <option value="consent">Consentimento Específico e Destacado (Art. 11, I)</option>
                <option value="health_protection">Tutela da Saúde / Execução por Profissionais (Art. 11, II, f)</option>
                <option value="contract_execution">Execução de Contrato / Procedimento Solicitado (Art. 7, V)</option>
                <option value="legal_obligation">Cumprimento de Obrigação Legal / Sanitária (Art. 11, II, a)</option>
              </select>
            </div>

            <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 space-y-2">
              <p>
                <strong>Termo de Ciência e Veracidade:</strong> O titular declara que todas as informações prestadas são fidedignas e está ciente de que a omissão de dados de saúde pode comprometer a eficácia e segurança do atendimento.
              </p>
              <label className="flex items-center gap-2 cursor-pointer font-medium text-zinc-900 dark:text-zinc-100 pt-1">
                <input
                  type="checkbox"
                  checked={isAccepted}
                  onChange={(e) => setIsAccepted(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                <span className="flex items-center gap-1.5">
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                  Registrar aceite e consentimento do cliente
                </span>
              </label>
            </div>
          </div>

          {/* Botões do Rodapé */}
          <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end gap-3 shrink-0">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {parentForm ? 'Salvar Nova Versão' : 'Concluir Ficha'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
