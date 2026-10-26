import { Appointment } from '@/types/appointments';
import { formatAppointmentDate, formatAppointmentTime } from './timezone';
import { buildWhatsAppLink, isValidBrazilianPhone, maskPhone } from './masks';

export type WhatsAppMessageType = 'confirmation' | 'reminder' | 'reschedule';

export interface WhatsAppTemplateData {
  type: WhatsAppMessageType;
  label: string;
  description: string;
  message: string;
  whatsappUrl: string | null;
  isValidPhone: boolean;
  rawPhone: string;
  formattedPhone: string;
}

/**
 * Monta as opções de mensagens manuais do WhatsApp com base nas regras de negócio e LGPD:
 * - NENHUM dado de saúde, anamnese, diagnósticos ou sensíveis é incluído.
 * - Fuso horário do tenant respeitado na formatação da data e hora.
 * - Mensagens claras e profissionais para estética e bem-estar.
 */
export function generateAppointmentWhatsAppTemplates(
  appointment: Appointment,
  tenantName: string,
  timezone: string = 'America/Sao_Paulo'
): {
  templates: WhatsAppTemplateData[];
  clientPhone: string;
  isValidPhone: boolean;
  clientName: string;
} {
  const clientName = appointment.client?.full_name?.trim() || 'Cliente';
  const firstName = clientName.split(' ')[0];
  const clientPhone = appointment.client?.whatsapp || appointment.client?.phone || '';
  const serviceName = appointment.service?.name || 'Procedimento';
  const profName = appointment.professional?.full_name?.split(' ')[0] || 'nossa equipe';

  // Formatação segura de data e horário conforme fuso do estabelecimento
  const formattedDate = formatAppointmentDate(appointment.start_time, timezone, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const formattedTime = formatAppointmentTime(appointment.start_time, timezone);

  const isValidPhone = isValidBrazilianPhone(clientPhone);
  const formattedPhone = isValidPhone ? maskPhone(clientPhone) : clientPhone || 'Não informado';

  // 1. Mensagem de Confirmação (Pedido de confirmação de presença)
  const confirmationText = 
`Olá, ${firstName}! Tudo bem? ✨

Aqui é do ${tenantName}.

Gostaríamos de confirmar o seu agendamento para *${serviceName}* com *${profName}*:
📅 *Data:* ${formattedDate}
⏰ *Horário:* ${formattedTime}

Você confirma a sua presença?
Por favor, responda com *SIM* para confirmarmos sua vaga ou nos avise caso precise reagendar.

Aguardamos você! 🌸`;

  // 2. Mensagem de Lembrete Prévio (exibe explicitamente data e horário no fuso do tenant, sem supor 'amanhã')
  const reminderText = 
`Olá, ${firstName}! Passando para lembrar do seu agendamento no ${tenantName}. 🔔

✨ *Procedimento:* ${serviceName}
👩‍⚕️ *Profissional:* ${profName}
📅 *Data:* ${formattedDate}
⏰ *Horário:* ${formattedTime}

Se precisar de qualquer informação sobre localização ou preparo prévio, estamos à sua disposição! Aguardamos você. 💆‍♀️`;

  // 3. Mensagem de Reagendamento / Ajuste de Horário
  const rescheduleText = 
`Olá, ${firstName}! Tudo bem?

Entramos em contato sobre o seu agendamento de *${serviceName}* no ${tenantName}, previsto para *${formattedDate}* às *${formattedTime}*.

Houve uma necessidade operacional de ajuste na nossa grade. Poderíamos verificar juntos um novo dia ou horário que fique mais confortável para você?

Ficamos no aguardo da sua resposta! Muito obrigado pela compreensão. 🌿`;

  const templates: WhatsAppTemplateData[] = [
    {
      type: 'confirmation',
      label: 'Confirmação de Agendamento',
      description: 'Solicita confirmação prévia de presença ao cliente.',
      message: confirmationText,
      whatsappUrl: isValidPhone ? buildWhatsAppLink(clientPhone, confirmationText) : null,
      isValidPhone,
      rawPhone: clientPhone,
      formattedPhone,
    },
    {
      type: 'reminder',
      label: 'Lembrete de Horário',
      description: 'Lembrete amigável com data, hora e profissional.',
      message: reminderText,
      whatsappUrl: isValidPhone ? buildWhatsAppLink(clientPhone, reminderText) : null,
      isValidPhone,
      rawPhone: clientPhone,
      formattedPhone,
    },
    {
      type: 'reschedule',
      label: 'Proposta de Reagendamento',
      description: 'Mensagem cordial para alinhamento de novo horário.',
      message: rescheduleText,
      whatsappUrl: isValidPhone ? buildWhatsAppLink(clientPhone, rescheduleText) : null,
      isValidPhone,
      rawPhone: clientPhone,
      formattedPhone,
    },
  ];

  return {
    templates,
    clientPhone,
    isValidPhone,
    clientName,
  };
}
