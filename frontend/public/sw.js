/**
 * Service Worker — Ethernity DMs PWA
 * Versão: 2.4.0
 * Resiliente: Só intercepta assets da mesma origem, nunca bloqueia chamadas de API ou módulos Vite.
 */

const CACHE_NAME = 'ethernity-dms-cache-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
  '/pwa-64x64.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/maskable-icon-512x512.png',
  '/og-image.png',
];

// 1. Instalação e precache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Ethernity DMs PWA: Precache não-bloqueante:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Ethernity DMs PWA: Removendo cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Handler (Resiliente e Seguro)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // A. Apenas processa GET
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // B. IGNORA COMPLETAMENTE requisições de outras origens (ex: API http://localhost:8000, FontAwesome CDN, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // C. IGNORA chamadas de API, endpoints de cofre e módulos de desenvolvimento (Segurança e Sigilo)
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/vault/') ||
    url.pathname.startsWith('/capsules/') ||
    url.pathname.startsWith('/guardians/') ||
    url.pathname.startsWith('/memories/') ||
    url.pathname.startsWith('/messages/') ||
    url.pathname.startsWith('/profile') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.searchParams.has('t') ||
    url.searchParams.has('import')
  ) {
    return;
  }

  // D. Navegação de Páginas HTML (Network-First com bypass de cache HTTP para garantir última versão)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cached) => cached || caches.match('/index.html') || caches.match('/'));
        })
    );
    return;
  }

  // E. Arquivos estáticos do frontend (Network-First com fallback)
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// 4. Notificações do Sistema
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 5. Push Notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const title = data.title || 'Ethernity DMs';
    event.waitUntil(
      self.registration.showNotification(title, {
        body: data.body || 'Nova notificação de memórias e legado',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: { url: data.url || '/' },
      })
    );
  } catch {
    event.waitUntil(
      self.registration.showNotification('Ethernity DMs', {
        body: event.data.text(),
        icon: '/favicon.svg',
        badge: '/favicon.svg',
      })
    );
  }
});
