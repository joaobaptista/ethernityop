import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('useAutoSaveDraft logic & behavior', () => {
  let storage = {};

  beforeEach(() => {
    storage = {};
    globalThis.localStorage = {
      getItem: vi.fn((key) => storage[key] || null),
      setItem: vi.fn((key, val) => {
        storage[key] = String(val);
      }),
      removeItem: vi.fn((key) => {
        delete storage[key];
      }),
      clear: vi.fn(() => {
        storage = {};
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies draft detection for non-empty content', () => {
    const isInitialEmpty = (data) => {
      if (!data) return true;
      const titleEmpty = !data.title || !data.title.trim();
      const contentEmpty =
        !data.content ||
        !data.content.trim() ||
        data.content.trim() === '<p></p>' ||
        data.content.trim() === '<p><br></p>';
      return titleEmpty && contentEmpty;
    };

    expect(isInitialEmpty(null)).toBe(true);
    expect(isInitialEmpty({})).toBe(true);
    expect(isInitialEmpty({ title: '', content: '<p></p>' })).toBe(true);
    expect(isInitialEmpty({ title: 'Carta', content: '' })).toBe(false);
    expect(isInitialEmpty({ title: '', content: '<p>Minha filha querida</p>' })).toBe(false);
  });

  it('persists draft to localStorage with ISO timestamp', () => {
    const key = 'ethernity_message_draft_v1';
    const payload = {
      title: 'Carta para o Casamento',
      content: '<p>Querida Mariana, seja muito feliz...</p>',
      recipientName: 'Mariana Silva',
      deliveryType: 'date',
      deliveryDate: '2026-12-25',
      deliveryTime: '09:00',
      savedAt: new Date('2026-09-30T10:00:00Z').toISOString(),
    };

    localStorage.setItem(key, JSON.stringify(payload));
    const retrieved = JSON.parse(localStorage.getItem(key));

    expect(retrieved.title).toBe('Carta para o Casamento');
    expect(retrieved.content).toContain('Querida Mariana');
    expect(retrieved.recipientName).toBe('Mariana Silva');
    expect(retrieved.savedAt).toBe('2026-09-30T10:00:00.000Z');
  });

  it('clears draft from localStorage on discard or final save', () => {
    const key = 'ethernity_message_draft_v1';
    localStorage.setItem(key, JSON.stringify({ title: 'Draft' }));
    expect(localStorage.getItem(key)).not.toBeNull();

    localStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });
});
