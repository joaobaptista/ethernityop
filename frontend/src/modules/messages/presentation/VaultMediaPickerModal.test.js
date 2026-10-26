import { describe, it, expect } from 'vitest';
import { filterVaultMedia } from './VaultMediaPickerModal.jsx';

describe('VaultMediaPickerModal Presentation & Logic', () => {
  const mockVaultItems = [
    {
      id: 'vault-item-1',
      title: 'Conselho para Formatura',
      type: 'audio',
      recipient: 'Lucas Silva',
      category: 'Histórias de Vida',
      duration: '03:15 min',
      isEncrypted: true,
    },
    {
      id: 'vault-item-2',
      title: 'Viagem de Férias à Praia',
      type: 'photo',
      recipient: 'Família',
      category: 'Momentos Especiais',
      previewUrl: 'https://example.com/photo.jpg',
      isEncrypted: true,
    },
    {
      id: 'vault-item-3',
      title: 'Depoimento em Vídeo de 18 Anos',
      type: 'video',
      recipient: 'Mariana Silva',
      category: 'Marcos de Família',
      duration: '04:20 min',
      posterUrl: 'https://example.com/poster.jpg',
      isEncrypted: true,
    },
    {
      id: 'vault-item-4',
      name: 'Foto Histórica com Avós',
      type: 'IMAGE',
      recipient: 'Todos',
      category: 'Álbum Ancestral',
      isEncrypted: true,
    },
  ];

  it('handles empty or non-array item lists gracefully', () => {
    expect(filterVaultMedia(null)).toEqual([]);
    expect(filterVaultMedia(undefined)).toEqual([]);
    expect(filterVaultMedia([])).toEqual([]);
  });

  it('filters all media types without restriction when filter is "all"', () => {
    const results = filterVaultMedia(mockVaultItems, 'all', '');
    expect(results.length).toBe(4);
  });

  it('filters photos accurately matching both "photo" and "IMAGE" variants', () => {
    const photos = filterVaultMedia(mockVaultItems, 'photo', '');
    expect(photos.length).toBe(2);
    expect(photos.map((p) => p.id)).toEqual(['vault-item-2', 'vault-item-4']);
  });

  it('filters videos accurately matching "video"', () => {
    const videos = filterVaultMedia(mockVaultItems, 'video', '');
    expect(videos.length).toBe(1);
    expect(videos[0].id).toBe('vault-item-3');
  });

  it('filters audios accurately matching "audio"', () => {
    const audios = filterVaultMedia(mockVaultItems, 'audio', '');
    expect(audios.length).toBe(1);
    expect(audios[0].id).toBe('vault-item-1');
  });

  it('filters items by case-insensitive title search query', () => {
    const results = filterVaultMedia(mockVaultItems, 'all', 'formatura');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('vault-item-1');
  });

  it('filters items by recipient search query', () => {
    const results = filterVaultMedia(mockVaultItems, 'all', 'Mariana');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('vault-item-3');
  });

  it('filters items by category search query', () => {
    const results = filterVaultMedia(mockVaultItems, 'all', 'Ancestral');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('vault-item-4');
  });

  it('returns empty array when search query matches nothing', () => {
    const results = filterVaultMedia(mockVaultItems, 'all', 'PalavraInexistente1234');
    expect(results.length).toBe(0);
  });
});
