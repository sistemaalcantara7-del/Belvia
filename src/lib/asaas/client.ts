/**
 * ZELUNIA SaaS - Cliente do Gateway Asaas da Plataforma
 * Gerencia a cobrança de assinaturas recorrentes dos estabelecimentos.
 * Opera por padrão em modo Sandbox quando ASAAS_ENV !== 'production'.
 */

const ASAAS_ENV = process.env.ASAAS_ENV || 'sandbox';
const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';

export const ASAAS_BASE_URL =
  ASAAS_ENV === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

export const IS_ASAAS_SANDBOX = ASAAS_ENV !== 'production';

interface AsaasCustomerPayload {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  externalReference?: string;
}

interface AsaasSubscriptionPayload {
  customer: string;
  billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED';
  value: number;
  nextDueDate: string;
  cycle: 'MONTHLY';
  description: string;
  externalReference?: string;
}

export async function asaasRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ success: boolean; data?: T; error?: string }> {
  if (!ASAAS_API_KEY) {
    // Modo de contingência para desenvolvimento / testes sem credencial Asaas
    return {
      success: false,
      error: 'Chave de API do Asaas (ASAAS_API_KEY) não configurada no servidor.',
    };
  }

  try {
    const url = `${ASAAS_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg =
        data?.errors?.[0]?.description ||
        data?.message ||
        `Erro Asaas HTTP ${res.status}`;
      return { success: false, error: errMsg };
    }

    return { success: true, data };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      error: error?.message || 'Falha na comunicação com o Asaas.',
    };
  }
}

/**
 * Cria ou localiza um cliente na conta da plataforma Asaas
 */
export async function findOrCreateAsaasCustomer(
  payload: AsaasCustomerPayload
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  if (!ASAAS_API_KEY) {
    if (ASAAS_ENV === 'production') {
      return {
        success: false,
        error: 'Chave de API do Asaas de produção não configurada no servidor.',
      };
    }
    const mockId = `cus_mock_${Math.random().toString(36).substring(2, 9)}`;
    return { success: true, customerId: mockId };
  }

  // 1. Tenta buscar por e-mail existente
  const search = await asaasRequest<{ data: Array<{ id: string }> }>(
    `/customers?email=${encodeURIComponent(payload.email)}`
  );

  if (search.success && search.data && search.data.data.length > 0) {
    return { success: true, customerId: search.data.data[0].id };
  }

  // 2. Se não existir, cria o cliente
  const created = await asaasRequest<{ id: string }>(
    '/customers',
    'POST',
    payload
  );

  if (created.success && created.data?.id) {
    return { success: true, customerId: created.data.id };
  }

  return { success: false, error: created.error || 'Erro ao registrar cliente no Asaas.' };
}

/**
 * Cria uma assinatura mensal na plataforma
 */
export async function createAsaasSubscription(
  payload: AsaasSubscriptionPayload
): Promise<{ success: boolean; subscriptionId?: string; error?: string }> {
  if (!ASAAS_API_KEY) {
    if (ASAAS_ENV === 'production') {
      return {
        success: false,
        error: 'Chave de API do Asaas de produção não configurada no servidor.',
      };
    }
    const mockSubId = `sub_mock_${Math.random().toString(36).substring(2, 9)}`;
    return { success: true, subscriptionId: mockSubId };
  }

  const created = await asaasRequest<{ id: string }>(
    '/subscriptions',
    'POST',
    payload
  );

  if (created.success && created.data?.id) {
    return { success: true, subscriptionId: created.data.id };
  }

  return { success: false, error: created.error || 'Erro ao criar assinatura no Asaas.' };
}

/**
 * Atualiza o valor de uma assinatura existente (ex: upgrade/downgrade de plano)
 */
export async function updateAsaasSubscriptionValue(
  subscriptionId: string,
  newValue: number,
  newDescription: string
): Promise<{ success: boolean; error?: string }> {
  if (!ASAAS_API_KEY) {
    if (ASAAS_ENV === 'production') {
      return {
        success: false,
        error: 'Chave de API do Asaas de produção não configurada no servidor.',
      };
    }
    return { success: true };
  }

  const updated = await asaasRequest(
    `/subscriptions/${subscriptionId}`,
    'PUT',
    {
      value: newValue,
      description: newDescription,
      updatePendingPayments: true,
    }
  );

  return { success: updated.success, error: updated.error };
}

/**
 * Cancela uma assinatura no Asaas
 */
export async function cancelAsaasSubscription(
  subscriptionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!ASAAS_API_KEY) {
    if (ASAAS_ENV === 'production') {
      return {
        success: false,
        error: 'Chave de API do Asaas de produção não configurada no servidor.',
      };
    }
    return { success: true };
  }

  const canceled = await asaasRequest(
    `/subscriptions/${subscriptionId}`,
    'DELETE'
  );

  return { success: canceled.success, error: canceled.error };
}

/**
 * Obtém a lista de cobranças vinculadas a uma assinatura
 */
export async function getAsaasSubscriptionPayments(
  subscriptionId: string
): Promise<{
  success: boolean;
  payments?: Array<{
    id: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    value: number;
    status: string;
    dueDate: string;
    billingType: string;
  }>;
  error?: string;
}> {
  if (!ASAAS_API_KEY) {
    if (ASAAS_ENV === 'production') {
      return {
        success: false,
        error: 'Chave de API do Asaas de produção não configurada no servidor.',
      };
    }
    return {
      success: true,
      payments: [
        {
          id: `pay_mock_${subscriptionId}`,
          invoiceUrl: 'https://sandbox.asaas.com/i/mock-invoice',
          value: 59.90,
          status: 'PENDING',
          dueDate: new Date().toISOString().split('T')[0],
          billingType: 'PIX',
        },
      ],
    };
  }

  const res = await asaasRequest<{
    data: Array<{
      id: string;
      invoiceUrl?: string;
      bankSlipUrl?: string;
      value: number;
      status: string;
      dueDate: string;
      billingType: string;
    }>;
  }>(`/subscriptions/${subscriptionId}/payments`);

  if (res.success && res.data) {
    return { success: true, payments: res.data.data };
  }

  return { success: false, error: res.error || 'Falha ao buscar faturas da assinatura.' };
}

/**
 * Obtém QRCode e Payload Copia-e-Cola para pagamento via Pix
 */
export async function getAsaasPaymentPixQrCode(
  paymentId: string
): Promise<{
  success: boolean;
  encodedImage?: string;
  payload?: string;
  expirationDate?: string;
  error?: string;
}> {
  if (!ASAAS_API_KEY) {
    if (ASAAS_ENV === 'production') {
      return {
        success: false,
        error: 'Chave de API do Asaas de produção não configurada no servidor.',
      };
    }
    return {
      success: true,
      encodedImage: '',
      payload: '00020126580014br.gov.bcb.pix0136mock-zelunia-key520400005303986540559.905802BR5916ALCANTARA SISTEMAS6009SAO PAULO62070503***6304MOCK',
      expirationDate: new Date(Date.now() + 86400000).toISOString(),
    };
  }

  const res = await asaasRequest<{
    encodedImage?: string;
    payload?: string;
    expirationDate?: string;
  }>(`/payments/${paymentId}/pixQrCode`);

  if (res.success && res.data) {
    return {
      success: true,
      encodedImage: res.data.encodedImage,
      payload: res.data.payload,
      expirationDate: res.data.expirationDate,
    };
  }

  return { success: false, error: res.error || 'Falha ao gerar QR Code Pix.' };
}
