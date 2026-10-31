import crypto from 'crypto';

export interface M2MVerificationResult {
  valid: boolean;
  code?: string;
  error?: string;
}

// Cache em memória para nonces anti-replay (TTL de 10 minutos para cobrir skew de 5 min)
const nonceCache = new Map<string, number>();

// Limpeza periódica do cache de nonces
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [nonce, ts] of nonceCache.entries()) {
    if (ts < cutoff) {
      nonceCache.delete(nonce);
    }
  }
}, 5 * 60 * 1000);

export function clearNonceCacheForTest(): void {
  nonceCache.clear();
}

/**
 * Validação de Assinatura M2M HMAC-SHA256
 * Suporta o contrato estrito com Nonce e backward-compatibility com consumidores legados.
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

  // 4. Verificação de Nonce anti-replay (se fornecido)
  if (nonce) {
    if (nonceCache.has(nonce)) {
      return { valid: false, code: 'REPLAY_DETECTED', error: 'Nonce já utilizado anteriormente. Replay rejeitado.' };
    }
  }

  // 5. Cálculo e comparação de Assinatura HMAC-SHA256
  // Se nonce foi enviado: payload = `${timestamp}:${nonce}:${method.toUpperCase()}:${pathAndQuery}`
  // Se nonce não foi enviado (Hub v1.0): payload = `${timestamp}:${method.toUpperCase()}:${pathAndQuery}`
  const payloadWithNonce = nonce
    ? `${timestamp}:${nonce}:${method.toUpperCase()}:${pathAndQuery}`
    : `${timestamp}:${method.toUpperCase()}:${pathAndQuery}`;

  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(payloadWithNonce)
    .digest('hex');

  const providedBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  let signatureValid = false;
  if (providedBuffer.length === expectedBuffer.length) {
    signatureValid = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  }

  // Fallback para assinaturas geradas sem nonce no payload, caso o cliente tenha enviado nonce apenas no header
  if (!signatureValid && nonce) {
    const payloadWithoutNonce = `${timestamp}:${method.toUpperCase()}:${pathAndQuery}`;
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

  // Registra o nonce para impedir replays futuros
  if (nonce) {
    nonceCache.set(nonce, Date.now());
  }

  return { valid: true };
}
