/**
 * storageAdapter.js — Universal Platform-Agnostic Storage Adapter
 * 
 * Works seamlessly in:
 *  1. React Web / PWA (Browser localStorage / in-memory fallback)
 *  2. React Native iOS & Android (injectable with AsyncStorage, MMKV, or SecureStore)
 *  3. Node.js / Unit Test environments (in-memory map)
 */

class MemoryStorage {
  constructor() {
    this._store = new Map();
  }

  getItem(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }

  setItem(key, value) {
    this._store.set(key, String(value));
  }

  removeItem(key) {
    this._store.delete(key);
  }

  clear() {
    this._store.clear();
  }
}

class StorageAdapter {
  constructor() {
    this._customDriver = null;
    this._memoryFallback = new MemoryStorage();
  }

  /**
   * Allows React Native apps to inject AsyncStorage, MMKV, etc.
   * Example (React Native):
   *   storageAdapter.setDriver(AsyncStorage);
   */
  setDriver(driver) {
    this._customDriver = driver;
  }

  _getDriver() {
    if (this._customDriver) {
      return this._customDriver;
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    return this._memoryFallback;
  }

  async getItem(key) {
    const driver = this._getDriver();
    try {
      const res = driver.getItem(key);
      return res instanceof Promise ? await res : res;
    } catch (err) {
      console.warn(`[StorageAdapter] getItem error for key "${key}":`, err);
      return this._memoryFallback.getItem(key);
    }
  }

  async setItem(key, value) {
    const driver = this._getDriver();
    try {
      const res = driver.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      return res instanceof Promise ? await res : res;
    } catch (err) {
      console.warn(`[StorageAdapter] setItem error for key "${key}":`, err);
      this._memoryFallback.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }

  async removeItem(key) {
    const driver = this._getDriver();
    try {
      const res = driver.removeItem(key);
      return res instanceof Promise ? await res : res;
    } catch (err) {
      console.warn(`[StorageAdapter] removeItem error for key "${key}":`, err);
      this._memoryFallback.removeItem(key);
    }
  }

  async clear() {
    const driver = this._getDriver();
    try {
      const res = driver.clear();
      return res instanceof Promise ? await res : res;
    } catch (err) {
      console.warn('[StorageAdapter] clear error:', err);
      this._memoryFallback.clear();
    }
  }

  /**
   * Synchronous getter for Web / Memory environments when needed
   */
  getItemSync(key) {
    const driver = this._getDriver();
    try {
      if (typeof driver.getItem === 'function') {
        const res = driver.getItem(key);
        return typeof res === 'string' ? res : null;
      }
    } catch {
      // fallback
    }
    return this._memoryFallback.getItem(key);
  }

  /**
   * Synchronous setter for Web / Memory environments
   */
  setItemSync(key, value) {
    const driver = this._getDriver();
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      if (typeof driver.setItem === 'function') {
        driver.setItem(key, str);
        return;
      }
    } catch {
      // fallback
    }
    this._memoryFallback.setItem(key, str);
  }
}

export const storageAdapter = new StorageAdapter();
export default storageAdapter;
