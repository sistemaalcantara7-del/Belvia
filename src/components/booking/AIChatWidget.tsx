'use client';

import React, { useState, useRef, useEffect, useTransition } from 'react';
import {
  Send,
  X,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Edit2,
  Flower2,
  CalendarDays,
  Users,
  Sparkles,
} from 'lucide-react';
import { AIChatMessage, AIChatAnamnesisPrompt, SuggestedSlotItem } from '@/types/aiReceptionist';
import {
  initAIChatSessionAction,
  sendAIChatMessageAction,
  answerConversationalAnamnesisAction,
  getNextAnamnesisQuestionAction,
  confirmAppointmentFromAIChatAction,
} from '@/lib/actions/aiReceptionist';
import {
  getPublicAvailableSlotsAction,
  lookupClientByPhoneAction,
} from '@/lib/actions/publicBooking';
import { PublicCatalogData } from '@/types/publicBooking';
import { maskPhone, sanitizeDigits } from '@/lib/utils/masks';
import { formatAppointmentDate, formatAppointmentTime } from '@/lib/utils/timezone';
import Link from 'next/link';
import Image from 'next/image';
import { MarkdownMessage } from './MarkdownMessage';

interface AIChatWidgetProps {
  catalog: PublicCatalogData;
}

interface ChatBookingDraft {
  step: 'idle' | 'awaiting_name' | 'awaiting_phone' | 'awaiting_confirmation' | 'submitting' | 'confirmed';
  serviceId: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
  date: string;
  time: string;
  price?: number;
  clientName?: string;
  clientWhatsapp?: string;
}

export function AIChatWidget({ catalog }: AIChatWidgetProps) {
  const { tenant } = catalog;
  const bookingSettings = tenant.settings?.booking_settings;
  // Custom primary color
  const businessName = bookingSettings?.business_name || tenant.name;

  const [isOpen, setIsOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, startSendTransition] = useTransition();
  const [hasInitialized, setHasInitialized] = useState(false);

  // Fluxo de Agendamento Nativo Dentro do Chat
  const [bookingDraft, setBookingDraft] = useState<ChatBookingDraft | null>(null);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  // Estado da Anamnese Ativa no Chat
  const [activeAnamnesis, setActiveAnamnesis] = useState<AIChatAnamnesisPrompt | null>(null);
  const [isSubmittingAnamnesis, setIsSubmittingAnamnesis] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, activeAnamnesis, bookingDraft]);

  // Inicializa sessão ao abrir pela primeira vez
  const handleOpenChat = () => {
    setIsOpen(true);
    if (!hasInitialized) {
      setHasInitialized(true);
      initAIChatSessionAction(tenant.slug).then((res) => {
        if (res.success && res.initialMessage) {
          setSessionToken(res.sessionToken);
          setMessages([res.initialMessage]);
        }
      });
    }
  };

  const handleQuickReply = (actionText: string) => {
    if (isSending || isBookingSubmitting) return;

    // Se estiver no card de confirmação de agendamento
    if (bookingDraft && bookingDraft.step === 'awaiting_confirmation') {
      if (actionText === 'confirm_booking') {
        executeInChatBooking();
        return;
      }
      if (actionText === 'edit_booking') {
        cancelOrResetDraft('alterar');
        return;
      }
    }

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: actionText,
      createdAt: new Date().toISOString(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);

    startSendTransition(async () => {
      const res = await sendAIChatMessageAction(
        {
          tenantSlug: tenant.slug,
          sessionToken,
          message: actionText,
        },
        newHistory
      );

      if (res.success && res.message) {
        setMessages((prev) => [...prev, res.message!]);
      } else {
        const errorMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            res.error ||
            'Desculpe, tive uma instabilidade momentânea. Se preferir, você pode agendar diretamente no botão acima!',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    });
  };

  // Clique no horário disponível: inicia ou atualiza o funil de agendamento DENTRO do chat
  const handleSelectSlot = (slot: SuggestedSlotItem) => {
    if (isBookingSubmitting) return;

    // Garante que o slot tenha data e hora válidas
    if (!slot.date || !slot.time) return;

    const srv = catalog.services.find((s) => s.id === slot.serviceId) || catalog.services[0];
    const serviceId = slot.serviceId || srv?.id || '';
    const serviceName = slot.serviceName || srv?.name || 'Serviço';
    const price = srv ? Number(srv.price) : undefined;
    const formattedDate = formatAppointmentDate(slot.date);

    // Preserva nome e WhatsApp caso o cliente já tenha preenchido anteriormente (ex: reagendamento/conflito)
    const existingName = bookingDraft?.clientName?.trim();
    const existingWhatsapp = bookingDraft?.clientWhatsapp?.trim();

    const userChoiceMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Quero agendar às ${slot.time} com ${slot.professionalName}`,
      createdAt: new Date().toISOString(),
    };

    if (existingName && existingName.length >= 3 && existingWhatsapp && existingWhatsapp.length >= 10) {
      // Cliente já havia informado os dados: avança direto para a confirmação com o novo horário!
      const updatedDraft: ChatBookingDraft = {
        step: 'awaiting_confirmation',
        serviceId,
        serviceName,
        professionalId: slot.professionalId,
        professionalName: slot.professionalName,
        date: slot.date,
        time: slot.time,
        price,
        clientName: existingName,
        clientWhatsapp: existingWhatsapp,
      };

      setBookingDraft(updatedDraft);

      const priceText = updatedDraft.price ? `R$ ${updatedDraft.price.toFixed(2)}` : 'A combinar';
      const summaryMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Novo horário selecionado com sucesso! ✨\n\nConfira o resumo atualizado antes de confirmarmos:\n\n• **Cliente:** ${updatedDraft.clientName}\n• **WhatsApp:** ${maskPhone(updatedDraft.clientWhatsapp)}\n• **Serviço:** ${updatedDraft.serviceName}\n• **Profissional:** ${updatedDraft.professionalName}\n• **Data:** ${formattedDate}\n• **Horário:** ${updatedDraft.time}\n• **Valor:** ${priceText}\n\nPodemos confirmar sua reserva na agenda da **${businessName}**?`,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userChoiceMsg, summaryMsg]);
    } else {
      // Primeira escolha: define o rascunho com o horário e solicita PRIMEIRO o WhatsApp com DDD
      setBookingDraft({
        step: 'awaiting_phone',
        serviceId,
        serviceName,
        professionalId: slot.professionalId,
        professionalName: slot.professionalName,
        date: slot.date,
        time: slot.time,
        price,
      });

      const assistantAckMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Excelente escolha! ✨\n\nVocê selecionou **${serviceName}** com **${slot.professionalName}** para **${formattedDate} às ${slot.time}**.\n\nPara localizarmos seu cadastro e reservarmos seu horário, por favor, digite o seu **WhatsApp com DDD** (ex: 11 99999-8888):`,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userChoiceMsg, assistantAckMsg]);
    }
  };

  // Cancelar ou alterar rascunho de agendamento
  const cancelOrResetDraft = (reason: 'alterar' | 'cancelar') => {
    // Se for apenas alterar horário, preserva nome e WhatsApp já digitados
    if (reason === 'alterar' && bookingDraft?.clientName && bookingDraft?.clientWhatsapp) {
      setBookingDraft({
        ...bookingDraft,
        step: 'idle',
        time: '',
      });
    } else {
      setBookingDraft(null);
    }

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: reason === 'alterar' ? 'Gostaria de escolher outro horário ou serviço' : 'Cancelar agendamento',
      createdAt: new Date().toISOString(),
    };
    const assistantMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Tudo bem! Qual serviço, profissional ou outro horário você gostaria de consultar?',
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  };

  // Executa o agendamento no Supabase via RPC atômica
  const executeInChatBooking = async () => {
    // Validação estrita: somente executa se tiver horário explícito, serviço e dados do cliente
    if (
      !bookingDraft ||
      !bookingDraft.time ||
      !bookingDraft.serviceId ||
      !bookingDraft.date ||
      !bookingDraft.clientName ||
      !bookingDraft.clientWhatsapp
    ) {
      const missingMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Por favor, selecione um horário disponível clicando em um dos cartões antes de confirmar.',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, missingMsg]);
      return;
    }

    setIsBookingSubmitting(true);

    const bookingRes = await confirmAppointmentFromAIChatAction({
      tenantSlug: tenant.slug,
      serviceId: bookingDraft.serviceId,
      professionalId: bookingDraft.professionalId,
      date: bookingDraft.date,
      time: bookingDraft.time,
      clientName: bookingDraft.clientName,
      clientWhatsapp: bookingDraft.clientWhatsapp,
    });

    setIsBookingSubmitting(false);

    if (bookingRes.success && bookingRes.appointmentId) {
      const persistedClientName = bookingRes.clientName || bookingDraft.clientName;
      const persistedServiceName = bookingRes.serviceName || bookingDraft.serviceName;
      const persistedProfName = bookingRes.professionalName || bookingDraft.professionalName;
      const persistedTime = bookingRes.startTime
        ? formatAppointmentTime(bookingRes.startTime)
        : bookingDraft.time;
      const persistedWhatsapp = bookingRes.clientWhatsapp || bookingDraft.clientWhatsapp;
      const formattedDate = formatAppointmentDate(bookingDraft.date);
      const prompt = 'anamnesisPrompt' in bookingRes ? (bookingRes.anamnesisPrompt as AIChatAnamnesisPrompt) : undefined;

      const successMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `🎉 **Agendamento Confirmado com Sucesso!**\n\nMuito obrigado, **${persistedClientName}**! Seu horário está garantido em nossa agenda oficial:\n\n• **Cliente:** ${persistedClientName}\n• **Serviço:** ${persistedServiceName}\n• **Profissional:** ${persistedProfName}\n• **Data:** ${formattedDate}\n• **Horário:** ${persistedTime}\n• **WhatsApp:** ${maskPhone(persistedWhatsapp)}\n\nNossa equipe já foi notificada. Qualquer dúvida ou imprevisto, estamos à inteira disposição!`,
        createdAt: new Date().toISOString(),
        anamnesisPrompt: prompt,
      };

      setMessages((prev) => [...prev, successMsg]);
      setBookingDraft({
        ...bookingDraft,
        clientName: persistedClientName,
        serviceName: persistedServiceName,
        professionalName: persistedProfName,
        time: persistedTime,
        clientWhatsapp: persistedWhatsapp,
        step: 'confirmed',
      });
    } else {
      // Divergência ou horário não mais disponível: oferece novos horários reais preservando nome e telefone
      const errorReason = bookingRes.message || 'Este horário acabou de ser preenchido por outro cliente.';

      // Consulta horários atualizados da agenda em tempo real
      const freshSlotsRes = await getPublicAvailableSlotsAction(
        tenant.id,
        bookingDraft.serviceId,
        bookingDraft.professionalId || null,
        bookingDraft.date
      );

      // Apresenta a disponibilidade real da agenda calculada pelo servidor
      const freshSlots = (freshSlotsRes.success && freshSlotsRes.slots ? freshSlotsRes.slots : [])
        .slice(0, 4)
        .map((s) => ({
          time: s.slot_time,
          professionalName: s.professional_name,
          professionalId: s.professional_id,
          date: bookingDraft.date,
          serviceId: bookingDraft.serviceId,
          serviceName: bookingDraft.serviceName,
        }));

      const retryMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ **Aviso sobre a vaga:** ${errorReason}\n\n${
          freshSlots.length > 0
            ? 'Para sua comodidade, consultei a agenda novamente agora mesmo e encontrei estes horários livres para o mesmo dia:'
            : 'Não encontramos outros horários livres para este dia. Gostaria de verificar para amanhã ou falar com a recepção?'
        }`,
        createdAt: new Date().toISOString(),
        suggestedSlots: freshSlots,
        quickReplies: freshSlots.length === 0
          ? [
              { label: 'Verificar amanhã', actionText: `Horários para amanhã para ${bookingDraft.serviceName}` },
              { label: 'Outro serviço', actionText: 'Quais outros serviços estão disponíveis?' },
            ]
          : undefined,
      };

      setMessages((prev) => [...prev, retryMsg]);

      // Preserva nome, whatsapp, serviço e data, mas limpa o horário inválido
      setBookingDraft({
        ...bookingDraft,
        step: 'idle',
        time: '',
      });
    }
  };

  const handleSendMessage = () => {
    const text = inputValue.trim();
    if (!text || isSending || isBookingSubmitting) return;

    // Se estiver no fluxo de pergunta aberta de anamnese
    if (activeAnamnesis && activeAnamnesis.status === 'in_progress' && activeAnamnesis.question) {
      handleAnswerAnamnesis(text);
      setInputValue('');
      return;
    }

    // Se estiver no fluxo nativo de agendamento: coleta de WhatsApp e reconhecimento de cliente
    if (bookingDraft && bookingDraft.step === 'awaiting_phone') {
      const cleanDigits = sanitizeDigits(text);
      if (cleanDigits.length < 10 || cleanDigits.length > 11) {
        const errorPromptMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Por favor, digite um **WhatsApp válido com DDD** (10 ou 11 dígitos, ex: 11 98888-7777).',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorPromptMsg]);
        return;
      }

      const formattedPhone = maskPhone(cleanDigits);
      const userMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: formattedPhone,
        createdAt: new Date().toISOString(),
      };

      setInputValue('');

      // Registra verificação com rate-limit e solicita o nome completo com acolhimento cordial
      startSendTransition(async () => {
        await lookupClientByPhoneAction({
          tenantSlug: tenant.slug,
          whatsapp: cleanDigits,
        });

        // Sem verificação por OTP, sempre solicita o nome completo normalmente sem expor dados de cadastro
        setBookingDraft({
          ...bookingDraft,
          clientWhatsapp: cleanDigits,
          step: 'awaiting_name',
        });

        const askNameMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `WhatsApp registrado com sucesso! ✨\n\nAgora, por gentileza, digite o seu **nome completo** para identificação do seu atendimento em **${businessName}**:`,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMsg, askNameMsg]);
      });

      return;
    }

    // Se estiver no fluxo nativo de agendamento: coleta de nome (para clientes novos)
    if (bookingDraft && bookingDraft.step === 'awaiting_name') {
      if (text.length < 3) {
        const errorPromptMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Por favor, informe seu **nome completo** (pelo menos 3 letras) para o registro da reserva.',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorPromptMsg]);
        return;
      }

      const updatedDraft: ChatBookingDraft = {
        ...bookingDraft,
        clientName: text,
        step: 'awaiting_confirmation',
      };
      setBookingDraft(updatedDraft);

      const userMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };

      const formattedDate = formatAppointmentDate(updatedDraft.date);
      const priceText = updatedDraft.price ? `R$ ${updatedDraft.price.toFixed(2)}` : 'A combinar';
      const formattedPhone = updatedDraft.clientWhatsapp ? maskPhone(updatedDraft.clientWhatsapp) : '';

      const summaryMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Perfeito, **${text}**! Confira os dados do seu agendamento antes de confirmarmos:\n\n• **Cliente:** ${text}\n• **WhatsApp:** ${formattedPhone}\n• **Serviço:** ${updatedDraft.serviceName}\n• **Profissional:** ${updatedDraft.professionalName}\n• **Data:** ${formattedDate}\n• **Horário:** ${updatedDraft.time}\n• **Valor:** ${priceText}\n\nPodemos confirmar sua reserva na agenda da **${businessName}**?`,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg, summaryMsg]);
      setInputValue('');
      return;
    }

    // Se estiver no fluxo nativo aguardando confirmação e o cliente responder no campo de texto
    if (bookingDraft && bookingDraft.step === 'awaiting_confirmation') {
      const lower = text.toLowerCase();
      if (lower.includes('sim') || lower.includes('confirma') || lower.includes('pode') || lower.includes('ok') || lower.includes('claro')) {
        setInputValue('');
        executeInChatBooking();
        return;
      } else if (lower.includes('nao') || lower.includes('não') || lower.includes('cancela')) {
        setInputValue('');
        cancelOrResetDraft('cancelar');
        return;
      }
    }

    // Se o cliente tentar digitar "confirmar" ou dados pessoais sem ter selecionado um horário antes
    const lowerText = text.toLowerCase();
    const isPrematureConfirm =
      (!bookingDraft || !bookingDraft.time) &&
      (lowerText === 'confirmar' || lowerText === 'confirma' || lowerText === 'sim' || lowerText === 'confirmar agendamento');

    if (isPrematureConfirm) {
      const promptSlotMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      const assistantAdviseMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Para confirmarmos seu agendamento, primeiro clique em um dos **cartões de horários disponíveis** acima. Qual horário você prefere?',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, promptSlotMsg, assistantAdviseMsg]);
      setInputValue('');
      return;
    }

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue('');

    startSendTransition(async () => {
      const res = await sendAIChatMessageAction(
        {
          tenantSlug: tenant.slug,
          sessionToken,
          message: text,
        },
        newHistory
      );

      if (res.success && res.message) {
        setMessages((prev) => [...prev, res.message!]);
      } else {
        const errorMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            res.error ||
            'Desculpe, tive uma instabilidade momentânea. Se preferir, você pode agendar diretamente no botão acima!',
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    });
  };

  // Aceite do Consentimento da Anamnese
  const handleConsentResponse = async (accepted: boolean) => {
    if (!activeAnamnesis) return;
    setIsSubmittingAnamnesis(true);

    if (!accepted) {
      // Cliente recusou
      const userMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: 'Prefiro preencher na clínica.',
        createdAt: new Date().toISOString(),
      };
      const assistantMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Perfeito! Sem problemas. Quando chegar ao estabelecimento nossa equipe fará a ficha com você. Até logo!',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setActiveAnamnesis(null);
      setIsSubmittingAnamnesis(false);
      return;
    }

    // Registra consentimento inicial
    await answerConversationalAnamnesisAction({
      sessionToken,
      appointmentId: activeAnamnesis.appointmentId,
      templateId: activeAnamnesis.templateId,
      consentAccepted: true,
      isFinalQuestion: false,
    });

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Sim, quero responder a anamnese agora.',
      createdAt: new Date().toISOString(),
    };

    const assistantMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Ótimo! São apenas ${activeAnamnesis.totalQuestions} perguntinhas rápidas para a sua segurança durante o procedimento.\n\n**Pergunta 1 de ${activeAnamnesis.totalQuestions}:**\n${activeAnamnesis.question?.text}`,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setActiveAnamnesis({
      ...activeAnamnesis,
      consentPending: false,
      status: 'in_progress',
    });
    setIsSubmittingAnamnesis(false);
  };

  // Resposta a uma pergunta de anamnese
  const handleAnswerAnamnesis = async (answerVal: string | boolean) => {
    if (!activeAnamnesis || !activeAnamnesis.question) return;
    setIsSubmittingAnamnesis(true);

    const isLast = activeAnamnesis.currentQuestionIndex + 1 >= activeAnamnesis.totalQuestions;
    const answerText = typeof answerVal === 'boolean' ? (answerVal ? 'Sim' : 'Não') : String(answerVal);

    // Salva progressivamente no Supabase
    await answerConversationalAnamnesisAction({
      sessionToken,
      appointmentId: activeAnamnesis.appointmentId,
      templateId: activeAnamnesis.templateId,
      consentAccepted: true,
      questionId: activeAnamnesis.question.id,
      answerText,
      answerJson: typeof answerVal === 'boolean' ? answerVal : undefined,
      allergies: activeAnamnesis.question.text.toLowerCase().includes('alergia') || activeAnamnesis.question.text.toLowerCase().includes('contraindica') ? answerText : undefined,
      healthHistory: activeAnamnesis.question.text.toLowerCase().includes('histórico') || activeAnamnesis.question.text.toLowerCase().includes('doença') ? answerText : undefined,
      isFinalQuestion: isLast,
    });

    // Registra mensagem do usuário
    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: answerText,
      createdAt: new Date().toISOString(),
    };

    if (isLast) {
      // Conclusão
      const doneMsg: AIChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '✨ **Anamnese concluída com sucesso!**\nSuas informações foram salvas com segurança no prontuário e já estão disponíveis para o profissional responsável na clínica. Obrigado por sua colaboração e nos vemos em breve!',
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg, doneMsg]);
      setActiveAnamnesis(null);
      setIsSubmittingAnamnesis(false);
    } else {
      // Avança para próxima pergunta
      const nextIdx = activeAnamnesis.currentQuestionIndex + 1;
      const nextRes = await getNextAnamnesisQuestionAction({
        templateId: activeAnamnesis.templateId,
        nextIndex: nextIdx,
      });

      if (nextRes.success && nextRes.question) {
        const nextQMsg: AIChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**Pergunta ${nextIdx + 1} de ${activeAnamnesis.totalQuestions}:**\n${nextRes.question.text}`,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMsg, nextQMsg]);
        setActiveAnamnesis({
          ...activeAnamnesis,
          currentQuestionIndex: nextIdx,
          question: nextRes.question,
        });
      } else {
        setActiveAnamnesis(null);
      }
      setIsSubmittingAnamnesis(false);
    }
  };

  return (
    <>
      {/* Botão Flutuante com Ilustração Transparente da Assistente Virtual (Prompt 176) */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpenChat}
          className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-40 cursor-pointer focus:outline-hidden transition-transform duration-300 hover:scale-105 active:scale-95 group select-none"
          style={{
            marginBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          aria-label="Abrir atendimento com Assistente Virtual"
        >
          <div className="assistant-float-animation relative w-[180px] sm:w-[220px] md:w-[260px] drop-shadow-xl hover:drop-shadow-2xl transition-all duration-300">
            <Image
              src="/img/assistente.png"
              alt="Assistente Virtual"
              width={1815}
              height={867}
              priority
              className="w-full h-auto object-contain pointer-events-none"
            />
          </div>
        </button>
      )}

      {/* Janela de Chat Aberta (Redesign Prompt 177 - Mockup Humanizado) */}
      {isOpen && (
        <div
          className="fixed bottom-2 right-2 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-16px)] sm:w-[390px] h-[calc(100dvh-16px)] sm:h-[680px] max-h-[calc(100dvh-16px)] sm:max-h-[85vh] bg-[#FFF9F6] rounded-[24px] shadow-[0_20px_60px_-15px_rgba(190,123,117,0.3),0_10px_30px_-10px_rgba(0,0,0,0.12)] border border-[#EADBCE]/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          style={{
            marginBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Cabeçalho Humanizado: 86px altura, fundo #BE7B75, Avatar Feminino 54px */}
          <div className="h-[86px] bg-[#BE7B75] px-4 py-3 text-white flex items-center justify-between shadow-xs shrink-0 select-none relative overflow-hidden">
            {/* Efeito sutil de brilho no topo do cabeçalho */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

            <div className="flex items-center gap-3 min-w-0 z-10">
              {/* Avatar Feminino Circular 54px com anel branco duplo */}
              <div className="relative w-[54px] h-[54px] rounded-full p-[2px] bg-white/40 shadow-md shrink-0">
                <div className="w-full h-full rounded-full overflow-hidden border-2 border-white bg-rose-100 relative">
                  <Image
                    src="/img/assistente-avatar.png"
                    alt="Recepcionista Virtual"
                    width={54}
                    height={54}
                    className="w-full h-full object-cover object-top"
                    priority
                  />
                </div>
              </div>

              {/* Informações: Nome Dinâmico do Estabelecimento e Status */}
              <div className="min-w-0">
                <h3 className="text-base sm:text-[17px] font-bold text-white tracking-tight truncate leading-snug drop-shadow-xs">
                  {businessName}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse shrink-0" />
                  <span className="text-xs text-rose-100 font-medium tracking-wide">
                    Recepcionista Virtual
                  </span>
                </div>
              </div>
            </div>

            {/* Botão Fechar Redondo com efeito translúcido */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all duration-200 active:scale-90 cursor-pointer shrink-0 z-10 border border-white/25 shadow-xs"
              aria-label="Fechar atendimento"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
          </div>

          {/* Área de Mensagens e Corpo do Chat com fundo #FFF9F6 */}
          <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3.5 bg-[#FFF9F6] text-xs relative">
            {/* Ilustração Decorativa da Assistente no Canto Inferior Direito (sem cobrir mensagens) */}
            <div className="absolute right-0 bottom-0 w-[140px] sm:w-[170px] pointer-events-none select-none opacity-90 sm:opacity-95 hidden xs:block z-0">
              <Image
                src="/img/assistente-decor.png"
                alt="Assistente Decorativa"
                width={175}
                height={180}
                className="w-full h-auto object-contain object-bottom drop-shadow-sm"
              />
            </div>

            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 z-10 relative ${
                    isAssistant ? 'justify-start' : 'justify-end'
                  }`}
                >
                  {/* Avatar feminino pequeno (36px) ao lado das respostas da IA */}
                  {isAssistant && (
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-[#EADBCE] shadow-2xs shrink-0 self-start bg-rose-50">
                      <Image
                        src="/img/assistente-avatar.png"
                        alt="Assistente"
                        width={36}
                        height={36}
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  )}

                  <div className="flex flex-col max-w-[85%] sm:max-w-[80%]">
                    {/* Balão de Mensagem */}
                    <div
                      className={`p-3.5 rounded-[18px] leading-relaxed ${
                        isAssistant
                          ? 'bg-white text-[#2C1810] border border-[#EADBCE]/90 rounded-tl-xs shadow-[0_2px_8px_rgba(190,123,117,0.08)]'
                          : 'bg-[#BE7B75] text-white rounded-tr-xs shadow-sm font-medium'
                      }`}
                    >
                      <MarkdownMessage content={msg.content} />
                    </div>

                    {/* Botões Rápidos Humanizados e Estilizados */}
                    {msg.quickReplies && msg.quickReplies.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-1.5 w-full">
                        {msg.quickReplies.map((qr, idx) => {
                          const isServices = qr.label.toLowerCase().includes('serviço') || qr.label.toLowerCase().includes('valor');
                          const isSchedule = qr.label.toLowerCase().includes('agendar') || qr.label.toLowerCase().includes('horário');
                          const isTeam = qr.label.toLowerCase().includes('equipe') || qr.label.toLowerCase().includes('profissional');

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleQuickReply(qr.actionText)}
                              className="px-3.5 py-2 text-xs rounded-full bg-white border border-[#EADBCE] text-[#8E4A43] font-semibold hover:border-[#BE7B75] hover:bg-[#FDF3F0] hover:shadow-xs transition-all duration-200 cursor-pointer text-left shadow-2xs flex items-center gap-2 group active:scale-[0.98] w-fit"
                            >
                              {isServices && <Flower2 className="w-3.5 h-3.5 text-[#BE7B75] group-hover:scale-110 transition-transform" />}
                              {isSchedule && <CalendarDays className="w-3.5 h-3.5 text-[#BE7B75] group-hover:scale-110 transition-transform" />}
                              {isTeam && <Users className="w-3.5 h-3.5 text-[#BE7B75] group-hover:scale-110 transition-transform" />}
                              {!isServices && !isSchedule && !isTeam && <Sparkles className="w-3.5 h-3.5 text-[#BE7B75]" />}
                              <span>{qr.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Sugestões de slots clicáveis */}
                    {msg.suggestedSlots && msg.suggestedSlots.length > 0 && (
                      <div className="mt-2.5 space-y-1.5 w-full">
                        <p className="text-[10px] uppercase font-bold text-[#A86B62] tracking-wider flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 text-[#BE7B75]" />
                          Horários Livres Encontrados:
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {msg.suggestedSlots.map((slot, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSelectSlot(slot)}
                              className="p-2.5 rounded-xl bg-white border border-[#EADBCE] text-center hover:border-[#BE7B75] hover:bg-[#FDF3F0] transition-all cursor-pointer group shadow-2xs"
                            >
                              <span className="font-bold text-[#2C1810] block text-xs group-hover:text-[#BE7B75]">
                                {slot.time}
                              </span>
                              <span className="text-[10px] text-[#A86B62] block truncate">
                                {slot.professionalName.split(' ')[0]}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Card de Anamnese Proposta após confirmação */}
                    {msg.anamnesisPrompt && (
                      <div className="mt-3 w-full p-3 rounded-2xl bg-white border border-rose-200 shadow-xs space-y-2">
                        <div className="flex items-center gap-1.5 text-rose-700 font-bold text-xs">
                          <FileText className="w-4 h-4" />
                          <span>{msg.anamnesisPrompt.templateTitle}</span>
                        </div>
                        <p className="text-[11px] text-[#6B5A55] leading-relaxed">
                          Deseja responder <strong>{msg.anamnesisPrompt.totalQuestions} perguntas rápidas</strong> sobre sua saúde e cuidados para agilizar seu atendimento?
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveAnamnesis(msg.anamnesisPrompt!);
                              handleConsentResponse(true);
                            }}
                            className="flex-1 py-1.5 px-3 rounded-lg text-white font-semibold text-[11px] shadow-2xs hover:opacity-90 cursor-pointer bg-[#BE7B75]"
                          >
                            Sim, responder agora
                          </button>
                          <button
                            type="button"
                            onClick={() => handleConsentResponse(false)}
                            className="py-1.5 px-3 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-semibold text-[11px] cursor-pointer"
                          >
                            Depois
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Card de Confirmação Final do Agendamento */}
            {bookingDraft && bookingDraft.step === 'awaiting_confirmation' && (
              <div className="p-3.5 bg-white rounded-2xl border-2 border-rose-200 shadow-sm space-y-3 animate-in fade-in zoom-in-95 duration-150 z-10 relative">
                <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                  <span className="flex items-center gap-1.5 font-bold text-xs text-[#2C1810]">
                    <CheckCircle2 className="w-4 h-4 text-[#BE7B75]" />
                    Resumo do Agendamento
                  </span>
                  <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    Aguardando Confirmação
                  </span>
                </div>

                <div className="space-y-1.5 text-[11px] text-[#6B5A55]">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Serviço:</span>
                    <strong className="text-[#2C1810]">{bookingDraft.serviceName}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Profissional:</span>
                    <strong className="text-[#2C1810]">{bookingDraft.professionalName}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500">Data e Hora:</span>
                    <strong className="text-[#2C1810]">
                      {bookingDraft.date} às {bookingDraft.time}
                    </strong>
                  </div>
                  {bookingDraft.price !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Valor Estimado:</span>
                      <strong className="text-emerald-700">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        }).format(bookingDraft.price)}
                      </strong>
                    </div>
                  )}
                  {bookingDraft.clientName && (
                    <div className="flex items-center justify-between pt-1 border-t border-rose-50">
                      <span className="text-zinc-500">Cliente:</span>
                      <span className="text-[#2C1810] font-medium">{bookingDraft.clientName}</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isBookingSubmitting}
                    onClick={() => handleQuickReply('confirm_booking')}
                    className="py-2 px-3 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs hover:opacity-95 disabled:opacity-50 cursor-pointer bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isBookingSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Confirmar
                  </button>
                  <button
                    type="button"
                    disabled={isBookingSubmitting}
                    onClick={() => handleQuickReply('edit_booking')}
                    className="py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Alterar
                  </button>
                </div>
              </div>
            )}

            {/* Painel de Resposta Ativa da Anamnese Conversacional */}
            {activeAnamnesis && activeAnamnesis.status === 'in_progress' && activeAnamnesis.question && (
              <div className="p-3 bg-white rounded-2xl border border-rose-200 shadow-xs space-y-2 mt-2 z-10 relative">
                <div className="flex items-center justify-between text-[10px] text-[#A86B62] font-semibold border-b border-rose-100 pb-1.5">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Pergunta {activeAnamnesis.currentQuestionIndex + 1} de {activeAnamnesis.totalQuestions}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveAnamnesis(null)}
                    className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    Pausar
                  </button>
                </div>

                <p className="text-xs font-semibold text-[#2C1810]">
                  {activeAnamnesis.question.text}
                </p>

                {activeAnamnesis.question.type === 'boolean' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isSubmittingAnamnesis}
                      onClick={() => handleAnswerAnamnesis(true)}
                      className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Sim
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingAnamnesis}
                      onClick={() => handleAnswerAnamnesis(false)}
                      className="py-2 px-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                    >
                      Não
                    </button>
                  </div>
                )}

                {(activeAnamnesis.question.type === 'single_choice' || activeAnamnesis.question.type === 'multiple_choice') &&
                  activeAnamnesis.question.options &&
                  activeAnamnesis.question.options.length > 0 && (
                    <div className="grid grid-cols-1 gap-1.5 pt-1">
                      {activeAnamnesis.question.options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={isSubmittingAnamnesis}
                          onClick={() => handleAnswerAnamnesis(opt)}
                          className="py-1.5 px-2.5 rounded-lg text-left bg-zinc-50 hover:bg-rose-50 hover:border-rose-300 border border-zinc-200 text-zinc-800 font-medium text-xs transition-colors cursor-pointer"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                {activeAnamnesis.question.type === 'text' && (
                  <p className="text-[11px] text-[#9B8985] italic">
                    Digite sua resposta no campo abaixo e pressione enviar.
                  </p>
                )}
              </div>
            )}

            {(isSending || isBookingSubmitting) && (
              <div className="flex items-center gap-2 text-[#9B8985] text-xs py-1 z-10 relative">
                <Loader2 className="w-4 h-4 animate-spin text-[#BE7B75]" />
                <span>
                  {isBookingSubmitting ? 'Gravando reserva com segurança...' : 'Digitando resposta...'}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Rodapé Humanizado: campo arredondado, botão enviar circular #BE7B75, LGPD e link convencional */}
          <div className="p-3 sm:p-3.5 bg-white border-t border-[#EADBCE]/80 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type={bookingDraft?.step === 'awaiting_phone' ? 'tel' : 'text'}
                placeholder={
                  activeAnamnesis
                    ? 'Digite sua resposta da anamnese...'
                    : bookingDraft?.step === 'awaiting_name'
                    ? 'Digite seu nome completo...'
                    : bookingDraft?.step === 'awaiting_phone'
                    ? 'Digite seu WhatsApp com DDD...'
                    : 'Pergunte sobre serviços ou horários...'
                }
                value={inputValue}
                onChange={(e) => {
                  if (bookingDraft?.step === 'awaiting_phone') {
                    setInputValue(maskPhone(e.target.value));
                  } else {
                    setInputValue(e.target.value);
                  }
                }}
                className="flex-1 px-4 py-2.5 text-xs rounded-full border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden focus:border-[#BE7B75] text-[#2C1810] placeholder:text-[#9B8985]"
              />
              <button
                type="submit"
                disabled={isSending || isSubmittingAnamnesis || isBookingSubmitting || !inputValue.trim()}
                className="w-9 h-9 rounded-full bg-[#BE7B75] text-white flex items-center justify-center disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all shadow-xs shrink-0 cursor-pointer"
                aria-label="Enviar mensagem"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[11px] text-[#8E7E7A] mt-2.5 px-1 font-medium">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Protegido sob LGPD
              </span>
              <div className="h-3 w-px bg-[#EADBCE]" />
              <Link
                href={`/agendar/${tenant.slug}`}
                className="hover:underline hover:text-[#BE7B75] transition-colors flex items-center gap-1"
              >
                <CalendarDays className="w-3.5 h-3.5 text-[#BE7B75]" />
                Agendamento Convencional
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
