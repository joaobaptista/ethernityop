/**
 * I18nContext.jsx — Contexto React de Apresentação para Internacionalização
 * Provê o estado global do idioma atual, troca de idioma e o helper de tradução t().
 */

import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  detectBrowserLanguage,
  translate,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  LANGUAGE_META,
} from '../domain/i18nModel.js';
import localeRepository from '../infrastructure/localeRepository.js';

export const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  // Inicialização com prioridade: 1) Salvo no localStorage -> 2) Detectado no navegador -> 3) Padrão (pt)
  const [language, setLanguageState] = useState(() => {
    const saved = localeRepository.getSavedLanguage();
    if (saved) return saved;
    return detectBrowserLanguage();
  });

  // Atualiza atributo lang na tag <html> do DOM
  useEffect(() => {
    const meta = LANGUAGE_META[language] || LANGUAGE_META[DEFAULT_LANGUAGE];
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', meta.htmlLang);
    }
  }, [language]);

  // Função para trocar o idioma com persistência
  const changeLanguage = useCallback((newLang) => {
    const saved = localeRepository.saveLanguage(newLang);
    setLanguageState(saved);
  }, []);

  // Carrega dicionários ativos e de fallback
  const currentTranslations = useMemo(() => {
    return localeRepository.getTranslations(language);
  }, [language]);

  const fallbackTranslations = useMemo(() => {
    return localeRepository.getTranslations(DEFAULT_LANGUAGE);
  }, []);

  // Helper de tradução puro t(key, params)
  const t = useCallback(
    (key, params = null) => {
      return translate(currentTranslations, fallbackTranslations, key, params);
    },
    [currentTranslations, fallbackTranslations]
  );

  const contextValue = useMemo(
    () => ({
      language,
      changeLanguage,
      t,
      supportedLanguages: SUPPORTED_LANGUAGES,
      languageMeta: LANGUAGE_META,
      currentMeta: LANGUAGE_META[language] || LANGUAGE_META[DEFAULT_LANGUAGE],
    }),
    [language, changeLanguage, t]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export default I18nProvider;
