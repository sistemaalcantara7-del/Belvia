import { NextRequest, NextResponse } from 'next/server';
import { verifyHubM2MRequest } from '@/lib/hub/m2mSecurity';
import { getAggregatedTelemetry } from '@/lib/hub/telemetryService';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams, pathname } = req.nextUrl;
    const referenceDate = searchParams.get('reference_date');

    // 1. Validação do parâmetro reference_date (formato YYYY-MM-DD)
    if (!referenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
      return NextResponse.json(
        {
          error: 'BAD_REQUEST',
          message: "Parâmetro 'reference_date' obrigatório no formato YYYY-MM-DD.",
        },
        { status: 400 }
      );
    }

    // 2. Extração dos headers de autenticação M2M
    const keyId = req.headers.get('x-hub-key-id') || req.headers.get('X-Hub-Key-Id') || '';
    const timestamp = req.headers.get('x-hub-timestamp') || req.headers.get('X-Hub-Timestamp') || '';
    const signature = req.headers.get('x-hub-signature') || req.headers.get('X-Hub-Signature') || '';
    const nonce = req.headers.get('x-hub-nonce') || req.headers.get('X-Hub-Nonce') || null;

    // 3. Obtenção das credenciais seguras do servidor
    const expectedKeyId = process.env.HUB_M2M_KEY_ID || process.env.ZELUNIA_M2M_KEY_ID || 'hub_key_zelunia_v1';
    const secretKey = process.env.HUB_M2M_SECRET_KEY || process.env.ZELUNIA_M2M_SECRET_KEY || '';

    // Reconstrói pathAndQuery exato da requisição
    const pathAndQuery = `${pathname}${req.nextUrl.search}`;

    // 4. Verificação criptográfica HMAC-SHA256 e prevenção contra Replay
    const authResult = verifyHubM2MRequest({
      keyId,
      timestamp,
      signature,
      nonce,
      method: 'GET',
      pathAndQuery,
      expectedKeyId,
      secretKey,
      maxClockSkewSeconds: 300, // Janela de 5 minutos
    });

    if (!authResult.valid) {
      const statusCode =
        authResult.code === 'REPLAY_DETECTED'
          ? 409
          : authResult.code === 'SERVER_MISCONFIGURED'
          ? 500
          : 401;

      return NextResponse.json(
        {
          error: authResult.code || 'UNAUTHORIZED',
          message: authResult.error || 'Acesso não autorizado ao endpoint de telemetria.',
        },
        { status: statusCode }
      );
    }

    // 5. Coleta agregada e higienizada das métricas
    const telemetry = await getAggregatedTelemetry(referenceDate);

    return NextResponse.json(telemetry, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      {
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Falha ao processar telemetria agregada.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
      },
      { status: 500 }
    );
  }
}
