/**
 * capsulesService.js — Application Service para Gerenciamento de Cápsulas do Tempo e Mídias
 * 
 * Responsabilidades:
 * 1. Manter SEMPRE os cards padrão ("Cápsula: 18º Aniversário da Mariana" e "Legado Familiar & Palavras de Sabedoria")
 * 2. Unificar a persistência de novas cápsulas criadas a partir do reconhecimento facial ou criação manual
 * 3. Armazenar com segurança as fotos reais de cada cápsula (em memória e IndexedDB para suportar múltiplos MBs sem QuotaExceededError)
 * 4. Fornecer subscrição reativa para atualização instantânea da UI
 */
import httpClient from '../../../core/api/httpClient.js';

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
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
    triggerLabel: '12 de Outubro de 2032',
    contentsSummary: '2 Áudios • 1 Vídeo • 1 Álbum de Fotos • Carta de Amor',
    sealColor: '#F05A47',
    statusText: 'Bloqueada até a data',
  },
  {
    id: 'cap-2',
    title: 'Legado Familiar & Palavras de Sabedoria',
    recipient: 'Antônio Silva (Pai)',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=250',
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
    img: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&q=80&w=800',
    dateLabel: 'Julho 2018',
    photoNumber: 1,
    story: 'Férias de verão na praia. O seu primeiro contato com as ondas do mar e aquele abraço quentinho ao entardecer.',
    audioDuration: '0:35',
    emotions: ['Amor', 'Saudade'],
  },
  {
    id: 'c-2',
    img: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=800',
    dateLabel: 'Dezembro 2021',
    photoNumber: 2,
    story: 'Dia de formatura e muita comemoração. Ver você conquistando seus sonhos com tanta dedicação enche meu coração.',
    audioDuration: '1:15',
    emotions: ['Orgulho', 'Alegria'],
  },
  {
    id: 'c-3',
    img: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=800',
    dateLabel: 'Janeiro 2024',
    photoNumber: 3,
    story: 'Este foi o dia em que você me ensinou a andar de bicicleta. Eu caí tantas vezes, mas você sempre estava lá para me levantar. Nunca vou esquecer seu sorriso orgulhoso quando finalmente consegui.',
    audioDuration: '0:42',
    emotions: ['Gratidão', 'Alegria', 'Amor'],
  },
  {
    id: 'c-4',
    img: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&q=80&w=800',
    dateLabel: 'Maio 2023',
    photoNumber: 4,
    story: 'Tarde de domingo na cozinha fazendo o bolo de cenoura com chocolate que você tanto pedia quando era pequena.',
    audioDuration: '0:50',
    emotions: ['Amor', 'Alegria'],
  },
  {
    id: 'c-5',
    img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800',
    dateLabel: 'Outubro 2022',
    photoNumber: 5,
    story: 'Caminhada pelo parque em pleno outono. As conversas que tivemos nesse dia mudaram minha perspectiva sobre tantas coisas.',
    audioDuration: '0:28',
    emotions: ['Gratidão', 'Saudade'],
  },
  {
    id: 'c-6',
    img: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&q=80&w=800',
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
    }
  }

  /**
   * Sanitiza uma cápsula para armazenamento seguro no localStorage
   * Remove arrays brutos com imagens base64 pesadas que causam estouro de cota (QuotaExceededError).
   */
  sanitizeCapsule(cap) {
    if (!cap || typeof cap !== 'object') return null;

    const countLabel = cap.photosCount || (Array.isArray(cap.photos) ? `${cap.photos.length} fotos` : '1 foto');

    const sanitized = {
      id: cap.id || `cap-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      title: cap.title || 'Cápsula do Tempo',
      recipient: cap.recipient || 'Pessoa Especial',
      avatar: cap.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
      triggerLabel: cap.triggerLabel || '12 de Outubro de 2032',
      contentsSummary: cap.contentsSummary || 'Mensagem de Amor',
      sealColor: cap.sealColor || '#F05A47',
      statusText: cap.statusText || 'Bloqueada até a data',
      personId: cap.personId || null,
      photosCount: countLabel,
      createdAt: cap.createdAt || Date.now(),
      removedContentItems: Array.isArray(cap.removedContentItems) ? cap.removedContentItems : [],
    };

    return sanitized;
  }

  /**
   * Salva a lista de fotos de uma cápsula específica no cache em memória e no IndexedDB
   */
  async setCapsulePhotos(capsuleId, photos = []) {
    if (!capsuleId || !Array.isArray(photos)) return;

    const normalizedPhotos = photos.map((p, idx) => ({
      id: p.id || `photo-${capsuleId}-${Date.now()}-${idx}`,
      img: p.img || p.media_url || p.thumbnailUrl || p.url,
      title: p.title || `Momento ${idx + 1}`,
      dateLabel: p.dateLabel || 'Recente',
      year: p.year || new Date().getFullYear(),
      story: p.story || '',
      audioDuration: p.audioDuration || '0:45',
      emotions: p.emotions || ['Amor', 'Gratidão'],
    })).filter((p) => Boolean(p.img));

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

    return normalizedPhotos;
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
        return inMemory;
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
          return idbRecord.photos;
        }
      } catch (e) {
        console.warn('[CapsulesService] Erro ao carregar fotos do IndexedDB:', e);
      }
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
        return photos;
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
          return valid;
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
      const remoteCapsules = await httpClient.get('/capsules/', token);
      if (Array.isArray(remoteCapsules) && remoteCapsules.length > 0) {
        const deletedIds = this._getDeletedIds();
        const formatted = remoteCapsules
          .filter((rc) => rc && !deletedIds.has(rc.id))
          .map((rc) =>
            this.sanitizeCapsule({
              id: rc.id,
              title: rc.title,
              recipient: rc.recipient,
              avatar: rc.avatar || rc.recipientAvatar,
              triggerLabel: rc.triggerLabel,
              contentsSummary: rc.contentsSummary,
              sealColor: rc.sealColor || '#F05A47',
              statusText: rc.statusText || 'Bloqueada até a data',
              photosCount: typeof rc.photosCount === 'number' ? `${rc.photosCount} fotos` : rc.photosCount,
              createdAt: rc.createdAt ? new Date(rc.createdAt).getTime() : Date.now(),
              userId: rc.userId,
            })
          )
          .filter(Boolean);

        if (formatted.length > 0) {
          const current = this.getCapsules();
          const localOnly = current.filter((c) => !formatted.some((fc) => fc.id === c.id));
          const merged = [...formatted, ...localOnly];
          this.saveCapsules(merged);
        }
      }
    } catch (err) {
      console.warn('[CapsulesService] Erro ao sincronizar cápsulas da API:', err);
    }
    return this.getCapsules();
  }

  /**
   * Exclui uma foto específica de dentro de uma cápsula.
   * Totalmente independente: afeta unicamente a cápsula informada.
   */
  async deleteCapsulePhoto(capsuleId, photoId) {
    if (!capsuleId || !photoId) return [];

    const currentPhotos = await this.getCapsulePhotos(capsuleId);
    const updatedPhotos = currentPhotos.filter((p) => p.id !== photoId);

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
          contentsSummary: `${photosLabel} • Mensagem de Amor`,
        };
      }
      return c;
    });
    this.saveCapsules(updated);

    this.notify();
    return updatedPhotos;
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
          updatedCapsule.hasVoice = false;
          updatedCapsule.voiceAudio = null;
          updatedCapsule.audios = [];
        }
        return updatedCapsule;
      }
      return c;
    });

    this.saveCapsules(updated);
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
        };
        return updatedCapsule;
      }
      return c;
    });

    this.saveCapsules(updated);
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
          contentsSummary: `${photosLabel} • Mensagem de Amor`,
        };
      }
      return c;
    });
    this.saveCapsules(updated);
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
    const merged = [...listToAdd, ...current];
    
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

    // Sincroniza assincronamente as novas cápsulas com a API MySQL (se autenticado)
    const token = getAuthToken();
    if (token) {
      for (const cap of listToAdd) {
        if (cap && cap.title && cap.id !== 'cap-1' && cap.id !== 'cap-2') {
          const photosToSync = (Array.isArray(cap.photos) && cap.photos.length > 0)
            ? cap.photos
            : this.findOriginalUploadedPhotos();

          httpClient.post('/capsules/', {
            id: cap.id,
            title: cap.title,
            recipient: typeof cap.recipient === 'object' ? cap.recipient : { name: cap.recipient, avatar: cap.avatar },
            deliveryType: cap.deliveryType || 'date',
            scheduledDate: cap.scheduledDate || cap.triggerDate || null,
            emotion: cap.emotion || 'love',
            guardians: Array.isArray(cap.guardians) ? cap.guardians : [],
            photos: (photosToSync || []).map((p) => ({
              img: p.img || p.media_url,
              title: p.title,
              story: p.story,
              audioDuration: p.audioDuration,
            })),
          }, token).catch((err) => {
            console.warn('[CapsulesService] Aviso na sincronização de criação com API:', err);
          });
        }
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
