/**
 * memoriesModel.js — Bounded Context: Memories (Curadoria de Fotos & Linha do Tempo Afetiva)
 * 
 * Regras de Domínio Puras (Sem dependência de React, DOM ou APIs de navegador).
 * 100% Isomórfico para uso em React Web e React Native (iOS & Android).
 */

export const DEFAULT_TIMELINE_YEARS = [2024, 2023];

export const INITIAL_CURATED_PHOTOS = [];

export const SAMPLE_FIXTURE_PHOTOS = [
  // Fixture estrita para execução de testes unitários isolados
  {
    id: 'photo-test-2024-1',
    img: null,
    title: 'Abraço na Praia ao Pôr do Sol',
    dateLabel: 'Mar 2024',
    year: 2024,
    selected: false,
    source: 'google_photos',
  },
  {
    id: 'photo-test-2024-2',
    img: null,
    title: 'Formatura e Conquista Especial',
    dateLabel: 'Jan 2024',
    year: 2024,
    selected: false,
    source: 'icloud',
  },
  {
    id: 'photo-test-2023-1',
    img: null,
    title: 'Aniversário Especial em Família com Bolo',
    dateLabel: 'Out 2023',
    year: 2023,
    selected: false,
    source: 'google_photos',
  },
  {
    id: 'photo-test-2023-2',
    img: null,
    title: 'Noite de Natal e Chocolate Quente',
    dateLabel: 'Dez 2023',
    year: 2023,
    selected: false,
    source: 'icloud',
  },
];

/**
 * Factory para criar uma entidade CuratedPhoto padronizada
 */
export function createCuratedPhoto(payload) {
  if (!payload || !payload.img) {
    throw new Error('A imagem da foto é obrigatória.');
  }

  return {
    id: payload.id || `photo-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    img: payload.img,
    title: payload.title || 'Momento Especial em Família',
    dateLabel: payload.dateLabel || 'Recente',
    year: Number(payload.year) || new Date().getFullYear(),
    selected: payload.selected !== false,
    source: payload.source || 'local',
    createdAt: payload.createdAt || Date.now(),
  };
}

/**
 * Agrupa fotos da linha do tempo por ano (função pura)
 */
export function groupPhotosByYear(photos = [], targetYears = DEFAULT_TIMELINE_YEARS) {
  if (!Array.isArray(photos)) return {};

  const map = {};
  targetYears.forEach((y) => (map[y] = []));

  photos.forEach((photo) => {
    const yr = photo.year || 2024;
    if (!map[yr]) {
      map[yr] = [];
    }
    map[yr].push(photo);
  });

  return map;
}

/**
 * Alterna a seleção de uma foto específica (imutável)
 */
export function togglePhotoSelection(photos = [], photoId) {
  if (!Array.isArray(photos)) return [];
  return photos.map((p) => (p.id === photoId ? { ...p, selected: !p.selected } : p));
}

/**
 * Seleciona ou desmarca todas as fotos (imutável)
 */
export function setAllPhotosSelection(photos = [], selectAll = true) {
  if (!Array.isArray(photos)) return [];
  return photos.map((p) => ({ ...p, selected: Boolean(selectAll) }));
}

/**
 * Calcula métricas de seleção e contagens
 */
export function calculateSelectionStats(photos = []) {
  if (!Array.isArray(photos)) {
    return { totalCount: 0, selectedCount: 0, isAllSelected: false };
  }

  const totalCount = photos.length;
  const selectedCount = photos.filter((p) => p.selected).length;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return { totalCount, selectedCount, isAllSelected };
}
