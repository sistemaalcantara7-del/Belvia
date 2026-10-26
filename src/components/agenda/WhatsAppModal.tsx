'use client';

import { useState } from 'react';
import { Appointment } from '@/types/appointments';
import { generateAppointmentWhatsAppTemplates, WhatsAppMessageType } from '@/lib/utils/whatsapp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  X,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  User,
  ShieldCheck,
} from 'lucide-react';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  tenantName: string;
  timezone?: string;
}

export function WhatsAppModal({
  isOpen,
  onClose,
  appointment,
  tenantName,
  timezone = 'America/Sao_Paulo',
}: WhatsAppModalProps) {
  const [selectedType, setSelectedType] = useState<WhatsAppMessageType>('confirmation');
  const [copied, setCopied] = useState(false);

  if (!isOpen || !appointment) return null;

  const { templates, clientPhone, isValidPhone, clientName } =
    generateAppointmentWhatsAppTemplates(appointment, tenantName, timezone);

  const activeTemplate = templates.find((t) => t.type === selectedType) || templates[0];

  function handleCopy() {
    if (activeTemplate?.message) {
      navigator.clipboard.writeText(activeTemplate.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleOpenWhatsApp() {
    if (activeTemplate?.whatsappUrl) {
      window.open(activeTemplate.whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <Card className="w-full max-w-lg bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Enviar WhatsApp
              </CardTitle>
              <CardDescription className="text-xs text-zinc-500">
                Comunicação direta com o cliente via WhatsApp Web ou App
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-600 rounded-full"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>

        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Informações Rápidas do Destinatário */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-zinc-400 shrink-0" />
              <div>
                <span className="font-bold text-zinc-800 dark:text-zinc-200 block">
                  {clientName}
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {activeTemplate.formattedPhone}
                </span>
              </div>
            </div>

            {isValidPhone ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Válido (DDI 55)
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-300 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-red-600" />
                {clientPhone ? 'Número inválido' : 'Sem telefone'}
              </span>
            )}
          </div>

          {/* Seletor de Modelo de Mensagem */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 block">
              Selecione o Modelo de Mensagem:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {templates.map((tpl) => {
                const isSelected = selectedType === tpl.type;
                return (
                  <button
                    key={tpl.type}
                    type="button"
                    onClick={() => setSelectedType(tpl.type)}
                    className={`p-2 rounded-lg text-left border transition-all text-xs flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 font-semibold shadow-xs ring-1 ring-emerald-500'
                        : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'
                    }`}
                  >
                    <span>{tpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visualização da Mensagem Pré-formatada */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Pré-visualização da Mensagem:
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 flex items-center gap-1"
                title="Copiar texto para a área de transferência"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-600 font-semibold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copiar texto
                  </>
                )}
              </button>
            </div>

            <div className="relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/80 p-3">
              <pre className="text-xs font-sans whitespace-pre-wrap leading-relaxed text-zinc-800 dark:text-zinc-200 max-h-48 overflow-y-auto">
                {activeTemplate.message}
              </pre>
            </div>
          </div>

          {/* Alerta de Governança, Base Legal e LGPD */}
          <div className="p-2.5 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200/60 dark:border-zinc-700/50 text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-zinc-800 dark:text-zinc-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Privacidade & Base Legal (LGPD Art. 7º, V)</span>
            </div>
            <p className="leading-relaxed">
              Mensagens operacionais de confirmação e lembrete vinculam-se estritamente à execução do contrato de prestação do serviço agendado pelo cliente.
              Nenhum dado clínico, anamnese ou sensível é exposto. A abertura do link não altera o status do agendamento nem registra confirmação automática.
            </p>
          </div>

          {/* Ações do Modal */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Fechar
            </Button>

            <Button
              size="sm"
              disabled={!isValidPhone}
              onClick={handleOpenWhatsApp}
              className={`text-xs gap-1.5 font-semibold ${
                isValidPhone
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-zinc-300 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Abrir no WhatsApp
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
