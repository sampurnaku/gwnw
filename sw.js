// Service worker: aplikasi tetap bisa dibuka tanpa internet, dan versi baru dari GitHub
// otomatis terpakai begitu perangkat online (file aplikasi diambil dari jaringan lebih dulu).
const CACHE = 'gwnw-v4';
const ASSETS = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/app.js',
  'src/calc.js',
  'src/parser.js',
  'src/presets.js',
  'src/export.js',
  'src/samples.js',
  'src/version.js',
  'vendor/pdf.min.mjs',
  'vendor/pdf.worker.min.mjs',
  'vendor/exceljs.min.js',
  'assets/logo.jpeg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
// Pustaka besar dan gambar jarang berubah: langsung dari cache.
const CACHE_FIRST = /\/(vendor|icons|assets)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function store(request, response) {
  if (response && response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);

  if (CACHE_FIRST.test(url.pathname)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((res) => store(request, res))),
    );
    return;
  }

  // File aplikasi: jaringan lebih dulu (selalu cek versi terbaru), cache bila offline.
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((res) => store(request, res))
      .catch(() => caches.match(request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
  );
});
