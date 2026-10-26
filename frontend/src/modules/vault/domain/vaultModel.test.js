import { describe, it, expect } from 'vitest';
import {
  VAULT_TYPES,
  VAULT_CATEGORIES,
  DEFAULT_INITIAL_VAULT_ITEMS,
  SAMPLE_FIXTURE_VAULT_ITEMS,
  validateVaultItem,
  createVaultItem,
  filterVaultItems,
  getVaultMetrics,
} from './vaultModel.js';

describe('vaultModel Domain Rules', () => {
  it('inicia com ambiente virgem sem itens mockados', () => {
    expect(DEFAULT_INITIAL_VAULT_ITEMS).toEqual([]);
  });

  it('validates correct vault items', () => {
    const valid = validateVaultItem({
      title: 'Conselho de vida',
      type: VAULT_TYPES.AUDIO,
    });
    expect(valid.valid).toBe(true);
  });

  it('rejects vault items without title or invalid type', () => {
    const noTitle = validateVaultItem({ title: '', type: VAULT_TYPES.VIDEO });
    expect(noTitle.valid).toBe(false);
    expect(noTitle.error).toContain('Título');

    const invalidType = validateVaultItem({ title: 'Carta', type: 'unknown_format' });
    expect(invalidType.valid).toBe(false);
    expect(invalidType.error).toContain('Tipo de memória');
  });

  it('creates standardized vault item entities with defaults', () => {
    const item = createVaultItem({
      title: 'Vídeo para o casamento da Maria',
      type: VAULT_TYPES.VIDEO,
    });

    expect(item.id).toBeDefined();
    expect(item.title).toBe('Vídeo para o casamento da Maria');
    expect(item.isEncrypted).toBe(true);
    expect(item.category).toBe(VAULT_CATEGORIES.LIFE_STORIES);
  });

  it('filters vault items by type and search query correctly', () => {
    const items = [
      ...SAMPLE_FIXTURE_VAULT_ITEMS,
      createVaultItem({
        id: 'v-custom-1',
        title: 'Depoimento sobre faculdade',
        type: VAULT_TYPES.VIDEO,
        recipient: 'Lucas',
      }),
    ];

    // Filter by type
    const audios = filterVaultItems(items, VAULT_TYPES.AUDIO);
    expect(audios.every((i) => i.type === VAULT_TYPES.AUDIO)).toBe(true);

    // Filter by search query
    const results = filterVaultItems(items, 'all', 'faculdade');
    expect(results.length).toBe(1);
    expect(results[0].title).toContain('faculdade');

    // Filter by recipient
    const lucasItems = filterVaultItems(items, 'all', 'Lucas');
    expect(lucasItems.length).toBeGreaterThanOrEqual(2);
  });

  it('calculates metrics and counts accurately', () => {
    const metrics = getVaultMetrics(SAMPLE_FIXTURE_VAULT_ITEMS);
    expect(metrics.total).toBe(4);
    expect(metrics.audios).toBe(1);
    expect(metrics.videos).toBe(1);
    expect(metrics.texts).toBe(1);
    expect(metrics.docs).toBe(1);
    expect(metrics.photos).toBe(0);
  });
});
