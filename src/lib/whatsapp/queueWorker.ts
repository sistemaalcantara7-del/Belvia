import { createClient } from '@/lib/supabase/server';

export interface ProcessQueueResult {
  tenantId: string;
  processedCount: number;
  successCount: number;
  failedCount: number;
  dryRun: boolean;
  errors: string[];
}

interface MetaTemplatePayload {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: {
      code: string;
    };
    components?: Array<{
      type: 'header' | 'body' | 'button';
      parameters: Array<{
        type: 'text';
        text: string;
      }>;
    }>;
  };
}

/**
 * Normaliza número de telefone para o padrão E.164 exigido pela Meta (+5511999998888).
 */
export function normalizePhoneForMeta(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('55')) {
    return digits;
  }
  return `55${digits}`;
}

/**
 * Worker seguro de processamento da notification_queue do estabelecimento.
 * Valida autorização, adquire lote atômico via SKIP LOCKED e submete à Meta Cloud API
 * com suporte nativo ao modo de homologação (dry_run_mode).
 */
export async function processNotificationQueueWorker(
  tenantId: string,
  options?: {
    batchSize?: number;
    forceDryRun?: boolean;
  }
): Promise<ProcessQueueResult> {
  const supabase = await createClient();
  const batchSize = options?.batchSize || 10;
  const errors: string[] = [];
  let successCount = 0;
  let failedCount = 0;

  // 1. Busca configurações e credenciais da Meta para o tenant
  const { data: config, error: cfgErr } = await supabase
    .from('tenant_whatsapp_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (cfgErr || !config) {
    return {
      tenantId,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      dryRun: true,
      errors: ['Configurações oficiais de WhatsApp não localizadas para o estabelecimento.'],
    };
  }

  // 1.1 Bloqueio Operacional: se a fila estiver pausada manualmente, interrompe imediatamente
  if (config.is_paused) {
    return {
      tenantId,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      dryRun: true,
      errors: [`Processamento pausado operacionalmente: ${config.pause_reason || 'Pausa manual ativa.'}`],
    };
  }

  // 1.2 Determina modo seguro:
  // Se forceDryRun estiver explicitamente definido como true, força dry-run.
  // Se forceDryRun for false mas o tenant NÃO estiver com is_live_active = true, FORÇA dry-run por segurança (impedindo bypass em endpoints).
  let isDryRun = true;
  if (options?.forceDryRun === false) {
    if (config.is_live_active === true && config.dry_run_mode === false) {
      isDryRun = false;
    } else {
      isDryRun = true; // Força dry-run se não estiver expressamente ativado em produção
    }
  } else {
    isDryRun = options?.forceDryRun ?? (config.dry_run_mode ?? true);
  }

  // 2. Executa a RPC atômica claim_next_notification_batch_v2 (ou fallback para v1)
  // Essa RPC já recupera mensagens travadas por timeout (> 5min), bloqueia concorrencialmente com SKIP LOCKED e invalida opt-out/cancelados
  let claimedBatch: unknown = null;
  const { data: v2Data, error: v2Err } = await supabase.rpc(
    'claim_next_notification_batch_v2',
    {
      p_tenant_id: tenantId,
      p_batch_size: batchSize,
    }
  );

  if (!v2Err && v2Data) {
    claimedBatch = v2Data;
  } else {
    // Fallback gracioso para a RPC v1 se a migration 27 ainda não foi executada no banco
    const { data: v1Data, error: v1Err } = await supabase.rpc(
      'claim_next_notification_batch',
      {
        p_tenant_id: tenantId,
        p_batch_size: batchSize,
      }
    );
    if (v1Err) {
      return {
        tenantId,
        processedCount: 0,
        successCount: 0,
        failedCount: 0,
        dryRun: isDryRun,
        errors: [`Erro ao reivindicar lote da fila: ${v1Err.message}`],
      };
    }
    claimedBatch = v1Data;
  }

  interface ClaimedItem {
    notification_id: string;
    appointment_id: string;
    client_id: string;
    recipient_phone: string;
    message_content: string;
    notification_type: string;
    idempotency_key: string;
  }

  const items = (claimedBatch || []) as ClaimedItem[];
  if (items.length === 0) {
    return {
      tenantId,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      dryRun: isDryRun,
      errors: [],
    };
  }

  // 3. Processa cada item do lote de forma independente
  for (const item of items) {
    const normalizedPhone = normalizePhoneForMeta(item.recipient_phone);

    // MODO DE HOMOLOGAÇÃO (SIMULAÇÃO SEGURA)
    // Marca expressamente com is_simulation = true (sem wamid falso da Meta e sem marcar como 'sent')
    if (isDryRun) {
      await supabase
        .from('notification_queue')
        .update({
          is_processing: false,
          is_simulation: true,
          simulated_at: new Date().toISOString(),
          error_message: 'Homologação: validação simulada com sucesso (modo seguro dry-run, sem envio à Meta).',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.notification_id)
        .eq('tenant_id', tenantId);

      successCount++;
      continue;
    }

    // MODO PRODUÇÃO COM DISPARO REAL À META
    if (!config.phone_number_id || !config.access_token_secret) {
      const errMsg = 'Credenciais incompletas para envio (Phone Number ID ou Access Token ausente).';
      await supabase
        .from('notification_queue')
        .update({
          status: 'failed',
          error_message: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.notification_id)
        .eq('tenant_id', tenantId);

      failedCount++;
      errors.push(`Notificação ${item.notification_id}: ${errMsg}`);
      continue;
    }

    try {
      // Determina o nome do template UTILITY homologado
      const templateName =
        item.notification_type === 'reminder_2h'
          ? 'zelunia_lembrete_2h'
          : 'zelunia_lembrete_24h';

      const payload: MetaTemplatePayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: 'pt_BR',
          },
        },
      };

      const metaUrl = `https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`;
      const response = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.access_token_secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resJson = await response.json();

      if (!response.ok || resJson.error) {
        const errorDetail = resJson.error?.message || 'Erro reportado pela Meta Graph API.';
        await supabase
          .from('notification_queue')
          .update({
            status: 'failed',
            error_message: errorDetail,
            retry_count: supabase.rpc('increment_retry_count') || 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.notification_id)
          .eq('tenant_id', tenantId);

        failedCount++;
        errors.push(`Falha na Meta para ${item.notification_id}: ${errorDetail}`);
      } else {
        const messageId = resJson.messages?.[0]?.id || `wamid_meta_${Date.now()}`;
        await supabase
          .from('notification_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            provider_message_id: messageId,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.notification_id)
          .eq('tenant_id', tenantId);

        successCount++;
      }
    } catch (sendErr) {
      // Em caso de erro de rede, timeout ou incerteza no envio:
      // NÃO reenvia automaticamente de imediato para prevenir duplicidade de mensagem
      const errString = sendErr instanceof Error ? sendErr.message : 'Falha na conexão de rede com a Meta.';
      await supabase
        .from('notification_queue')
        .update({
          status: 'failed',
          error_message: `Resultado incerto ou timeout de rede: ${errString}. Reenvio suspenso para prevenir duplicidade.`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.notification_id)
        .eq('tenant_id', tenantId);

      failedCount++;
      errors.push(`Exceção no envio ${item.notification_id}: ${errString}`);
    }
  }

  return {
    tenantId,
    processedCount: items.length,
    successCount,
    failedCount,
    dryRun: isDryRun,
    errors,
  };
}
