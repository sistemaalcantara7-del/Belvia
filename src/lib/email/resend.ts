/**
 * ZELUNIA SaaS - Serviço Centralizado de E-mails Transacionais com Resend
 * Domínio Remetente Verificado: zelunia.com.br
 * Remetente Padrão: ZELUNIA <no-reply@zelunia.com.br>
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ZELUNIA <no-reply@zelunia.com.br>';

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResponse {
  success: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Envia um e-mail transacional via API REST oficial do Resend.
 * Não depende de bibliotecas externas pesadas e roda em qualquer runtime Node/Edge.
 */
export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResponse> {
  if (!RESEND_API_KEY) {
    // Registro seguro em log sem expor credenciais
    console.warn('[Resend] RESEND_API_KEY não configurada no servidor. Disparo cancelado com segurança.');
    return {
      success: false,
      skipped: true,
      error: 'RESEND_API_KEY não configurada no servidor.',
    };
  }

  try {
    const toRecipients = Array.isArray(payload.to) ? payload.to : [payload.to];

    const body = {
      from: RESEND_FROM_EMAIL,
      to: toRecipients,
      subject: payload.subject,
      html: payload.html,
      reply_to: payload.replyTo,
      tags: payload.tags,
    };

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg = data?.message || data?.error || `Erro HTTP ${res.status} ao comunicar com o Resend`;
      console.error('[Resend Error]', errMsg);
      return {
        success: false,
        error: errMsg,
      };
    }

    return {
      success: true,
      id: data.id,
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error('[Resend Network Error]', error?.message);
    return {
      success: false,
      error: error?.message || 'Falha de conexão com o serviço Resend.',
    };
  }
}
