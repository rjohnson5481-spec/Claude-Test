/* ============================================================
   TE Question Extractor — Service Worker
   Iron & Light Johnson Academy
   ============================================================ */

const CACHE_NAME = 'te-extractor-v1.9';

// Core app shell — cached on install for offline use
const APP_SHELL = [
  '/Claude-Test/',
  '/Claude-Test/index.html',
  '/Claude-Test/style.css',
  '/Claude-Test/app.js',
  '/Claude-Test/manifest.json',
  '/Claude-Test/icons/icon-192.svg',
  '/Claude-Test/icons/icon-512.svg',
];

// ── Install: cache the app shell ────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: clear old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app shell, network-only for external ──
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never intercept: API calls, fonts, CDN libraries
  if (
    url.includes('anthropic.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('unpkg.com') ||
    url.includes('imgur.com')
  ) {
    return;
  }

  // Cache-first for same-origin requests
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache valid same-origin GET responses
        if (
          response.ok &&
          event.request.method === 'GET' &&
          url.startsWith(self.location.origin)
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback — return cached index.html for navigation
      if (event.request.mode === 'navigate') {
        return caches.match('/Claude-Test/index.html');
      }
    })
  );
});
