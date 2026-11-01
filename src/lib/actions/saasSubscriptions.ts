'use server';

import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedTenantContext } from '@/lib/tenant/context';
import { PlanType } from '@/types/tenant';
import { PLAN_CONFIGS } from '@/types/plans';
import {
  SaasSubscription,
  SaasInvoice,
  SubscriptionOverviewData,
} from '@/types/subscriptions';
import {
  findOrCreateAsaasCustomer,
  createAsaasSubscription,
  updateAsaasSubscriptionValue,
  cancelAsaasSubscription,
  getAsaasSubscriptionPayments,
  getAsaasPaymentPixQrCode,
  IS_ASAAS_SANDBOX,
} from '@/lib/asaas/client';
import { revalidatePath } from 'next/cache';

/**
 * Obtém os dados completos da assinatura e histórico de faturas do estabelecimento
 */
export async function getSubscriptionOverviewAction(
  tenantSlug: string
): Promise<{ success: boolean; data?: SubscriptionOverviewData; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context) {
      return { success: false, error: 'Acesso não autorizado.' };
    }

    const supabase = await createClient();

    // 1. Garante que exista registro em saas_subscriptions
    const { data: rpcRes, error: rpcErr } = await supabase.rpc(
      'get_or_create_tenant_subscription',
      { p_tenant_id: context.tenantId }
    );

    if (rpcErr || !rpcRes?.success) {
      // Fallback: busca direta se a RPC ainda não tiver sido aplicada
      const { data: directSub } = await supabase
        .from('saas_subscriptions')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .maybeSingle();

      const subData: SaasSubscription = directSub || {
        id: crypto.randomUUID(),
        tenant_id: context.tenantId,
        plan: context.plan,
        status: 'trial',
        billing_cycle: 'monthly',
        amount: PLAN_CONFIGS[context.plan].priceMonthly,
        asaas_customer_id: null,
        asaas_subscription_id: null,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 7 * 86400000).toISOString(),
        grace_period_days: 5,
        trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        canceled_at: null,
        cancellation_reason: null,
        last_payment_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: invoices } = await supabase
        .from('saas_invoices')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .order('due_date', { ascending: false });

      return {
        success: true,
        data: {
          subscription: subData,
          invoices: (invoices || []) as SaasInvoice[],
          tenantPlan: context.plan,
          canManage: context.role === 'owner' || context.role === 'admin',
          isSandBox: IS_ASAAS_SANDBOX,
        },
      };
    }

    const subscription = rpcRes.subscription as SaasSubscription;

    // 2. Busca histórico de cobranças do tenant
    const { data: invoices } = await supabase
      .from('saas_invoices')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .order('due_date', { ascending: false });

    return {
      success: true,
      data: {
        subscription,
        invoices: (invoices || []) as SaasInvoice[],
        tenantPlan: context.plan,
        canManage: context.role === 'owner' || context.role === 'admin',
        isSandBox: IS_ASAAS_SANDBOX,
      },
    };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error?.message || 'Erro ao carregar dados da assinatura.' };
  }
}

/**
 * Cria ou ativa a assinatura recorrente via Asaas
 */
export interface SubscribeActionResult {
  success: boolean;
  error?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodePayload?: string;
  pixQrCodeImage?: string;
  status?: string;
}

/**
 * Cria ou ativa a assinatura recorrente via Asaas
 * ATENÇÃO (Regra de Ouro): NÃO altera status para 'active' nem libera acesso antes
 * da confirmação de pagamento autenticada pelo webhook do Asaas.
 */
export async function subscribeToPlanAction(
  tenantSlug: string,
  targetPlan: PlanType,
  billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO'
): Promise<SubscribeActionResult> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context || (context.role !== 'owner' && context.role !== 'admin')) {
      return { success: false, error: 'Apenas proprietários podem gerenciar assinaturas.' };
    }

    const planConfig = PLAN_CONFIGS[targetPlan];
    if (!planConfig) {
      return { success: false, error: 'Plano inválido.' };
    }

    const supabase = await createClient();

    // 1. Busca perfil do usuário proprietário para vincular ao Asaas
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', context.userId)
      .single();

    // 2. Busca assinatura atual existente no banco
    const { data: currentSub } = await supabase
      .from('saas_subscriptions')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    // 3. Localiza ou cria cliente corporativo no Asaas vinculado ao tenant
    let asaasCustomerId = currentSub?.asaas_customer_id;
    if (!asaasCustomerId) {
      const customerRes = await findOrCreateAsaasCustomer({
        name: profile?.full_name || context.tenantName,
        email: profile?.email || `${tenantSlug}@zelunia.com.br`,
        phone: profile?.phone || undefined,
        externalReference: context.tenantId,
      });

      if (!customerRes.success || !customerRes.customerId) {
        return { success: false, error: customerRes.error || 'Falha ao registrar cliente no gateway.' };
      }
      asaasCustomerId = customerRes.customerId;
    }

    // 4. Data de primeiro vencimento: hoje para Pix ou amanhã
    const dueDate = new Date();
    if (billingType !== 'PIX') {
      dueDate.setDate(dueDate.getDate() + 1);
    }
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // 5. Criação ou reutilização da assinatura no Asaas
    let asaasSubscriptionId = currentSub?.asaas_subscription_id;

    if (!asaasSubscriptionId) {
      const subRes = await createAsaasSubscription({
        customer: asaasCustomerId,
        billingType,
        value: planConfig.priceMonthly,
        nextDueDate: dueDateStr,
        cycle: 'MONTHLY',
        description: `Assinatura ZELUNIA — Plano ${planConfig.name} (${context.tenantName})`,
        externalReference: context.tenantId,
      });

      if (!subRes.success || !subRes.subscriptionId) {
        return { success: false, error: subRes.error || 'Falha ao gerar assinatura no Asaas.' };
      }
      asaasSubscriptionId = subRes.subscriptionId;
    } else if (currentSub && currentSub.amount !== planConfig.priceMonthly) {
      // Se já existia assinatura e houve mudança de plano, sincroniza valor
      await updateAsaasSubscriptionValue(
        asaasSubscriptionId,
        planConfig.priceMonthly,
        `Assinatura ZELUNIA — Plano ${planConfig.name} (${context.tenantName})`
      );
    }

    // 6. Obtém a primeira cobrança/fatura gerada para exibir link / QR code Pix
    let invoiceUrl: string | undefined;
    let bankSlipUrl: string | undefined;
    let pixQrCodePayload: string | undefined;
    let pixQrCodeImage: string | undefined;

    const paymentsRes = await getAsaasSubscriptionPayments(asaasSubscriptionId);
    if (paymentsRes.success && paymentsRes.payments && paymentsRes.payments.length > 0) {
      const pendingPayment = paymentsRes.payments.find(p => p.status === 'PENDING') || paymentsRes.payments[0];
      invoiceUrl = pendingPayment.invoiceUrl;
      bankSlipUrl = pendingPayment.bankSlipUrl;

      // Se for Pix, busca QR Code gerado pelo Asaas
      if (billingType === 'PIX' && pendingPayment.id) {
        const pixRes = await getAsaasPaymentPixQrCode(pendingPayment.id);
        if (pixRes.success) {
          pixQrCodePayload = pixRes.payload;
          pixQrCodeImage = pixRes.encodedImage;
        }
      }

      // Registra de forma idempotente em saas_invoices se houver paymentId
      if (pendingPayment.id) {
        await supabase.from('saas_invoices').upsert(
          {
            tenant_id: context.tenantId,
            subscription_id: currentSub?.id || undefined,
            asaas_payment_id: pendingPayment.id,
            amount: pendingPayment.value || planConfig.priceMonthly,
            status: 'pending',
            billing_type: billingType,
            due_date: pendingPayment.dueDate || dueDateStr,
            invoice_url: invoiceUrl || null,
            bank_slip_url: bankSlipUrl || null,
            pix_qr_code: pixQrCodePayload || null,
          },
          { onConflict: 'asaas_payment_id' }
        );
      }
    }

    // 7. Atualiza saas_subscriptions SEM liberar acesso ('active') prematuramente.
    // Preserva 'trial' se ainda estiver válido, ou mantém 'overdue'/'suspended' aguardando pagamento
    const currentStatus = currentSub?.status || 'trial';
    const preservedStatus = currentStatus === 'trial' ? 'trial' : 'overdue';

    await supabase
      .from('saas_subscriptions')
      .upsert(
        {
          tenant_id: context.tenantId,
          plan: targetPlan,
          status: preservedStatus,
          amount: planConfig.priceMonthly,
          asaas_customer_id: asaasCustomerId,
          asaas_subscription_id: asaasSubscriptionId,
        },
        { onConflict: 'tenant_id' }
      );

    revalidatePath(`/${tenantSlug}/configuracoes`);

    return {
      success: true,
      invoiceUrl,
      bankSlipUrl,
      pixQrCodePayload,
      pixQrCodeImage,
      status: preservedStatus,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error?.message || 'Falha ao processar contratação da assinatura.' };
  }
}

/**
 * Altera o plano do tenant (Upgrade / Downgrade)
 */
export async function changePlanAction(
  tenantSlug: string,
  newPlan: PlanType
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context || (context.role !== 'owner' && context.role !== 'admin')) {
      return { success: false, error: 'Permissão negada.' };
    }

    const targetConfig = PLAN_CONFIGS[newPlan];
    if (!targetConfig) {
      return { success: false, error: 'Plano inválido.' };
    }

    const supabase = await createClient();

    // 1. Busca assinatura atual
    const { data: sub } = await supabase
      .from('saas_subscriptions')
      .select('*')
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    if (sub?.asaas_subscription_id) {
      // Atualiza valor no Asaas
      await updateAsaasSubscriptionValue(
        sub.asaas_subscription_id,
        targetConfig.priceMonthly,
        `Assinatura ZELUNIA — Plano ${targetConfig.name} (${context.tenantName})`
      );
    }

    // 2. Atualiza registros no banco
    await supabase
      .from('saas_subscriptions')
      .update({
        plan: newPlan,
        amount: targetConfig.priceMonthly,
      })
      .eq('tenant_id', context.tenantId);

    await supabase
      .from('tenants')
      .update({ plan: newPlan })
      .eq('id', context.tenantId);

    revalidatePath(`/${tenantSlug}/configuracoes`);
    return { success: true };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error?.message || 'Erro ao alterar plano.' };
  }
}

/**
 * Cancela a assinatura recorrente
 */
export async function cancelSubscriptionAction(
  tenantSlug: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const context = await getAuthenticatedTenantContext(tenantSlug);
    if (!context || context.role !== 'owner') {
      return { success: false, error: 'Apenas o proprietário do estabelecimento pode cancelar.' };
    }

    const supabase = await createClient();

    const { data: sub } = await supabase
      .from('saas_subscriptions')
      .select('asaas_subscription_id')
      .eq('tenant_id', context.tenantId)
      .maybeSingle();

    if (sub?.asaas_subscription_id) {
      await cancelAsaasSubscription(sub.asaas_subscription_id);
    }

    await supabase
      .from('saas_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        cancellation_reason: reason || 'Cancelado pelo usuário',
      })
      .eq('tenant_id', context.tenantId);

    revalidatePath(`/${tenantSlug}/configuracoes`);
    return { success: true };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error?.message || 'Erro ao cancelar assinatura.' };
  }
}
