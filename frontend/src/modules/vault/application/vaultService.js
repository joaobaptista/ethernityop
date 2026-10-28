/**
 * vaultService.js — Application Layer for Vault Context (Universal Use Cases)
 * 
 * Reutilizável em React Web e React Native (iOS & Android).
 */
import vaultRepository from '../infrastructure/vaultRepository.js';
import { filterVaultItems, getVaultMetrics } from '../domain/vaultModel.js';
import { API_BASE_URL } from '../../../core/api/apiUrl.js';

export class VaultService {
  constructor(repository = vaultRepository) {
    this.repository = repository;
    this.listeners = new Set();
  }

  /**
   * Padrão Observable para sincronização reativa de estado
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify(items) {
    this.listeners.forEach((callback) => {
      try {
        callback(items);
      } catch (err) {
        console.error('[VaultService] Erro no listener:', err);
      }
    });
  }

  async getItems() {
    return this.repository.getItems();
  }

  getItemsSync() {
    return this.repository.getItemsSync();
  }

  async addItem(itemPayload) {
    const item = await this.repository.addItem(itemPayload);
    const all = await this.repository.getItems();
    this._notify(all);

    // Emissão de evento customizado para retrocompatibilidade em ambiente Web
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('ethernity_vault_updated', { detail: item }));
      } catch {
        // noop
      }
    }

    return item;
  }

  async removeItem(itemId) {
    const result = await this.repository.removeItem(itemId);
    const all = await this.repository.getItems();
    this._notify(all);

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('ethernity_vault_updated'));
      } catch {
        // noop
      }
    }

    return result;
  }

  filter(items, activeFilter, searchQuery) {
    return filterVaultItems(items, activeFilter, searchQuery);
  }

  getMetrics(items) {
    return getVaultMetrics(items);
  }

  /**
   * Empacota e envia arquivo/blob de mídia diretamente para o Cofre Criptografado
   * @param {File|Blob} fileOrBlob 
   * @param {Object} metadata { title, description, capsuleId, category, recipient }
   * @param {string|null} token JWT opcional
   */
  async uploadMedia(fileOrBlob, metadata = {}, token = null) {
    if (!fileOrBlob) {
      throw new Error('Nenhum arquivo ou gravação fornecida para o cofre.');
    }

    const title = (metadata.title || 'Gravação Segura').trim();
    const capsuleId = metadata.capsuleId || 'capsule-default';
    const description = metadata.description || '';

    // Determina o tipo e extensão padrão se for Blob
    const mime = (fileOrBlob.type || '').toLowerCase();
    let defaultFilename = 'gravacao-segura.bin';
    let vaultType = 'audio';

    if (mime.startsWith('image/')) {
      defaultFilename = 'imagem.webp';
      vaultType = 'photo';
    } else if (mime.startsWith('video/')) {
      defaultFilename = 'gravacao-video.webm';
      vaultType = 'video';
    } else if (mime.startsWith('audio/')) {
      defaultFilename = 'gravacao-audio.webm';
      vaultType = 'audio';
    }

    const file =
      typeof File !== 'undefined' && fileOrBlob instanceof File
        ? fileOrBlob
        : new File([fileOrBlob], metadata.filename || defaultFilename, {
            type: fileOrBlob.type || 'application/octet-stream',
          });

    const authToken =
      token ||
      (typeof localStorage !== 'undefined' && typeof localStorage?.getItem === 'function'
        ? localStorage.getItem('ethernity_auth_token')
        : null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('description', description);
    formData.append('capsuleId', capsuleId);

    let result = null;
    let backendError = null;

    // Endereço único da API (VITE_API_URL): nunca relativo ao site nem localhost fixo
    const backendUrls = [`${API_BASE_URL}/vault/media/upload`];

    for (const url of backendUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          body: formData,
        });

        if (response.ok) {
          result = await response.json();
          break;
        } else {
          const errData = await response.json().catch(() => ({}));
          backendError = new Error(errData.detail || errData.message || `Erro HTTP ${response.status}`);
        }
      } catch (err) {
        backendError = err;
      }
    }

    // Se o backend respondeu com sucesso
    if (result && result.mediaId) {
      const vaultItem = await this.addItem({
        id: result.mediaId,
        title,
        type: vaultType,
        recipient: metadata.recipient || 'Toda a família',
        category: metadata.category || (vaultType === 'audio' ? 'Histórias de Vida' : 'Marcos de Família'),
        duration: result.durationSeconds ? `${Math.round(result.durationSeconds)}s` : undefined,
        size: `${((file.size || 0) / (1024 * 1024)).toFixed(1)} MB`,
        mediaUrl: result.mediaUrl || result.streamUrl,
        streamUrl: result.streamUrl,
        posterUrl: result.posterUrl,
        thumbUrl: result.thumbUrl,
        waveformUrl: result.waveformUrl,
        isEncrypted: true,
      });

      return {
        success: true,
        offline: false,
        result,
        vaultItem,
      };
    }

    // Fallback Offline/Local se o backend não estiver acessível
    console.warn('[VaultService] Backend de upload indisponível, aplicando fallback local:', backendError);
    const localId = `local-${Date.now()}`;
    const localUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(fileOrBlob) : '';

    const fallbackItem = await this.addItem({
      id: localId,
      title,
      type: vaultType,
      recipient: metadata.recipient || 'Toda a família',
      category: metadata.category || (vaultType === 'audio' ? 'Histórias de Vida' : 'Marcos de Família'),
      size: `${((file.size || 0) / (1024 * 1024)).toFixed(1)} MB`,
      previewUrl: localUrl,
      mediaUrl: localUrl,
      isEncrypted: true,
    });

    return {
      success: true,
      offline: true,
      vaultItem: fallbackItem,
      mediaId: localId,
      mediaUrl: localUrl,
      warning: 'Salvo localmente no dispositivo (Modo Offline).',
    };
  }
}

export const vaultService = new VaultService();
export default vaultService;
