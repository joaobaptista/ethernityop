/**
 * vaultModel.js — Bounded Context: Vault (Cofre Digital Criptografado)
 * 
 * Regras de Domínio Puras (Sem dependência de React, DOM ou APIs de navegador).
 * 100% Isomórfico para uso em React Web e React Native (iOS/Android).
 */

export const VAULT_TYPES = {
  PHOTO: 'photo',
  AUDIO: 'audio',
  VIDEO: 'video',
  TEXT: 'text',
  DOC: 'doc',
};

export const VAULT_CATEGORIES = {
  LIFE_STORIES: 'Histórias de Vida',
  FAMILY_MILESTONES: 'Marcos de Família',
  LOVE_LETTERS: 'Cartas de Amor',
  DIRECTIVES: 'Documentos Importantes',
};

export const DEFAULT_INITIAL_VAULT_ITEMS = [];

export const SAMPLE_FIXTURE_VAULT_ITEMS = [
  {
    id: 'vault-1',
    type: VAULT_TYPES.AUDIO,
    title: 'História sobre a nossa primeira viagem à praia',
    recipient: 'Para meus filhos Lucas e Beatriz',
    date: '14 de Março, 2026',
    duration: '04:32 min',
    size: '4.2 MB',
    isEncrypted: true,
    category: VAULT_CATEGORIES.LIFE_STORIES,
  },
  {
    id: 'vault-2',
    type: VAULT_TYPES.VIDEO,
    title: 'Mensagem para a formatura do Lucas',
    recipient: 'Lucas Silva',
    date: '02 de Fevereiro, 2026',
    duration: '08:15 min',
    size: '42.8 MB',
    isEncrypted: true,
    category: VAULT_CATEGORIES.FAMILY_MILESTONES,
  },
  {
    id: 'vault-3',
    type: VAULT_TYPES.TEXT,
    title: 'Conselhos e reflexões para tempos difíceis',
    recipient: 'Toda a família',
    date: '28 de Janeiro, 2026',
    duration: 'Texto e Fotos',
    size: '1.1 MB',
    isEncrypted: true,
    category: VAULT_CATEGORIES.LOVE_LETTERS,
  },
  {
    id: 'vault-4',
    type: VAULT_TYPES.DOC,
    title: 'Diretivas de Vontade & Cartas aos Guardiões',
    recipient: 'Guardião Principal (Dra. Helena)',
    date: '10 de Janeiro, 2026',
    duration: 'PDF Assinado',
    size: '2.4 MB',
    isEncrypted: true,
    category: VAULT_CATEGORIES.DIRECTIVES,
  },
];

/**
 * Valida se um item possui os campos obrigatórios e estrutura correta
 */
export function validateVaultItem(item) {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Item do cofre inválido.' };
  }
  if (!item.title || typeof item.title !== 'string' || item.title.trim().length === 0) {
    return { valid: false, error: 'Título da memória é obrigatório.' };
  }
  const validTypes = Object.values(VAULT_TYPES);
  if (!item.type || !validTypes.includes(item.type)) {
    return { valid: false, error: `Tipo de memória inválido. Tipos suportados: ${validTypes.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Factory para criar uma entidade VaultItem padronizada
 */
export function createVaultItem(payload) {
  const validation = validateVaultItem(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return {
    id: payload.id || `vault-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    title: payload.title.trim(),
    type: payload.type,
    recipient: payload.recipient || 'Toda a família',
    date: payload.date || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    duration: payload.duration || (payload.type === VAULT_TYPES.TEXT ? 'Texto' : '01:00 min'),
    size: payload.size || '1.0 MB',
    isEncrypted: payload.isEncrypted !== false,
    category: payload.category || VAULT_CATEGORIES.LIFE_STORIES,
    previewUrl: payload.previewUrl || null,
    description: payload.description || '',
    createdAt: payload.createdAt || Date.now(),
  };
}

/**
 * Filtra e busca itens do cofre por tipo e termo de busca (função pura)
 */
export function filterVaultItems(items = [], activeFilter = 'all', searchQuery = '') {
  if (!Array.isArray(items)) return [];

  const normalizedQuery = searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    if (activeFilter !== 'all' && item.type !== activeFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    const titleMatch = item.title?.toLowerCase().includes(normalizedQuery);
    const recipientMatch = item.recipient?.toLowerCase().includes(normalizedQuery);
    const categoryMatch = item.category?.toLowerCase().includes(normalizedQuery);
    const descMatch = item.description?.toLowerCase().includes(normalizedQuery);

    return Boolean(titleMatch || recipientMatch || categoryMatch || descMatch);
  });
}

/**
 * Agrega e conta quantidade de itens por tipo
 */
export function getVaultMetrics(items = []) {
  if (!Array.isArray(items)) {
    return { total: 0, photos: 0, audios: 0, videos: 0, texts: 0, docs: 0 };
  }

  return {
    total: items.length,
    photos: items.filter((i) => i.type === VAULT_TYPES.PHOTO).length,
    audios: items.filter((i) => i.type === VAULT_TYPES.AUDIO).length,
    videos: items.filter((i) => i.type === VAULT_TYPES.VIDEO).length,
    texts: items.filter((i) => i.type === VAULT_TYPES.TEXT).length,
    docs: items.filter((i) => i.type === VAULT_TYPES.DOC).length,
  };
}
