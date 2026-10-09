const CACHE_NAME = 'ai-infra-watch-shell-v3';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  // Activate the new shell immediately so older cached app versions can be retired.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // API responses and non-GET requests must never be served from the app-shell cache.
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  // Network-first: always prefer the newest deployed HTML/assets; cache is offline-only fallback.
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((cached) => cached || caches.match('/'))
    )
  );
});
