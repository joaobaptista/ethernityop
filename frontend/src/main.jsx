import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Limpeza proativa de caches obsoletos no navegador
if ('caches' in window) {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((name) => {
      if (name !== 'ethernity-dms-cache-v5') {
        caches.delete(name);
      }
    });
  });
}

// Força atualização dinâmica do favicon para burlar cache interno do Chrome/Safari
if (typeof document !== 'undefined') {
  const refreshFavicon = () => {
    const timestamp = Date.now();
    const links = document.querySelectorAll("link[rel*='icon'], link[rel='apple-touch-icon']");
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        const cleanHref = href.split('?')[0];
        link.setAttribute('href', `${cleanHref}?v=${timestamp}`);
      }
    });
  };
  window.addEventListener('load', refreshFavicon);
}

// Registro do Service Worker para PWA (Progressive Web App)
if (
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js?v=20261023_v5', { updateViaCache: 'none' })
      .then((registration) => {
        // Força atualização imediata para descartar caches legados
        registration.update();
        console.log('Ethernity DMs PWA Service Worker ativo:', registration.scope);
      })
      .catch((error) => {
        console.warn('Falha ao registrar Ethernity DMs PWA Service Worker:', error);
      });
  });
}

