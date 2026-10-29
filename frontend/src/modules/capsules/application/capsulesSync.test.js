import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import capsulesService from './capsulesService.js';
import { buildCalendarEvents } from '../../calendar/domain/calendarModel.js';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
});

describe('capsulesService — gravação no servidor', () => {
  let mockStore;
  let calls;
  let uploadCount;

  beforeEach(() => {
    mockStore = { ethernity_auth_token: 'token-teste' };
    globalThis.localStorage = {
      getItem: (key) => (key in mockStore ? mockStore[key] : null),
      setItem: (key, val) => {
        mockStore[key] = String(val);
      },
      removeItem: (key) => {
        delete mockStore[key];
      },
      clear: () => {
        mockStore = {};
      },
    };
    calls = [];
    uploadCount = 0;

    globalThis.fetch = vi.fn(async (url, options = {}) => {
      const method = options.method || 'GET';
      calls.push({ url: String(url), method, body: options.body });

      if (String(url).startsWith('data:')) {
        return { ok: true, status: 200, blob: async () => new Blob(['img'], { type: 'image/jpeg' }) };
      }
      if (String(url).endsWith('/vault/media/upload')) {
        uploadCount += 1;
        return jsonResponse({ mediaId: `mem-srv-${uploadCount}`, id: 100 + uploadCount });
      }
      if (String(url).endsWith('/capsules/') && method === 'POST') {
        return jsonResponse({ id: JSON.parse(options.body).id }, 201);
      }
      if (String(url).includes('/capsules/cap-restore') && method === 'GET') {
        return jsonResponse({
          id: 'cap-restore',
          memories: [
            { memoryId: 41, mediaId: 'mem-a', type: 'IMAGE', title: 'Praia', story: 'Primeiro mergulho' },
            { memoryId: 42, mediaId: 'mem-b', type: 'AUDIO', title: 'Voz' },
          ],
        });
      }
      if (String(url).includes('/memories/') && method === 'PUT') {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grava a cápsula no servidor sem base64 no JSON e envia as fotos ao cofre', async () => {
    capsulesService.addCapsules([
      {
        id: 'cap-sync-1',
        title: 'Cápsula para Ana',
        recipient: 'Ana',
        avatar: 'data:image/jpeg;base64,AVATAR',
        photos: [{ id: 'p-sync-1', img: 'data:image/jpeg;base64,FOTO', title: 'Momento' }],
      },
    ]);

    await capsulesService.syncCapsule('cap-sync-1');

    const capsulePost = calls.find((c) => c.url.endsWith('/capsules/') && c.method === 'POST');
    const payload = JSON.parse(capsulePost.body);
    expect(payload.id).toBe('cap-sync-1');
    expect(payload.photos).toBeUndefined();
    expect(JSON.stringify(payload.metadata)).not.toContain('base64,FOTO');

    expect(calls.some((c) => c.url.endsWith('/vault/media/upload'))).toBe(true);
    const photos = await capsulesService.getCapsulePhotos('cap-sync-1');
    expect(photos[0].mediaId).toMatch(/^mem-srv-/);
    expect(capsulesService.getCapsules().find((c) => c.id === 'cap-sync-1').syncState).toBe('synced');
  });

  it('não reenvia ao cofre fotos que já têm cópia no servidor', async () => {
    capsulesService.addCapsules([
      { id: 'cap-sync-2', title: 'Cápsula 2', recipient: 'Bia', photos: [{ id: 'p-sync-2', img: 'data:image/jpeg;base64,X' }] },
    ]);
    await capsulesService.syncCapsule('cap-sync-2');
    const uploadsAfterFirst = uploadCount;

    await capsulesService.syncCapsule('cap-sync-2');
    expect(uploadCount).toBe(uploadsAfterFirst);
  });

  it('fica pendente quando o servidor está indisponível e conclui na próxima tentativa', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    capsulesService.addCapsules([{ id: 'cap-offline', title: 'Sem rede', recipient: 'Caio' }]);
    await capsulesService.syncCapsule('cap-offline');
    expect(capsulesService.getCapsules().find((c) => c.id === 'cap-offline').syncState).toBe('pending');

    globalThis.fetch = realFetch;
    await capsulesService.syncPending();
    expect(capsulesService.getCapsules().find((c) => c.id === 'cap-offline').syncState).toBe('synced');
  });

  it('recupera do servidor as fotos de uma cápsula que não existe neste aparelho', async () => {
    const photos = await capsulesService.getCapsulePhotos('cap-restore');
    expect(photos).toHaveLength(1);
    expect(photos[0].mediaId).toBe('mem-a');
    expect(photos[0].story).toBe('Primeiro mergulho');
    expect(photos[0].img).toContain('/api/vault/media/mem-a?variant=display');
    expect(photos[0].img).toContain('token=token-teste');
  });

  it('salva a história da foto no aparelho e no servidor', async () => {
    await capsulesService.setCapsulePhotos('cap-story', [{ id: 'p-story', img: null, mediaId: 'mem-s', memoryId: 77 }]);
    await capsulesService.updatePhotoStory('cap-story', 'p-story', 'O dia em que você aprendeu a andar', ['Amor']);

    const photos = await capsulesService.getCapsulePhotos('cap-story');
    expect(photos[0].story).toBe('O dia em que você aprendeu a andar');
    const put = calls.find((c) => c.url.endsWith('/memories/77') && c.method === 'PUT');
    expect(JSON.parse(put.body).content).toBe('O dia em que você aprendeu a andar');
  });

  it('edita destinatário e data de entrega e envia ao servidor', async () => {
    capsulesService.addCapsules([{ id: 'cap-edit', title: 'Para Lia', recipient: 'Lia (Filha)' }]);
    expect(capsulesService.getCapsules().find((c) => c.id === 'cap-edit').triggerLabel).toBe('Data de entrega a definir');

    capsulesService.updateCapsuleDetails('cap-edit', {
      title: 'Formatura da Lia',
      recipientName: 'Lia',
      relationship: 'Filha',
      deliveryType: 'date',
      scheduledDate: '2031-12-10T12:00:00.000Z',
    });

    const cap = capsulesService.getCapsules().find((c) => c.id === 'cap-edit');
    expect(cap.title).toBe('Formatura da Lia');
    expect(cap.triggerLabel).toBe('Entrega em 10 de dezembro de 2031');
    await vi.waitFor(() => {
      const post = calls.filter((c) => c.url.endsWith('/capsules/') && c.method === 'POST').pop();
      expect(JSON.parse(post.body).scheduledDate).toBe('2031-12-10T12:00:00.000Z');
    });
  });

  it('expurga no servidor a foto excluída da cápsula', async () => {
    await capsulesService.setCapsulePhotos('cap-del', [{ id: 'p-del', img: null, mediaId: 'mem-del', memoryId: 9 }]);
    await capsulesService.deleteCapsulePhoto('cap-del', 'p-del');
    expect(calls.some((c) => c.url.endsWith('/vault/media/mem-del') && c.method === 'DELETE')).toBe(true);
  });
});

describe('calendário de entregas', () => {
  it('monta eventos ordenados a partir de cápsulas e mensagens com data, ignorando póstumas', () => {
    const events = buildCalendarEvents(
      [
        { id: 'c1', title: 'Formatura', recipient: 'Lia', deliveryType: 'date', scheduledDate: '2031-12-10T12:00:00Z' },
        { id: 'c2', title: 'Póstuma', recipient: 'Rui', deliveryType: 'posthumous', scheduledDate: null },
      ],
      [{ id: 'm1', title: 'Aniversário', recipientName: 'Lia', deliveryType: 'date', deliveryDate: '2030-05-01' }]
    );

    expect(events.map((e) => e.id)).toEqual(['msg-m1', 'cap-c1']);
    expect(events[1].title).toBe('Entrega da Cápsula: Formatura');
  });
});
