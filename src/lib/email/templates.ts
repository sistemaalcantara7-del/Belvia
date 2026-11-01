/**
 * ZELUNIA SaaS - Templates de E-mails Transacionais
 * Cores do Design System:
 * - Primária / Destaque: Terracota/Rose (#C4837A e #B87070)
 * - Escuro / Header: Vinho escuro (#2D1F27 / #35272D)
 * - Fundo: Bege / Areia suave (#FAF6F4)
 * - Texto Principal: Chocolate (#2C1810)
 * - Texto Secundário: (#7D6B65)
 * - Borda: (#EAD9D3)
 */

// URL canônica com www e imagem otimizada para e-mails (sem metadados Adobe pesados e com 81KB para aceitação instantânea no GoogleImageProxy)
const CANONICAL_DOMAIN = 'https://www.zelunia.com.br';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || CANONICAL_DOMAIN;
const LOGO_URL = `${CANONICAL_DOMAIN}/img/logo-email.png`;

interface BaseEmailWrapperProps {
  previewText: string;
  badgeText?: string;
  badgeBg?: string;
  heading: string;
  subheading?: string;
  contentHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export function renderBaseEmailTemplate({
  previewText,
  badgeText,
  badgeBg = '#B87070',
  heading,
  subheading,
  contentHtml,
  ctaText,
  ctaUrl,
  footerNote,
}: BaseEmailWrapperProps): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading} — ZELUNIA</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #FAF6F4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #2C1810;
      line-height: 1.6;
    }
    table { border-collapse: collapse; }
    a { color: #C4837A; text-decoration: none; }
    .btn:hover { background-color: #A86B62 !important; }
  </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #FAF6F4;">
  <span style="display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; color: #FAF6F4; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${previewText}
  </span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #FAF6F4;">
    <tr>
      <td align="center" style="padding: 20px 15px;">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #FFFFFF; border-radius: 24px; border: 1px solid #EAD9D3; overflow: hidden; box-shadow: 0 4px 20px rgba(44, 24, 16, 0.05);">
          <!-- Top Header -->
          <tr>
            <td align="center" style="background-color: #2D1F27; padding: 36px 30px 28px 30px; text-align: center;">
              <a href="${APP_URL}" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${LOGO_URL}" alt="ZELUNIA" width="160" style="width: 160px; max-width: 100%; height: auto; display: block; margin: 0 auto 12px auto;" />
              </a>
              <p style="margin: 0; color: #E8D1CA; font-size: 11px; text-transform: uppercase; letter-spacing: 0.25em;">
                Gestão Inteligente &bull; Beleza &bull; Estética
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px 28px 32px;">
              ${
                badgeText
                  ? `<div style="text-align: center; margin-bottom: 16px;">
                      <span style="display: inline-block; background-color: ${badgeBg}; color: #FFFFFF; font-size: 10px; font-weight: bold; letter-spacing: 0.1em; text-transform: uppercase; padding: 4px 14px; border-radius: 9999px;">
                        ${badgeText}
                      </span>
                    </div>`
                  : ''
              }

              <h1 style="margin: 0 0 12px 0; font-family: Georgia, serif; font-size: 24px; font-weight: normal; color: #2C1810; text-align: center; line-height: 1.3;">
                ${heading}
              </h1>

              ${
                subheading
                  ? `<p style="margin: 0 0 24px 0; font-size: 13px; color: #7D6B65; text-align: center; line-height: 1.5;">
                      ${subheading}
                    </p>`
                  : '<div style="margin-bottom: 20px;"></div>'
              }

              <div style="font-size: 14px; color: #4A3B36; line-height: 1.65;">
                ${contentHtml}
              </div>

              ${
                ctaText && ctaUrl
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 32px; margin-bottom: 16px;">
                      <tr>
                        <td align="center">
                          <a href="${ctaUrl}" target="_blank" class="btn" style="display: inline-block; background-color: #C4837A; color: #FFFFFF; font-size: 14px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 12px; text-align: center; box-shadow: 0 2px 8px rgba(196, 131, 122, 0.35);">
                            ${ctaText} &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>`
                  : ''
              }

              ${
                footerNote
                  ? `<p style="margin: 24px 0 0 0; font-size: 11px; color: #9B8985; text-align: center; line-height: 1.5;">
                      ${footerNote}
                    </p>`
                  : ''
              }
            </td>
          </tr>

          <!-- Security & Footer -->
          <tr>
            <td style="background-color: #FAF6F4; padding: 24px 30px; border-top: 1px solid #EAD9D3; text-align: center;">
              <p style="margin: 0 0 8px 0; font-size: 11px; color: #7D6B65;">
                Você está recebendo este e-mail por possuir cadastro no sistema ZELUNIA.
              </p>
              <p style="margin: 0; font-size: 11px; color: #9B8985;">
                &copy; ${new Date().getFullYear()} Alcântara Sistemas Ltda &bull; CNPJ &bull; Fortaleza - CE
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── 1. Boas-vindas / Onboarding do Estabelecimento ──────────────────────────
export function emailWelcomeTemplate({
  name,
  clinicName,
  slug,
  planName,
  trialDays = 7,
}: {
  name: string;
  clinicName: string;
  slug: string;
  planName: string;
  trialDays?: number;
}): { subject: string; html: string } {
  const heading = `Bem-vindo à ZELUNIA, ${name}!`;
  const subject = `Bem-vindo à ZELUNIA — Seu espaço ${clinicName} está pronto`;
  const dashboardUrl = `${APP_URL}/${slug}`;

  const contentHtml = `
    <p>É uma alegria ter a <strong>${clinicName}</strong> conosco. Sua conta foi criada com sucesso no <strong>Plano ${planName}</strong>.</p>
    <p>Seus <strong>${trialDays} dias de degustação gratuita</strong> já estão ativos, sem qualquer cobrança no seu cartão:</p>
    <div style="background-color: #FAF0ED; border: 1px solid #EAD9D3; border-radius: 16px; padding: 18px 20px; margin: 20px 0;">
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #4A3B36;">
        <li style="margin-bottom: 8px;"><strong>Agenda Completa:</strong> controle horários e bloqueios com praticidade.</li>
        <li style="margin-bottom: 8px;"><strong>Agendamento Online:</strong> compartilhe seu link exclusivo com seus clientes.</li>
        <li style="margin-bottom: 8px;"><strong>Fichas de Anamnese:</strong> histórico clínico e procedimentos em ambiente protegido.</li>
        <li><strong>Controle de Caixa:</strong> lançamentos diários e relatórios em tempo real.</li>
      </ul>
    </div>
    <p>Acesse seu painel agora mesmo para personalizar seus serviços e horários:</p>
  `;

  const html = renderBaseEmailTemplate({
    previewText: `Seu espaço ${clinicName} na ZELUNIA foi criado com sucesso.`,
    badgeText: 'Conta Criada com Sucesso',
    badgeBg: '#5C8A5E',
    heading,
    subheading: 'Gestão completa para o seu estabelecimento de estética e beleza',
    contentHtml,
    ctaText: 'Acessar Meu Painel',
    ctaUrl: dashboardUrl,
    footerNote: `Link de acesso direto: ${dashboardUrl}`,
  });

  return { subject, html };
}

// ── 2. Confirmação de Cadastro (Template Supabase Auth / Notificação) ────────
export function emailConfirmRegistrationTemplate({
  name,
  confirmUrl,
}: {
  name: string;
  confirmUrl: string;
}): { subject: string; html: string } {
  const subject = 'Confirme seu e-mail para ativar sua conta na ZELUNIA';
  const heading = 'Confirmação de Cadastro';

  const contentHtml = `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>Obrigado por iniciar sua jornada com a ZELUNIA. Para garantir a segurança dos dados do seu estabelecimento, por favor confirme seu endereço de e-mail clicando no botão abaixo:</p>
    <p style="font-size: 12px; color: #7D6B65;">Ao confirmar, seu estabelecimento será ativado automaticamente com 7 dias de teste gratuito, sem necessidade de cartão de crédito.</p>
  `;

  const html = renderBaseEmailTemplate({
    previewText: 'Confirme seu e-mail para concluir o cadastro na ZELUNIA.',
    badgeText: 'Ativação de Conta',
    badgeBg: '#C4837A',
    heading,
    subheading: 'Falta apenas um clique para acessar sua clínica',
    contentHtml,
    ctaText: 'Confirmar Meu E-mail',
    ctaUrl: confirmUrl,
    footerNote: 'Se você não solicitou este cadastro, desconsidere esta mensagem com segurança.',
  });

  return { subject, html };
}

// ── 3. Recuperação de Senha ─────────────────────────────────────────────────
export function emailPasswordResetTemplate({
  name,
  resetUrl,
}: {
  name: string;
  resetUrl: string;
}): { subject: string; html: string } {
  const subject = 'Recuperação de Senha — ZELUNIA';
  const heading = 'Redefinição de Senha';

  const contentHtml = `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>Recebemos uma solicitação para redefinir a senha de acesso à sua conta ZELUNIA.</p>
    <p>Para escolher uma nova senha com segurança, clique no botão abaixo:</p>
    <div style="background-color: #FFF5F5; border: 1px solid #FFC5C5; border-radius: 12px; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #B85555;">
      Este link é válido por tempo limitado e só pode ser utilizado uma única vez.
    </div>
  `;

  const html = renderBaseEmailTemplate({
    previewText: 'Instruções para redefinir sua senha na ZELUNIA.',
    badgeText: 'Segurança da Conta',
    badgeBg: '#B87070',
    heading,
    subheading: 'Solicitação de alteração de credenciais',
    contentHtml,
    ctaText: 'Redefinir Minha Senha',
    ctaUrl: resetUrl,
    footerNote: 'Se você não fez essa solicitação, sua senha atual continua segura. Nenhuma ação adicional é necessária.',
  });

  return { subject, html };
}

// ── 4. Trial Próximo do Vencimento (Aviso 2 dias antes) ─────────────────────
export function emailTrialExpiringSoonTemplate({
  name,
  clinicName,
  slug,
  planName,
  priceMonthly,
  daysLeft = 2,
}: {
  name: string;
  clinicName: string;
  slug: string;
  planName: string;
  priceMonthly: number;
  daysLeft?: number;
}): { subject: string; html: string } {
  const subject = `Seu período gratuito na ZELUNIA encerra em ${daysLeft} dias`;
  const heading = 'Seu período gratuito está terminando';
  const billingUrl = `${APP_URL}/${slug}/configuracoes?tab=subscription`;

  const contentHtml = `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>O período de degustação gratuita de 7 dias da <strong>${clinicName}</strong> está próximo do fim (restam apenas <strong>${daysLeft} dias</strong>).</p>
    <p>Para não interromper a rotina de agendamentos, fichas de clientes e o link de agendamento online da sua clínica, ative sua assinatura mensal:</p>
    <div style="background-color: #FAF0ED; border: 1px solid #EAD9D3; border-radius: 16px; padding: 18px 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 13px; color: #7D6B65; text-transform: uppercase; font-weight: bold;">Plano Selecionado</div>
      <div style="font-family: Georgia, serif; font-size: 22px; color: #2C1810; margin: 4px 0;">Plano ${planName}</div>
      <div style="font-size: 20px; font-weight: bold; color: #C4837A;">R$ ${priceMonthly.toFixed(2).replace('.', ',')} <span style="font-size: 12px; font-weight: normal; color: #7D6B65;">/ mês</span></div>
      <div style="font-size: 11px; color: #9B8985; margin-top: 6px;">Pagamento facilitado via PIX com ativação instantânea ou Cartão</div>
    </div>
  `;

  const html = renderBaseEmailTemplate({
    previewText: `Restam ${daysLeft} dias do período gratuito do seu estabelecimento ${clinicName}.`,
    badgeText: 'Período Gratuito',
    badgeBg: '#C49A3A',
    heading,
    subheading: `${clinicName} &bull; Mantenha seus atendimentos sem pausas`,
    contentHtml,
    ctaText: 'Ativar Minha Assinatura',
    ctaUrl: billingUrl,
    footerNote: 'Seus dados, clientes e prontuários permanecem 100% seguros.',
  });

  return { subject, html };
}

// ── 5. Trial Expirado (Bloqueio Elegante com Preservação) ────────────────────
export function emailTrialExpiredTemplate({
  name,
  clinicName,
  slug,
  planName,
  priceMonthly,
}: {
  name: string;
  clinicName: string;
  slug: string;
  planName: string;
  priceMonthly: number;
}): { subject: string; html: string } {
  const subject = `Período gratuito encerrado — ${clinicName}`;
  const heading = 'Período gratuito encerrado';
  const billingUrl = `${APP_URL}/${slug}/configuracoes?tab=subscription`;

  const contentHtml = `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>O período de avaliação gratuita da <strong>${clinicName}</strong> chegou ao fim. Esperamos que a ZELUNIA tenha feito a diferença na organização do seu negócio!</p>
    <div style="background-color: #FAF0ED; border: 1px solid #EAD9D3; border-radius: 16px; padding: 18px 20px; margin: 20px 0;">
      <p style="margin: 0 0 8px 0; font-weight: bold; color: #2C1810;">🔒 Seus dados estão 100% preservados</p>
      <p style="margin: 0; font-size: 12px; color: #7D6B65;">Nenhum cliente, histórico de atendimento ou configuração foi removido. Assim que regularizar sua mensalidade, o acesso é liberado instantaneamente.</p>
    </div>
    <p>Escolha a forma de pagamento que preferir (PIX com confirmação em segundos ou Cartão de Crédito) para reativar seu painel:</p>
  `;

  const html = renderBaseEmailTemplate({
    previewText: `O período gratuito de 7 dias do ${clinicName} encerrou. Reative em 1 clique.`,
    badgeText: 'Acesso Pausado',
    badgeBg: '#B87070',
    heading,
    subheading: `Plano ${planName} &bull; R$ ${priceMonthly.toFixed(2).replace('.', ',')}/mês`,
    contentHtml,
    ctaText: 'Reativar Estabelecimento Agora',
    ctaUrl: billingUrl,
  });

  return { subject, html };
}

// ── 6. Pagamento Confirmado / Mensalidade Liquidada ─────────────────────────
export function emailPaymentConfirmedTemplate({
  name,
  clinicName,
  slug,
  planName,
  amount,
  nextDueDate,
  invoiceNumber,
}: {
  name: string;
  clinicName: string;
  slug: string;
  planName: string;
  amount: number;
  nextDueDate: string;
  invoiceNumber?: string | null;
}): { subject: string; html: string } {
  const subject = `Pagamento confirmado — Assinatura ZELUNIA (${clinicName})`;
  const heading = 'Pagamento Confirmado com Sucesso!';
  const dashboardUrl = `${APP_URL}/${slug}`;

  const formattedDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(nextDueDate));

  const contentHtml = `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>Confirmamos a liquidação da sua mensalidade referente ao estabelecimento <strong>${clinicName}</strong>. Sua assinatura está ativa e regularizada!</p>
    <div style="background-color: #FAF6F4; border: 1px solid #EAD9D3; border-radius: 16px; padding: 20px; margin: 20px 0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #7D6B65;">Plano:</td>
          <td align="right" style="padding: 6px 0; font-weight: bold; color: #2C1810;">Plano ${planName}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7D6B65;">Valor Pago:</td>
          <td align="right" style="padding: 6px 0; font-weight: bold; color: #5C8A5E;">R$ ${amount.toFixed(2).replace('.', ',')}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #7D6B65;">Próximo Vencimento:</td>
          <td align="right" style="padding: 6px 0; font-weight: bold; color: #2C1810;">${formattedDate}</td>
        </tr>
        ${
          invoiceNumber
            ? `<tr>
                <td style="padding: 6px 0; color: #7D6B65;">Identificador da Fatura:</td>
                <td align="right" style="padding: 6px 0; font-family: monospace; color: #7D6B65;">${invoiceNumber}</td>
              </tr>`
            : ''
        }
      </table>
    </div>
    <p>Agradecemos pela confiança na ZELUNIA. Tenha um excelente trabalho!</p>
  `;

  const html = renderBaseEmailTemplate({
    previewText: `Pagamento recebido. A assinatura da ${clinicName} está ativa.`,
    badgeText: 'Assinatura Ativa',
    badgeBg: '#5C8A5E',
    heading,
    subheading: 'Mensalidade processada com segurança via Asaas',
    contentHtml,
    ctaText: 'Ir para o Painel da Clínica',
    ctaUrl: dashboardUrl,
  });

  return { subject, html };
}

// ── 7. Assinatura Vencida / Inadimplência com Período de Tolerância ─────────
export function emailSubscriptionOverdueTemplate({
  name,
  clinicName,
  slug,
  amount,
  dueDate,
  invoiceUrl,
  graceDays = 5,
}: {
  name: string;
  clinicName: string;
  slug: string;
  amount: number;
  dueDate: string;
  invoiceUrl?: string | null;
  graceDays?: number;
}): { subject: string; html: string } {
  const subject = `Aviso de mensalidade pendente — ZELUNIA (${clinicName})`;
  const heading = 'Mensalidade em Aberto';
  const targetUrl = invoiceUrl || `${APP_URL}/${slug}/configuracoes?tab=subscription`;
  const formattedDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(dueDate));

  const contentHtml = `
    <p>Olá, <strong>${name}</strong>!</p>
    <p>Identificamos que a mensalidade da <strong>${clinicName}</strong> no valor de <strong>R$ ${amount.toFixed(2).replace('.', ',')}</strong> com vencimento em <strong>${formattedDate}</strong> ainda não foi compensada.</p>
    <div style="background-color: #FAF0ED; border: 1px solid #EAD9D3; border-radius: 16px; padding: 18px 20px; margin: 20px 0;">
      <p style="margin: 0 0 6px 0; font-weight: bold; color: #C49A3A;">Período de tolerância ativo (${graceDays} dias)</p>
      <p style="margin: 0; font-size: 12px; color: #7D6B65;">Seu acesso continua liberado temporariamente para que você possa regularizar sem prejuízo ao atendimento dos seus clientes.</p>
    </div>
    <p>Clique no botão abaixo para acessar o boleto, código PIX ou pagamento via cartão:</p>
  `;

  const html = renderBaseEmailTemplate({
    previewText: `Mensalidade pendente da ${clinicName}. Evite a suspensão do acesso.`,
    badgeText: 'Pagamento Pendente',
    badgeBg: '#C49A3A',
    heading,
    subheading: `${clinicName} &bull; Evite interrupção nos seus agendamentos`,
    contentHtml,
    ctaText: 'Pagar / Regularizar Agora',
    ctaUrl: targetUrl,
    footerNote: 'Se você já realizou o pagamento via boleto nas últimas 24h, favor desconsiderar este lembrete.',
  });

  return { subject, html };
}
