/**
 * localeRepository.js — Repositório de Infraestrutura para Persistência de Idioma
 * Gerencia a leitura e gravação das preferências de idioma no storage local.
 */

import { normalizeLanguageCode, DEFAULT_LANGUAGE } from '../domain/i18nModel.js';
import pt from './locales/pt.js';
import en from './locales/en.js';
import es from './locales/es.js';

const STORAGE_KEY = 'ethernity_preferred_language';

const DICTIONARIES = {
  pt,
  en,
  es,
};

class LocaleRepository {
  /**
   * Obtém o idioma salvo explicitamente pelo usuário
   */
  getSavedLanguage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          return normalizeLanguageCode(saved);
        }
      }
    } catch (e) {
      console.warn('Ethernity DMs i18n: Erro ao ler preferência de idioma do localStorage:', e);
    }
    return null;
  }

  /**
   * Salva a preferência de idioma do usuário
   */
  saveLanguage(languageCode) {
    const normalized = normalizeLanguageCode(languageCode);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, normalized);
      }
    } catch (e) {
      console.warn('Ethernity DMs i18n: Erro ao salvar preferência de idioma no localStorage:', e);
    }
    return normalized;
  }

  /**
   * Carrega o dicionário correspondente ao idioma
   */
  getTranslations(languageCode) {
    const normalized = normalizeLanguageCode(languageCode);
    return DICTIONARIES[normalized] || DICTIONARIES[DEFAULT_LANGUAGE];
  }

  /**
   * Retorna todos os dicionários carregados
   */
  getAllDictionaries() {
    return DICTIONARIES;
  }
}

export const localeRepository = new LocaleRepository();
export default localeRepository;
