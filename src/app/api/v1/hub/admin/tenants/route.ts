import { NextRequest, NextResponse } from 'next/server';
import {
  verifyHubM2MRequestWithPersistence,
  logHubAdminAudit,
} from '@/lib/hub/m2mSecurity';
import {
  listHubAdminTenants,
  getServiceRoleSupabaseClient,
} from '@/lib/hub/adminTenantsService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const pathAndQuery = `${pathname}${req.nextUrl.search}`;

  // 1. Extração dos headers de autenticação M2M
  const keyId = req.headers.get('x-hub-key-id') || req.headers.get('X-Hub-Key-Id') || '';
  const timestamp = req.headers.get('x-hub-timestamp') || req.headers.get('X-Hub-Timestamp') || '';
  const signature = req.headers.get('x-hub-signature') || req.headers.get('X-Hub-Signature') || '';
  const nonce = req.headers.get('x-hub-nonce') || req.headers.get('X-Hub-Nonce') || null;

  // 2. Chave administrativa independente (fallback seguro para HUB_M2M_KEY_ID caso a chave admin dedicada ainda não tenha sido configurada)
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
        action: 'TENANTS_LIST_UNAUTHORIZED',
        keyId,
        method: 'GET',
        path: pathname,
        statusCode,
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

  // 4. Parâmetros de consulta
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const search = searchParams.get('search') || undefined;
  const status = searchParams.get('status') || undefined;
  const plan = searchParams.get('plan') || undefined;

  try {
    const result = await listHubAdminTenants({
      page,
      limit,
      search,
      status,
      plan,
    });

    await logHubAdminAudit(
      {
        action: 'TENANTS_LIST_SUCCESS',
        keyId,
        method: 'GET',
        path: pathname,
        statusCode: 200,
        metadata: { total: result.pagination.total, page: result.pagination.page },
      },
      supabase
    );

    return NextResponse.json(result, {
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
        action: 'TENANTS_LIST_ERROR',
        keyId,
        method: 'GET',
        path: pathname,
        statusCode: 500,
        metadata: { error: error.message },
      },
      supabase
    );

    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno ao consultar lista administrativa de estabelecimentos.',
      },
      { status: 500 }
    );
  }
}
