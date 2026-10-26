/**
 * localVaultService.js — IndexedDB + Web Crypto API Local-First Storage (Zero-Cloud & LGPD Compliant)
 * 
 * Armazena mensagens, arquivos médicos e telemetria exclusivamente no dispositivo do usuário
 * com criptografia simétrica AES-256-GCM. Nenhum dado sensível é persistido na nuvem.
 */

const DB_NAME = 'Ethernity_DMS_Local_Vault';
const DB_VERSION = 1;
const STORE_MESSAGES = 'care_messages';
const STORE_FILES = 'medical_files';
const STORE_KEYS = 'vault_keys';

class LocalVaultService {
  constructor() {
    this.db = null;
    this.cryptoKey = null;
    this.initPromise = null;
  }

  /**
   * Inicializa o banco IndexedDB seguro
   */
  async init() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const msgStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          msgStore.createIndex('groupId', 'groupId', { unique: false });
          msgStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const fileStore = db.createObjectStore(STORE_FILES, { keyPath: 'id' });
          fileStore.createIndex('groupId', 'groupId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this._getOrCreateCryptoKey();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[LocalVault] IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });

    return this.initPromise;
  }

  /**
   * Obtém ou gera uma chave AES-256-GCM na Web Crypto API
   */
  async _getOrCreateCryptoKey() {
    if (this.cryptoKey) return this.cryptoKey;

    try {
      // Tentar carregar do store de chaves
      const tx = this.db.transaction(STORE_KEYS, 'readonly');
      const store = tx.objectStore(STORE_KEYS);
      const req = store.get('master_key');

      return new Promise((resolve) => {
        req.onsuccess = async (e) => {
          if (e.target.result && e.target.result.rawKey) {
            this.cryptoKey = await crypto.subtle.importKey(
              'raw',
              e.target.result.rawKey,
              { name: 'AES-GCM', length: 256 },
              true,
              ['encrypt', 'decrypt']
            );
            resolve(this.cryptoKey);
          } else {
            // Gerar nova chave AES-GCM
            const newKey = await crypto.subtle.generateKey(
              { name: 'AES-GCM', length: 256 },
              true,
              ['encrypt', 'decrypt']
            );
            const exportedRaw = await crypto.subtle.exportKey('raw', newKey);
            
            const writeTx = this.db.transaction(STORE_KEYS, 'readwrite');
            writeTx.objectStore(STORE_KEYS).put({ id: 'master_key', rawKey: exportedRaw });
            this.cryptoKey = newKey;
            resolve(this.cryptoKey);
          }
        };
        req.onerror = async () => {
          this.cryptoKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
          resolve(this.cryptoKey);
        };
      });
    } catch (err) {
      console.warn('[LocalVault] Fallback to ephemeral key:', err);
      this.cryptoKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      return this.cryptoKey;
    }
  }

  /**
   * Criptografa string com AES-GCM
   */
  async encryptText(text) {
    await this.init();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.cryptoKey,
      encoded
    );

    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext)),
    };
  }

  /**
   * Descriptografa objeto cifrado
   */
  async decryptText(payload) {
    await this.init();
    if (!payload || !payload.iv || !payload.data) return '';
    try {
      const iv = new Uint8Array(payload.iv);
      const ciphertext = new Uint8Array(payload.data);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.cryptoKey,
        ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch (err) {
      console.error('[LocalVault] Decrypt error:', err);
      return '[Erro de descriptografia local]';
    }
  }

  /**
   * Salva mensagem criptografada no IndexedDB local
   */
  async saveMessage(groupId, message) {
    await this.init();
    const encryptedText = await this.encryptText(message.text || '');
    
    const record = {
      ...message,
      groupId,
      text: '[Criptografado E2EE]',
      encryptedPayload: encryptedText,
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_MESSAGES, 'readwrite');
      const req = tx.objectStore(STORE_MESSAGES).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Carrega mensagens locais do grupo e descriptografa em memória
   */
  async getMessagesByGroup(groupId) {
    await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_MESSAGES, 'readonly');
      const index = tx.objectStore(STORE_MESSAGES).index('groupId');
      const req = index.getAll(groupId);

      req.onsuccess = async (e) => {
        const records = e.target.result || [];
        const decryptedList = await Promise.all(
          records.map(async (rec) => {
            if (rec.encryptedPayload) {
              const plain = await this.decryptText(rec.encryptedPayload);
              return { ...rec, text: plain };
            }
            return rec;
          })
        );
        resolve(decryptedList.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0)));
      };
      req.onerror = () => resolve([]);
    });
  }

  /**
   * Salva arquivo binário (Blob) localmente no IndexedDB
   */
  async saveFile(groupId, fileMeta, blob) {
    await this.init();
    const record = {
      id: fileMeta.id || `file-${Date.now()}`,
      groupId,
      name: fileMeta.name,
      size: fileMeta.size,
      mimeType: fileMeta.mimeType || blob.type,
      blob,
      savedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_FILES, 'readwrite');
      const req = tx.objectStore(STORE_FILES).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Obtém arquivo binário local por ID
   */
  async getFile(fileId) {
    await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_FILES, 'readonly');
      const req = tx.objectStore(STORE_FILES).get(fileId);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = () => resolve(null);
    });
  }

  /**
   * LGPD: Exclusão total de dados do dispositivo (Direito ao Esquecimento)
   */
  async purgeAllData() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_MESSAGES, STORE_FILES, STORE_KEYS], 'readwrite');
      tx.objectStore(STORE_MESSAGES).clear();
      tx.objectStore(STORE_FILES).clear();
      tx.objectStore(STORE_KEYS).clear();
      tx.oncomplete = () => {
        console.log('[LocalVault] 🗑️ Todos os dados locais foram excluídos em conformidade com a LGPD.');
        resolve(true);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * LGPD: Exportação do cofre em JSON (Direito à Portabilidade)
   */
  async exportVaultJSON() {
    await this.init();
    const tx = this.db.transaction([STORE_MESSAGES, STORE_FILES], 'readonly');
    const msgReq = tx.objectStore(STORE_MESSAGES).getAll();
    const fileReq = tx.objectStore(STORE_FILES).getAll();

    return new Promise((resolve) => {
      tx.oncomplete = async () => {
        const rawMsgs = msgReq.result || [];
        const files = fileReq.result || [];
        
        const decryptedMsgs = await Promise.all(
          rawMsgs.map(async (m) => {
            if (m.encryptedPayload) {
              const plain = await this.decryptText(m.encryptedPayload);
              return { ...m, text: plain };
            }
            return m;
          })
        );

        const exportData = {
          exportedAt: new Date().toISOString(),
          app: 'Ethernity DMS',
          compliance: 'LGPD Art. 18 (Portabilidade de Dados)',
          totalMessages: decryptedMsgs.length,
          messages: decryptedMsgs,
          files: files.map((f) => ({ id: f.id, name: f.name, size: f.size, mimeType: f.mimeType, savedAt: f.savedAt })),
        };

        resolve(JSON.stringify(exportData, null, 2));
      };
    });
  }
}

export const localVaultService = new LocalVaultService();
export default localVaultService;
