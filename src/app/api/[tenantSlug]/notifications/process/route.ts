import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { processNotificationQueueWorker } from '@/lib/whatsapp/queueWorker';

export const dynamic = 'force-dynamic';

/**
 * Endpoint de disparo controlado do processamento da fila de notificações.
 * Aceita acionamento manual por gestor autenticado ('owner'/'admin') ou por scheduler cron.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ tenantSlug: string }> }
) {
  const { tenantSlug } = await context.params;

  // 1. Validação de autenticação e contexto do estabelecimento
  const tenantCtx = await getAuthenticatedTenantContext(tenantSlug);
  if (!tenantCtx) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 401 });
  }

  // Validação estrita de assinatura no backend (Prompt 142)
  if (tenantCtx.isSubscriptionValid === false) {
    return NextResponse.json(
      {
        error: tenantCtx.isTrialExpired
          ? 'Período gratuito de 7 dias encerrado. Regularize a assinatura para reativar os disparos.'
          : 'Assinatura suspensa. Regularize o plano para processar notificações.',
      },
      { status: 402 }
    );
  }

  if (!['owner', 'admin'].includes(tenantCtx.role)) {
    return NextResponse.json(
      { error: 'Permissão insuficiente para processar a fila de notificações.' },
      { status: 403 }
    );
  }

  let body: { batchSize?: number; forceDryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // corpo opcional
  }

  // 2. Executa o worker com isolamento de tenant
  const result = await processNotificationQueueWorker(tenantCtx.tenantId, {
    batchSize: body.batchSize || 10,
    forceDryRun: body.forceDryRun,
  });

  return NextResponse.json({
    success: true,
    result,
  });
}
