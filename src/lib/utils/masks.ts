/**
 * Remove todos os caracteres não numéricos.
 */
export function sanitizeDigits(value?: string | null): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Validação do algoritmo de CPF brasileiro.
 */
export function isValidCPF(cpf?: string | null): boolean {
  const digits = sanitizeDigits(cpf);
  if (digits.length !== 11) return false;

  // Bloqueia CPFs com dígitos todos repetidos
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits.charAt(i), 10) * (10 - i);
  }
  let firstCheck = 11 - (sum % 11);
  if (firstCheck >= 10) firstCheck = 0;
  if (firstCheck !== parseInt(digits.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits.charAt(i), 10) * (11 - i);
  }
  let secondCheck = 11 - (sum % 11);
  if (secondCheck >= 10) secondCheck = 0;
  if (secondCheck !== parseInt(digits.charAt(10), 10)) return false;

  return true;
}

/**
 * Aplica máscara de telefone / WhatsApp brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
 */
export function maskPhone(value?: string | null): string {
  const digits = sanitizeDigits(value).slice(0, 11);
  if (!digits) return '';

  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Aplica máscara de CPF: XXX.XXX.XXX-XX
 */
export function maskCPF(value?: string | null): string {
  const digits = sanitizeDigits(value).slice(0, 11);
  if (!digits) return '';

  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Mascara de privacidade para CPF em listagens (LGPD): ***.XXX.XXX-**
 */
export function maskCPFPartial(value?: string | null): string {
  const digits = sanitizeDigits(value);
  if (digits.length !== 11) return value || '—';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/**
 * Valida se um número de telefone brasileiro é válido (10 ou 11 dígitos com DDD válido entre 11 e 99).
 * Se já contiver DDI 55 (12 ou 13 dígitos), valida removendo o 55.
 */
export function isValidBrazilianPhone(phone?: string | null): boolean {
  if (!phone) return false;
  let digits = sanitizeDigits(phone);
  
  // Se veio com DDI 55 na frente
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Celular (11 dígitos, inicia com 9 após DDD) ou fixo (10 dígitos, inicia com 2-5 após DDD)
  if (digits.length !== 10 && digits.length !== 11) return false;

  const ddd = parseInt(digits.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;

  if (digits.length === 11) {
    // Celulares no Brasil iniciam com 9
    return digits.charAt(2) === '9';
  }

  return true;
}

/**
 * Normaliza o número para o padrão internacional com DDI 55: 55XXXXXXXXXXX.
 */
export function normalizeBrazilianPhoneWithDDI(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = sanitizeDigits(phone);

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (!isValidBrazilianPhone(digits)) {
    return null;
  }

  return `55${digits}`;
}

/**
 * Gera URL limpa para iniciar conversa no WhatsApp Web ou App.
 */
export function buildWhatsAppLink(phone?: string | null, text?: string): string | null {
  const normalized = normalizeBrazilianPhoneWithDDI(phone);
  if (!normalized) return null;

  const baseUrl = `https://wa.me/${normalized}`;
  if (text) {
    return `${baseUrl}?text=${encodeURIComponent(text)}`;
  }
  return baseUrl;
}
