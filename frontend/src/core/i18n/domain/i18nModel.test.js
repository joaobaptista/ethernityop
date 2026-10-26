import { describe, it, expect } from 'vitest';
import {
  normalizeLanguageCode,
  detectBrowserLanguage,
  resolveTranslationKey,
  interpolateParams,
  translate,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
} from './i18nModel.js';

describe('i18nModel Domain Rules', () => {
  describe('Supported languages and normalization', () => {
    it('supports pt, en, es with pt as default', () => {
      expect(SUPPORTED_LANGUAGES).toEqual(['pt', 'en', 'es']);
      expect(DEFAULT_LANGUAGE).toBe('pt');
    });

    it('normalizes locale codes correctly', () => {
      expect(normalizeLanguageCode('pt-BR')).toBe('pt');
      expect(normalizeLanguageCode('pt-PT')).toBe('pt');
      expect(normalizeLanguageCode('en-US')).toBe('en');
      expect(normalizeLanguageCode('en-GB')).toBe('en');
      expect(normalizeLanguageCode('es-ES')).toBe('es');
      expect(normalizeLanguageCode('es-419')).toBe('es');
      expect(normalizeLanguageCode('fr-FR')).toBe('pt');
      expect(normalizeLanguageCode('')).toBe('pt');
      expect(normalizeLanguageCode(null)).toBe('pt');
    });
  });

  describe('Browser Language Detection', () => {
    it('detects language from navigator.languages list', () => {
      const mockNav = { languages: ['en-US', 'pt-BR'], language: 'en-US' };
      expect(detectBrowserLanguage(mockNav)).toBe('en');

      const mockNavSpanish = { languages: ['es-MX', 'en-US'], language: 'es-MX' };
      expect(detectBrowserLanguage(mockNavSpanish)).toBe('es');

      const mockNavPt = { languages: ['pt-BR'], language: 'pt-BR' };
      expect(detectBrowserLanguage(mockNavPt)).toBe('pt');
    });

    it('falls back to default language for unsupported locales', () => {
      const mockNavOther = { languages: ['de-DE', 'it-IT'], language: 'de-DE' };
      expect(detectBrowserLanguage(mockNavOther)).toBe('pt');
      expect(detectBrowserLanguage(null)).toBe('pt');
    });
  });

  describe('Key Resolution and Interpolation', () => {
    const mockDictionary = {
      nav: {
        dashboard: 'Painel Principal',
      },
      dashboard: {
        trackers_count: '{{count}} Rastreadores no Radar',
        greeting: 'Olá, {name}!',
      },
    };

    it('resolves nested keys correctly', () => {
      expect(resolveTranslationKey(mockDictionary, 'nav.dashboard')).toBe('Painel Principal');
      expect(resolveTranslationKey(mockDictionary, 'nav.nonexistent')).toBeNull();
      expect(resolveTranslationKey(mockDictionary, 'invalid.key.path')).toBeNull();
    });

    it('interpolates parameters correctly with {{param}} or {param}', () => {
      expect(interpolateParams('{{count}} Rastreadores', { count: 3 })).toBe('3 Rastreadores');
      expect(interpolateParams('Olá, {name}!', { name: 'Vagner' })).toBe('Olá, Vagner!');
    });

    it('performs fallback translation when key is missing in active locale', () => {
      const current = { nav: {} };
      const fallback = { nav: { dashboard: 'Painel Principal' } };

      expect(translate(current, fallback, 'nav.dashboard')).toBe('Painel Principal');
      expect(translate(current, fallback, 'completely.missing.key')).toBe('completely.missing.key');
    });
  });
});
