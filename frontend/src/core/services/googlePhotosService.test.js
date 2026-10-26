import { describe, it, expect, beforeEach, vi } from 'vitest';
import googlePhotosService, { DEFAULT_GOOGLE_PHOTOS } from './googlePhotosService.js';

describe('googlePhotosService', () => {
  let mockStore = {};

  beforeEach(() => {
    mockStore = {};
    const mockStorage = {
      getItem: (key) => mockStore[key] || null,
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
    globalThis.localStorage = mockStorage;
  });

  it('initializes with disconnected status when storage is empty', () => {
    const status = googlePhotosService.getConnectionStatus();
    expect(status.connected).toBe(false);
    expect(status.email).toBeNull();
    expect(status.importedPhotos).toEqual([]);
    expect(status.totalImported).toBe(0);
  });

  it('connects account and notifies subscribers', async () => {
    const subscriber = vi.fn();
    const unsubscribe = googlePhotosService.subscribe(subscriber);

    const connected = await googlePhotosService.connectAccount({
      email: 'teste.usuario@gmail.com',
      name: 'Teste Usuário',
    });

    expect(connected.connected).toBe(true);
    expect(connected.email).toBe('teste.usuario@gmail.com');
    expect(subscriber).toHaveBeenCalled();

    const stored = googlePhotosService.getConnectionStatus();
    expect(stored.connected).toBe(true);
    expect(stored.email).toBe('teste.usuario@gmail.com');

    unsubscribe();
  });

  it('filters available photos by category and search', async () => {
    const familyPhotos = await googlePhotosService.getPhotos({ category: 'family', allowMock: true });
    expect(familyPhotos.length).toBeGreaterThan(0);
    expect(familyPhotos.every((p) => p.category === 'family')).toBe(true);

    const searchPhotos = await googlePhotosService.getPhotos({ search: 'Praia', allowMock: true });
    expect(searchPhotos.length).toBeGreaterThan(0);
    expect(searchPhotos[0].title).toContain('Praia');
  });

  it('imports chosen photos into the vault', async () => {
    const targetPhotos = [DEFAULT_GOOGLE_PHOTOS[0].id, DEFAULT_GOOGLE_PHOTOS[1].id];
    const result = await googlePhotosService.importPhotos(targetPhotos, {
      recipient: 'Para Minha Filha',
    });

    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(2);
    expect(result.importedItems[0].recipient).toBe('Para Minha Filha');
    expect(result.importedItems[0].isEncrypted).toBe(true);

    const status = googlePhotosService.getConnectionStatus();
    expect(status.connected).toBe(true);
    expect(status.totalImported).toBe(2);
  });

  it('disconnects account properly', async () => {
    await googlePhotosService.connectAccount({ email: 'user@gmail.com' });
    expect(googlePhotosService.getConnectionStatus().connected).toBe(true);

    const disconnected = await googlePhotosService.disconnectAccount();
    expect(disconnected.connected).toBe(false);
    expect(googlePhotosService.getConnectionStatus().connected).toBe(false);
  });

  it('manages Google Client ID correctly', () => {
    googlePhotosService.setClientId('');
    expect(googlePhotosService.hasConfiguredClientId()).toBe(false);
    googlePhotosService.setClientId('test-client-id.apps.googleusercontent.com');
    expect(googlePhotosService.getClientId()).toBe('test-client-id.apps.googleusercontent.com');
    expect(googlePhotosService.hasConfiguredClientId()).toBe(true);

    googlePhotosService.setClientId('');
    expect(googlePhotosService.hasConfiguredClientId()).toBe(false);
  });
});
