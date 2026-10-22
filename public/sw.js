const VERSION = 'noor-v1';
const AUDIO = 'noor-audio';
const AUDIO_MAX = 300;
const MUSHAF = 'noor-mushaf-v1';
const LAYOUT_V = '2';
const FONT_MAX = 120;
const PRECACHE = ['./', './index.html', './quran.json', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(PRECACHE.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== AUDIO && k !== MUSHAF && k !== 'noor-models-v1').map(k => caches.delete(k))))
      .then(() => caches.open(MUSHAF).then(c => dropOldLayouts(c).then(() => trimFonts(c))).catch(() => {}))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - AUDIO_MAX; i++) await cache.delete(keys[i]);
}

const isLayoutUrl = u => new URL(u).pathname.includes('/mushaf/p/');
async function dropOldLayouts(c) {
  for (const r of await c.keys()) {
    const u = new URL(r.url);
    if (isLayoutUrl(r.url) && u.searchParams.get('v') !== LAYOUT_V) await c.delete(r);
  }
}
async function trimFonts(c) {
  const fonts = (await c.keys()).filter(r => !isLayoutUrl(r.url));
  for (let i = 0; i < fonts.length - FONT_MAX; i++) await c.delete(fonts[i]);
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
  if (url.hostname === 'static.qurancdn.com' || url.hostname === 'verses.quran.foundation' || (url.origin === location.origin && url.pathname.includes('/mushaf/p/'))) {
    const isLayout = url.origin === location.origin;
    if (isLayout && url.searchParams.get('v') !== LAYOUT_V) return;
    e.respondWith(caches.open(MUSHAF).then(c => c.match(req.url).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && res.type !== 'opaque') c.put(req.url, res.clone()).then(() => (isLayout ? dropOldLayouts(c) : trimFonts(c))).catch(() => {});
      return res;
    }))));
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
