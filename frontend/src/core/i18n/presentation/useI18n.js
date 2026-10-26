/**
 * useI18n.js — Hook de Apresentação para Internacionalização
 */

import { useContext } from 'react';
import { I18nContext } from './I18nContext.jsx';

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n deve ser utilizado dentro de um <I18nProvider>');
  }
  return context;
}

export default useI18n;
