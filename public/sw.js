// Kaylee's Hub — Service Worker
// Strategy: network-first for API calls, stale-while-revalidate for assets
//
// CACHE VERSION: bump this string every time you want to force a clean
// cache purge on next deploy (e.g. after a big visual/layout change).
// Not required for normal updates — stale-while-revalidate below already
// self-heals within one extra page load — but bumping it guarantees an
// immediate full refresh instead of a one-visit lag.
const CACHE_NAME = 'kaylees-hub-v2';

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Lets the app force this worker to activate immediately instead of
// waiting for all tabs to close — paired with the update-prompt logic
// in main.tsx (see chat message for that snippet).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});

// ── Push notifications: display the notification when one arrives ─────────
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Kaylee's Hub", body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || "Kaylee's Hub";
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'kaylees-hub',
    data: { url: payload.url || '/' },
    // Re-alert even if a notification with the same tag already showed
    // today (e.g. briefing ping vs. mood reminder shouldn't collapse
    // into one silent notification).
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click: focus an existing tab or open a new one ───────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go network-first for Supabase API calls
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/functions/')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Network-first for navigation requests (fresh HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // Stale-while-revalidate for static assets (JS, CSS, images): serve the
  // cached version instantly for speed, but always fetch a fresh copy in
  // the background and update the cache for next time. This means even an
  // asset that somehow gets "stuck" only stays stale for one extra visit,
  // never indefinitely — no more needing to delete and reinstall the app.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const network = fetch(event.request).then((response) => {
          if (response.ok && event.request.method === 'GET') {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
