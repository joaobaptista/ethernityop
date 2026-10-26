import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VaultService } from './vaultService.js';

describe('VaultService Application Layer', () => {
  let mockRepo;
  let service;

  beforeEach(() => {
    mockRepo = {
      items: [],
      async getItems() {
        return [...this.items];
      },
      getItemsSync() {
        return [...this.items];
      },
      async addItem(payload) {
        const item = { ...payload, id: payload.id || 'mock-id' };
        this.items.push(item);
        return item;
      },
      async removeItem(id) {
        this.items = this.items.filter((i) => i.id !== id);
        return true;
      },
    };
    service = new VaultService(mockRepo);
    vi.restoreAllMocks();
  });

  it('notifies subscribers when a new item is added or removed', async () => {
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    await service.addItem({
      title: 'Minha História Gravada',
      type: 'audio',
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].length).toBe(1);

    await service.removeItem('mock-id');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await service.addItem({ title: 'Novo item', type: 'video' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('throws error when uploading empty file or blob', async () => {
    await expect(service.uploadMedia(null)).rejects.toThrow('Nenhum arquivo ou gravação fornecida');
  });

  it('uploads audio/video blob to vault backend and enriches vault item', async () => {
    const fakeBlob = new Blob(['fake audio recording bytes'], { type: 'audio/webm' });

    // Mock fetch com sucesso simulando backend /api/vault/media/upload
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 101,
        mediaId: 'mem-uuid-1234',
        type: 'AUDIO',
        mediaUrl: '/api/vault/media/mem-uuid-1234/stream',
        streamUrl: '/api/vault/media/mem-uuid-1234/stream',
        waveformUrl: '/api/vault/media/mem-uuid-1234/waveform',
        durationSeconds: 42,
      }),
    });

    const result = await service.uploadMedia(fakeBlob, {
      title: 'Depoimento em Voz',
      description: 'Mensagem para os netos',
      category: 'Histórias de Vida',
      recipient: 'Netos',
    });

    expect(result.success).toBe(true);
    expect(result.offline).toBe(false);
    expect(result.vaultItem).toBeDefined();
    expect(result.vaultItem.id).toBe('mem-uuid-1234');
    expect(result.vaultItem.type).toBe('audio');
    expect(result.vaultItem.isEncrypted).toBe(true);
    expect(result.vaultItem.streamUrl).toBe('/api/vault/media/mem-uuid-1234/stream');

    const items = await service.getItems();
    expect(items.some((i) => i.id === 'mem-uuid-1234')).toBe(true);
  });

  it('falls back to local vault item when backend upload fails (Offline Mode)', async () => {
    const fakeBlob = new Blob(['video data'], { type: 'video/webm' });

    // Mock fetch falhando (ex: servidor offline)
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error: Connection refused'));

    const result = await service.uploadMedia(fakeBlob, {
      title: 'Gravação na Webcam',
      recipient: 'Família',
    });

    expect(result.success).toBe(true);
    expect(result.offline).toBe(true);
    expect(result.vaultItem).toBeDefined();
    expect(result.vaultItem.type).toBe('video');
    expect(result.vaultItem.isEncrypted).toBe(true);
    expect(result.warning).toContain('Modo Offline');

    const items = await service.getItems();
    expect(items.length).toBe(1);
  });
});
