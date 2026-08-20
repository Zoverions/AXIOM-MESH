const CACHE_NAME = 'axiom-one-shell-v5';
const SHELL_ASSETS = Object.freeze([
  '/',
  '/index.html',
  '/styles.css',
  '/app.mjs',
  '/presentation.mjs',
  '/social-presentation.mjs',
  '/human-contract.json',
  '/manifest.webmanifest',
  '/icon.svg',
  '/vendor/axiom-client.mjs',
  '/mesh/config/gateway-client-contract.json'
]);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET'
    || url.origin !== self.location.origin
    || url.pathname.startsWith('/v1/')
    || !SHELL_ASSETS.includes(url.pathname)
  ) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request, { cache: 'no-store' });
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      return new Response('AXIOM One shell is unavailable offline', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});