export interface MinimalService {
  id: string;
  name: string;
  description?: string | null;
  category?: string;
  price: number;
  duration_minutes: number;
}

export interface MinimalProfessional {
  id: string;
  full_name: string;
  specialty: string;
}

export interface MinimalChatMessage {
  role: string;
  content: string;
}

/**
 * Remove acentuação e caracteres especiais para comparação flexível
 */
export function normalizeNlpText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Dicionário de intenções e sinônimos de estética, beleza e saúde
 */
const INTENT_SYNONYMS: Record<string, string[]> = {
  // Cabelo / Barba
  cabelo: ['corte', 'cortar', 'escova', 'penteado', 'mechas', 'coloracao', 'luzes', 'progressiva', 'hidratacao', 'botox', 'tintura', 'cabelo'],
  cortar: ['corte', 'cortar', 'cabelo'],
  corte: ['corte', 'cortar', 'cabelo'],
  barba: ['barba', 'barbearia', 'barboterapia'],
  // Unhas / Mãos e Pés
  unha: ['manicure', 'pedicure', 'unhas', 'esmalte', 'esmaltacao', 'alongamento', 'gel', 'fibra', 'spa'],
  unhas: ['manicure', 'pedicure', 'unhas', 'esmalte', 'esmaltacao', 'alongamento', 'gel', 'fibra', 'spa'],
  manicure: ['manicure', 'unha', 'unhas', 'esmalte'],
  pedicure: ['pedicure', 'pe', 'pes', 'unha', 'unhas'],
  esmalte: ['manicure', 'pedicure', 'esmaltacao'],
  // Facial / Pele
  pele: ['limpeza de pele', 'facial', 'estetica', 'peeling', 'revitalizacao', 'hidratacao', 'botox', 'microagulhamento'],
  rosto: ['limpeza de pele', 'facial', 'peeling', 'microagulhamento', 'harmonizacao'],
  facial: ['facial', 'limpeza de pele', 'peeling'],
  limpeza: ['limpeza de pele', 'limpeza'],
  // Corporal / Massagem
  massagem: ['massagem', 'drenagem', 'relaxante', 'modeladora', 'corporal', 'ventosa'],
  drenagem: ['drenagem', 'linfatica', 'corporal', 'massagem'],
  corpo: ['corporal', 'drenagem', 'massagem', 'gordura'],
  // Depilação
  depilar: ['depilacao', 'cera', 'laser'],
  depilacao: ['depilacao', 'cera', 'laser'],
  laser: ['depilacao', 'laser'],
  cera: ['depilacao', 'cera'],
  // Sobrancelhas e Cílios
  sobrancelha: ['sobrancelha', 'sobrancelhas', 'design', 'henna', 'micropigmentacao', 'brow'],
  sobrancelhas: ['sobrancelha', 'sobrancelhas', 'design', 'henna', 'micropigmentacao'],
  cilios: ['cilios', 'extensao', 'alongamento', 'lash', 'lifting'],
  lash: ['cilios', 'lash'],
};

/**
 * Localiza todos os serviços compatíveis a partir da mensagem ou do histórico recente.
 * Distingue quando há match único vs quando há múltiplos serviços que atendem à intenção
 * (ex: "cortar o cabelo" com "Corte Feminino" e "Corte Masculino").
 */
export function detectAllMatchingServices<T extends MinimalService>(
  userMessage: string,
  services: T[],
  history: MinimalChatMessage[] = []
): { matches: T[]; source: 'exact' | 'token_or_synonym' | 'history' | 'none' } {
  const normMsg = normalizeNlpText(userMessage);

  // 1. Verificação direta por nome completo do serviço na mensagem atual
  const exactMatches = services.filter((s) => {
    const normName = normalizeNlpText(s.name);
    return normMsg.includes(normName);
  });
  if (exactMatches.length > 0) {
    return { matches: exactMatches, source: 'exact' };
  }

  // 2. Busca por intenção / sinônimo / token na mensagem atual
  const matchedMap = new Map<string, T>();
  const words = normMsg.split(/\s+/).map((w) => w.replace(/[.,!?:;]/g, ''));

  for (const word of words) {
    const relatedTokens = INTENT_SYNONYMS[word];
    if (relatedTokens) {
      for (const rel of relatedTokens) {
        for (const s of services) {
          const normS = normalizeNlpText(s.name);
          const normCat = normalizeNlpText(s.category || '');
          const normDesc = normalizeNlpText(s.description || '');
          if (normS.includes(rel) || normCat.includes(rel) || normDesc.includes(rel)) {
            matchedMap.set(s.id, s);
          }
        }
      }
    }
  }

  // Verifica palavras-chave do nome do serviço
  for (const s of services) {
    const tokens = normalizeNlpText(s.name)
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !['com', 'para', 'das', 'dos', 'uma', 'seu', 'sua'].includes(t));
    if (tokens.some((token) => normMsg.includes(token))) {
      matchedMap.set(s.id, s);
    }
  }

  if (matchedMap.size > 0) {
    return { matches: Array.from(matchedMap.values()), source: 'token_or_synonym' };
  }

  // 3. Fallback de histórico recente: se a mensagem atual não cita serviço (ex: "amanhã às 14h", "com o Marcos")
  for (let i = history.length - 1; i >= 0; i--) {
    const hText = normalizeNlpText(history[i].content);
    for (const s of services) {
      const normName = normalizeNlpText(s.name);
      if (hText.includes(normName)) {
        return { matches: [s], source: 'history' };
      }
    }
  }

  return { matches: [], source: 'none' };
}

/**
 * Localiza profissional mencionado no texto ou preservado no histórico recente
 */
export function detectProfessionalInConversation<P extends MinimalProfessional>(
  userMessage: string,
  professionals: P[],
  history: MinimalChatMessage[] = []
): P | null {
  const normMsg = normalizeNlpText(userMessage);

  // 1. Verificação na mensagem atual
  for (const p of professionals) {
    const firstName = normalizeNlpText(p.full_name.split(' ')[0]);
    const fullName = normalizeNlpText(p.full_name);
    if (normMsg.includes(fullName) || (firstName.length >= 3 && normMsg.includes(firstName))) {
      return p;
    }
  }

  // 2. Preservação a partir do histórico recente
  for (let i = history.length - 1; i >= 0; i--) {
    const hText = normalizeNlpText(history[i].content);
    for (const p of professionals) {
      const firstName = normalizeNlpText(p.full_name.split(' ')[0]);
      const fullName = normalizeNlpText(p.full_name);
      if (hText.includes(fullName) || (firstName.length >= 3 && hText.includes(firstName))) {
        return p;
      }
    }
  }

  return null;
}

/**
 * Extrai data pretendida pelo cliente no texto ou preservada no histórico recente
 */
export function detectDateInConversation(
  userMessage: string,
  referenceDateIso?: string,
  history: MinimalChatMessage[] = []
): string {
  const norm = normalizeNlpText(userMessage);
  const base = referenceDateIso ? new Date(referenceDateIso + 'T12:00:00Z') : new Date();

  // 1. Mensagem atual
  if (norm.includes('amanha') && !norm.includes('depois de amanha')) {
    const tomorrow = new Date(base);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  if (norm.includes('depois de amanha')) {
    const after = new Date(base);
    after.setDate(after.getDate() + 2);
    return after.toISOString().split('T')[0];
  }
  if (norm.includes('hoje')) {
    return base.toISOString().split('T')[0];
  }

  // 2. Histórico recente
  for (let i = history.length - 1; i >= 0; i--) {
    const hText = normalizeNlpText(history[i].content);
    if (hText.includes('amanha') && !hText.includes('depois de amanha')) {
      const tomorrow = new Date(base);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    if (hText.includes('depois de amanha')) {
      const after = new Date(base);
      after.setDate(after.getDate() + 2);
      return after.toISOString().split('T')[0];
    }
  }

  // Padrão hoje
  return base.toISOString().split('T')[0];
}

/**
 * Identifica se a mensagem contém uma tentativa explícita de agendamento ou serviço,
 * mesmo que o serviço não exista no catálogo (ex: "quero fazer tatuagem")
 */
export function detectUnmatchedServiceIntent(userMessage: string): boolean {
  const norm = normalizeNlpText(userMessage);
  const intentTriggers = [
    'queria', 'quero', 'gostaria', 'preciso', 'tem como', 'fazem', 'voce faz', 'voces fazem',
    'quanto fica', 'cortar', 'fazer', 'pintar', 'aplicar', 'massagem', 'limpeza', 'corte',
    'depilacao', 'sobrancelha', 'unha', 'cabelo'
  ];
  return intentTriggers.some((t) => norm.includes(t));
}
