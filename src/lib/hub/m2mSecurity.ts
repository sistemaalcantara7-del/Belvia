import crypto from 'crypto';

export interface M2MVerificationResult {
  valid: boolean;
  code?: string;
  error?: string;
}

export interface HubAdminAuditEntry {
  action: string;
  keyId: string;
  method: string;
  path: string;
  statusCode: number;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}

// Cache em memória para nonces anti-replay (TTL de 10 minutos para cobrir skew de 5 min)
const nonceCache = new Map<string, number>();

// Limpeza periódica do cache de nonces (apenas se houver ambiente Node com timer)
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [nonce, ts] of nonceCache.entries()) {
      if (ts < cutoff) {
        nonceCache.delete(nonce);
      }
    }
  }, 5 * 60 * 1000);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

export function clearNonceCacheForTest(): void {
  nonceCache.clear();
}

/**
 * Validação de Assinatura M2M HMAC-SHA256
 * Suporta requisições GET (apenas path) e mutações POST/PUT (com body SHA256 digest)
 */
export function verifyHubM2MRequest(params: {
  keyId: string;
  timestamp: string;
  signature: string;
  nonce?: string | null;
  method: string;
  pathAndQuery: string;
  expectedKeyId: string;
  secretKey: string;
  maxClockSkewSeconds?: number;
  bodyRaw?: string | null;
  skipMemoryCache?: boolean;
}): M2MVerificationResult {
  const {
    keyId,
    timestamp,
    signature,
    nonce,
    method,
    pathAndQuery,
    expectedKeyId,
    secretKey,
    maxClockSkewSeconds = 300,
    bodyRaw,
    skipMemoryCache = false,
  } = params;

  // 1. Chave configurada no servidor
  if (!secretKey) {
    return { valid: false, code: 'SERVER_MISCONFIGURED', error: 'Segredo M2M não configurado no servidor.' };
  }

  // 2. Validação do Key ID
  if (!keyId || keyId !== expectedKeyId) {
    return { valid: false, code: 'INVALID_KEY_ID', error: 'Key ID não reconhecido ou inválido.' };
  }

  // 3. Validação do Timestamp (formato e skew de relógio)
  const tsNum = parseInt(timestamp, 10);
  if (isNaN(tsNum)) {
    return { valid: false, code: 'INVALID_TIMESTAMP', error: 'Timestamp inválido ou mal formatado.' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsNum) > maxClockSkewSeconds) {
    return {
      valid: false,
      code: 'TIMESTAMP_OUT_OF_WINDOW',
      error: `Timestamp fora da janela de tolerância de ${maxClockSkewSeconds} segundos.`,
    };
  }

  // 4. Verificação de Nonce anti-replay (se fornecido e não ignorado para delegação estrita ao banco)
  if (nonce && !skipMemoryCache) {
    if (nonceCache.has(nonce)) {
      return { valid: false, code: 'REPLAY_DETECTED', error: 'Nonce já utilizado anteriormente. Replay rejeitado.' };
    }
  }

  // 5. Cálculo e comparação de Assinatura HMAC-SHA256
  // Se bodyRaw estiver presente (operações POST/PUT): adiciona hash SHA-256 do corpo ao payload assinado
  const bodyHash = bodyRaw ? crypto.createHash('sha256').update(bodyRaw).digest('hex') : '';

  // Formato Canônico estrito:
  // timestamp:nonce:METHOD:pathAndQuery[:bodyHash]
  let payloadWithNonce = `${timestamp}:${nonce || ''}:${method.toUpperCase()}:${pathAndQuery}`;
  if (bodyHash) {
    payloadWithNonce += `:${bodyHash}`;
  }

  let payloadWithoutNonce = `${timestamp}:${method.toUpperCase()}:${pathAndQuery}`;
  if (bodyHash) {
    payloadWithoutNonce += `:${bodyHash}`;
  }

  const payload = nonce ? payloadWithNonce : payloadWithoutNonce;

  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payload)
    .digest('hex');

  const providedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  let signatureValid = false;
  if (providedBuffer.length === expectedBuffer.length) {
    signatureValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  }

  // Fallback 1: se nonce foi fornecido mas assinatura gerada sem bodyHash
  if (!signatureValid && bodyHash) {
    const legacyPayload = nonce
      ? `${timestamp}:${nonce}:${method.toUpperCase()}:${pathAndQuery}`
      : `${timestamp}:${method.toUpperCase()}:${pathAndQuery}`;
    const legacyExpected = crypto.createHmac('sha256', secretKey).update(legacyPayload).digest('hex');
    const legacyBuffer = Buffer.from(legacyExpected, 'hex');
    if (providedBuffer.length === legacyBuffer.length) {
      signatureValid = crypto.timingSafeEqual(providedBuffer, legacyBuffer);
    }
  }

  // Fallback 2: para clientes legados que enviaram nonce apenas no header sem incluí-lo na string
  if (!signatureValid && nonce) {
    const fallbackExpected = crypto
      .createHmac('sha256', secretKey)
      .update(payloadWithoutNonce)
      .digest('hex');
    const fallbackBuffer = Buffer.from(fallbackExpected, 'hex');
    if (providedBuffer.length === fallbackBuffer.length) {
      signatureValid = crypto.timingSafeEqual(providedBuffer, fallbackBuffer);
    }
  }

  if (!signatureValid) {
    return { valid: false, code: 'INVALID_SIGNATURE', error: 'Assinatura HMAC-SHA256 incorreta.' };
  }

  // Registra o nonce no cache local em memória (apenas se memória estiver habilitada)
  if (nonce && !skipMemoryCache) {
    nonceCache.set(nonce, Date.now());
  }

  return { valid: true };
}

/**
 * Validação de Assinatura M2M com persistência distribuída OBRIGATÓRIA (FAIL-CLOSED)
 * Utilizada para operações administrativas do Hub (GET e POST).
 * 
 * Regras estritas:
 * 1. Exige nonce em public.hub_m2m_nonces.
 * 2. Sem fallback em memória para autorização anti-replay.
 * 3. Se o banco estiver indisponível ou retornar erro, retorna code 'SERVICE_UNAVAILABLE' (HTTP 503).
 */
export async function verifyHubM2MRequestWithPersistence(params: {
  keyId: string;
  timestamp: string;
  signature: string;
  nonce?: string | null;
  method: string;
  pathAndQuery: string;
  expectedKeyId: string;
  secretKey: string;
  maxClockSkewSeconds?: number;
  bodyRaw?: string | null;
  supabaseClient?: import('@supabase/supabase-js').SupabaseClient;
}): Promise<M2MVerificationResult> {
  const { nonce, supabaseClient, bodyRaw } = params;

  // 1. Exigência estrita de Nonce para operações administrativas
  if (!nonce || typeof nonce !== 'string' || nonce.trim().length === 0) {
    return {
      valid: false,
      code: 'MISSING_NONCE',
      error: 'Header x-hub-nonce é obrigatório para operações administrativas.',
    };
  }

  // 2. Cliente de banco é obrigatório para fail-closed
  if (!supabaseClient) {
    return {
      valid: false,
      code: 'SERVICE_UNAVAILABLE',
      error: 'Serviço de persistência distribuída indisponível (fail-closed).',
    };
  }

  // 3. Validação de assinatura HMAC e janela de tempo (sem cache de memória)
  const baseResult = verifyHubM2MRequest({
    ...params,
    bodyRaw,
    skipMemoryCache: true,
  });

  if (!baseResult.valid) {
    return baseResult;
  }

  // 4. Inserção atômica no PostgreSQL em public.hub_m2m_nonces (Fail-Closed)
  try {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await supabaseClient
      .from('hub_m2m_nonces')
      .insert({
        nonce,
        key_id: params.keyId,
        expires_at: expiresAt,
      });

    if (error) {
      // Código 23505 = unique_violation no PostgreSQL
      if (
        error.code === '23505' ||
        error.message?.includes('duplicate key') ||
        error.message?.includes('unique')
      ) {
        return {
          valid: false,
          code: 'REPLAY_DETECTED',
          error: 'Nonce já utilizado anteriormente (detectado na camada distribuída). Replay rejeitado.',
        };
      }

      // Qualquer outro erro do banco (ex: tabela inexistente, timeout, conexão perdida):
      // FAIL-CLOSED obrigatório -> HTTP 503
      return {
        valid: false,
        code: 'SERVICE_UNAVAILABLE',
        error: `Serviço de persistência distribuída inacessível (${error.message || 'database error'}). Operação bloqueada em modo fail-closed.`,
      };
    }
  } catch (err: unknown) {
    const error = err as Error;
    return {
      valid: false,
      code: 'SERVICE_UNAVAILABLE',
      error: `Falha na verificação distribuída de segurança: ${error.message}. Operação bloqueada (fail-closed).`,
    };
  }

  return { valid: true };
}

/**
 * Trilha de auditoria obrigatória do Alcântara Hub.
 * Registra simultaneamente no stdout estruturado e tenta persistir em public.hub_admin_audit_logs.
 * Se a persistência em banco falhar e a flag requirePersistence for ativa, propaga o erro.
 */
export async function logHubAdminAudit(
  entry: HubAdminAuditEntry,
  supabaseClient?: import('@supabase/supabase-js').SupabaseClient,
  options?: { requirePersistence?: boolean }
): Promise<void> {
  const sanitized = {
    timestamp: new Date().toISOString(),
    channel: 'HUB_ADMIN_M2M',
    action: entry.action,
    key_id: entry.keyId,
    method: entry.method,
    path: entry.path,
    status_code: entry.statusCode,
    tenant_id: entry.tenantId || null,
    metadata: entry.metadata || {},
  };

  // 1. Sempre emite log estruturado no stdout
  console.log(`[HUB_ADMIN_AUDIT] ${JSON.stringify(sanitized)}`);

  // 2. Se cliente supabase fornecido, persiste na tabela de auditoria
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.from('hub_admin_audit_logs').insert({
        channel: 'HUB_ADMIN_M2M',
        action: entry.action,
        key_id: entry.keyId,
        method: entry.method,
        path: entry.path,
        status_code: entry.statusCode,
        tenant_id: entry.tenantId || null,
        metadata: entry.metadata || {},
      });

      if (error && options?.requirePersistence) {
        throw new Error(`Falha ao persistir auditoria obrigatória: ${error.message}`);
      }
    } catch (err: unknown) {
      if (options?.requirePersistence) {
        throw err;
      }
      console.error('[HUB_ADMIN_AUDIT_WARNING] Não foi possível persistir auditoria em hub_admin_audit_logs:', err);
    }
  } else if (options?.requirePersistence) {
    throw new Error('Supabase client ausente para auditoria obrigatória persistente.');
  }
}
