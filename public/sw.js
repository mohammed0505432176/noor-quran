const VERSION = 'noor-v1';
const AUDIO = 'noor-audio';
const AUDIO_MAX = 300;
const PRECACHE = ['./', './index.html', './quran.json', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== AUDIO && k !== 'noor-models-v1').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - AUDIO_MAX; i++) await cache.delete(keys[i]);
}

async function audio(req) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque') && res.status !== 206) {
    cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('everyayah.com')) {
    if (req.headers.has('range')) return;
    e.respondWith(audio(req).catch(() => Response.error()));
    return;
  }
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/models/') || url.pathname.includes('/ort/')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }))
  );
});
