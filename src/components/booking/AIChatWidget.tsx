'use client';

import React, { useState, useRef, useEffect, useTransition } from 'react';
import {
  Bot,
  Send,
  X,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { AIChatMessage, AIChatAnamnesisPrompt } from '@/types/aiReceptionist';
import {
  initAIChatSessionAction,
  sendAIChatMessageAction,
  answerConversationalAnamnesisAction,
  getNextAnamnesisQuestionAction,
} from '@/lib/actions/aiReceptionist';
import { PublicCatalogData } from '@/types/publicBooking';
import Link from 'next/link';
import { MarkdownMessage } from './MarkdownMessage';

interface AIChatWidgetProps {
  catalog: PublicCatalogData;
}

export function AIChatWidget({ catalog }: AIChatWidgetProps) {
  const { tenant } = catalog;
  const bookingSettings = tenant.settings?.booking_settings;
  const primaryColor = bookingSettings?.primary_color || '#C4837A';
  const businessName = bookingSettings?.business_name || tenant.name;

  const [isOpen, setIsOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, startSendTransition] = useTransition();
  const [hasInitialized, setHasInitialized] = useState(false);

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
  }, [messages, isOpen, activeAnamnesis]);

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

  const handleSendMessage = () => {
    const text = inputValue.trim();
    if (!text || isSending) return;

    // Se estiver no fluxo de pergunta aberta de anamnese
    if (activeAnamnesis && activeAnamnesis.status === 'in_progress' && activeAnamnesis.question) {
      handleAnswerAnamnesis(text);
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
            'Desculpe, tive uma instabilidade momentânea. Se preferir, pode agendar diretamente no botão acima!',
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
      {/* Botão Flutuante Discreto no Canto Inferior Direito */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleOpenChat}
          className="fixed bottom-5 right-5 z-40 px-4 py-3 rounded-full text-white shadow-xl hover:scale-105 transition-all flex items-center gap-2.5 group cursor-pointer"
          style={{ backgroundColor: primaryColor }}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-100 leading-none">
              Atendimento Online
            </p>
            <p className="text-xs font-semibold leading-tight mt-0.5">Falar com Assistente</p>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      )}

      {/* Janela de Chat Aberta */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-full sm:w-96 max-w-[calc(100vw-2rem)] h-[560px] max-h-[85vh] bg-white rounded-3xl shadow-2xl border border-[#EADBCE] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Cabeçalho do Chat */}
          <div
            className="p-4 text-white flex items-center justify-between shadow-xs shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight">{businessName}</h3>
                <p className="text-[11px] text-rose-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Recepcionista Virtual
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-full bg-black/10 hover:bg-black/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#FDFAF8] text-xs">
            {messages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[85%] p-3 rounded-2xl leading-relaxed ${
                      isAssistant
                        ? 'bg-white text-[#2C1810] border border-[#EADBCE] rounded-tl-xs shadow-2xs'
                        : 'text-white rounded-tr-xs shadow-2xs'
                    }`}
                    style={!isAssistant ? { backgroundColor: primaryColor } : undefined}
                  >
                    <MarkdownMessage content={msg.content} />
                  </div>

                  {/* Sugestões de slots clicáveis retornados pela IA */}
                  {msg.suggestedSlots && msg.suggestedSlots.length > 0 && (
                    <div className="mt-2 space-y-1.5 w-full max-w-[85%]">
                      <p className="text-[10px] uppercase font-bold text-[#A86B62] tracking-wider">
                        Horários Livres Encontrados:
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {msg.suggestedSlots.map((slot, idx) => (
                          <Link
                            key={idx}
                            href={`/agendar/${tenant.slug}`}
                            className="p-2 rounded-xl bg-white border border-[#EADBCE] text-center hover:border-[#C4837A] hover:bg-[#FAF6F3] transition-colors"
                          >
                            <span className="font-bold text-[#2C1810] block text-xs">
                              {slot.time}
                            </span>
                            <span className="text-[10px] text-[#A86B62] block truncate">
                              {slot.professionalName.split(' ')[0]}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Card de Anamnese Proposta após confirmação */}
                  {msg.anamnesisPrompt && (
                    <div className="mt-3 w-full max-w-[90%] p-3 rounded-2xl bg-white border border-rose-200 shadow-xs space-y-2">
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
                          className="flex-1 py-1.5 px-3 rounded-lg text-white font-semibold text-[11px] shadow-2xs hover:opacity-90 cursor-pointer"
                          style={{ backgroundColor: primaryColor }}
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
              );
            })}

            {/* Painel de Resposta Ativa da Anamnese Conversacional */}
            {activeAnamnesis && activeAnamnesis.status === 'in_progress' && activeAnamnesis.question && (
              <div className="p-3 bg-white rounded-2xl border border-rose-200 shadow-xs space-y-2 mt-2">
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

                {/* Opções Booleanas */}
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

                {/* Opções de Múltipla Escolha / Escolha Única */}
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

                {/* Instrução para perguntas de texto livre */}
                {activeAnamnesis.question.type === 'text' && (
                  <p className="text-[11px] text-[#9B8985] italic">
                    Digite sua resposta no campo abaixo e pressione enviar.
                  </p>
                )}
              </div>
            )}

            {isSending && (
              <div className="flex items-center gap-2 text-[#9B8985] text-xs py-1">
                <Loader2 className="w-4 h-4 animate-spin text-[#C4837A]" />
                <span>Digitando resposta...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Rodapé / Input do Chat */}
          <div className="p-3 bg-white border-t border-[#EADBCE] shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                placeholder={
                  activeAnamnesis
                    ? 'Digite sua resposta da anamnese...'
                    : 'Pergunte sobre serviços ou horários...'
                }
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-[#EADBCE] bg-[#FAF6F3] focus:bg-white focus:outline-hidden focus:border-[#C4837A]"
              />
              <button
                type="submit"
                disabled={isSending || isSubmittingAnamnesis || !inputValue.trim()}
                className="w-8 h-8 rounded-xl text-white flex items-center justify-center disabled:opacity-40 transition-colors shadow-2xs shrink-0 cursor-pointer"
                style={{ backgroundColor: primaryColor }}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-[#9B8985] mt-2 px-1">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Protegido sob LGPD
              </span>
              <Link href={`/agendar/${tenant.slug}`} className="hover:underline font-medium">
                Agendamento Convencional
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
