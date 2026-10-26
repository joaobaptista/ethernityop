/**
 * vaultRepository.js — Infrastructure Layer for Vault Context
 * 
 * Interage com o StorageAdapter de forma agnóstica de plataforma (Web & React Native).
 */
import storageAdapter from '../../../core/adapters/storageAdapter.js';
import { DEFAULT_INITIAL_VAULT_ITEMS, createVaultItem } from '../domain/vaultModel.js';

const STORAGE_KEY = 'ethernity_vault_items';

export class VaultRepository {
  async getItems() {
    try {
      const raw = await storageAdapter.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[VaultRepository] Erro ao ler dados do storage:', err);
    }
    return [...DEFAULT_INITIAL_VAULT_ITEMS];
  }

  getItemsSync() {
    try {
      const raw = storageAdapter.getItemSync(STORAGE_KEY);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[VaultRepository] Erro sincrono ao ler storage:', err);
    }
    return [...DEFAULT_INITIAL_VAULT_ITEMS];
  }

  async saveItems(items) {
    try {
      await storageAdapter.setItem(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (err) {
      console.error('[VaultRepository] Erro ao salvar itens no storage:', err);
      return false;
    }
  }

  saveItemsSync(items) {
    try {
      storageAdapter.setItemSync(STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (err) {
      console.error('[VaultRepository] Erro sincrono ao salvar storage:', err);
      return false;
    }
  }

  async addItem(itemPayload) {
    const item = createVaultItem(itemPayload);
    const current = await this.getItems();
    const updated = [item, ...current.filter((i) => i.id !== item.id)];
    await this.saveItems(updated);
    return item;
  }

  async removeItem(itemId) {
    const current = await this.getItems();
    const updated = current.filter((i) => i.id !== itemId);
    await this.saveItems(updated);
    return true;
  }
}

export const vaultRepository = new VaultRepository();
export default vaultRepository;
