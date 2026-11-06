/* NovaChat service worker.
   Everything the app needs (HTML, JS, CSS, icons) is precached on install, so an
   installed copy keeps opening and working even if the server is switched off.
   build.mjs fills in VERSION and PRECACHE. */
const VERSION = '2.0.0-cffbb28a';
const CACHE = 'nova-' + VERSION;
const PRECACHE = [
  "/",
  "/app-IYQ7TW3J.css",
  "/app-LPFBYIWO.js",
  "/favicon.ico",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/index.html",
  "/manifest.webmanifest"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nova-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // AI providers, image hosts: always network
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  // Page loads (including /?new=1 and share-target URLs): serve the cached app shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((hit) => hit || fetch(req).catch(() => new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Static files: cache first, fall back to network and remember the result.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => new Response('', { status: 504 }))
    )
  );
});
