/**
 * capsulesService.js — Application Service para Gerenciamento de Cápsulas do Tempo e Mídias
 * 
 * Responsabilidades:
 * 1. Unificar a persistência de novas cápsulas criadas a partir do reconhecimento facial ou criação manual
 * 2. Cache local: metadados no localStorage e fotos/mídias no IndexedDB (sem QuotaExceededError)
 * 3. Gravar tudo no servidor (cápsula, fotos no cofre cifrado, histórias, voz e vídeos), com reenvio
 *    automático do que ficou pendente e restauração em outro aparelho
 * 4. Fornecer subscrição reativa para atualização instantânea da UI
 */
import httpClient from '../../../core/api/httpClient.js';
import { describeCapsuleDelivery } from '../domain/capsulesModel.js';
import { API_BASE_URL, resolveMediaUrl, backgroundRequest } from '../../../core/api/apiUrl.js';

function getAuthToken() {
  try {
    const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
    if (store) {
      return store.getItem('ethernity_auth_token') || null;
    }
  } catch {}
  return null;
}

export const DEFAULT_CAPSULES = [];

export const SAMPLE_FIXTURE_CAPSULES = [
  {
    id: 'cap-1',
    title: 'Cápsula: 18º Aniversário da Mariana',
    recipient: 'Mariana Silva (Filha)',
    avatar: null,
    triggerLabel: '12 de Outubro de 2032',
    contentsSummary: '2 Áudios • 1 Vídeo • 1 Álbum de Fotos • Carta de Amor',
    sealColor: '#F05A47',
    statusText: 'Bloqueada até a data',
  },
  {
    id: 'cap-2',
    title: 'Legado Familiar & Palavras de Sabedoria',
    recipient: 'Antônio Silva (Pai)',
    avatar: null,
    triggerLabel: 'Liberação Póstuma (Guardião Responsável)',
    contentsSummary: '3 Áudios • 2 Vídeos • Documentos & Diretivas',
    sealColor: '#7E57C2',
    statusText: 'Sob Guarda do Guardião',
  },
];

export const DEFAULT_CURATION_PHOTOS = [];

export const SAMPLE_FIXTURE_CURATION_PHOTOS = [
  {
    id: 'c-1',
    img: null,
    dateLabel: 'Julho 2018',
    photoNumber: 1,
    story: 'Férias de verão na praia. O seu primeiro contato com as ondas do mar e aquele abraço quentinho ao entardecer.',
    audioDuration: '0:35',
    emotions: ['Amor', 'Saudade'],
  },
  {
    id: 'c-2',
    img: null,
    dateLabel: 'Dezembro 2021',
    photoNumber: 2,
    story: 'Dia de formatura e muita comemoração. Ver você conquistando seus sonhos com tanta dedicação enche meu coração.',
    audioDuration: '1:15',
    emotions: ['Orgulho', 'Alegria'],
  },
  {
    id: 'c-3',
    img: null,
    dateLabel: 'Janeiro 2024',
    photoNumber: 3,
    story: 'Este foi o dia em que você me ensinou a andar de bicicleta. Eu caí tantas vezes, mas você sempre estava lá para me levantar. Nunca vou esquecer seu sorriso orgulhoso quando finalmente consegui.',
    audioDuration: '0:42',
    emotions: ['Gratidão', 'Alegria', 'Amor'],
  },
  {
    id: 'c-4',
    img: null,
    dateLabel: 'Maio 2023',
    photoNumber: 4,
    story: 'Tarde de domingo na cozinha fazendo o bolo de cenoura com chocolate que você tanto pedia quando era pequena.',
    audioDuration: '0:50',
    emotions: ['Amor', 'Alegria'],
  },
  {
    id: 'c-5',
    img: null,
    dateLabel: 'Outubro 2022',
    photoNumber: 5,
    story: 'Caminhada pelo parque em pleno outono. As conversas que tivemos nesse dia mudaram minha perspectiva sobre tantas coisas.',
    audioDuration: '0:28',
    emotions: ['Gratidão', 'Saudade'],
  },
  {
    id: 'c-6',
    img: null,
    dateLabel: 'Novembro 2020',
    photoNumber: 6,
    story: 'Almoço de família reunida depois de meses sem podermos nos abraçar. Um dos dias mais alegres da nossa história.',
    audioDuration: '1:05',
    emotions: ['Amor', 'Orgulho', 'Gratidão'],
  },
];

const STORAGE_KEY = 'ethernity_user_capsules';
const DELETED_KEY = 'ethernity_deleted_capsule_ids';
const IDB_NAME = 'Ethernity_Capsules_Media';
const IDB_VERSION = 1;
const IDB_STORE = 'capsule_photos';

const PENDING_PREFIX = 'pending::';

const isServerMediaUrl = (url) => typeof url === 'string' && url.includes('/vault/media/');

/**
 * Referência leve de mídia (voz, vídeo, calibração) para os metadados da cápsula.
 * Blobs e URLs temporárias (blob:) nunca vão para o localStorage nem para o servidor.
 */
function sanitizeMediaRef(item) {
  if (!item || typeof item !== 'object') return null;
  const ref = {
    id: item.id || `media-${Date.now()}`,
    title: item.title || '',
    duration: item.duration || '',
    durationSeconds: item.durationSeconds || null,
    date: item.date || item.createdAt || null,
    kind: item.kind || item.type || null,
    script: typeof item.script === 'string' ? item.script.slice(0, 20000) : undefined,
    mediaId: item.mediaId || null,
    memoryId: item.memoryId || null,
  };
  const url = item.url || item.previewUrl || item.streamUrl;
  if (!ref.mediaId && typeof url === 'string' && !/^blob:/i.test(url) && !isServerMediaUrl(url)) {
    ref.url = url;
  }
  return ref;
}

function hydrateMediaRef(ref, variantPath = 'stream') {
  if (!ref || typeof ref !== 'object' || !ref.mediaId) return ref;
  if (ref.url && !isServerMediaUrl(ref.url)) return ref;
  const url = resolveMediaUrl(`/api/vault/media/${ref.mediaId}/${variantPath}`);
  return { ...ref, url, streamUrl: url };
}

function openIndexedDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'capsuleId' });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

class CapsulesService {
  constructor() {
    this.listeners = new Set();
    this._photosByCapsuleId = new Map();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) {
          this.notify();
        }
      });
      // A conexão voltou: envia o que ficou pendente no aparelho
      window.addEventListener('online', () => {
        this.syncPending().catch(() => {});
      });
    }
  }

  /**
   * Sanitiza uma cápsula para armazenamento seguro no localStorage
   * Remove arrays brutos com imagens base64 pesadas que causam estouro de cota (QuotaExceededError).
   */
  sanitizeCapsule(cap) {
    if (!cap || typeof cap !== 'object') return null;

    const countLabel = cap.photosCount || (Array.isArray(cap.photos) ? `${cap.photos.length} ${cap.photos.length === 1 ? 'foto' : 'fotos'}` : '');

    const sanitized = {
      id: cap.id || `cap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      title: cap.title || 'Cápsula do Tempo',
      recipient: cap.recipient || 'Pessoa Especial',
      avatar: cap.avatar || null,
      ...describeCapsuleDelivery({
        deliveryType: cap.deliveryType,
        scheduledDate: cap.scheduledDate || cap.triggerDate || null,
      }),
      contentsSummary: countLabel,
      sealColor: cap.sealColor || '#F05A47',
      personId: cap.personId || null,
      photosCount: countLabel,
      createdAt: cap.createdAt || Date.now(),
      removedContentItems: Array.isArray(cap.removedContentItems) ? cap.removedContentItems : [],
      deliveryType: cap.deliveryType || 'date',
      scheduledDate: cap.scheduledDate || cap.triggerDate || null,
      hasVoice: Boolean(cap.hasVoice),
      voiceAudio: sanitizeMediaRef(cap.voiceAudio),
      audios: Array.isArray(cap.audios) ? cap.audios.map(sanitizeMediaRef).filter(Boolean) : [],
      videos: Array.isArray(cap.videos) ? cap.videos.map(sanitizeMediaRef).filter(Boolean) : [],
      calibrationAudio: sanitizeMediaRef(cap.calibrationAudio),
      syncState: cap.syncState || 'pending',
    };

    return sanitized;
  }

  /**
   * Salva a lista de fotos de uma cápsula específica no cache em memória e no IndexedDB
   */
  async setCapsulePhotos(capsuleId, photos = []) {
    if (!capsuleId || !Array.isArray(photos)) return;

    const normalizedPhotos = photos.map((p, idx) => {
      const rawImg = p.img || p.media_url || p.thumbnailUrl || p.url || null;
      return {
        id: p.id || `photo-${capsuleId}-${Date.now()}-${idx}`,
        // Fotos já no servidor guardam só o mediaId; a URL (com token) é montada na leitura
        img: p.mediaId && isServerMediaUrl(rawImg) ? null : rawImg,
        mediaId: p.mediaId || null,
        memoryId: p.memoryId || null,
        title: p.title || `Momento ${idx + 1}`,
        dateLabel: p.dateLabel || 'Recente',
        year: p.year || new Date().getFullYear(),
        story: p.story || '',
        audioDuration: p.audioDuration || '0:45',
        emotions: p.emotions || ['Amor', 'Gratidão'],
      };
    }).filter((p) => Boolean(p.img || p.mediaId));

    // 1. Armazena no Map em memória para acesso síncrono ultra-rápido
    this._photosByCapsuleId.set(capsuleId, normalizedPhotos);

    // 2. Persiste assincronamente no IndexedDB local para não perder após recarregar
    const db = await openIndexedDB();
    if (db) {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({
          capsuleId,
          photos: normalizedPhotos,
          updatedAt: Date.now(),
        });
      } catch (err) {
        console.warn('[CapsulesService] Erro ao salvar fotos no IndexedDB:', err);
      }
    }

    return this._hydratePhotos(normalizedPhotos);
  }

  /**
   * Monta a URL de exibição das fotos que estão no cofre do servidor.
   */
  _hydratePhotos(photos) {
    if (!Array.isArray(photos)) return [];
    return photos.map((p) =>
      p && p.mediaId && (!p.img || isServerMediaUrl(p.img))
        ? { ...p, img: resolveMediaUrl(`/api/vault/media/${p.mediaId}?variant=display`) }
        : p
    );
  }

  _hydrateCapsule(cap) {
    if (!cap) return cap;
    return {
      ...cap,
      ...describeCapsuleDelivery(cap),
      contentsSummary: cap.photosCount || cap.contentsSummary || '',
      voiceAudio: hydrateMediaRef(cap.voiceAudio),
      audios: Array.isArray(cap.audios) ? cap.audios.map((a) => hydrateMediaRef(a)) : [],
      videos: Array.isArray(cap.videos) ? cap.videos.map((v) => hydrateMediaRef(v)) : [],
      calibrationAudio: hydrateMediaRef(cap.calibrationAudio),
    };
  }

  /**
   * Fotos da cápsula como estão guardadas localmente (sem montar URLs).
   */
  async _getStoredPhotos(capsuleId) {
    if (this._photosByCapsuleId.has(capsuleId)) {
      return this._photosByCapsuleId.get(capsuleId) || [];
    }
    const db = await openIndexedDB();
    if (!db) return [];
    try {
      const record = await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(capsuleId);
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = () => resolve(null);
      });
      if (record && Array.isArray(record.photos)) {
        this._photosByCapsuleId.set(capsuleId, record.photos);
        return record.photos;
      }
    } catch {}
    return [];
  }

  // Blobs de voz/vídeo aguardando envio ao servidor (ex.: gravados sem conexão)
  async _putPendingBlob(capsuleId, itemId, blob) {
    if (!blob) return;
    const db = await openIndexedDB();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ capsuleId: `${PENDING_PREFIX}${capsuleId}::${itemId}`, blob, updatedAt: Date.now() });
    } catch {}
  }

  async _getPendingBlob(capsuleId, itemId) {
    const db = await openIndexedDB();
    if (!db) return null;
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(`${PENDING_PREFIX}${capsuleId}::${itemId}`);
        req.onsuccess = (e) => resolve(e.target.result?.blob || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async _deletePendingBlob(capsuleId, itemId) {
    const db = await openIndexedDB();
    if (!db) return;
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(`${PENDING_PREFIX}${capsuleId}::${itemId}`);
    } catch {}
  }

  _mediaRefsOf(cap) {
    if (!cap) return [];
    return [...(cap.audios || []), ...(cap.videos || []), cap.voiceAudio, cap.calibrationAudio].filter(Boolean);
  }

  /**
   * Procura as fotos originais reais enviadas pelo usuário
   * Busca prioritariamente no sessionStorage e no repositório de memórias da timeline (uploads locais e Google Photos)
   */
  findOriginalUploadedPhotos() {
    const sessionStore = typeof window !== 'undefined' ? window.sessionStorage : (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    const localStore = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);

    // 1. Verifica no sessionStorage (fotos ativas do fluxo de criação)
    try {
      if (sessionStore) {
        const raw = sessionStore.getItem('ethernity_active_photos_for_capsules');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = parsed.filter((p) => p && p.img && !String(p.id).includes('avatar'));
            if (valid.length > 0) {
              return valid.map((u, i) => ({
                id: u.id || `uploaded-${Date.now()}-${i}`,
                img: u.img,
                title: u.title || `Foto Original ${i + 1}`,
                dateLabel: u.dateLabel || 'Hoje',
                year: u.year || new Date().getFullYear(),
                story: u.story || '',
                audioDuration: u.audioDuration || '0:35',
                emotions: u.emotions || ['Amor', 'Alegria', 'Gratidão'],
              }));
            }
          }
        }
      }
    } catch {}

    // 2. Verifica no repositório de memórias (onde todos os uploads locais e imports Google Photos são salvos)
    try {
      if (localStore) {
        const rawTimeline = localStore.getItem('ethernity_curated_timeline_photos');
        if (rawTimeline) {
          const parsedTimeline = JSON.parse(rawTimeline);
          if (Array.isArray(parsedTimeline) && parsedTimeline.length > 0) {
            const userUploaded = parsedTimeline.filter((p) =>
              p && p.img && (
                p.source === 'local' ||
                p.source === 'google_photos' ||
                String(p.id).startsWith('local-') ||
                String(p.id).startsWith('direct-upload-') ||
                String(p.img).startsWith('data:image/')
              )
            );
            if (userUploaded.length > 0) {
              return userUploaded.map((u, i) => ({
                id: u.id || `uploaded-${Date.now()}-${i}`,
                img: u.img,
                title: u.title || `Foto Original ${i + 1}`,
                dateLabel: u.dateLabel || 'Hoje',
                year: u.year || new Date().getFullYear(),
                story: u.story || '',
                audioDuration: u.audioDuration || '0:35',
                emotions: u.emotions || ['Amor', 'Alegria', 'Gratidão'],
              }));
            }
          }
        }
      }
    } catch {}

    return [];
  }

  /**
   * Retorna as fotos vinculadas a uma cápsula.
   * Prioriza SEMPRE as fotos originais reais enviadas pelo usuário,
   * curando automaticamente qualquer cápsula que estivesse exibindo apenas o recorte do avatar.
   */
  /**
   * Retorna as fotos vinculadas a uma cápsula.
   * Respeita rigorosamente a lista de fotos salvas no IndexedDB/Memória daquela cápsula específica.
   */
  async getCapsulePhotos(capsuleId, fallbackCapsule = null) {
    if (!capsuleId) return [];

    // 1. Verifica cache em memória (se existir um registro para esta cápsula, respeita rigorosamente)
    if (this._photosByCapsuleId.has(capsuleId)) {
      const inMemory = this._photosByCapsuleId.get(capsuleId);
      if (Array.isArray(inMemory)) {
        return this._hydratePhotos(inMemory);
      }
    }

    // 2. Verifica no IndexedDB (registro persistido específico desta cápsula)
    const db = await openIndexedDB();
    if (db) {
      try {
        const idbRecord = await new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readonly');
          const req = tx.objectStore(IDB_STORE).get(capsuleId);
          req.onsuccess = (e) => resolve(e.target.result || null);
          req.onerror = () => resolve(null);
        });

        if (idbRecord && Array.isArray(idbRecord.photos)) {
          this._photosByCapsuleId.set(capsuleId, idbRecord.photos);
          return this._hydratePhotos(idbRecord.photos);
        }
      } catch (e) {
        console.warn('[CapsulesService] Erro ao carregar fotos do IndexedDB:', e);
      }
    }

    // 2.1 Outro aparelho / navegador limpo: busca as fotos desta cápsula no servidor
    const fromServer = await this._restorePhotosFromServer(capsuleId);
    if (fromServer.length > 0) {
      return fromServer;
    }

    // 3. Se a cápsula tiver fotos explicitamente atribuídas no seu próprio objeto
    if (Array.isArray(fallbackCapsule?.photos) && fallbackCapsule.photos.length > 0) {
      await this.setCapsulePhotos(capsuleId, fallbackCapsule.photos);
      return fallbackCapsule.photos;
    }

    // 4. Se tiver avatar específico da própria pessoa vinculada a esta cápsula
    if (fallbackCapsule?.avatar) {
      const avatarPhoto = [
        {
          id: `photo-${capsuleId}-avatar`,
          img: fallbackCapsule.avatar,
          title: `Momento com ${fallbackCapsule.recipient || 'Pessoa Especial'}`,
          dateLabel: 'Hoje',
          year: new Date().getFullYear(),
          story: 'Uma memória inesquecível guardada com amor para a eternidade.',
          audioDuration: '0:35',
          emotions: ['Amor', 'Alegria', 'Gratidão'],
        },
      ];
      await this.setCapsulePhotos(capsuleId, avatarPhoto);
      return avatarPhoto;
    }

    // NUNCA busca fotos globais ou de outras cápsulas; o conteúdo de cada cápsula é 100% exclusivo e estanque
    return [];
  }

  /**
   * Retorna as fotos de forma síncrona se disponíveis no cache
   */
  getCapsulePhotosSync(capsuleId, fallbackCapsule = null) {
    if (this._photosByCapsuleId.has(capsuleId)) {
      const photos = this._photosByCapsuleId.get(capsuleId);
      if (Array.isArray(photos)) {
        return this._hydratePhotos(photos);
      }
    }

    if (Array.isArray(fallbackCapsule?.photos) && fallbackCapsule.photos.length > 0) {
      return fallbackCapsule.photos;
    }

    if (fallbackCapsule?.avatar) {
      return [
        {
          id: `photo-${capsuleId}-avatar`,
          img: fallbackCapsule.avatar,
          title: `Momento com ${fallbackCapsule.recipient || 'Pessoa Especial'}`,
          dateLabel: 'Hoje',
          year: new Date().getFullYear(),
          story: 'Uma memória inesquecível guardada com amor para a eternidade.',
          audioDuration: '0:35',
          emotions: ['Amor', 'Alegria', 'Gratidão'],
        },
      ];
    }
    return [];
  }

  /**
   * IDs de cápsulas excluídas explicitamente pelo usuário
   */
  _getDeletedIds() {
    try {
      const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) {
        const raw = store.getItem(DELETED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      }
    } catch {}
    return new Set();
  }

  _markAsDeleted(capsuleId) {
    try {
      const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) {
        const deletedSet = this._getDeletedIds();
        deletedSet.add(capsuleId);
        store.setItem(DELETED_KEY, JSON.stringify(Array.from(deletedSet)));
      }
    } catch {}
  }

  /**
   * Retorna todas as cápsulas ativas, excluindo as que foram deletadas
   */
  getCapsules() {
    const deletedIds = this._getDeletedIds();
    try {
      const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store) {
        return DEFAULT_CAPSULES.filter((c) => !deletedIds.has(c.id));
      }

      const stored = store.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((c) => c && c.id && !deletedIds.has(c.id));
          return valid.map((c) => this._hydrateCapsule(c));
        }
      }
    } catch (err) {
      console.warn('[CapsulesService] Erro ao ler cápsulas do storage:', err);
    }

    return DEFAULT_CAPSULES.filter((c) => !deletedIds.has(c.id));
  }

  /**
   * Salva a lista completa no localStorage de forma segura e independente
   */
  saveCapsules(capsulesList) {
    if (!Array.isArray(capsulesList)) return [];

    const deletedIds = this._getDeletedIds();
    const completeList = capsulesList.filter((c) => c && c.id && !deletedIds.has(c.id));

    // Sanitiza todos os itens
    const sanitizedList = completeList.map((c) => this.sanitizeCapsule(c)).filter(Boolean);

    try {
      const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) {
        store.setItem(STORAGE_KEY, JSON.stringify(sanitizedList));
      }
    } catch (err) {
      console.warn('[CapsulesService] QuotaExceeded fallback ao salvar cápsulas:', err);
      // Fallback: salva apenas os campos mínimos essenciais
      try {
        const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
        if (store) {
          const minimalList = sanitizedList.map((c) => ({
            id: c.id,
            title: c.title,
            recipient: c.recipient,
            triggerLabel: c.triggerLabel,
            contentsSummary: c.contentsSummary,
            sealColor: c.sealColor,
            statusText: c.statusText,
            photosCount: c.photosCount,
            removedContentItems: Array.isArray(c.removedContentItems) ? c.removedContentItems : [],
          }));
          store.setItem(STORAGE_KEY, JSON.stringify(minimalList));
        }
      } catch (innerErr) {
        console.error('[CapsulesService] Falha crítica de persistência:', innerErr);
      }
    }

    this.notify();
    return sanitizedList;
  }

  /**
   * Exclui uma cápsula específica e TODO o seu conteúdo interno (mídias no IndexedDB, cache e metadados).
   * 
   * GARANTIA ESTRITA DE INDEPENDÊNCIA:
   * A exclusão desta cápsula e de suas fotos NÃO afeta, NÃO remove e NÃO corrompe
   * os dados, fotos ou memórias das demais cápsulas existentes.
   */
  async deleteCapsule(capsuleId) {
    if (!capsuleId) return false;

    const existing = this.getCapsules().find((c) => c.id === capsuleId);
    for (const ref of this._mediaRefsOf(existing)) {
      await this._deletePendingBlob(capsuleId, ref.id);
    }

    // 1. Remove do cache em memória isoladamente apenas desta cápsula
    this._photosByCapsuleId.delete(capsuleId);

    // 2. Remove do IndexedDB o registro isolado de mídias desta cápsula
    const db = await openIndexedDB();
    if (db) {
      try {
        await new Promise((resolve) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const req = tx.objectStore(IDB_STORE).delete(capsuleId);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        });
      } catch (err) {
        console.warn('[CapsulesService] Erro ao deletar fotos do IndexedDB:', err);
      }
    }

    // 3. Registra nos IDs deletados para não ser restaurada como padrão
    this._markAsDeleted(capsuleId);

    // 4. Remove rascunhos em cache (localStorage) vinculados a esta cápsula
    try {
      const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
      if (store) {
        store.removeItem(`ethernity_message_draft_${capsuleId}`);
        // Também remove chaves legadas globais se existirem
        store.removeItem('ethernity_message_draft_v1');
      }
    } catch {}

    // 5. Remove dos metadados persistidos no localStorage
    const current = this.getCapsules();
    const filtered = current.filter((c) => c.id !== capsuleId);
    this.saveCapsules(filtered);

    // 6. Sincroniza expurgo atômico na API MySQL (CryptoShred)
    const token = getAuthToken();
    if (token) {
      httpClient.delete(`/capsules/${capsuleId}`, token).catch((err) => {
        console.warn('[CapsulesService] Aviso na sincronização de exclusão com API:', err);
      });
    }

    this.notify();
    return true;
  }

  /**
   * Sincroniza e busca cápsulas reais gravadas no banco de dados MySQL via API.
   * Se offline ou falhar, mantém integridade com os dados em cache no localStorage.
   */
  async fetchCapsulesFromApi() {
    const token = getAuthToken();
    if (!token) return this.getCapsules();

    try {
      const remoteCapsules = await backgroundRequest('GET', '/capsules/', undefined, token);
      if (Array.isArray(remoteCapsules)) {
        const deletedIds = this._getDeletedIds();

        // Exclusões feitas sem conexão: repete o expurgo no servidor
        for (const rc of remoteCapsules) {
          if (rc && deletedIds.has(rc.id)) {
            backgroundRequest('DELETE', `/capsules/${rc.id}`, undefined, token).catch(() => {});
          }
        }

        const current = this.getCapsules();
        const formatted = remoteCapsules
          .filter((rc) => rc && !deletedIds.has(rc.id))
          .map((rc) => {
            const meta = rc.metadata || {};
            const local = current.find((c) => c.id === rc.id) || {};
            return {
              ...local,
              ...meta,
              id: rc.id,
              title: rc.title,
              recipient: rc.recipient,
              avatar: rc.avatar || rc.recipientAvatar || local.avatar,
              triggerLabel: rc.triggerLabel || meta.triggerLabel,
              contentsSummary: meta.contentsSummary || rc.contentsSummary || local.contentsSummary,
              sealColor: meta.sealColor || rc.sealColor || '#F05A47',
              statusText: rc.statusText || meta.statusText || 'Bloqueada até a data',
              photosCount: meta.photosCount || (typeof rc.photosCount === 'number' ? `${rc.photosCount} fotos` : rc.photosCount),
              deliveryType: rc.deliveryType || 'date',
              scheduledDate: rc.scheduledDate || null,
              createdAt: meta.createdAt || (rc.createdAt ? new Date(rc.createdAt).getTime() : Date.now()),
              userId: rc.userId,
              // Mudanças locais ainda não enviadas continuam pendentes
              syncState: local.syncState === 'pending' ? 'pending' : 'synced',
            };
          });

        const localOnly = current.filter((c) => !formatted.some((fc) => fc.id === c.id));
        this.saveCapsules([...formatted, ...localOnly]);
      }
    } catch (err) {
      console.warn('[CapsulesService] Erro ao sincronizar cápsulas da API:', err);
    }

    // Envia o que foi criado/alterado só neste aparelho (inclui cápsulas antigas, anteriores à sincronização)
    this.syncPending().catch(() => {});
    return this.getCapsules();
  }

  /**
   * Envia ao servidor todas as cápsulas com alterações pendentes.
   */
  async syncPending() {
    const pending = this.getCapsules().filter((c) => c.syncState !== 'synced');
    for (const cap of pending) {
      await this.syncCapsule(cap.id);
    }
  }

  _enqueue(capsuleId, task) {
    if (!this._syncQueues) this._syncQueues = new Map();
    const previous = this._syncQueues.get(capsuleId) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    this._syncQueues.set(capsuleId, next);
    return next;
  }

  _updateCapsuleLocal(capsuleId, patch) {
    const list = this.getCapsules();
    let updated = null;
    const next = list.map((c) => {
      if (c.id !== capsuleId) return c;
      updated = { ...c, ...(typeof patch === 'function' ? patch(c) : patch) };
      return updated;
    });
    if (updated) this.saveCapsules(next);
    return updated;
  }

  _capsulePayload(cap) {
    return {
      id: cap.id,
      title: cap.title,
      recipient: { name: cap.recipient, avatar: cap.avatar || null },
      deliveryType: cap.deliveryType || 'date',
      scheduledDate: cap.scheduledDate || null,
      emotion: cap.emotion || 'love',
      guardians: Array.isArray(cap.guardians) ? cap.guardians : undefined,
      metadata: {
        personId: cap.personId || null,
        triggerLabel: cap.triggerLabel,
        contentsSummary: cap.contentsSummary,
        sealColor: cap.sealColor,
        statusText: cap.statusText,
        photosCount: cap.photosCount,
        createdAt: cap.createdAt,
        removedContentItems: cap.removedContentItems || [],
        hasVoice: Boolean(cap.hasVoice),
        voiceAudio: sanitizeMediaRef(cap.voiceAudio),
        audios: (cap.audios || []).map(sanitizeMediaRef).filter(Boolean),
        videos: (cap.videos || []).map(sanitizeMediaRef).filter(Boolean),
        calibrationAudio: sanitizeMediaRef(cap.calibrationAudio),
      },
    };
  }

  /**
   * Envia um arquivo ao cofre criptografado do servidor, vinculado à cápsula.
   * Aceita Blob/File, data: URL, blob: URL ou URL http acessível.
   */
  async _uploadToVault(capsuleId, source, { title = '', description = '', filename = 'arquivo' } = {}, token = getAuthToken()) {
    let blob = source;
    if (!(typeof Blob !== 'undefined' && source instanceof Blob)) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`Não foi possível ler a mídia (${res.status})`);
      blob = await res.blob();
    }
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('title', title || filename);
    formData.append('description', description || '');
    formData.append('capsuleId', capsuleId);

    const response = await fetch(`${API_BASE_URL}/vault/media/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.mediaId) {
      throw new Error(data.detail || `Falha no envio (${response.status})`);
    }
    return data;
  }

  /**
   * Grava no servidor a cápsula, suas fotos e mídias ainda não enviadas.
   * Idempotente: pode ser chamada várias vezes (retentativas, outro aparelho, volta da conexão).
   */
  async syncCapsule(capsuleId) {
    const token = getAuthToken();
    if (!token || !capsuleId) return false;

    return this._enqueue(capsuleId, async () => {
      let cap = this.getCapsules().find((c) => c.id === capsuleId);
      if (!cap) return false;

      try {
        await backgroundRequest('POST', '/capsules/', this._capsulePayload(cap), token);
      } catch (err) {
        console.warn('[CapsulesService] Cápsula ficará pendente de envio:', err.message);
        this._updateCapsuleLocal(capsuleId, { syncState: 'pending' });
        return false;
      }

      let complete = true;

      // Fotos ainda sem cópia no cofre do servidor
      const photos = await this._getStoredPhotos(capsuleId);
      let photosChanged = false;
      const syncedPhotos = [];
      for (const photo of photos) {
        if (photo.mediaId || !photo.img || String(photo.id).endsWith('-avatar')) {
          syncedPhotos.push(photo);
          continue;
        }
        try {
          const result = await this._uploadToVault(
            capsuleId,
            photo.img,
            { title: photo.title, description: photo.story, filename: `${photo.id}.jpg` },
            token
          );
          syncedPhotos.push({ ...photo, mediaId: result.mediaId, memoryId: result.id });
          photosChanged = true;
        } catch (err) {
          console.warn('[CapsulesService] Foto pendente de envio:', err.message);
          syncedPhotos.push(photo);
          complete = false;
        }
      }
      if (photosChanged) {
        await this.setCapsulePhotos(capsuleId, syncedPhotos);
      }

      // Voz, vídeos e calibração gravados neste aparelho
      cap = this.getCapsules().find((c) => c.id === capsuleId) || cap;
      const uploaded = {};
      for (const ref of this._mediaRefsOf(cap)) {
        if (ref.mediaId || uploaded[ref.id]) continue;
        const blob = await this._getPendingBlob(capsuleId, ref.id);
        if (!blob) continue;
        try {
          const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
          const result = await this._uploadToVault(
            capsuleId,
            blob,
            { title: ref.title, description: ref.script || '', filename: `${ref.id}.${ext}` },
            token
          );
          uploaded[ref.id] = { mediaId: result.mediaId, memoryId: result.id };
          await this._deletePendingBlob(capsuleId, ref.id);
        } catch (err) {
          console.warn('[CapsulesService] Mídia pendente de envio:', err.message);
          complete = false;
        }
      }

      if (Object.keys(uploaded).length > 0) {
        const withIds = (ref) => (ref && uploaded[ref.id] ? { ...ref, ...uploaded[ref.id] } : ref);
        cap = this._updateCapsuleLocal(capsuleId, (c) => ({
          voiceAudio: withIds(c.voiceAudio),
          audios: (c.audios || []).map(withIds),
          videos: (c.videos || []).map(withIds),
          calibrationAudio: withIds(c.calibrationAudio),
        }));
        try {
          await backgroundRequest('POST', '/capsules/', this._capsulePayload(cap), token);
        } catch {
          complete = false;
        }
      }

      this._updateCapsuleLocal(capsuleId, { syncState: complete ? 'synced' : 'pending' });
      return complete;
    });
  }

  /**
   * Recupera do servidor as fotos de uma cápsula (outro aparelho ou navegador limpo).
   */
  async _restorePhotosFromServer(capsuleId) {
    const token = getAuthToken();
    if (!token || !capsuleId) return [];
    try {
      const detail = await backgroundRequest('GET', `/capsules/${capsuleId}`, undefined, token);
      const images = (detail?.memories || []).filter((m) => m.type === 'IMAGE' && m.mediaId);
      if (images.length === 0) return [];
      const photos = images.map((m, idx) => ({
        id: `photo-${capsuleId}-${m.memoryId}`,
        mediaId: m.mediaId,
        memoryId: m.memoryId,
        img: null,
        title: m.title || `Momento ${idx + 1}`,
        story: m.story || '',
      }));
      return await this.setCapsulePhotos(capsuleId, photos);
    } catch {
      return [];
    }
  }

  /**
   * Salva a história (e emoções) escritas para uma foto da cápsula, no aparelho e no servidor.
   */
  async updatePhotoStory(capsuleId, photoId, story = '', emotions = null) {
    if (!capsuleId || !photoId) return null;
    const photos = await this._getStoredPhotos(capsuleId);
    let target = null;
    const updated = photos.map((p) => {
      if (p.id !== photoId) return p;
      target = { ...p, story, ...(Array.isArray(emotions) ? { emotions } : {}) };
      return target;
    });
    if (!target) return null;
    await this.setCapsulePhotos(capsuleId, updated);

    const token = getAuthToken();
    if (token && target.memoryId) {
      backgroundRequest('PUT', `/memories/${target.memoryId}`, { content: story }, token).catch((err) => {
        console.warn('[CapsulesService] História salva só neste aparelho por enquanto:', err.message);
        this._updateCapsuleLocal(capsuleId, { syncState: 'pending' });
      });
    }
    return this._hydratePhotos([target])[0];
  }

  /**
   * Vincula um vídeo (ex.: avatar falante) à cápsula e o envia ao cofre do servidor.
   */
  addCapsuleVideo(capsuleId, videoItem) {
    if (!capsuleId || !videoItem) return null;
    const ref = sanitizeMediaRef({ ...videoItem, kind: 'video' });
    const updated = this._updateCapsuleLocal(capsuleId, (c) => ({
      videos: [ref, ...(c.videos || []).filter((v) => v.id !== ref.id)],
      syncState: 'pending',
    }));
    if (!updated) return null;
    this._putPendingBlob(capsuleId, ref.id, videoItem.videoBlob)
      .then(() => this.syncCapsule(capsuleId))
      .catch(() => {});
    this.notify();
    return updated;
  }

  /**
   * Guarda a gravação de calibração da voz (voz matriz do avatar) na cápsula.
   */
  setCalibrationAudio(capsuleId, audioItem) {
    if (!capsuleId || !audioItem) return null;
    const previous = this.getCapsules().find((c) => c.id === capsuleId)?.calibrationAudio;
    const ref = sanitizeMediaRef({ ...audioItem, kind: 'calibration' });
    const updated = this._updateCapsuleLocal(capsuleId, { calibrationAudio: ref, syncState: 'pending' });
    if (!updated) return null;
    if (previous?.mediaId && previous.mediaId !== ref.mediaId) {
      backgroundRequest('DELETE', `/vault/media/${previous.mediaId}`).catch(() => {});
    }
    this._putPendingBlob(capsuleId, ref.id, audioItem.audioBlob)
      .then(() => this.syncCapsule(capsuleId))
      .catch(() => {});
    return updated;
  }

  /**
   * Exclui uma foto específica de dentro de uma cápsula.
   * Totalmente independente: afeta unicamente a cápsula informada.
   */
  async deleteCapsulePhoto(capsuleId, photoId) {
    if (!capsuleId || !photoId) return [];

    const currentPhotos = await this.getCapsulePhotos(capsuleId);
    const removed = currentPhotos.find((p) => p.id === photoId);
    const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId);

    await this.setCapsulePhotos(capsuleId, updatedPhotos);

    // Expurgo definitivo também no cofre do servidor
    if (removed?.mediaId && getAuthToken()) {
      backgroundRequest('DELETE', `/vault/media/${removed.mediaId}`).catch((err) => {
        console.warn('[CapsulesService] Falha ao expurgar foto no servidor:', err.message);
      });
    }

    // Atualiza contagem nos metadados da cápsula
    const capsules = this.getCapsules();
    const updated = capsules.map((c) => {
      if (c.id === capsuleId) {
        const count = updatedPhotos.length;
        const photosLabel = `${count} ${count === 1 ? 'foto' : 'fotos'}`;
        return {
          ...c,
          photosCount: photosLabel,
          contentsSummary: photosLabel,
        };
      }
      return c;
    });
    this.saveCapsules(updated);

    this.notify();
    return updatedPhotos;
  }

  /**
   * Atualiza título, destinatário e regra de entrega definidos pelo usuário e grava no servidor.
   */
  updateCapsuleDetails(capsuleId, { title, recipientName, relationship, deliveryType, scheduledDate } = {}) {
    const capsules = this.getCapsules();
    if (!capsules.some((c) => c.id === capsuleId)) return null;

    const name = String(recipientName || '').trim();
    const rel = String(relationship || '').trim();
    const type = deliveryType === 'posthumous' ? 'posthumous' : 'date';

    const updated = capsules.map((c) =>
      c.id === capsuleId
        ? {
            ...c,
            title: String(title || '').trim() || c.title,
            recipient: name ? (rel ? `${name} (${rel})` : name) : c.recipient,
            deliveryType: type,
            scheduledDate: type === 'date' ? scheduledDate || null : null,
            syncState: 'pending',
          }
        : c
    );
    this.saveCapsules(updated);
    this.syncCapsule(capsuleId).catch(() => {});
    return this.getCapsules().find((c) => c.id === capsuleId) || null;
  }

  /**
   * Exclui um arquivo/item de conteúdo não-fotográfico de uma cápsula específica (ex: 'voice', 'text', 'video').
   * 
   * GARANTIA ESTRITA DE INDEPENDÊNCIA:
   * A exclusão deste item afeta única e exclusivamente a cápsula informada.
   * Todas as demais cápsulas e seus respectivos arquivos permanecem 100% inalterados.
   */
  deleteCapsuleContentItem(capsuleId, itemType) {
    if (!capsuleId || !itemType) return null;

    const capsules = this.getCapsules();
    let updatedCapsule = null;

    const updated = capsules.map((c) => {
      if (c.id === capsuleId) {
        const currentRemoved = Array.isArray(c.removedContentItems) ? [...c.removedContentItems] : [];
        if (!currentRemoved.includes(itemType)) {
          currentRemoved.push(itemType);
        }
        updatedCapsule = {
          ...c,
          removedContentItems: currentRemoved,
        };
        if (itemType === 'voice') {
          const voiceRefs = [c.voiceAudio, ...(c.audios || [])].filter(Boolean);
          for (const ref of voiceRefs) {
            this._deletePendingBlob(capsuleId, ref.id);
            if (ref.mediaId && getAuthToken()) {
              backgroundRequest('DELETE', `/vault/media/${ref.mediaId}`).catch(() => {});
            }
          }
          updatedCapsule.hasVoice = false;
          updatedCapsule.voiceAudio = null;
          updatedCapsule.audios = [];
          updatedCapsule.syncState = 'pending';
        }
        return updatedCapsule;
      }
      return c;
    });

    this.saveCapsules(updated);
    if (updatedCapsule) this.syncCapsule(capsuleId).catch(() => {});
    this.notify();
    return updatedCapsule;
  }

  /**
   * Adiciona ou atualiza a mensagem de voz de uma cápsula específica.
   * Totalmente independente e estanque: afeta unicamente a cápsula informada.
   */
  addCapsuleAudio(capsuleId, audioItem) {
    if (!capsuleId || !audioItem) return null;

    const capsules = this.getCapsules();
    let updatedCapsule = null;

    const updated = capsules.map((c) => {
      if (c.id === capsuleId) {
        const currentAudios = Array.isArray(c.audios) ? [...c.audios] : [];
        const existingIdx = currentAudios.findIndex((a) => a.id === audioItem.id);
        if (existingIdx >= 0) {
          currentAudios[existingIdx] = { ...currentAudios[existingIdx], ...audioItem };
        } else {
          currentAudios.unshift(audioItem);
        }

        const removed = (c.removedContentItems || []).filter((it) => it !== 'voice');
        updatedCapsule = {
          ...c,
          hasVoice: true,
          voiceAudio: audioItem,
          audios: currentAudios,
          removedContentItems: removed,
          syncState: 'pending',
        };
        return updatedCapsule;
      }
      return c;
    });

    this.saveCapsules(updated);
    if (updatedCapsule) {
      // O áudio fica guardado no aparelho até chegar ao cofre do servidor
      this._putPendingBlob(capsuleId, audioItem.id, audioItem.audioBlob)
        .then(() => this.syncCapsule(capsuleId))
        .catch(() => {});
    }
    this.notify();
    return updatedCapsule;
  }

  /**
   * Adiciona fotos diretamente a uma cápsula existente sem reconhecimento facial.
   * Totalmente independente: afeta unicamente a cápsula indicada sem acionar clustering de rostos.
   */
  async addPhotosToCapsule(capsuleId, newPhotos = []) {
    if (!capsuleId || !Array.isArray(newPhotos) || newPhotos.length === 0) return [];

    const currentPhotos = await this.getCapsulePhotos(capsuleId);
    const normalizedNew = newPhotos.map((p, idx) => ({
      id: p.id || `photo-${capsuleId}-${Date.now()}-${idx}`,
      img: p.img || p.media_url || p.thumbnailUrl || p.url,
      title: p.title || `Foto ${currentPhotos.length + idx + 1}`,
      dateLabel: p.dateLabel || 'Hoje',
      year: p.year || new Date().getFullYear(),
      story: p.story || '',
      audioDuration: p.audioDuration || '0:35',
      emotions: p.emotions || ['Amor', 'Gratidão'],
    })).filter((p) => Boolean(p.img));

    const updatedPhotos = [...currentPhotos, ...normalizedNew];
    await this.setCapsulePhotos(capsuleId, updatedPhotos);

    // Atualiza contagem nos metadados da cápsula
    const capsules = this.getCapsules();
    const updated = capsules.map((c) => {
      if (c.id === capsuleId) {
        const count = updatedPhotos.length;
        const photosLabel = `${count} ${count === 1 ? 'foto' : 'fotos'}`;
        return {
          ...c,
          photosCount: photosLabel,
          syncState: 'pending',
        };
      }
      return c;
    });
    this.saveCapsules(updated);
    this.syncCapsule(capsuleId).catch(() => {});
    this.notify();

    return updatedPhotos;
  }

  /**
   * Adiciona novas cápsulas (ex: após identificação facial) mantendo as que já existiam
   * e salvando com segurança as fotos vinculadas
   */
  addCapsules(newCapsules) {
    const listToAdd = Array.isArray(newCapsules) ? newCapsules : [newCapsules];
    const current = this.getCapsules();

    // Salva fotos reais de cada cápsula no armazenamento seguro de mídias
    for (const cap of listToAdd) {
      if (cap && cap.id) {
        const photosToSave = (Array.isArray(cap.photos) && cap.photos.length > 0)
          ? cap.photos
          : this.findOriginalUploadedPhotos();
        if (Array.isArray(photosToSave) && photosToSave.length > 0) {
          this.setCapsulePhotos(cap.id, photosToSave);
        }
      }
    }
    
    // Adiciona as novas no início da lista, preservando as anteriores e as padrão
    const merged = [...listToAdd.map((cap) => (cap && cap.id ? { ...cap, syncState: 'pending' } : cap)), ...current];
    
    // Remove duplicatas por ID se houver
    const seen = new Set();
    const unique = [];
    for (const cap of merged) {
      if (!seen.has(cap.id)) {
        seen.add(cap.id);
        unique.push(cap);
      }
    }

    const saved = this.saveCapsules(unique);

    // Grava no servidor (metadados, fotos e mídias); sem conexão fica pendente e é reenviada depois
    for (const cap of listToAdd) {
      if (cap && cap.id && cap.title) {
        this.syncCapsule(cap.id).catch(() => {});
      }
    }

    return saved;
  }

  /**
   * Subscrição reativa para componentes React
   */
  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notifica todos os ouvintes registrados
   */
  notify() {
    const data = this.getCapsules();
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error('[CapsulesService] Erro no listener:', err);
      }
    });
  }

  /**
   * Restaura o estado inicial padrão e limpa os registros de exclusão
   */
  resetToDefaults() {
    this._photosByCapsuleId.clear();
    const store = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
    if (store) {
      store.removeItem(DELETED_KEY);
    }
    return this.saveCapsules([...DEFAULT_CAPSULES]);
  }
}

const capsulesService = new CapsulesService();
export default capsulesService;
