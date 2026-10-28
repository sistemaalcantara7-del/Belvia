import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Cliente Supabase Service Role para processamento seguro de webhooks
function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Configurações de banco ausentes para o webhook.');
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN || '';

export async function POST(req: NextRequest) {
  try {
    // 1. Validação de token de autenticação do Asaas (quando configurado)
    if (ASAAS_WEBHOOK_TOKEN) {
      const receivedToken =
        req.headers.get('asaas-access-token') ||
        req.headers.get('authorization')?.replace('Bearer ', '');

      if (receivedToken !== ASAAS_WEBHOOK_TOKEN) {
        return NextResponse.json({ error: 'Token de autenticação inválido.' }, { status: 401 });
      }
    }

    const payload = await req.json();
    const event = payload?.event; // ex: PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED
    const payment = payload?.payment;

    if (!event || !payment) {
      return NextResponse.json({ received: true, ignored: true, reason: 'Payload incompleto' });
    }

    const supabase = getAdminSupabaseClient();
    const asaasPaymentId = payment.id;
    const asaasSubscriptionId = payment.subscription;
    const externalReference = payment.externalReference; // ID do tenant

    // 2. Localiza o tenant vinculado
    let tenantId: string | null = null;

    if (externalReference) {
      tenantId = externalReference;
    } else if (asaasSubscriptionId) {
      const { data: sub } = await supabase
        .from('saas_subscriptions')
        .select('tenant_id')
        .eq('asaas_subscription_id', asaasSubscriptionId)
        .maybeSingle();

      if (sub) tenantId = sub.tenant_id;
    }

    if (!tenantId) {
      return NextResponse.json({ received: true, ignored: true, reason: 'Tenant não localizado.' });
    }

    // 3. Atualiza ou insere o registro da fatura de forma idempotente (saas_invoices)
    const invoiceStatusMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'paid',
      PAYMENT_RECEIVED: 'paid',
      PAYMENT_OVERDUE: 'overdue',
      PAYMENT_REFUNDED: 'refunded',
      PAYMENT_DELETED: 'canceled',
    };

    const targetInvoiceStatus = invoiceStatusMap[event] || 'pending';

    await supabase.from('saas_invoices').upsert(
      {
        tenant_id: tenantId,
        asaas_payment_id: asaasPaymentId,
        invoice_number: payment.invoiceNumber || null,
        amount: Number(payment.value || 0),
        status: targetInvoiceStatus,
        billing_type: payment.billingType || 'UNDEFINED',
        due_date: payment.dueDate || new Date().toISOString().split('T')[0],
        paid_at: ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event) ? new Date().toISOString() : null,
        invoice_url: payment.invoiceUrl || null,
        bank_slip_url: payment.bankSlipUrl || null,
        pix_qr_code: payment.pixQrCode || null,
        raw_payload: payload,
      },
      { onConflict: 'asaas_payment_id' }
    );

    // 4. Atualização de status da assinatura e do tenant
    if (['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'].includes(event)) {
      // Pagamento confirmado: Ativa assinatura e o estabelecimento
      await supabase
        .from('saas_subscriptions')
        .update({
          status: 'active',
          last_payment_at: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
          last_webhook_event: event,
        })
        .eq('tenant_id', tenantId);

      await supabase
        .from('tenants')
        .update({ status: 'active' })
        .eq('id', tenantId);
    } else if (event === 'PAYMENT_OVERDUE') {
      // Pagamento atrasado: entra em período de tolerância ('overdue')
      const { data: sub } = await supabase
        .from('saas_subscriptions')
        .select('grace_period_days, current_period_end')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      const graceDays = sub?.grace_period_days || 5;
      const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : new Date();
      const isPastGrace = Date.now() > (periodEnd.getTime() + graceDays * 86400000);

      const nextStatus = isPastGrace ? 'suspended' : 'overdue';

      await supabase
        .from('saas_subscriptions')
        .update({
          status: nextStatus,
          last_webhook_event: event,
        })
        .eq('tenant_id', tenantId);

      if (nextStatus === 'suspended') {
        // Bloqueio controlado sem exclusão de nenhum dado
        await supabase
          .from('tenants')
          .update({ status: 'suspended' })
          .eq('id', tenantId);
      }
    }

    return NextResponse.json({ success: true, processed_event: event });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error?.message || 'Erro interno no webhook.' }, { status: 500 });
  }
}
