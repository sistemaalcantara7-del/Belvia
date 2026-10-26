/**
 * Converte data e hora locais (ex.: '2026-10-27' e '09:00') em um objeto Date / ISO string
 * considerando o fuso horário informado (ex.: 'America/Sao_Paulo', 'America/Manaus').
 */
export function localDateTimeToUtcIso(dateStr: string, timeStr: string, timezone: string = 'America/Sao_Paulo'): string {
  // Usamos formatação Intl para obter o offset real do fuso alvo na data pretendida
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  // Iteração para encontrar a data UTC exata cujo horário local corresponde a dateStr e timeStr
  // Passo 1: aproximação inicial assumindo data UTC
  let targetUtc = new Date(`${dateStr}T${timeStr}:00Z`).getTime();

  // Testar e ajustar o offset
  for (let i = 0; i < 3; i++) {
    const parts = dtf.formatToParts(new Date(targetUtc));
    const p: Record<string, string> = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    const localIso = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`;
    const diff = new Date(`${dateStr}T${timeStr}:00Z`).getTime() - new Date(localIso).getTime();
    if (diff === 0) break;
    targetUtc += diff;
  }

  return new Date(targetUtc).toISOString();
}

/**
 * Formata um timestamp ISO UTC para data legível no fuso horário especificado.
 * Exemplo: '25/10/2026' ou 'Segunda-feira, 25 de outubro'
 */
export function formatAppointmentDate(
  isoDateStr: string,
  timezone: string = 'America/Sao_Paulo',
  options?: Intl.DateTimeFormatOptions
): string {
  const d = new Date(isoDateStr);
  const defaultOptions: Intl.DateTimeFormatOptions = options || {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };
  return new Intl.DateTimeFormat('pt-BR', { ...defaultOptions, timeZone: timezone }).format(d);
}

/**
 * Formata um timestamp ISO UTC para hora legível no fuso horário especificado.
 * Exemplo: '14:30'
 */
export function formatAppointmentTime(
  isoDateStr: string,
  timezone: string = 'America/Sao_Paulo'
): string {
  const d = new Date(isoDateStr);
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}
