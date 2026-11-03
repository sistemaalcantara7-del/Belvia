import { NextRequest, NextResponse } from 'next/server';
import {
  verifyHubM2MRequestWithPersistence,
  logHubAdminAudit,
} from '@/lib/hub/m2mSecurity';
import {
  changeTenantStatusAdmin,
  getOrSetIntentIdempotency,
  getServiceRoleSupabaseClient,
} from '@/lib/hub/adminTenantsService';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { pathname } = req.nextUrl;
  const pathAndQuery = `${pathname}${req.nextUrl.search}`;
  const { id: tenantId } = await context.params;

  if (!tenantId) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'ID do estabelecimento não fornecido.' },
      { status: 400 }
    );
  }

  // 1. Extração do corpo cru para hash HMAC e validação
  let bodyRaw = '';
  let bodyJson: Record<string, unknown> = {};
  try {
    bodyRaw = await req.text();
    if (bodyRaw) {
      bodyJson = JSON.parse(bodyRaw);
    }
  } catch {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Payload JSON inválido.' },
      { status: 400 }
    );
  }

  // 2. Extração dos headers de autenticação M2M
  const keyId = req.headers.get('x-hub-key-id') || req.headers.get('X-Hub-Key-Id') || '';
  const timestamp = req.headers.get('x-hub-timestamp') || req.headers.get('X-Hub-Timestamp') || '';
  const signature = req.headers.get('x-hub-signature') || req.headers.get('X-Hub-Signature') || '';
  const nonce = req.headers.get('x-hub-nonce') || req.headers.get('X-Hub-Nonce') || null;

  // 3. Chave administrativa independente
  const expectedKeyId =
    process.env.HUB_ADMIN_M2M_KEY_ID ||
    process.env.ZELUNIA_ADMIN_M2M_KEY_ID ||
    process.env.HUB_M2M_KEY_ID ||
    'hub_admin_key_zelunia_v1';

  const secretKey =
    process.env.HUB_ADMIN_M2M_SECRET_KEY ||
    process.env.ZELUNIA_ADMIN_M2M_SECRET_KEY ||
    process.env.HUB_M2M_SECRET_KEY ||
    '';

  const supabase = getServiceRoleSupabaseClient();

  // 4. Verificação de HMAC com Nonce Persistente e Body Hash
  const authResult = await verifyHubM2MRequestWithPersistence({
    keyId,
    timestamp,
    signature,
    nonce,
    method: 'POST',
    pathAndQuery,
    expectedKeyId,
    secretKey,
    maxClockSkewSeconds: 300,
    bodyRaw: bodyRaw || null,
    supabaseClient: supabase,
  });

  if (!authResult.valid) {
    const statusCode =
      authResult.code === 'SERVICE_UNAVAILABLE'
        ? 503
        : authResult.code === 'REPLAY_DETECTED'
        ? 409
        : authResult.code === 'SERVER_MISCONFIGURED'
        ? 500
        : 401;

    await logHubAdminAudit(
      {
        action: 'TENANT_CHANGE_STATUS_UNAUTHORIZED',
        keyId,
        method: 'POST',
        path: pathname,
        statusCode,
        tenantId,
        metadata: { error_code: authResult.code, error_message: authResult.error },
      },
      supabase
    );

    return NextResponse.json(
      {
        error: authResult.code || 'UNAUTHORIZED',
        message: authResult.error || 'Acesso não autorizado à operação administrativa.',
      },
      { status: statusCode }
    );
  }

  // 5. Validação dos campos de entrada
  const newStatus = (bodyJson.status as 'active' | 'suspended' | 'trial' | 'canceled') || '';
  const reason = (bodyJson.reason as string) || '';
  const operatorId = (bodyJson.operator_id as string) || undefined;

  if (!newStatus) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: "O campo 'status' é obrigatório ('active', 'suspended', 'trial', 'canceled')." },
      { status: 400 }
    );
  }

  if (!reason || reason.trim().length < 5) {
    return NextResponse.json(
      {
        error: 'BAD_REQUEST',
        message: "O campo 'reason' é obrigatório para auditoria administrativa (mínimo 5 caracteres).",
      },
      { status: 400 }
    );
  }

  // 6. Execução da alteração de status no domínio com Idempotência Distribuída por Intenção
  const intentKey = (bodyJson.idempotency_key as string) || `status:${tenantId}:${newStatus}:${reason.trim()}`;

  try {
    const result = await getOrSetIntentIdempotency({
      supabase,
      intentKey,
      tenantId,
      operation: 'status',
      execute: () =>
        changeTenantStatusAdmin({
          tenantId,
          newStatus,
          reason,
          operatorId,
        }),
    });

    const statusCode = result.success ? (result.idempotent ? 200 : 200) : result.code === 'FINANCIAL_SYNC_REQUIRED' ? 422 : 400;

    await logHubAdminAudit(
      {
        action: result.success ? 'TENANT_CHANGE_STATUS_SUCCESS' : 'TENANT_CHANGE_STATUS_BLOCKED',
        keyId,
        method: 'POST',
        path: pathname,
        statusCode,
        tenantId,
        metadata: {
          idempotent: result.idempotent || false,
          intent_key: intentKey,
          code: result.code,
          new_status: newStatus,
          reason,
          operator_id: operatorId,
        },
      },
      supabase,
      { requirePersistence: true }
    );

    return NextResponse.json(result, { status: statusCode });
  } catch (err: unknown) {
    const error = err as Error;
    await logHubAdminAudit(
      {
        action: 'TENANT_CHANGE_STATUS_ERROR',
        keyId,
        method: 'POST',
        path: pathname,
        statusCode: 500,
        tenantId,
        metadata: { error: error.message },
      },
      supabase
    );

    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno ao processar alteração de status do estabelecimento.',
      },
      { status: 500 }
    );
  }
}
