import { NextRequest, NextResponse } from 'next/server';
import {
  verifyHubM2MRequestWithPersistence,
  logHubAdminAudit,
} from '@/lib/hub/m2mSecurity';
import {
  getHubAdminTenantDetails,
  getServiceRoleSupabaseClient,
} from '@/lib/hub/adminTenantsService';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  const { pathname } = req.nextUrl;
  const pathAndQuery = `${pathname}${req.nextUrl.search}`;
  const { id: tenantId } = await context.params;

  if (!tenantId) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'ID do estabelecimento não fornecido.' },
      { status: 400 }
    );
  }

  // 1. Extração dos headers de autenticação M2M
  const keyId = req.headers.get('x-hub-key-id') || req.headers.get('X-Hub-Key-Id') || '';
  const timestamp = req.headers.get('x-hub-timestamp') || req.headers.get('X-Hub-Timestamp') || '';
  const signature = req.headers.get('x-hub-signature') || req.headers.get('X-Hub-Signature') || '';
  const nonce = req.headers.get('x-hub-nonce') || req.headers.get('X-Hub-Nonce') || null;

  // 2. Chave administrativa M2M independente
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

  // 3. Verificação HMAC-SHA256 e proteção contra Replay Attack
  const authResult = await verifyHubM2MRequestWithPersistence({
    keyId,
    timestamp,
    signature,
    nonce,
    method: 'GET',
    pathAndQuery,
    expectedKeyId,
    secretKey,
    maxClockSkewSeconds: 300,
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
        action: 'TENANT_DETAILS_UNAUTHORIZED',
        keyId,
        method: 'GET',
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
        message: authResult.error || 'Acesso não autorizado ao gateway administrativo do Hub.',
      },
      { status: statusCode }
    );
  }

  // 4. Consulta detalhes corporativos do estabelecimento
  try {
    const details = await getHubAdminTenantDetails(tenantId);

    if (!details) {
      await logHubAdminAudit(
        {
          action: 'TENANT_NOT_FOUND',
          keyId,
          method: 'GET',
          path: pathname,
          statusCode: 404,
          tenantId,
        },
        supabase
      );

      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: `Estabelecimento com identificador '${tenantId}' não foi localizado.`,
        },
        { status: 404 }
      );
    }

    await logHubAdminAudit(
      {
        action: 'TENANT_DETAILS_SUCCESS',
        keyId,
        method: 'GET',
        path: pathname,
        statusCode: 200,
        tenantId,
        metadata: { plan: details.tenant.plan, status: details.tenant.status },
      },
      supabase
    );

    return NextResponse.json(details, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    await logHubAdminAudit(
      {
        action: 'TENANT_DETAILS_ERROR',
        keyId,
        method: 'GET',
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
        message: 'Erro interno ao consultar detalhes do estabelecimento.',
      },
      { status: 500 }
    );
  }
}
