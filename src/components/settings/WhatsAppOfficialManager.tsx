'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Radio,
  ExternalLink,
  RefreshCw,
  FileCheck,
  Key,
  Info,
  Play,
  Pause,
  AlertTriangle,
  Lock,
  BarChart3,
  Flame,
  Check,
  X,
} from 'lucide-react';
import {
  TenantWhatsAppConfig,
  WhatsAppOfficialTemplate,
  WhatsAppPreActivationChecklist,
  WHATSAPP_CONNECTION_STATUS_MAP,
  WHATSAPP_TEMPLATE_STATUS_MAP,
} from '@/types/whatsapp';
import { NotificationQueueItem } from '@/types/reminders';
import {
  saveTenantWhatsAppConfigAction,
  testWhatsAppConnectionAction,
  seedStandardTemplatesAction,
  triggerNotificationQueueProcessingAction,
  getWhatsAppPreActivationChecklistAction,
  setWhatsAppLiveActivationAction,
  setWhatsAppOperationalPauseAction,
} from '@/lib/actions/whatsapp';

interface WhatsAppOfficialManagerProps {
  tenantSlug: string;
  userRole: string;
  initialConfig: TenantWhatsAppConfig;
  templates: WhatsAppOfficialTemplate[];
  queueItems?: NotificationQueueItem[];
}

export function WhatsAppOfficialManager({
  tenantSlug,
  userRole,
  initialConfig,
  templates: initialTemplates,
  queueItems = [],
}: WhatsAppOfficialManagerProps) {
  const canManage = ['owner', 'admin'].includes(userRole);

  const [wabaId, setWabaId] = useState(initialConfig.waba_id || '');
  const [phoneNumberId, setPhoneNumberId] = useState(initialConfig.phone_number_id || '');
  const [phoneDisplay, setPhoneDisplay] = useState(initialConfig.business_phone_display || '');
  const [accessTokenSecret, setAccessTokenSecret] = useState('');
  const [webhookVerifyToken] = useState(initialConfig.webhook_verify_token || '');

  const [config, setConfig] = useState<TenantWhatsAppConfig>(initialConfig);
  const [templates] = useState<WhatsAppOfficialTemplate[]>(initialTemplates);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Estados de Ativação e Homologação
  const [checklist, setChecklist] = useState<WhatsAppPreActivationChecklist | null>(null);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isActivatingLive, setIsActivatingLive] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [pauseReason, setPauseReason] = useState('');

  // Ações Básicas
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  const statusMeta =
    WHATSAPP_CONNECTION_STATUS_MAP[config.connection_status] ||
    WHATSAPP_CONNECTION_STATUS_MAP.disconnected;

  // Indicadores da fila para este tenant
  const metrics = {
    total: queueItems.length,
    pending: queueItems.filter((q) => q.status === 'pending').length,
    simulated: queueItems.filter((q) => (q as unknown as { is_simulation?: boolean }).is_simulation || q.status === 'simulated').length,
    sent: queueItems.filter((q) => q.status === 'sent').length,
    delivered: queueItems.filter((q) => (q as unknown as { delivery_status?: string }).delivery_status === 'delivered').length,
    read: queueItems.filter((q) => (q as unknown as { delivery_status?: string }).delivery_status === 'read').length,
    failed: queueItems.filter((q) => q.status === 'failed').length,
    canceled: queueItems.filter((q) => q.status === 'canceled').length,
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    try {
      setIsSaving(true);
      setFeedback(null);

      const res = await saveTenantWhatsAppConfigAction(tenantSlug, {
        wabaId,
        phoneNumberId,
        businessPhoneDisplay: phoneDisplay,
        accessTokenSecret: accessTokenSecret || undefined,
        webhookVerifyToken: webhookVerifyToken || undefined,
      });

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else if (res.data) {
        setConfig(res.data);
        setAccessTokenSecret('');
        setFeedback({
          type: 'success',
          message: 'Credenciais da Meta Cloud API salvas com sucesso!',
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao salvar credenciais do WhatsApp.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!canManage) return;

    try {
      setIsTesting(true);
      setFeedback(null);

      const res = await testWhatsAppConnectionAction(tenantSlug);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
        setConfig((prev) => ({ ...prev, connection_status: 'error' }));
      } else if (res.data) {
        setFeedback({ type: 'success', message: `${res.data.message} (${res.data.verifiedName})` });
        setConfig((prev) => ({ ...prev, connection_status: 'connected' }));
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Falha ao testar conexão com a Meta.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSeedTemplates = async () => {
    if (!canManage) return;

    try {
      setIsSeeding(true);
      setFeedback(null);

      const res = await seedStandardTemplatesAction(tenantSlug);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setFeedback({
          type: 'success',
          message: 'Templates oficiais homologados pelo ZELUNIA foram sincronizados!',
        });
        startTransition(() => {
          router.refresh();
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao sincronizar templates.' });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleProcessQueueDryRun = async () => {
    if (!canManage) return;

    try {
      setIsProcessingQueue(true);
      setFeedback(null);

      const res = await triggerNotificationQueueProcessingAction(tenantSlug, true);
      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else if (res.data) {
        setFeedback({
          type: 'success',
          message: `Lote processado em Modo Homologação: ${res.data.processedCount} mensagens verificadas (${res.data.successCount} simuladas com sucesso, zero disparos reais).`,
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao processar fila em modo homologação.' });
    } finally {
      setIsProcessingQueue(false);
    }
  };

  const handleLoadChecklist = async () => {
    if (!canManage) return;

    try {
      setIsLoadingChecklist(true);
      const res = await getWhatsAppPreActivationChecklistAction(tenantSlug);
      if (res.data) {
        setChecklist(res.data);
      }
    } catch (err) {
      console.error('Erro ao carregar checklist:', err);
    } finally {
      setIsLoadingChecklist(false);
    }
  };

  const handleToggleLiveMode = async (enable: boolean) => {
    if (!canManage) return;

    try {
      setIsActivatingLive(true);
      setFeedback(null);

      const res = await setWhatsAppLiveActivationAction(
        tenantSlug,
        enable,
        enable ? 'Ativação explícita autorizada via painel operacional.' : 'Retorno ao modo seguro dry-run.'
      );

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setConfig((prev) => ({
          ...prev,
          is_live_active: enable,
          dry_run_mode: !enable,
          is_paused: false,
        }));
        setShowConfirmModal(false);
        setFeedback({
          type: 'success',
          message: enable
            ? 'WhatsApp Oficial ativado para envios reais com sucesso!'
            : 'Envios reais suspensos. O sistema retornou ao modo de homologação seguro.',
        });
        await handleLoadChecklist();
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao alterar ativação do WhatsApp.' });
    } finally {
      setIsActivatingLive(false);
    }
  };

  const handleTogglePause = async () => {
    if (!canManage) return;

    const nextPause = !config.is_paused;
    try {
      setIsTogglingPause(true);
      setFeedback(null);

      const res = await setWhatsAppOperationalPauseAction(
        tenantSlug,
        nextPause,
        pauseReason || (nextPause ? 'Pausa operacional emergencial acionada pelo gestor.' : 'Retomada de serviço autorizada.')
      );

      if (res.error) {
        setFeedback({ type: 'error', message: res.error });
      } else {
        setConfig((prev) => ({ ...prev, is_paused: nextPause }));
        setPauseReason('');
        setFeedback({
          type: 'success',
          message: nextPause
            ? 'Fila de WhatsApp pausada com sucesso. Nenhuma mensagem será despachada.'
            : 'Fila de WhatsApp retomada. O processamento operacional voltará ao normal.',
        });
      }
    } catch (err) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Erro ao alternar pausa operacional.' });
    } finally {
      setIsTogglingPause(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header do WhatsApp Oficial com Status Operacional e Chave Live/Pausa */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#1E1115]">
                  WhatsApp Business Cloud API (Meta Oficial)
                </h2>
                {config.is_live_active ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <Flame className="w-3 h-3 text-emerald-600" />
                    EM PRODUÇÃO (LIVE)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    MODO SEGURO (HOMOLOGAÇÃO / DRY-RUN)
                  </span>
                )}
                {config.is_paused && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    PAUSADO OPERACIONALMENTE
                  </span>
                )}
              </div>
              <p className="text-xs text-[#7D6B65]">
                Canal direto empresarial com a Meta para mensagens ativas homologadas e sem intermediários
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
            >
              <Radio className="w-3 h-3 animate-pulse" />
              {statusMeta.label}
            </span>

            {canManage && (
              <>
                <button
                  type="button"
                  onClick={handleProcessQueueDryRun}
                  disabled={isProcessingQueue}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#66534E] hover:text-[#B87070] bg-[#FAF5F3] border border-[#EADBCE] hover:bg-[#FAF0EC] transition-all disabled:opacity-50"
                  title="Executar simulação segura da fila (dry-run)"
                >
                  <Play className="w-3.5 h-3.5 text-[#B87070]" />
                  <span>{isProcessingQueue ? 'Simulando...' : 'Simular Lote'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#66534E] hover:text-[#2C1810] bg-[#FAF5F3] border border-[#EADBCE] hover:bg-[#FAF0EC] transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Testando...' : 'Testar Conexão'}</span>
                </button>

                {config.is_live_active && (
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    disabled={isTogglingPause}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                      config.is_paused
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    {config.is_paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    <span>{config.is_paused ? 'Retomar Fila' : 'Pausar Fila'}</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Informações da Linha Ativa */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-[#F0E5DF]">
          <div className="p-3 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]">
            <span className="text-[10px] font-bold text-[#7D6B65] uppercase tracking-wider block">
              Número Homologado
            </span>
            <span className="text-xs font-bold font-mono text-[#1E1115]">
              {config.business_phone_display || 'Não informado'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]">
            <span className="text-[10px] font-bold text-[#7D6B65] uppercase tracking-wider block">
              Phone Number ID
            </span>
            <span className="text-xs font-mono text-[#1E1115] truncate block">
              {config.phone_number_id || 'Não configurado'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#FAF5F3] border border-[#EADBCE]">
            <span className="text-[10px] font-bold text-[#7D6B65] uppercase tracking-wider block">
              WABA ID (Conta Empresarial)
            </span>
            <span className="text-xs font-mono text-[#1E1115] truncate block">
              {config.waba_id || 'Não configurado'}
            </span>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[11px] font-bold hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      {/* 2. PAINEL DE ATIVAÇÃO CONTROLADA (PRÉ-ATIVAÇÃO) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#B87070]" />
            <div>
              <h3 className="text-sm font-bold text-[#1E1115]">
                Painel de Pré-Ativação e Governança de Envio Real
              </h3>
              <p className="text-xs text-[#7D6B65]">
                Validação de pré-requisitos técnicos e legais antes da liberação de mensagens reais
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadChecklist}
              disabled={isLoadingChecklist}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#66534E] hover:text-[#2C1810] bg-[#FAF5F3] border border-[#EADBCE] hover:bg-[#FAF0EC] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingChecklist ? 'animate-spin' : ''}`} />
              <span>{isLoadingChecklist ? 'Verificando...' : 'Checar Pré-Requisitos'}</span>
            </button>

            {canManage && (
              <>
                {config.is_live_active ? (
                  <button
                    type="button"
                    onClick={() => handleToggleLiveMode(false)}
                    disabled={isActivatingLive}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-all disabled:opacity-50"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Voltar ao Modo Seguro</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!checklist) {
                        await handleLoadChecklist();
                      }
                      setShowConfirmModal(true);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    <span>Ativar WhatsApp Oficial (Produção)</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tabela de Verificação do Checklist */}
        {checklist ? (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E1115]">Conexão Meta API</span>
                  {checklist.meta_connected ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <X className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <p className="text-[11px] text-[#7D6B65]">
                  {checklist.meta_connected ? 'Conexão ativa e validada' : 'Sem conexão oficial'}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E1115]">Templates UTILITY</span>
                  {checklist.utility_templates_approved ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <X className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <p className="text-[11px] text-[#7D6B65]">
                  {checklist.approved_templates_count} modelos aprovados (mín. 2)
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E1115]">Consentimentos (LGPD)</span>
                  {checklist.opt_in_clients_count > 0 ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  )}
                </div>
                <p className="text-[11px] text-[#7D6B65]">
                  {checklist.opt_in_clients_count} de {checklist.total_clients_count} clientes com opt-in
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E1115]">Regras de Lembrete</span>
                  {checklist.reminders_enabled ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <X className="w-4 h-4 text-rose-600" />
                  )}
                </div>
                <p className="text-[11px] text-[#7D6B65]">
                  {checklist.reminders_enabled ? 'Disparos habilitados' : 'Desabilitado no sistema'}
                </p>
              </div>
            </div>

            {/* Alertas Críticos de Fila / Travamentos antes de Ativar */}
            {(checklist.processing_messages_count > 0 ||
              checklist.simulated_pending_count > 0 ||
              checklist.uncertain_failures_count > 0) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Pendências Operacionais Bloqueantes:</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Para sua segurança, a ativação em produção fica bloqueada enquanto houver mensagens em processamento ativo ({checklist.processing_messages_count}), simulações pendentes ({checklist.simulated_pending_count}) ou envios com falha incerta ({checklist.uncertain_failures_count}).
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#FAF5F3] border border-dashed border-[#EADBCE] text-xs text-[#7D6B65] text-center">
            Clique em <strong>&quot;Checar Pré-Requisitos&quot;</strong> para auditar as credenciais, templates e consentimentos deste estabelecimento.
          </div>
        )}

        {/* Indicadores Consolidados da Fila */}
        <div className="pt-3 border-t border-[#F0E5DF]">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-[#B87070]" />
            <h4 className="text-xs font-bold text-[#1E1115] uppercase tracking-wider">
              Métricas da Fila e Entregabilidade
            </h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Aguardando</span>
              <span className="text-sm font-bold text-amber-700">{metrics.pending}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Simulações</span>
              <span className="text-sm font-bold text-purple-700">{metrics.simulated}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Enviados</span>
              <span className="text-sm font-bold text-blue-700">{metrics.sent}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Entregues</span>
              <span className="text-sm font-bold text-emerald-700">{metrics.delivered}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Lidos</span>
              <span className="text-sm font-bold text-emerald-900">{metrics.read}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Falhas</span>
              <span className="text-sm font-bold text-rose-700">{metrics.failed}</span>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] text-center">
              <span className="text-[10px] text-[#7D6B65] uppercase font-bold block">Cancelados</span>
              <span className="text-sm font-bold text-zinc-600">{metrics.canceled}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO EXPLÍCITA DE ATIVAÇÃO REAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-white rounded-none sm:rounded-2xl max-w-lg w-full h-full sm:h-auto sm:max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-xl border-0 sm:border border-[#EADBCE] overflow-hidden">
            <div className="flex items-center gap-3 shrink-0 pb-3 border-b border-[#F0E5DF]">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1E1115]">
                  Confirmação de Ativação Oficial (Meta Live)
                </h3>
                <p className="text-xs text-[#7D6B65]">
                  Essa ação iniciará disparos reais de mensagens via Meta Cloud API
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2 leading-relaxed">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  Atenção às Regras de Segurança:
                </p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Mensagens anteriores já simuladas <strong>NUNCA</strong> serão disparadas automaticamente.</li>
                  <li>Apenas agendamentos futuros com <strong>consentimento explícito (opt-in)</strong> serão notificados.</li>
                  <li>Custos da Meta Cloud API serão debitados da sua conta Meta Business vinculada.</li>
                  <li>Você poderá pausar ou desativar a qualquer momento com efeito imediato.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F0E5DF] shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#66534E] hover:bg-[#FAF5F3] transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isActivatingLive}
                onClick={() => handleToggleLiveMode(true)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all disabled:opacity-50"
              >
                {isActivatingLive ? 'Ativando...' : 'Confirmar e Ativar Modo Real'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Formulário Seguro de Credenciais da Cloud API */}
      <form
        onSubmit={handleSaveConfig}
        className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-5"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#B87070]" />
            <h3 className="text-sm font-bold text-[#1E1115]">
              Credenciais e Parâmetros da Meta Cloud API
            </h3>
          </div>
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B87070] hover:underline"
          >
            <span>Painel Meta for Developers</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#66534E] mb-1">
              WhatsApp Business Account ID (WABA ID)
            </label>
            <input
              type="text"
              placeholder="Ex: 104829104812345"
              value={wabaId}
              disabled={!canManage}
              onChange={(e) => setWabaId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none font-mono disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#66534E] mb-1">
              Phone Number ID (ID do Número na Meta)
            </label>
            <input
              type="text"
              placeholder="Ex: 109283746519283"
              value={phoneNumberId}
              disabled={!canManage}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none font-mono disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#66534E] mb-1">
              Número de Telefone Comercial (Exibição)
            </label>
            <input
              type="text"
              placeholder="+55 (11) 98765-4321"
              value={phoneDisplay}
              disabled={!canManage}
              onChange={(e) => setPhoneDisplay(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#66534E] mb-1">
              Token Permanente do Usuário do Sistema Meta
            </label>
            <input
              type="password"
              placeholder={config.has_access_token ? '••••••••••••••••••••••••••••••••' : 'EAAG...'}
              value={accessTokenSecret}
              disabled={!canManage}
              onChange={(e) => setAccessTokenSecret(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FAF5F3] border border-[#EADBCE] rounded-xl text-[#2C1810] focus:ring-2 focus:ring-[#B87070] outline-none font-mono disabled:opacity-60"
            />
            <p className="text-[10px] text-[#7D6B65] mt-1">
              {config.has_access_token
                ? 'Token cadastrado com segurança. Deixe em branco para manter o existente.'
                : 'Insira o token permanente de acesso gerado no Meta Business Manager.'}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B87070] hover:bg-[#a55f5f] text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Salvando...' : 'Salvar Credenciais Oficiais'}</span>
            </button>
          </div>
        )}
      </form>

      {/* 4. Templates Oficiais Aprovados pela Meta */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#EADBCE] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-[#B87070]" />
            <div>
              <h3 className="text-sm font-bold text-[#1E1115]">
                Modelos de Mensagem Homologados (Meta Approved Templates)
              </h3>
              <p className="text-xs text-[#7D6B65]">
                Mensagens ativas iniciadas pela empresa exigem templates aprovados na categoria UTILITY
              </p>
            </div>
          </div>

          {canManage && (
            <button
              type="button"
              onClick={handleSeedTemplates}
              disabled={isSeeding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-[#66534E] hover:text-[#B87070] bg-[#FAF5F3] border border-[#EADBCE] hover:bg-[#FAF0EC] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin' : ''}`} />
              <span>{isSeeding ? 'Sincronizando...' : 'Sincronizar Templates Padrão'}</span>
            </button>
          )}
        </div>

        {templates.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#7D6B65] bg-[#FAF5F3] rounded-xl border border-dashed border-[#EADBCE] space-y-2">
            <p>Nenhum template oficial homologado foi carregado para este estabelecimento.</p>
            {canManage && (
              <button
                type="button"
                onClick={handleSeedTemplates}
                className="text-xs font-bold text-[#B87070] hover:underline"
              >
                Clique aqui para sincronizar os modelos oficiais de Lembrete 24h e 2h
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => {
              const statusMeta =
                WHATSAPP_TEMPLATE_STATUS_MAP[tpl.status] ||
                WHATSAPP_TEMPLATE_STATUS_MAP.PENDING;

              return (
                <div
                  key={tpl.id}
                  className="p-4 rounded-xl bg-[#FAF5F3] border border-[#EADBCE] space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-[#1E1115]">
                        {tpl.template_name}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-[#7D6B65]">
                      <span className="font-semibold uppercase tracking-wider">{tpl.category}</span>
                      <span>•</span>
                      <span>Idioma: {tpl.language}</span>
                    </div>

                    <div className="p-3 rounded-lg bg-white border border-[#EADBCE] text-[11px] text-[#2C1810] font-sans leading-relaxed">
                      {tpl.header_text && (
                        <p className="font-bold text-[#1E1115] mb-1">{tpl.header_text}</p>
                      )}
                      <p>{tpl.body_text}</p>
                      {tpl.footer_text && (
                        <p className="text-[10px] text-[#A8948D] mt-1 italic">
                          {tpl.footer_text}
                        </p>
                      )}
                    </div>
                  </div>

                  <p className="text-[10px] text-[#A8948D] pt-1 border-t border-[#EADBCE]/50">
                    Compatível com a política de mensagens 24h da Meta Business Platform.
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Guia de Ativação e Compliance */}
        <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Regras de Comunicação Oficial da Meta:</p>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              1. Disparos iniciados pela empresa fora da janela de 24h devem obrigatoriamente utilizar <strong>templates aprovados</strong> na categoria <code>UTILITY</code>.<br />
              2. O ZELUNIA valida compulsoriamente o consentimento (<code>opt_in_reminders</code>) do titular antes do processamento de cada mensagem na fila persistente.<br />
              3. O uso de tokens permanentes do Sistema Meta impede quedas de conexão e protege seu número empresarial contra bloqueios operacionais.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
