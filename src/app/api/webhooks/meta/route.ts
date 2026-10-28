import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Cliente administrativo para processamento assíncrono de eventos de Webhook da Meta
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Validação de Assinatura HMAC-SHA256 da Meta (Header X-Hub-Signature-256).
 */
function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const signatureParts = signatureHeader.split('sha256=');
  if (signatureParts.length !== 2) return false;

  const expectedSignature = signatureParts[1];
  const hmac = crypto.createHmac('sha256', appSecret);
  const calculatedSignature = hmac.update(rawBody).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(calculatedSignature, 'hex')
  );
}

/**
 * GET: Handshake e Verificação do Webhook pela Meta for Developers.
 * Parâmetros enviados pela Meta:
 * - hub.mode: 'subscribe'
 * - hub.verify_token: token configurado no painel da Meta
 * - hub.challenge: valor numérico aleatório a ser ecoado
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token) {
    // Consulta se o verify_token pertence a algum estabelecimento ativo
    const { data: config } = await supabaseAdmin
      .from('tenant_whatsapp_configs')
      .select('tenant_id')
      .eq('webhook_verify_token', token)
      .limit(1)
      .maybeSingle();

    if (config) {
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  return NextResponse.json({ error: 'Verificação de Webhook rejeitada.' }, { status: 403 });
}

interface MetaWebhookStatusEvent {
  id: string; // wamid.HBgL...
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message: string }>;
}

interface MetaWebhookMessageEvent {
  from: string; // telefone do cliente (ex: "5511999998888")
  id: string;   // wamid.HBgL...
  timestamp: string;
  type: 'text' | 'button' | 'interactive' | string;
  context?: {
    id: string; // wamid da notificação original à qual o cliente respondeu
    from?: string;
  };
  text?: {
    body: string;
  };
  button?: {
    text: string;
    payload: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
}

/**
 * POST: Recepção de Notificações de Entrega (DLR) e Leitura da Meta.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get('x-hub-signature-256');

    let bodyJson: {
      object?: string;
      entry?: Array<{
        id?: string;
        changes?: Array<{
          value?: {
            messaging_product?: string;
            metadata?: {
              display_phone_number?: string;
              phone_number_id?: string;
            };
            statuses?: MetaWebhookStatusEvent[];
            messages?: MetaWebhookMessageEvent[];
          };
        }>;
      }>;
    };

    try {
      bodyJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Payload JSON inválido' }, { status: 400 });
    }

    if (bodyJson.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const entries = bodyJson.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value;
        const phoneNumberId = val?.metadata?.phone_number_id;

        // Se houver phone_number_id, opcionalmente valida a assinatura do app_secret configurado
        if (phoneNumberId && signatureHeader) {
          const { data: config } = await supabaseAdmin
            .from('tenant_whatsapp_configs')
            .select('meta_app_secret')
            .eq('phone_number_id', phoneNumberId)
            .maybeSingle();

          if (config?.meta_app_secret) {
            const isValid = verifyMetaSignature(rawBody, signatureHeader, config.meta_app_secret);
            if (!isValid) {
              console.warn('[Webhook Meta] Assinatura HMAC rejeitada para o phoneNumberId:', phoneNumberId);
              return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
            }
          }
        }

        const statuses = val?.statuses || [];
        for (const st of statuses) {
          const providerMsgId = st.id;
          const statusName = st.status;
          const timestampIso = st.timestamp
            ? new Date(parseInt(st.timestamp, 10) * 1000).toISOString()
            : new Date().toISOString();

          let errorDetails: string | null = null;
          if (st.errors && st.errors.length > 0) {
            errorDetails = `${st.errors[0].title}: ${st.errors[0].message} (Código ${st.errors[0].code})`;
          }

          // Atualiza o status na notification_queue
          // Tenta via RPC v2 com proteção anti-regressão de status
          const { error: rpcErrV2 } = await supabaseAdmin.rpc('update_notification_delivery_status_v2', {
            p_provider_message_id: providerMsgId,
            p_status: statusName,
            p_timestamp: timestampIso,
            p_error_details: errorDetails,
          });

          if (rpcErrV2) {
            // Tenta via RPC v1 da migration 26
            const { error: rpcErrV1 } = await supabaseAdmin.rpc('update_notification_delivery_status', {
              p_provider_message_id: providerMsgId,
              p_status: statusName,
              p_timestamp: timestampIso,
              p_error_details: errorDetails,
            });

            // Se nenhuma RPC estiver ativa, atualiza diretamente garantindo a não-regressão
            if (rpcErrV1) {
              const { data: currentMsg } = await supabaseAdmin
                .from('notification_queue')
                .select('delivery_status, read_at')
                .eq('provider_message_id', providerMsgId)
                .maybeSingle();

              // NUNCA regride se já estiver lido
              if (currentMsg?.read_at) {
                continue;
              }

              if (statusName === 'delivered') {
                await supabaseAdmin
                  .from('notification_queue')
                  .update({
                    delivery_status: 'delivered' as unknown as string,
                    delivered_at: timestampIso,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('provider_message_id', providerMsgId);
              } else if (statusName === 'read') {
                await supabaseAdmin
                  .from('notification_queue')
                  .update({
                    delivery_status: 'read' as unknown as string,
                    delivered_at: timestampIso,
                    read_at: timestampIso,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('provider_message_id', providerMsgId);
              } else if (statusName === 'failed') {
                await supabaseAdmin
                  .from('notification_queue')
                  .update({
                    status: 'failed',
                    delivery_status: 'failed' as unknown as string,
                    error_message: errorDetails || 'Falha na entrega via Meta.',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('provider_message_id', providerMsgId);
              }
            }
          }
        }

        // 2. PROCESSAMENTO DE MENSAGENS E RESPOSTAS DE CLIENTES (Fase 5.6 - Confirmação)
        const messages = val?.messages || [];
        for (const msg of messages) {
          const senderPhone = msg.from;
          const messageId = msg.id;
          let messageText: string | null = null;
          let buttonPayload: string | null = null;

          if (msg.type === 'text' && msg.text?.body) {
            messageText = msg.text.body;
          } else if (msg.type === 'button' && msg.button) {
            messageText = msg.button.text;
            buttonPayload = msg.button.payload;
          } else if (msg.type === 'interactive' && msg.interactive) {
            if (msg.interactive.type === 'button_reply' && msg.interactive.button_reply) {
              messageText = msg.interactive.button_reply.title;
              buttonPayload = msg.interactive.button_reply.id;
            } else if (msg.interactive.type === 'list_reply' && msg.interactive.list_reply) {
              messageText = msg.interactive.list_reply.title;
              buttonPayload = msg.interactive.list_reply.id;
            }
          }

          // Captura contexto de resposta direta (context.id = wamid da notificação à qual o cliente respondeu)
          const contextMessageId = msg.context?.id || null;

          // Invoca a RPC transacional process_whatsapp_appointment_confirmation da migration 29
          if (phoneNumberId) {
            await supabaseAdmin.rpc('process_whatsapp_appointment_confirmation', {
              p_phone_number_id: phoneNumberId,
              p_sender_phone: senderPhone,
              p_message_id: messageId,
              p_message_text: messageText,
              p_button_payload: buttonPayload,
              p_context_message_id: contextMessageId,
              p_raw_payload: msg,
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
