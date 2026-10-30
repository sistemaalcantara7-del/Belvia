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
  service_ids?: string[];
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
 * Identifica se a mensagem do usuário é uma pergunta focada em profissional / equipe / quem vai atender
 */
export function isProfessionalQuestion(userMessage: string): boolean {
  const norm = normalizeNlpText(userMessage);

  const teamPatterns = [
    'quem ira me atender',
    'quem vai me atender',
    'quem ira atender',
    'quem vai atender',
    'quem me atende',
    'quem atende',
    'quem vai cortar',
    'quem ira cortar',
    'quem corta',
    'quem vai fazer',
    'quem ira fazer',
    'quem faz',
    'qual profissional',
    'quais profissionais',
    'quem sao os profissionais',
    'quem e o profissional',
    'quem e o especialista',
    'quem faz esse procedimento',
    'quem faz esse servico',
    'atendente',
    'equipe',
    'especialista',
  ];

  if (teamPatterns.some((pattern) => norm.includes(pattern))) {
    return true;
  }

  // Padrões flexíveis: "quem ... [atender|cortar|fazer|cuidar]"
  if (/^quem\s+(vai|ira|pode|consegue)?\s*(me)?\s*(atender|cortar|fazer|cuidar)/i.test(norm)) {
    return true;
  }

  // Tokens isolados
  const words = norm.split(/\s+/).map((w) => w.replace(/[.,!?:;]/g, ''));
  return words.includes('profissional') || words.includes('profissionais') || words.includes('especialista');
}

/**
 * Retorna os profissionais que atendem a um determinado serviço, considerando os vínculos de service_ids.
 * Se nenhum profissional tiver vínculo explícito com o serviço, retorna apenas os vinculados ou vazio se houver vínculos no tenant.
 */
export function getProfessionalsForService<P extends MinimalProfessional>(
  serviceId: string,
  professionals: P[]
): P[] {
  const professionalsWithLinks = professionals.filter(
    (p) => Array.isArray(p.service_ids) && p.service_ids.length > 0
  );

  if (professionalsWithLinks.length > 0) {
    return professionals.filter(
      (p) => Array.isArray(p.service_ids) && p.service_ids.includes(serviceId)
    );
  }

  // Se nenhum profissional tem vínculos configurados (ex: clínica com profissional único que atende tudo)
  return professionals;
}

/**
 * Localiza todos os serviços compatíveis a partir da mensagem ou do histórico recente.
 * Preserva a ambiguidade quando o usuário não escolheu uma opção específica ainda.
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

  // 3. Fallback de histórico recente: preserva TODOS os serviços discutidos na última interação
  for (let i = history.length - 1; i >= 0; i--) {
    const hText = normalizeNlpText(history[i].content);
    const foundInMessage = services.filter((s) => hText.includes(normalizeNlpText(s.name)));
    if (foundInMessage.length > 0) {
      return { matches: foundInMessage, source: 'history' };
    }
  }

  return { matches: [], source: 'none' };
}

/**
 * Localiza profissional mencionado no texto (por nome ou pronome como "ela"/"ele" caso haja profissional no histórico)
 */
export function detectProfessionalInConversation<P extends MinimalProfessional>(
  userMessage: string,
  professionals: P[],
  history: MinimalChatMessage[] = []
): P | null {
  const normMsg = normalizeNlpText(userMessage);

  // 1. Verificação nominal direta na mensagem atual
  for (const p of professionals) {
    const firstName = normalizeNlpText(p.full_name.split(' ')[0]);
    const fullName = normalizeNlpText(p.full_name);
    if (normMsg.includes(fullName) || (firstName.length >= 3 && normMsg.includes(firstName))) {
      return p;
    }
  }

  // 2. Pronomes ou referências de gênero ("ela", "ele", "dra", "doutora")
  const words = normMsg.split(/\s+/).map((w) => w.replace(/[.,!?:;]/g, ''));
  const hasPronoun = words.some((w) => ['ela', 'ele', 'dra', 'doutora', 'dr', 'doutor'].includes(w));

  // 3. Preservação a partir do histórico recente
  for (let i = history.length - 1; i >= 0; i--) {
    const hText = normalizeNlpText(history[i].content);
    for (const p of professionals) {
      const firstName = normalizeNlpText(p.full_name.split(' ')[0]);
      const fullName = normalizeNlpText(p.full_name);
      if (hText.includes(fullName) || (firstName.length >= 3 && hText.includes(firstName))) {
        // Se a mensagem citar um pronome ou estiver fazendo follow-up, devolve o profissional preservado
        return p;
      }
    }
  }

  // Se houver apenas 1 profissional na equipe do tenant e o usuário usou pronome
  if (hasPronoun && professionals.length === 1) {
    return professionals[0];
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
): { targetDate: string; isExplicitInCurrentMessage: boolean } {
  const norm = normalizeNlpText(userMessage);
  const base = referenceDateIso ? new Date(referenceDateIso + 'T12:00:00Z') : new Date();

  // 1. Mensagem atual
  if (norm.includes('amanha') && !norm.includes('depois de amanha')) {
    const tomorrow = new Date(base);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { targetDate: tomorrow.toISOString().split('T')[0], isExplicitInCurrentMessage: true };
  }
  if (norm.includes('depois de amanha')) {
    const after = new Date(base);
    after.setDate(after.getDate() + 2);
    return { targetDate: after.toISOString().split('T')[0], isExplicitInCurrentMessage: true };
  }
  if (norm.includes('hoje')) {
    return { targetDate: base.toISOString().split('T')[0], isExplicitInCurrentMessage: true };
  }

  // 2. Histórico recente
  for (let i = history.length - 1; i >= 0; i--) {
    const hText = normalizeNlpText(history[i].content);
    if (hText.includes('amanha') && !hText.includes('depois de amanha')) {
      const tomorrow = new Date(base);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { targetDate: tomorrow.toISOString().split('T')[0], isExplicitInCurrentMessage: false };
    }
    if (hText.includes('depois de amanha')) {
      const after = new Date(base);
      after.setDate(after.getDate() + 2);
      return { targetDate: after.toISOString().split('T')[0], isExplicitInCurrentMessage: false };
    }
  }

  // Padrão hoje
  return { targetDate: base.toISOString().split('T')[0], isExplicitInCurrentMessage: false };
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
