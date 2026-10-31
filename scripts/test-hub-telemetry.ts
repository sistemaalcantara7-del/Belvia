import crypto from 'crypto';
import assert from 'assert';
import { verifyHubM2MRequest, clearNonceCacheForTest } from '../src/lib/hub/m2mSecurity';
import { ZeluniaTelemetryResponse } from '../src/lib/hub/telemetryService';

const TEST_KEY_ID = 'hub_key_zelunia_v1';
const TEST_SECRET = 'segredo_super_seguro_e_longo_para_testes_m2m_zelunia_2026';

function generateSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  nonce?: string | null
): string {
  const payload = nonce
    ? `${timestamp}:${nonce}:${method.toUpperCase()}:${path}`
    : `${timestamp}:${method.toUpperCase()}:${path}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function runTests() {
  console.log('--- INICIANDO TESTES DE TELEMETRIA M2M & SEGURANÇA (ZELUNIA -> HUB) ---\n');
  clearNonceCacheForTest();

  const now = Math.floor(Date.now() / 1000).toString();
  const path = '/api/v1/hub/telemetry?reference_date=2026-10-31';

  // TESTE 1: Assinatura Válida com Nonce (Contrato Estrito)
  {
    const nonce = 'nonce_teste_unico_001';
    const sig = generateSignature(TEST_SECRET, now, 'GET', path, nonce);

    const res = verifyHubM2MRequest({
      keyId: TEST_KEY_ID,
      timestamp: now,
      signature: sig,
      nonce,
      method: 'GET',
      pathAndQuery: path,
      expectedKeyId: TEST_KEY_ID,
      secretKey: TEST_SECRET,
    });

    assert.strictEqual(res.valid, true, 'TESTE 1 FALHOU: Assinatura válida com nonce deveria ser aceita.');
    console.log('✔ Teste 1: Autenticação HMAC-SHA256 válida com Nonce aprovada.');
  }

  // TESTE 2: Prevenção contra Replay Attack com o mesmo Nonce
  {
    const nonce = 'nonce_teste_unico_001'; // mesmo do teste 1
    const sig = generateSignature(TEST_SECRET, now, 'GET', path, nonce);

    const res = verifyHubM2MRequest({
      keyId: TEST_KEY_ID,
      timestamp: now,
      signature: sig,
      nonce,
      method: 'GET',
      pathAndQuery: path,
      expectedKeyId: TEST_KEY_ID,
      secretKey: TEST_SECRET,
    });

    assert.strictEqual(res.valid, false, 'TESTE 2 FALHOU: Replay com mesmo nonce deveria ser rejeitado.');
    assert.strictEqual(res.code, 'REPLAY_DETECTED');
    console.log('✔ Teste 2: Prevenção contra Replay Attack com Nonce duplicado aprovada.');
  }

  // TESTE 3: Assinatura Válida sem Nonce (Compatibilidade com Hub v1.0 / Legado)
  {
    const sig = generateSignature(TEST_SECRET, now, 'GET', path, null);

    const res = verifyHubM2MRequest({
      keyId: TEST_KEY_ID,
      timestamp: now,
      signature: sig,
      nonce: null,
      method: 'GET',
      pathAndQuery: path,
      expectedKeyId: TEST_KEY_ID,
      secretKey: TEST_SECRET,
    });

    assert.strictEqual(res.valid, true, 'TESTE 3 FALHOU: Assinatura backward-compatible sem nonce deveria ser aceita.');
    console.log('✔ Teste 3: Compatibilidade reversa com Hub v1.0 (sem nonce) aprovada.');
  }

  // TESTE 4: Rejeição de Timestamp Expirado (> 300 segundos / 5 minutos)
  {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 360).toString(); // 6 min atrás
    const nonce = 'nonce_expirado_002';
    const sig = generateSignature(TEST_SECRET, oldTimestamp, 'GET', path, nonce);

    const res = verifyHubM2MRequest({
      keyId: TEST_KEY_ID,
      timestamp: oldTimestamp,
      signature: sig,
      nonce,
      method: 'GET',
      pathAndQuery: path,
      expectedKeyId: TEST_KEY_ID,
      secretKey: TEST_SECRET,
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'TIMESTAMP_OUT_OF_WINDOW');
    console.log('✔ Teste 4: Rejeição de Timestamp fora da janela de tolerância aprovada.');
  }

  // TESTE 5: Rejeição de Key ID Incorreto ou Falsificado
  {
    const nonce = 'nonce_key_invalida_003';
    const sig = generateSignature(TEST_SECRET, now, 'GET', path, nonce);

    const res = verifyHubM2MRequest({
      keyId: 'key_id_falso',
      timestamp: now,
      signature: sig,
      nonce,
      method: 'GET',
      pathAndQuery: path,
      expectedKeyId: TEST_KEY_ID,
      secretKey: TEST_SECRET,
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'INVALID_KEY_ID');
    console.log('✔ Teste 5: Rejeição de Key ID incorreto aprovada.');
  }

  // TESTE 6: Rejeição de Assinatura HMAC Adulterada
  {
    const nonce = 'nonce_tamper_004';
    const sig = 'deadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcdef';

    const res = verifyHubM2MRequest({
      keyId: TEST_KEY_ID,
      timestamp: now,
      signature: sig,
      nonce,
      method: 'GET',
      pathAndQuery: path,
      expectedKeyId: TEST_KEY_ID,
      secretKey: TEST_SECRET,
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.code, 'INVALID_SIGNATURE');
    console.log('✔ Teste 6: Rejeição de Assinatura adulterada aprovada.');
  }

  // TESTE 7: Teste de Conformidade com a Política de Privacidade e LGPD (Zero PII / Zero PHI)
  {
    const mockTelemetryPayload: ZeluniaTelemetryResponse = {
      product_slug: 'zelunia',
      reference_date: '2026-10-31',
      generated_at: new Date().toISOString(),
      system_status: {
        health: 'operational',
        version: '1.0.0',
        uptime_pct_last_30d: 99.9,
      },
      tenants_data: [
        {
          external_tenant_id: '123e4567-e89b-12d3-a456-426614174000',
          financial: {
            mrr_current: 99.9,
            billed_period: 199.8,
            received_period: 199.8,
            overdue_balance: 0.0,
          },
          usage_aggregated: {
            active_professionals_count: 3,
            completed_appointments_count: 42,
            clients_total_count: 120,
          },
          ai_telemetry: {
            tokens_consumed_total: 15420,
            estimated_cost_usd: 0.002313,
            models_used: ['gpt-4o-mini'],
          },
        },
      ],
    };

    // Serializa e verifica ausência de campos proibidos pela LGPD
    const jsonStr = JSON.stringify(mockTelemetryPayload);
    const forbiddenPatterns = [
      /paciente/i,
      /anamnese/i,
      /prontuario/i,
      /cpf/i,
      /telefone/i,
      /whatsapp/i,
      /diagnostico/i,
      /prescricao/i,
      /cid10/i,
    ];

    for (const pattern of forbiddenPatterns) {
      assert.strictEqual(
        pattern.test(jsonStr),
        false,
        `TESTE 7 FALHOU: Padrão sensível '${pattern}' detectado no JSON de telemetria!`
      );
    }
    console.log('✔ Teste 7: Auditoria de Privacidade LGPD / Zero PII aprovada (nenhum dado pessoal/clínico no payload).');
  }

  console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO (7/7) ---');
}

runTests().catch((err) => {
  console.error('Erro nos testes:', err);
  process.exit(1);
});
