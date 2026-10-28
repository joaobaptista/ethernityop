import { describe, it, expect, beforeEach, vi } from 'vitest';
import capsulesService, { DEFAULT_CAPSULES } from './capsulesService.js';

describe('capsulesService', () => {
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
    capsulesService.resetToDefaults();
  });

  it('retorna DEFAULT_CAPSULES vazio se o localStorage estiver limpo (ambiente virgem)', () => {
    globalThis.localStorage.clear();
    const capsules = capsulesService.getCapsules();
    expect(capsules).toEqual([]);
  });

  it('adiciona e preserva as cápsulas criadas pelo usuário', () => {
    const newCapsule = {
      id: 'cap-new-1',
      title: 'Cápsula: Presente para Lucas',
      recipient: 'Lucas (Filho)',
      avatar: 'data:image/jpeg;base64,mockavatar',
      triggerLabel: '12 de Outubro de 2032',
      contentsSummary: '3 fotos • Mensagem de Amor',
    };

    const updated = capsulesService.addCapsules(newCapsule);
    
    // Verifica que a nova foi adicionada
    expect(updated.some((c) => c.id === 'cap-new-1')).toBe(true);
    expect(updated.length).toBe(1);
  });

  it('sanitiza e remove arrays pesados de fotos base64 evitando QuotaExceededError', () => {
    const heavyPhotos = [
      { id: 'p1', img: 'data:image/jpeg;base64,' + 'A'.repeat(50000) },
      { id: 'p2', img: 'data:image/jpeg;base64,' + 'B'.repeat(50000) },
    ];

    const capsuleWithHeavyData = {
      id: 'cap-heavy-1',
      title: 'Cápsula Pesada',
      recipient: 'Alguém',
      photos: heavyPhotos,
    };

    const sanitized = capsulesService.sanitizeCapsule(capsuleWithHeavyData);
    expect(sanitized.photos).toBeUndefined();
    expect(sanitized.photosCount).toBe('2 fotos');
  });

  it('armazena e recupera fotos reais associadas a uma cápsula', async () => {
    const uploadedPhotos = [
      { id: 'photo-1', img: 'data:image/jpeg;base64,photo1', title: 'Selfie com Oli', dateLabel: 'Hoje' },
      { id: 'photo-2', img: 'data:image/jpeg;base64,photo2', title: 'Passeio', dateLabel: 'Ontem' },
    ];

    await capsulesService.setCapsulePhotos('cap-oli', uploadedPhotos);
    const retrieved = await capsulesService.getCapsulePhotos('cap-oli');

    expect(retrieved.length).toBe(2);
    expect(retrieved[0].img).toBe('data:image/jpeg;base64,photo1');
    expect(retrieved[1].title).toBe('Passeio');
  });

  it('fornece fallback do avatar como foto quando a cápsula criada não tem fotos salvas', async () => {
    const fallbackCapsule = {
      id: 'cap-custom-user',
      recipient: 'Oli',
      avatar: 'data:image/jpeg;base64,oli-avatar',
    };

    const photos = await capsulesService.getCapsulePhotos('cap-custom-user', fallbackCapsule);
    expect(photos.length).toBeGreaterThan(0);
    expect(photos[0].img).toBe('data:image/jpeg;base64,oli-avatar');
  });

  it('notifica ouvintes inscritos via subscribe', () => {
    const listener = vi.fn();
    const unsubscribe = capsulesService.subscribe(listener);

    capsulesService.addCapsules({
      id: 'cap-sub-test',
      title: 'Teste Subscrição',
      recipient: 'Amigo',
    });

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('mantém o conteúdo da cápsula estritamente estanque e exclusivo, sem vazar fotos globais da timeline', async () => {
    // Simula foto de upload na timeline geral
    mockStore['ethernity_curated_timeline_photos'] = JSON.stringify([
      {
        id: 'local-file-123',
        img: 'data:image/jpeg;base64,timeline-global-photo',
        title: 'Foto Timeline',
        source: 'local',
      },
    ]);

    const originalPhotos = capsulesService.findOriginalUploadedPhotos();
    expect(originalPhotos.length).toBe(1);

    // Cápsula individual com seu próprio avatar exclusivo
    const fallbackCapsule = {
      id: 'cap-oli-custom',
      recipient: 'Oli',
      avatar: 'data:image/jpeg;base64,cropped-avatar-face',
    };

    // getCapsulePhotos retorna estritamente a identidade da cápsula informada, sem puxar fotos globais da timeline
    const photos = await capsulesService.getCapsulePhotos('cap-oli-custom', fallbackCapsule);
    expect(photos.length).toBe(1);
    expect(photos[0].img).toBe('data:image/jpeg;base64,cropped-avatar-face');
    expect(photos[0].img).not.toBe('data:image/jpeg;base64,timeline-global-photo');
  });

  it('exclui uma cápsula e todo o seu conteúdo de forma 100% independente, sem afetar as demais cápsulas', async () => {
    // Cria duas cápsulas independentes
    const cap1 = { id: 'cap-oli', title: 'Cápsula Oli', recipient: 'Oli' };
    const cap2 = { id: 'cap-pedro', title: 'Cápsula Pedro', recipient: 'Pedro' };
    capsulesService.addCapsules([cap1, cap2]);

    // Define fotos distintas para cada uma
    const photosOli = [{ id: 'ph-oli-1', img: 'data:img-oli', title: 'Oli Foto' }];
    const photosPedro = [{ id: 'ph-pedro-1', img: 'data:img-pedro', title: 'Pedro Foto' }];
    await capsulesService.setCapsulePhotos('cap-oli', photosOli);
    await capsulesService.setCapsulePhotos('cap-pedro', photosPedro);

    // Ambas têm suas fotos salvas independentemente
    const beforeDeleteOli = await capsulesService.getCapsulePhotos('cap-oli');
    const beforeDeletePedro = await capsulesService.getCapsulePhotos('cap-pedro');
    expect(beforeDeleteOli.length).toBe(1);
    expect(beforeDeletePedro.length).toBe(1);

    // Deleta a cápsula de Oli
    const deleted = await capsulesService.deleteCapsule('cap-oli');
    expect(deleted).toBe(true);

    // Verifica que a cápsula de Oli não está mais na listagem
    const capsulesAfter = capsulesService.getCapsules();
    expect(capsulesAfter.some((c) => c.id === 'cap-oli')).toBe(false);

    // A cápsula de Pedro permanece intacta
    expect(capsulesAfter.some((c) => c.id === 'cap-pedro')).toBe(true);

    // As fotos da cápsula de Pedro permanecem 100% intactas e inalteradas
    const photosPedroAfter = await capsulesService.getCapsulePhotos('cap-pedro');
    expect(photosPedroAfter.length).toBe(1);
    expect(photosPedroAfter[0].id).toBe('ph-pedro-1');
    expect(photosPedroAfter[0].img).toBe('data:img-pedro');
  });

  it('exclui uma foto específica de dentro de uma cápsula sem afetar as outras', async () => {
    const cap = { id: 'cap-multi', title: 'Multi Fotos' };
    capsulesService.addCapsules(cap);
    await capsulesService.setCapsulePhotos('cap-multi', [
      { id: 'p1', img: 'data:p1' },
      { id: 'p2', img: 'data:p2' },
    ]);

    const remaining = await capsulesService.deleteCapsulePhoto('cap-multi', 'p1');
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('p2');
  });

  it('exclui arquivos de conteúdo (voz, texto) de forma independente sem afetar outras cápsulas', () => {
    const capA = { id: 'cap-item-a', title: 'Cápsula A' };
    const capB = { id: 'cap-item-b', title: 'Cápsula B' };
    capsulesService.addCapsules([capA, capB]);

    // Exclui mensagem de voz da Cápsula A
    const updatedA = capsulesService.deleteCapsuleContentItem('cap-item-a', 'voice');
    expect(updatedA.removedContentItems).toContain('voice');

    // Cápsula B não tem 'voice' removido
    const all = capsulesService.getCapsules();
    const foundB = all.find((c) => c.id === 'cap-item-b');
    expect(foundB.removedContentItems).not.toContain('voice');
  });

  it('quando todas as fotos de uma cápsula são excluídas, ela permanece vazia sem restaurar fotos indevidamente', async () => {
    const cap = { id: 'cap-empty-test', title: 'Cápsula Sem Fotos' };
    capsulesService.addCapsules(cap);
    await capsulesService.setCapsulePhotos('cap-empty-test', [{ id: 'p-only', img: 'data:img' }]);

    const remaining = await capsulesService.deleteCapsulePhoto('cap-empty-test', 'p-only');
    expect(remaining.length).toBe(0);

    const checkPhotos = await capsulesService.getCapsulePhotos('cap-empty-test');
    expect(checkPhotos.length).toBe(0);
  });

  it('adiciona fotos diretamente a uma cápsula existente mantendo a independência das demais', async () => {
    const cap1 = { id: 'cap-direct-1', title: 'Cápsula 1' };
    const cap2 = { id: 'cap-direct-2', title: 'Cápsula 2' };
    capsulesService.addCapsules([cap1, cap2]);

    await capsulesService.setCapsulePhotos('cap-direct-1', [{ id: 'p1', img: 'data:p1' }]);
    await capsulesService.setCapsulePhotos('cap-direct-2', [{ id: 'p2', img: 'data:p2' }]);

    const added = await capsulesService.addPhotosToCapsule('cap-direct-1', [
      { id: 'p1-extra', img: 'data:p1-extra', title: 'Foto Extra' }
    ]);

    expect(added.length).toBe(2);
    expect(added.some((p) => p.id === 'p1-extra')).toBe(true);

    // Cápsula 2 não é afetada
    const photosCap2 = await capsulesService.getCapsulePhotos('cap-direct-2');
    expect(photosCap2.length).toBe(1);
    expect(photosCap2[0].id).toBe('p2');
  });

  it('adiciona gravação de voz a uma cápsula específica de forma estanque e independente', () => {
    const cap1 = { id: 'cap-voice-1', title: 'Cápsula Voz 1' };
    const cap2 = { id: 'cap-voice-2', title: 'Cápsula Voz 2' };
    capsulesService.addCapsules([cap1, cap2]);

    const audioItem = {
      id: 'voice-item-123',
      title: 'Conselhos para Mariana',
      duration: '02:15 min',
      url: 'blob:http://localhost/audio-123',
      type: 'audio',
    };

    const updated = capsulesService.addCapsuleAudio('cap-voice-1', audioItem);
    expect(updated).not.toBeNull();
    expect(updated.hasVoice).toBe(true);
    expect(updated.voiceAudio.title).toBe('Conselhos para Mariana');
    expect(updated.audios.length).toBe(1);
    expect(updated.audios[0].id).toBe('voice-item-123');

    // A Cápsula 2 permanece intocada sem mensagem de voz
    const all = capsulesService.getCapsules();
    const found2 = all.find((c) => c.id === 'cap-voice-2');
    expect(found2.hasVoice).toBeFalsy();
    expect(found2.voiceAudio).toBeFalsy();
  });

  it('ao excluir o item de voz de uma cápsula, realiza o expurgo definitivo de hasVoice e audios', () => {
    const cap = { id: 'cap-voice-del', title: 'Cápsula com Voz' };
    capsulesService.addCapsules(cap);
    capsulesService.addCapsuleAudio('cap-voice-del', {
      id: 'v-del',
      title: 'Depoimento',
      duration: '01:00 min',
    });

    const deletedCap = capsulesService.deleteCapsuleContentItem('cap-voice-del', 'voice');
    expect(deletedCap.hasVoice).toBe(false);
    expect(deletedCap.voiceAudio).toBeNull();
    expect(deletedCap.audios).toEqual([]);
    expect(deletedCap.removedContentItems).toContain('voice');
  });
});


