/**
 * i18nModel.js — Modelo e Regras de Domínio para Internacionalização
 * Contém regras puras de detecção de idioma do navegador, normalização e interpolação.
 */

export const SUPPORTED_LANGUAGES = ['pt', 'en', 'es'];
export const DEFAULT_LANGUAGE = 'pt';

export const LANGUAGE_META = {
  pt: {
    code: 'pt',
    name: 'Português',
    region: 'Brasil',
    flag: '🇧🇷',
    htmlLang: 'pt-BR',
  },
  en: {
    code: 'en',
    name: 'English',
    region: 'US',
    flag: '🇺🇸',
    htmlLang: 'en-US',
  },
  es: {
    code: 'es',
    name: 'Español',
    region: 'ES',
    flag: '🇪🇸',
    htmlLang: 'es-ES',
  },
};

/**
 * Normaliza qualquer tag de idioma (ex: 'pt-BR', 'en-US', 'es-419') para um código suportado.
 */
export function normalizeLanguageCode(rawCode) {
  if (!rawCode || typeof rawCode !== 'string') return DEFAULT_LANGUAGE;
  const lower = rawCode.trim().toLowerCase();

  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('es')) return 'es';
  if (lower.startsWith('en')) return 'en';

  return DEFAULT_LANGUAGE;
}

/**
 * Detecta o idioma ideal baseado nas preferências do navegador (navigator.languages ou navigator.language).
 */
export function detectBrowserLanguage(navigatorObj = typeof navigator !== 'undefined' ? navigator : null) {
  if (!navigatorObj) return DEFAULT_LANGUAGE;

  const candidateLanguages = [];
  if (Array.isArray(navigatorObj.languages) && navigatorObj.languages.length > 0) {
    candidateLanguages.push(...navigatorObj.languages);
  }
  if (navigatorObj.language) {
    candidateLanguages.push(navigatorObj.language);
  }
  if (navigatorObj.userLanguage) {
    candidateLanguages.push(navigatorObj.userLanguage);
  }

  for (const candidate of candidateLanguages) {
    if (typeof candidate === 'string') {
      const lower = candidate.toLowerCase();
      if (lower.startsWith('pt')) return 'pt';
      if (lower.startsWith('es')) return 'es';
      if (lower.startsWith('en')) return 'en';
    }
  }

  return DEFAULT_LANGUAGE;
}

/**
 * Resolve o caminho de uma chave (ex: 'dashboard.stats.active_trackers') em um objeto de dicionário.
 */
export function resolveTranslationKey(translations, key) {
  if (!translations || !key || typeof key !== 'string') return key;

  const parts = key.split('.');
  let current = translations;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }

  return typeof current === 'string' ? current : null;
}

/**
 * Interpola variáveis em strings no formato {{varName}} ou {varName}.
 */
export function interpolateParams(text, params) {
  if (!text || typeof text !== 'string' || !params || typeof params !== 'object') {
    return text || '';
  }

  return text.replace(/\{\{\s*(\w+)\s*\}\}|\{\s*(\w+)\s*\}/g, (match, key1, key2) => {
    const key = key1 || key2;
    return key in params && params[key] !== undefined && params[key] !== null
      ? String(params[key])
      : match;
  });
}

/**
 * Função principal de tradução pura.
 * Tenta buscar no dicionário atual; caso não encontre, faz fallback para o dicionário padrão (PT).
 */
export function translate(currentTranslations, fallbackTranslations, key, params = null) {
  let resolved = resolveTranslationKey(currentTranslations, key);

  if (resolved === null && fallbackTranslations && fallbackTranslations !== currentTranslations) {
    resolved = resolveTranslationKey(fallbackTranslations, key);
  }

  if (resolved === null) {
    return key;
  }

  return interpolateParams(resolved, params);
}
