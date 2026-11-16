// Service worker do PWA: guarda o app em cache para a carteirinha abrir sem internet.
// Os dados (e o segredo do QR dinâmico) ficam no armazenamento local do aparelho.

const CACHE = 'elosaude-app-v1';
const ARQUIVOS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icone.svg',
  '../assets/app.css',
  '../assets/js/lib/util.js',
  '../assets/js/lib/crypto.js',
  '../assets/js/lib/pagamentos-fake.js',
  '../assets/js/backend/db.js',
  '../assets/js/backend/seed.js',
  '../assets/js/backend/regras.js',
  '../assets/js/backend/api.js',
  '../assets/js/ui/ui.js',
  '../assets/js/ui/login.js',
  '../assets/js/ui/cobranca.js',
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4.1.11',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(ARQUIVOS.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Rede primeiro (o Live Server recarrega arquivos alterados); cache quando offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.url.includes('/ws')) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok || resp.type === 'opaque') {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
