/* ============================================================
   TE Question Extractor — Service Worker
   Iron & Light Johnson Academy
   ============================================================ */

const CACHE_NAME = 'te-extractor-v2.2';

// ── Install: activate immediately, no pre-caching ────────────
self.addEventListener('install', event => {
  self.skipWaiting();
});

// ── Message: force activation when page requests it ──────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Activate: clear every old cache, claim all clients ───────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, cache only as offline fallback ─────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never intercept: API calls, fonts, CDN libraries, external assets
  if (
    url.includes('anthropic.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('unpkg.com') ||
    url.includes('imgur.com')
  ) {
    return;
  }

  // Only handle same-origin GET requests
  if (event.request.method !== 'GET' || !url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    // Always try network first — ensures updates are always received
    fetch(event.request)
      .then(response => {
        // Store a fresh copy in cache for offline use
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — serve from cache (offline fallback)
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Last resort: return index.html for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('/Claude-Test/index.html');
          }
        });
      })
  );
});
