import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email/resend';
import {
  emailPaymentConfirmedTemplate,
  emailSubscriptionOverdueTemplate,
} from '@/lib/email/templates';
import { PLAN_CONFIGS } from '@/types/plans';
import { PlanType } from '@/types/tenant';

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
      // 1. Verifica se esta fatura já havia sido confirmada anteriormente (idempotência estrita)
      const { data: existingInvoice } = await supabase
        .from('saas_invoices')
        .select('status, paid_at')
        .eq('asaas_payment_id', asaasPaymentId)
        .maybeSingle();

      const wasAlreadyPaid = existingInvoice?.status === 'paid' && !!existingInvoice?.paid_at;

      // Pagamento confirmado via webhook autenticado: ativa assinatura e tenant com o plano contratado
      const nextDueDateStr = new Date(Date.now() + 30 * 86400000).toISOString();

      const { data: updatedSub } = await supabase
        .from('saas_subscriptions')
        .update({
          status: 'active',
          last_payment_at: new Date().toISOString(),
          current_period_end: nextDueDateStr,
          last_webhook_event: event,
        })
        .eq('tenant_id', tenantId)
        .select('plan')
        .maybeSingle();

      const effectivePlan = (updatedSub?.plan || 'essential') as PlanType;

      // Sincroniza o plano efetivo e status ativo na tabela tenants
      await supabase
        .from('tenants')
        .update({
          status: 'active',
          plan: effectivePlan,
        })
        .eq('id', tenantId);

      // Dispara e-mail transacional de pagamento confirmado apenas se não era pagamento previamente processado
      if (!wasAlreadyPaid) {
        try {
          const { data: ownerUser } = await supabase
            .from('tenant_users')
            .select('user_id, tenants(name, slug)')
            .eq('tenant_id', tenantId)
            .eq('role', 'owner')
            .eq('status', 'active')
            .maybeSingle();

        if (ownerUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', ownerUser.user_id)
            .maybeSingle();

          interface TenantRelation {
            name: string;
            slug: string;
          }
          const tenantInfo = ownerUser.tenants as unknown as TenantRelation;

          if (profile?.email && tenantInfo) {
            const planKey = (updatedSub?.plan || 'essential') as PlanType;
            const planConfig = PLAN_CONFIGS[planKey] || PLAN_CONFIGS.essential;
            const paidMail = emailPaymentConfirmedTemplate({
              name: profile.full_name || tenantInfo.name,
              clinicName: tenantInfo.name,
              slug: tenantInfo.slug,
              planName: planConfig.name,
              amount: Number(payment.value || planConfig.priceMonthly),
              nextDueDate: nextDueDateStr,
              invoiceNumber: payment.invoiceNumber || null,
            });

            sendEmail({
              to: profile.email,
              subject: paidMail.subject,
              html: paidMail.html,
              tags: [{ name: 'category', value: 'payment_confirmed' }],
            }).catch((err) => console.error('[Resend Payment Confirm Error]', err));
          }
        }
      } catch (mailErr) {
        console.error('[Resend Owner Lookup Error]', mailErr);
      }
    }
    } else if (event === 'PAYMENT_OVERDUE') {
      // Pagamento atrasado: entra em tolerância ('overdue') ou suspensão ('suspended')
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
        // Bloqueio controlado de operações sem exclusão de dados
        await supabase
          .from('tenants')
          .update({ status: 'suspended' })
          .eq('id', tenantId);
      }

      // Dispara e-mail de aviso de cobrança vencida
      try {
        const { data: ownerUser } = await supabase
          .from('tenant_users')
          .select('user_id, tenants(name, slug)')
          .eq('tenant_id', tenantId)
          .eq('role', 'owner')
          .eq('status', 'active')
          .maybeSingle();

        if (ownerUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', ownerUser.user_id)
            .maybeSingle();

          interface TenantRelation {
            name: string;
            slug: string;
          }
          const tenantInfo = ownerUser.tenants as unknown as TenantRelation;

          if (profile?.email && tenantInfo) {
            const overdueMail = emailSubscriptionOverdueTemplate({
              name: profile.full_name || tenantInfo.name,
              clinicName: tenantInfo.name,
              slug: tenantInfo.slug,
              amount: Number(payment.value || 0),
              dueDate: payment.dueDate || new Date().toISOString(),
              invoiceUrl: payment.invoiceUrl || null,
              graceDays,
            });

            sendEmail({
              to: profile.email,
              subject: overdueMail.subject,
              html: overdueMail.html,
              tags: [{ name: 'category', value: 'subscription_overdue' }],
            }).catch((err) => console.error('[Resend Overdue Error]', err));
          }
        }
      } catch (mailErr) {
        console.error('[Resend Overdue Lookup Error]', mailErr);
      }
    } else if (['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE'].includes(event)) {
      // Estorno ou contestação: suspende acesso imediatamente para análise
      await supabase
        .from('saas_subscriptions')
        .update({
          status: 'suspended',
          last_webhook_event: event,
        })
        .eq('tenant_id', tenantId);

      await supabase
        .from('tenants')
        .update({ status: 'suspended' })
        .eq('id', tenantId);
    } else if (['PAYMENT_DELETED'].includes(event)) {
      // Cobrança excluída / cancelada
      await supabase
        .from('saas_subscriptions')
        .update({
          last_webhook_event: event,
        })
        .eq('tenant_id', tenantId);
    }

    return NextResponse.json({ success: true, processed_event: event });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error?.message || 'Erro interno no webhook.' }, { status: 500 });
  }
}
