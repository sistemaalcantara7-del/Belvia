'use server';

import { createClient as createAnonSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  AIChatMessage,
  SendChatMessageInput,
  SendChatMessageResponse,
  AIChatAnamnesisPrompt,
} from '@/types/aiReceptionist';
import {
  getPublicTenantCatalogAction,
  getPublicAvailableSlotsAction,
  createPublicBookingAction,
} from '@/lib/actions/publicBooking';
import { sanitizeDigits } from '@/lib/utils/masks';
import {
  detectAllMatchingServices,
  detectProfessionalInConversation,
  detectDateInConversation,
  detectUnmatchedServiceIntent,
  isProfessionalQuestion,
  getProfessionalsForService,
  normalizeNlpText,
} from '@/lib/ai/nlpMatcher';

function getPublicSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL ou chave pública não configurados no ambiente.');
  }

  return createAnonSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getServiceRoleSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Configurações do Supabase ausentes no servidor.');
  }

  return createAnonSupabaseClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Inicia ou recupera uma sessão de chat conversacional
 */
export async function initAIChatSessionAction(
  tenantSlug: string,
  existingToken?: string
): Promise<{ success: boolean; sessionToken: string; initialMessage: AIChatMessage; error?: string }> {
  try {
    const catalogRes = await getPublicTenantCatalogAction(tenantSlug);
    if (!catalogRes.success || !catalogRes.data) {
      return {
        success: false,
        sessionToken: '',
        initialMessage: {
          id: 'error',
          role: 'assistant',
          content: 'Estabelecimento indisponível no momento.',
          createdAt: new Date().toISOString(),
        },
        error: 'Estabelecimento indisponível.',
      };
    }

    const { tenant } = catalogRes.data;
    const businessName = tenant.settings?.booking_settings?.business_name || tenant.name;
    const sessionToken = existingToken || crypto.randomUUID();

    const welcomeText = `Olá! Sou a assistente virtual da **${businessName}**. Estou aqui para tirar dúvidas sobre nossos serviços, consultar horários livres e ajudar você a agendar seu atendimento. Como posso te ajudar hoje?`;

    const initialMessage: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: welcomeText,
      createdAt: new Date().toISOString(),
    };

    return {
      success: true,
      sessionToken,
      initialMessage,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao iniciar chat com IA.';
    return {
      success: false,
      sessionToken: '',
      initialMessage: {
        id: 'err',
        role: 'assistant',
        content: 'Não foi possível iniciar o chat.',
        createdAt: new Date().toISOString(),
      },
      error: msg,
    };
  }
}

/**
 * Motor de IA e Raciocínio Conversacional no Servidor
 */
export async function sendAIChatMessageAction(
  input: SendChatMessageInput,
  history: AIChatMessage[] = []
): Promise<SendChatMessageResponse> {
  try {
    const { tenantSlug, sessionToken, message, clientIp = 'unknown' } = input;
    const cleanUserMessage = message.trim();

    if (!cleanUserMessage) {
      return { success: false, error: 'Mensagem vazia.' };
    }

    // 1. Carrega dados reais do tenant no servidor (grounding estrito)
    const catalogRes = await getPublicTenantCatalogAction(tenantSlug);
    if (!catalogRes.success || !catalogRes.data) {
      return { success: false, error: 'Estabelecimento não encontrado.' };
    }

    const { tenant, services, professionals } = catalogRes.data;
    const businessName = tenant.settings?.booking_settings?.business_name || tenant.name;
    const businessPhone = tenant.settings?.booking_settings?.whatsapp || tenant.settings?.whatsapp;

    // 2. Configurações dos Provedores de IA (OpenAI como primário, Gemini como secundário desativado por padrão)
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const openAiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

    // 3. Monta o Prompt de Contexto do Estabelecimento e Instruções Rígidas
    const servicesListText = services
      .map(
        (s) =>
          `- ${s.name} (ID: ${s.id}): R$ ${Number(s.price).toFixed(2)}, Duração: ${s.duration_minutes} min, Categoria: ${s.category}`
      )
      .join('\n');

    const professionalsListText = professionals
      .map((p) => `- ${p.full_name} (ID: ${p.id}): ${p.specialty}`)
      .join('\n');

    const todayStr = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .split('/')
      .reverse()
      .join('-'); // YYYY-MM-DD

    const systemPrompt = `Você é a Recepcionista Virtual oficial da clínica/salão "${businessName}".
Data de hoje: ${todayStr} (horário de Brasília).

DIRETRIZES FUNDAMENTAIS DE SEGURANÇA E NEGÓCIO:
1. Você JAMAIS inventa serviços, preços ou horários que não estejam no catálogo abaixo.
2. Seu tom é caloroso, profissional, polido e prestativo.
3. Se o cliente perguntar sobre serviços ou preços, responda baseando-se estritamente nesta lista:
${servicesListText}

4. Nossos profissionais habilitados:
${professionalsListText}

5. FLUXO DE AGENDAMENTO:
   Passo 1: Identificar o serviço desejado.
   Passo 2: Identificar a preferência de profissional (ou qualquer disponível).
   Passo 3: Identificar a data desejada (ex: hoje, amanhã, dia X).
   Passo 4: Consultar horários livres reais (nunca inventar).
   Passo 5: Solicitar nome completo e WhatsApp com DDD do cliente.
   Passo 6: Apresentar resumo completo e pedir confirmação explícita (ex: "Podemos confirmar sua reserva para [serviço] no dia [data] às [horário]?").
   Passo 7: Somente após a confirmação com SIM/CONFIRMAR, instrua o sistema a efetivar.

Se não houver chave de modelo ou ocorrer falha, sugira falar diretamente pelo WhatsApp: ${businessPhone || 'diretamente na recepção'}.`;

    // 4. VERIFICAÇÃO ATÔMICA DA COTA MENSAL E RESERVA DE TOKENS (FASE 7.5.1)
    // Regra estrita: Plano Essencial utiliza exclusivamente atendimento determinístico.
    // Plano Inteligente: Realiza reserva atômica via RPC 'reserve_ai_tokens' para prevenir condições de corrida.
    let isQuotaAllowed = false;
    let reservationId: string | null = null;

    if (tenant.plan === 'smart') {
      try {
        const adminClient = getServiceRoleSupabase();
        const { data: reserveRes } = await adminClient.rpc('reserve_ai_tokens', {
          p_tenant_id: tenant.id,
          p_tokens_to_reserve: 800,
          p_session_token: input.sessionToken || null,
        });

        interface ReserveReturn {
          allowed?: boolean;
          reservation_id?: string;
          reason?: string;
        }
        const typedReserve = reserveRes as ReserveReturn | null;

        if (typedReserve && typedReserve.allowed === true) {
          isQuotaAllowed = true;
          reservationId = typedReserve.reservation_id || null;
        } else {
          isQuotaAllowed = false;
          console.warn(`[AI Quota Limit] Tenant ${tenant.slug} não possui cota disponível (${typedReserve?.reason || 'esgotada'}). Ativando fallback determinístico.`);
        }
      } catch {
        // Fallback resiliente caso a RPC 38 ainda não tenha sido executada no banco
        isQuotaAllowed = true;
      }
    } else {
      // Plano Essencial: Não consome IA generativa
      isQuotaAllowed = false;
    }

    // 5. CHAMADA AO PROVEDOR DE IA COM ISOLAMENTO SERVER-SIDE, TIMEOUT E LOG DE CONSUMO
    // Provedor Primário: OpenAI (gpt-4o-mini por padrão)
    if (openAiApiKey && isQuotaAllowed) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiApiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: openAiModel,
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.slice(-8).map((h) => ({
                role: h.role === 'assistant' ? 'assistant' : 'user',
                content: h.content,
              })),
              { role: 'user', content: cleanUserMessage },
            ],
            temperature: 0.4,
            max_tokens: 600,
          }),
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const replyText =
            data?.choices?.[0]?.message?.content ||
            'Como posso te ajudar com o agendamento?';

          const promptTokens = data?.usage?.prompt_tokens || 0;
          const completionTokens = data?.usage?.completion_tokens || 0;
          const totalTokens = data?.usage?.total_tokens || 0;

          // LIQUIDAÇÃO E REGISTRO ATÔMICO DE CONSUMO REAL (Migration 38/39 via service_role)
          const adminClient = getServiceRoleSupabase();
          Promise.resolve(
            adminClient.rpc('settle_ai_usage', {
              p_tenant_id: tenant.id,
              p_reservation_id: reservationId,
              p_provider: 'openai',
              p_model: openAiModel,
              p_prompt_tokens: promptTokens,
              p_completion_tokens: completionTokens,
              p_session_token: input.sessionToken || null,
            })
          ).catch(() => {
            // Fallback caso a migration 38 ainda não tenha sido aplicada
            adminClient.rpc('record_ai_usage', {
              p_tenant_id: tenant.id,
              p_provider: 'openai',
              p_model: openAiModel,
              p_prompt_tokens: promptTokens,
              p_completion_tokens: completionTokens,
              p_session_token: input.sessionToken || null,
            });
          });

          const usageData = {
            promptTokens,
            completionTokens,
            totalTokens,
            model: openAiModel,
            provider: 'openai' as const,
          };

          console.info(`[OpenAI Usage - Tenant ${tenant.slug}] Model: ${openAiModel} | Tokens: ${totalTokens} (Prompt: ${promptTokens}, Comp: ${completionTokens})`);

          const assistantMsg: AIChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: replyText,
            createdAt: new Date().toISOString(),
          };

          return {
            success: true,
            message: assistantMsg,
            usage: usageData,
          };
        } else {
          const errorBody = await response.text().catch(() => '');
          console.warn(`[OpenAI API Warning] HTTP ${response.status} no modelo ${openAiModel}: ${errorBody}. Tentando contingência.`);
        }
      } catch (err: unknown) {
        const error = err as Error;
        const isTimeout = error.name === 'AbortError';
        console.warn(`[OpenAI API Warning] ${isTimeout ? 'Timeout na chamada' : 'Erro de conexão'}: ${error.message}. Tentando contingência.`);
      }
    }

    // Provedor Secundário (Alternativa): Google Gemini (caso OpenAI não configurada e Gemini habilitado)
    if (!openAiApiKey && geminiApiKey && isQuotaAllowed) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: systemPrompt }] },
                ...history.slice(-8).map((h) => ({
                  role: h.role === 'assistant' ? 'model' : 'user',
                  parts: [{ text: h.content }],
                })),
                { role: 'user', parts: [{ text: cleanUserMessage }] },
              ],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 600,
              },
            }),
          }
        );

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const replyText =
            data?.candidates?.[0]?.content?.parts?.[0]?.text ||
            'Como posso te ajudar com o agendamento?';

          const usageMetadata = data?.usageMetadata;
          const usageData = usageMetadata
            ? {
                promptTokens: usageMetadata.promptTokenCount || 0,
                completionTokens: usageMetadata.candidatesTokenCount || 0,
                totalTokens: usageMetadata.totalTokenCount || 0,
                model: geminiModel,
                provider: 'gemini' as const,
              }
            : undefined;

          const assistantMsg: AIChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: replyText,
            createdAt: new Date().toISOString(),
          };

          return {
            success: true,
            message: assistantMsg,
            usage: usageData,
          };
        } else {
          const errorBody = await response.text().catch(() => '');
          console.warn(`[Gemini API Warning] Falha na chamada ao modelo ${geminiModel} (HTTP ${response.status}): ${errorBody}. Ativando fallback determinístico.`);
        }
      } catch (err: unknown) {
        const error = err as Error;
        const isTimeout = error.name === 'AbortError';
        console.warn(`[Gemini API Warning] ${isTimeout ? 'Timeout na chamada' : 'Erro de conexão'}: ${error.message}. Ativando fallback determinístico.`);
      }
    }

    // 6. MOTOR DETERMINÍSTICO DE CONTINGÊNCIA & LINGUAGEM NATURAL (PLANO ESSENCIAL OU FALLBACK)
    // Conduz o cliente na esteira: Intenção -> Serviço -> Profissional -> Data -> Horários Reais -> Confirmação
    const normMsg = normalizeNlpText(cleanUserMessage);
    let reply = '';
    let suggestedSlotsData: AIChatMessage['suggestedSlots'] = undefined;
    let quickRepliesData: AIChatMessage['quickReplies'] = undefined;

    // A. Detecta se é pergunta específica sobre profissional / quem vai atender
    const isTeamInquiry = isProfessionalQuestion(cleanUserMessage);

    // B. Detecta se o cliente está perguntando de valores / preços
    const isPriceOrListInquiry =
      !isTeamInquiry &&
      (normMsg.includes('preco') ||
        normMsg.includes('quanto custa') ||
        normMsg.includes('valor') ||
        normMsg.includes('tabela') ||
        normMsg.includes('cardapio') ||
        (normMsg.includes('servico') && !normMsg.includes('agendar')));

    // C. Detecta serviços compatíveis na mensagem ou no histórico recente
    const { matches: matchedServices, source: servicesSource } = detectAllMatchingServices(
      cleanUserMessage,
      services,
      history
    );

    // D. Detecta profissional nominalmente ou preservado do histórico (ou por pronomes "ela"/"ele")
    const matchedProfessional = detectProfessionalInConversation(cleanUserMessage, professionals, history);

    // E. Detecta data (hoje, amanhã ou data explícita)
    const { targetDate, isExplicitInCurrentMessage } = detectDateInConversation(cleanUserMessage, todayStr, history);
    const isTomorrow = targetDate > todayStr;
    const dateLabel = isTomorrow ? 'amanhã' : 'hoje';

    // F. Detecta se a mensagem atual expressa intenção ativa de consulta de horário/agendamento
    const isScheduleIntent =
      isExplicitInCurrentMessage ||
      normMsg.includes('horario') ||
      normMsg.includes('vaga') ||
      normMsg.includes('atende amanha') ||
      normMsg.includes('atende hoje') ||
      normMsg.includes('agendar') ||
      normMsg.includes('marcar');

    // G. Intenção sem correspondência no catálogo
    const hasUnmatchedIntent = matchedServices.length === 0 && detectUnmatchedServiceIntent(cleanUserMessage);

    // -------------------------------------------------------------------------
    // PRIORIDADE 1: PERGUNTA SOBRE PROFISSIONAIS / QUEM VAI ATENDER
    // -------------------------------------------------------------------------
    if (isTeamInquiry) {
      if (matchedServices.length > 1) {
        // Ambiguidade preservada: informa os profissionais vinculados a cada opção
        const optionsBreakdown = matchedServices.map((s) => {
          const eligibleProfs = getProfessionalsForService(s.id, professionals);
          if (eligibleProfs.length > 0) {
            const profNames = eligibleProfs.map((p) => p.full_name).join(', ');
            return `• **${s.name}**: atendido por ${profNames}`;
          } else {
            return `• **${s.name}**: nenhum profissional habilitado no momento`;
          }
        });

        reply = `Em **${businessName}**, estes são os profissionais disponíveis para cada procedimento:\n\n` +
          optionsBreakdown.join('\n') +
          `\n\nQual dessas opções você prefere agendar?`;

        quickRepliesData = matchedServices.map((s) => ({
          label: s.name,
          actionText: s.name,
        }));
      } else if (matchedServices.length === 1) {
        // Apenas um serviço no escopo
        const s = matchedServices[0];
        const eligibleProfs = getProfessionalsForService(s.id, professionals);

        if (eligibleProfs.length > 0) {
          const profNames = eligibleProfs.map((p) => `**${p.full_name}** (${p.specialty})`).join(' ou ');
          reply = `Para o procedimento **${s.name}**, o atendimento é realizado por ${profNames}.\n\nDeseja que eu consulte os horários livres com algum deles para hoje ou amanhã?`;

          quickRepliesData = eligibleProfs.map((p) => ({
            label: `Com ${p.full_name.split(' ')[0]}`,
            actionText: `Horários com ${p.full_name}`,
          }));
        } else {
          reply = `No momento, não temos nenhum profissional ativo vinculado especificamente ao procedimento **${s.name}** em **${businessName}**.\n\nDeseja conhecer nossos outros procedimentos disponíveis?`;

          quickRepliesData = services.slice(0, 3).map((srv) => ({
            label: srv.name,
            actionText: srv.name,
          }));
        }
      } else {
        // Pergunta geral sobre a equipe
        if (professionals.length > 0) {
          reply = `Nossa equipe em **${businessName}** conta com especialistas qualificados:\n\n` +
            professionals.map((p) => `• **${p.full_name}** — ${p.specialty}`).join('\n') +
            `\n\nVocê tem preferência por algum especialista ou gostaria de conhecer nossos procedimentos?`;

          quickRepliesData = professionals.map((p) => ({
            label: p.full_name.split(' ')[0],
            actionText: `Com ${p.full_name}`,
          }));
        } else {
          reply = `No momento não há profissionais ativos listados em nosso sistema para **${businessName}**.\n\nPor favor, entre em contato diretamente pelo nosso WhatsApp para mais informações.`;
        }
      }
    }
    // -------------------------------------------------------------------------
    // PRIORIDADE 2: CONSULTA DE PREÇOS / VALORES
    // -------------------------------------------------------------------------
    else if (isPriceOrListInquiry) {
      if (matchedServices.length === 1) {
        const s = matchedServices[0];
        reply = `O procedimento **${s.name}** custa **R$ ${Number(s.price).toFixed(2)}** com duração estimada de **${s.duration_minutes} minutos**.\n\nDeseja verificar os horários disponíveis para agendarmos?`;
        quickRepliesData = [
          { label: 'Ver horários para hoje', actionText: `Horários para hoje para ${s.name}` },
          { label: 'Ver horários para amanhã', actionText: `Horários para amanhã para ${s.name}` },
        ];
      } else if (matchedServices.length > 1) {
        reply = `Aqui estão os valores para as opções em **${businessName}**:\n\n` +
          matchedServices
            .map((s) => `• **${s.name}**: R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)`)
            .join('\n') +
          `\n\nQual dessas opções você gostaria de agendar?`;

        quickRepliesData = matchedServices.map((s) => ({
          label: s.name,
          actionText: s.name,
        }));
      } else {
        const sampleServices = services.slice(0, 5);
        reply = `Temos opções incríveis em **${businessName}**! Veja alguns dos nossos principais procedimentos:\n\n` +
          sampleServices
            .map((s) => `• **${s.name}**: R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)`)
            .join('\n') +
          `\n\nQual desses você gostaria de agendar?`;

        quickRepliesData = sampleServices.slice(0, 4).map((s) => ({
          label: s.name,
          actionText: s.name,
        }));
      }
    }
    // -------------------------------------------------------------------------
    // PRIORIDADE 3: AMBIGUIDADE (múltiplos serviços compatíveis sem escolha definida)
    // -------------------------------------------------------------------------
    else if (matchedServices.length > 1 && !isScheduleIntent) {
      reply = `Temos mais de uma opção para o que você procura em **${businessName}**! Qual destas você prefere agendar?\n\n` +
        matchedServices
          .map((s) => `• **${s.name}**: R$ ${Number(s.price).toFixed(2)} (${s.duration_minutes} min)`)
          .join('\n') +
        `\n\nBasta me responder com a opção desejada ou clicar em um dos botões abaixo:`;

      quickRepliesData = matchedServices.map((s) => ({
        label: s.name,
        actionText: s.name,
      }));
    }
    // -------------------------------------------------------------------------
    // PRIORIDADE 4: SERVIÇO DEFINIDO OU ESCOLHIDO (CONSULTA REAL DE SLOTS)
    // -------------------------------------------------------------------------
    else if (matchedServices.length >= 1) {
      // Se houver mais de um serviço mas o cliente expressou agendamento, consulta para o primeiro ou o mais específico
      const chosenService = matchedServices.length === 1 ? matchedServices[0] : matchedServices[0];

      // Consulta slots reais na agenda
      const slotsRes = await getPublicAvailableSlotsAction(
        tenant.id,
        chosenService.id,
        matchedProfessional ? matchedProfessional.id : null,
        targetDate
      );

      const hasSlots = slotsRes.success && slotsRes.slots && slotsRes.slots.length > 0;

      if (hasSlots) {
        const topSlots = (slotsRes.slots || []).slice(0, 4);
        suggestedSlotsData = topSlots.map((s) => ({
          time: s.slot_time,
          professionalName: s.professional_name,
          professionalId: s.professional_id,
          date: targetDate,
          serviceId: chosenService.id,
          serviceName: chosenService.name,
        }));

        const profMentionStr = matchedProfessional ? ` com ${matchedProfessional.full_name}` : '';
        reply = `Perfeito! Para **${chosenService.name}**${profMentionStr}, consultei nossa agenda em tempo real e temos estes horários livres para **${dateLabel}**:\n\n` +
          topSlots.map((s) => `🕒 **${s.slot_time}** com ${s.professional_name}`).join('\n') +
          `\n\nQual desses horários você prefere? Você pode clicar no horário desejado acima para concluir seu agendamento em instantes!`;
      } else {
        const profNotice = matchedProfessional ? ` com ${matchedProfessional.full_name}` : '';
        reply = `Para **${chosenService.name}**${profNotice}, não encontrei horários livres para **${dateLabel}** na agenda online. Gostaria de consultar para outro dia, ou prefere falar diretamente conosco pelo WhatsApp?`;

        quickRepliesData = [
          { label: 'Verificar para amanhã', actionText: `Horários para amanhã para ${chosenService.name}` },
          { label: 'Falar no WhatsApp', actionText: 'Gostaria do WhatsApp da recepção' },
        ];
      }
    }
    // -------------------------------------------------------------------------
    // PRIORIDADE 5: SERVIÇO NÃO EXISTENTE
    // -------------------------------------------------------------------------
    else if (hasUnmatchedIntent) {
      const availableCategories = Array.from(new Set(services.map((s) => s.category).filter(Boolean)));
      const sampleNames = services.slice(0, 4).map((s) => s.name).join(', ');

      reply = `No momento não temos esse procedimento específico cadastrado em nosso catálogo oficial da **${businessName}**.\n\nNossos serviços disponíveis incluem: **${sampleNames}**${
        availableCategories.length > 0 ? ` (categorias: ${availableCategories.join(', ')})` : ''
      }.\n\nDeseja agendar algum desses ou tirar alguma dúvida?`;

      quickRepliesData = services.slice(0, 4).map((s) => ({
        label: s.name,
        actionText: s.name,
      }));
    }
    // -------------------------------------------------------------------------
    // PRIORIDADE 6: SAUDAÇÃO PADRÃO
    // -------------------------------------------------------------------------
    else {
      const sample = services.slice(0, 3).map((s) => s.name).join(', ');
      reply = `Olá! Sou a assistente virtual da **${businessName}**. Posso te apresentar nossos serviços (como ${sample}), informar valores ou consultar horários livres para seu atendimento. O que você gostaria de agendar hoje?`;

      quickRepliesData = services.slice(0, 3).map((s) => ({
        label: s.name,
        actionText: s.name,
      }));
    }

    const assistantMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
      suggestedSlots: suggestedSlotsData,
      quickReplies: quickRepliesData,
    };

    return {
      success: true,
      message: assistantMsg,
      isFallback: !geminiApiKey && !openAiApiKey,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha na resposta do assistente.';
    return {
      success: false,
      error: msg,
    };
  }
}

/**
 * Confirmação de Agendamento disparada diretamente pela conversa
 * Retorna os dados do agendamento criado e verifica se há modelo de anamnese compatível
 */
export async function confirmAppointmentFromAIChatAction(params: {
  tenantSlug: string;
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  clientName: string;
  clientWhatsapp: string;
}) {
  const bookingRes = await createPublicBookingAction({
    tenantSlug: params.tenantSlug,
    serviceId: params.serviceId,
    professionalId: params.professionalId,
    date: params.date,
    time: params.time,
    clientName: params.clientName,
    clientWhatsapp: params.clientWhatsapp,
    clientNotes: 'Agendado através da Recepcionista Virtual com IA',
  });

  if (!bookingRes.success || !bookingRes.appointmentId) {
    return bookingRes;
  }

  // Tenta carregar modelo de anamnese aprovado para o estabelecimento
  try {
    const supabase = getPublicSupabase();
    // 1. Obter tenant_id pelo slug
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('slug', params.tenantSlug)
      .single();

    if (tenant) {
      // 2. Localizar serviço para checar categoria (ex: Facial, Corporal, etc.)
      const { data: service } = await supabase
        .from('services')
        .select('name, category')
        .eq('id', params.serviceId)
        .eq('tenant_id', tenant.id)
        .single();

      const serviceCategory = service?.category || 'Facial';

      // 3. Buscar templates ativos no tenant
      const { data: templates } = await supabase
        .from('anamnesis_templates')
        .select(`
          id,
          title,
          category,
          questions:anamnesis_questions (
            id,
            question_text,
            question_type,
            options,
            order_index,
            is_required
          )
        `)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (templates && templates.length > 0) {
        // Encontra o template mais adequado à categoria do serviço ou o primeiro ativo
        const matched =
          templates.find(
            (t) =>
              t.category?.toLowerCase() === serviceCategory.toLowerCase() ||
              t.title?.toLowerCase().includes(serviceCategory.toLowerCase())
          ) || templates[0];

        const sortedQuestions = (matched.questions || []).sort(
          (a, b) => a.order_index - b.order_index
        );

        if (sortedQuestions.length > 0) {
          const firstQ = sortedQuestions[0];
          const anamnesisPrompt: AIChatAnamnesisPrompt = {
            appointmentId: bookingRes.appointmentId,
            templateId: matched.id,
            templateTitle: matched.title,
            category: matched.category,
            currentQuestionIndex: 0,
            totalQuestions: sortedQuestions.length,
            consentPending: true,
            status: 'pending_consent',
            question: {
              id: firstQ.id,
              text: firstQ.question_text,
              type: firstQ.question_type,
              options: Array.isArray(firstQ.options) ? firstQ.options : undefined,
            },
          };

          return {
            ...bookingRes,
            anamnesisPrompt,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Não foi possível inicializar a anamnese inicial:', err);
  }

  return bookingRes;
}

/**
 * Salva o consentimento ou resposta progressiva da Anamnese Conversacional com IA
 */
export async function answerConversationalAnamnesisAction(params: {
  sessionToken: string;
  appointmentId: string;
  templateId: string;
  consentAccepted: boolean;
  questionId?: string;
  answerText?: string;
  answerJson?: unknown;
  allergies?: string;
  medications?: string;
  relevantConditions?: string;
  healthHistory?: string;
  treatmentGoal?: string;
  isFinalQuestion?: boolean;
  clientIp?: string;
}) {
  try {
    const supabase = getPublicSupabase();

    const consentTerms =
      'Autorizo o tratamento de dados pessoais sensíveis de saúde estritamente para avaliação prévia de segurança do atendimento estético agendado, conforme o Art. 11 da LGPD.';

    const status = params.isFinalQuestion ? 'completed' : 'partial';

    const answersPayload = params.questionId
      ? [
          {
            question_id: params.questionId,
            answer_text: params.answerText || null,
            answer_json: params.answerJson || null,
          },
        ]
      : [];

    const { data: rpcRes, error } = await supabase.rpc(
      'save_conversational_anamnesis_progress',
      {
        p_session_token: params.sessionToken,
        p_appointment_id: params.appointmentId,
        p_template_id: params.templateId,
        p_status: status,
        p_consent_accepted: params.consentAccepted,
        p_consent_terms: consentTerms,
        p_allergies: params.allergies || null,
        p_health_history: params.healthHistory || null,
        p_medications: params.medications || null,
        p_relevant_conditions: params.relevantConditions || null,
        p_treatment_goal: params.treatmentGoal || null,
        p_answers: answersPayload,
        p_client_ip: params.clientIp || 'unknown',
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: rpcRes,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao registrar anamnese.';
    return { success: false, error: msg };
  }
}

/**
 * Busca a próxima pergunta do questionário de anamnese
 */
export async function getNextAnamnesisQuestionAction(params: {
  templateId: string;
  nextIndex: number;
}) {
  try {
    const supabase = getPublicSupabase();
    const { data: questions, error } = await supabase
      .from('anamnesis_questions')
      .select('id, question_text, question_type, options, order_index')
      .eq('template_id', params.templateId)
      .order('order_index', { ascending: true });

    if (error || !questions) {
      return { success: false, error: 'Questionário não encontrado.' };
    }

    if (params.nextIndex >= questions.length) {
      return {
        success: true,
        finished: true,
        totalQuestions: questions.length,
      };
    }

    const nextQ = questions[params.nextIndex];
    return {
      success: true,
      finished: false,
      totalQuestions: questions.length,
      question: {
        id: nextQ.id,
        text: nextQ.question_text,
        type: nextQ.question_type,
        options: Array.isArray(nextQ.options) ? nextQ.options : undefined,
      },
      currentIndex: params.nextIndex,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao carregar pergunta.';
    return { success: false, error: msg };
  }
}

/**
 * Consulta Administrativa: Obtém o consumo e métricas de cota de IA do tenant
 */
export async function getTenantAIUsageMetricsAction(tenantSlug: string) {
  try {
    const supabase = await createClient();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug, plan')
      .eq('slug', tenantSlug)
      .single();

    if (!tenant) {
      return { success: false, error: 'Tenant não encontrado.' };
    }

    // 1. Consulta Cota Mensal do Tenant via RPC
    const { data: quotaData } = await supabase.rpc('check_ai_monthly_quota', {
      p_tenant_id: tenant.id,
    });

    // 2. Consulta os últimos logs de consumo (sem dados sensíveis)
    const { data: logs } = await supabase
      .from('ai_usage_logs')
      .select('id, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, created_at')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(30);

    interface QuotaRpcReturn {
      allowed: boolean;
      plan: string;
      monthly_limit: number;
      used_tokens: number;
      remaining_tokens: number;
      percentage_used: number;
    }
    const typedQuota = quotaData as QuotaRpcReturn | null;
    const monthlyLimit = typedQuota?.monthly_limit || (tenant.plan === 'smart' ? 300000 : 50000);
    const usedTokens = typedQuota?.used_tokens || 0;
    const remainingTokens = Math.max(0, monthlyLimit - usedTokens);
    const percentageUsed = Math.min(100, Math.round((usedTokens / monthlyLimit) * 100));

    // Estima custo total consumido no mês (gpt-4o-mini médio: ~$0.0003 por 1k tokens)
    const estimatedCostUsd = Number(((usedTokens / 1000) * 0.0003).toFixed(4));

    return {
      success: true,
      data: {
        plan: tenant.plan,
        monthlyLimit,
        usedTokens,
        remainingTokens,
        percentageUsed,
        estimatedCostUsd,
        recentLogs: logs || [],
      },
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Falha ao buscar métricas de IA.';
    return { success: false, error: msg };
  }
}
