import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useAutoSaveDraft
 * Hook para salvamento automático inteligente com debounce (evita requisições e escritas repetitivas).
 * Protege rascunhos de cartas e memórias familiares contra fechamento acidental de aba.
 *
 * @param {string} storageKey Chave única no localStorage
 * @param {object} currentData Dados atuais do formulário { title, content, ... }
 * @param {object} options Opções de debounce e callbacks
 * @returns {object} Status de salvamento, métodos de restore e clear
 */
export function useAutoSaveDraft(storageKey, currentData, options = {}) {
  const {
    debounceMs = 1500,
    onSave = null,
    isInitialEmpty = (data) => {
      if (!data) return true;
      const titleEmpty = !data.title || !data.title.trim();
      const contentEmpty =
        !data.content ||
        !data.content.trim() ||
        data.content.trim() === '<p></p>' ||
        data.content.trim() === '<p><br></p>';
      return titleEmpty && contentEmpty;
    },
  } = options;

  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'unsaved'
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [initialDraft, setInitialDraft] = useState(null);

  const debounceTimerRef = useRef(null);
  const currentDataRef = useRef(currentData);
  currentDataRef.current = currentData;
  const isDirtyRef = useRef(false);

  // 1. Carrega rascunho salvo anteriormente na inicialização
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && !isInitialEmpty(parsed)) {
          setInitialDraft(parsed);
          if (parsed.savedAt) {
            setLastSavedAt(new Date(parsed.savedAt));
          }
        }
      }
    } catch (e) {
      console.warn('[useAutoSaveDraft] Falha ao recuperar rascunho anterior:', e);
    }
  }, [storageKey]);

  // Função interna para persistência imediata
  const executeSave = useCallback((dataToSave) => {
    if (!dataToSave || isInitialEmpty(dataToSave)) {
      setSaveStatus('saved');
      return;
    }

    try {
      setSaveStatus('saving');
      const now = new Date();
      const payload = {
        ...dataToSave,
        savedAt: now.toISOString(),
      };

      localStorage.setItem(storageKey, JSON.stringify(payload));
      setLastSavedAt(now);
      isDirtyRef.current = false;
      setSaveStatus('saved');

      if (typeof onSave === 'function') {
        onSave(payload);
      }
    } catch (err) {
      console.warn('[useAutoSaveDraft] Erro ao persistir rascunho:', err);
      setSaveStatus('unsaved');
    }
  }, [storageKey, onSave]);

  // 2. Dispara debounce a cada alteração de currentData
  useEffect(() => {
    // Se o dado estiver vazio e nunca foi alterado, ignora
    if (isInitialEmpty(currentData)) {
      return;
    }

    isDirtyRef.current = true;
    setSaveStatus('unsaved');

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      executeSave(currentDataRef.current);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [currentData, debounceMs, executeSave]);

  // 3. Listener para salvar no fechamento da aba / mudança de visibilidade
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDirtyRef.current) {
        executeSave(currentDataRef.current);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isDirtyRef.current) {
        executeSave(currentDataRef.current);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [executeSave]);

  // 4. Limpa rascunho (ex: após salvar mensagem com sucesso ou ao descartar)
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setInitialDraft(null);
      setLastSavedAt(null);
      isDirtyRef.current = false;
      setSaveStatus('saved');
    } catch (e) {
      console.warn('[useAutoSaveDraft] Falha ao limpar rascunho:', e);
    }
  }, [storageKey]);

  // Força salvar agora
  const forceSaveNow = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    executeSave(currentDataRef.current);
  }, [executeSave]);

  return {
    saveStatus,
    lastSavedAt,
    initialDraft,
    clearDraft,
    forceSaveNow,
  };
}

export default useAutoSaveDraft;
