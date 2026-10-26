import { useState, useEffect, useCallback } from 'react';

// /health fica na raiz do backend, fora do prefixo /api
const HEALTH_URL = `${((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || 'http://localhost:8000')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '')}/health`;

/**
 * useNetworkStatus — Hook para monitorar conectividade de rede (online / offline)
 * com verificação ativa de API local e opção de dispensar a barra.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Verificação ativa via ping na API local
  const checkConnectivity = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(HEALTH_URL, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        setIsOnline(true);
        if (wasOffline) {
          setShowReconnected(true);
          setTimeout(() => {
            setShowReconnected(false);
            setWasOffline(false);
          }, 3500);
        }
        return true;
      }
    } catch {
      // Falha ao alcançar o servidor
    }
    return false;
  }, [wasOffline]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setIsDismissed(false);
      if (wasOffline) {
        setShowReconnected(true);
        const timer = setTimeout(() => {
          setShowReconnected(false);
          setWasOffline(false);
        }, 4000);
        return () => clearTimeout(timer);
      }
    };

    const handleOffline = () => {
      // Antes de marcar offline definitivo, tenta alcançar a API local
      checkConnectivity().then((reachable) => {
        if (!reachable) {
          setIsOnline(false);
          setWasOffline(true);
          setShowReconnected(false);
        }
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Se iniciou offline de acordo com o navegador, testa se a API local está acessível
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      checkConnectivity();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline, checkConnectivity]);

  const dismiss = () => {
    setIsDismissed(true);
  };

  return { isOnline, showReconnected, isDismissed, dismiss, checkConnectivity };
}

export default useNetworkStatus;

