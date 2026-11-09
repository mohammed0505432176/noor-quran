// Noor service worker. Strategy:
//  - app shell (index, built JS/CSS/fonts listed by the build in PRECACHE_BUILT) is precached per release: cache `noor-shell-<BUILD>`;
//    a new release gets a new cache name and the old shell cache is deleted on activate (cache versioning = bump on release)
//  - other same-origin GETs (quran.json, kids images, adhan audio...): cache-first inside the shell cache
//  - navigations: network first, cached index.html when offline
//  - audio (everyayah) / mushaf fonts+layouts: their own long-lived caches with caps
//  - the on-device model (/models/) is NEVER touched here: quran-engine.js stores it in its own Cache Storage bucket
//    (`noor-models-v1`). The ORT wasm runtime (/ort/) gets its own small cache so the engine also starts offline.
// The BUILD placeholder below and the PRECACHE_BUILT list are filled in by vite.config.js at build time (dev: unreplaced, empty).
const BUILD = '__BUILD_VERSION__';
const SHELL_PREFIX = 'noor-shell-';
const VERSION = SHELL_PREFIX + BUILD;
const AUDIO = 'noor-audio';
const AUDIO_MAX = 300;
const MUSHAF = 'noor-mushaf-v1';
const MUSHAF_OFFLINE = 'noor-mushaf-offline-v1';   // «المصحف دون إنترنت»: written by core/mushaf-offline.js, read first, never trimmed
const MODELS = 'noor-models-v1';       // owned by quran-engine.js, only protected from deletion here
const ORT = 'noor-ort-v1';
const LAYOUT_V = '2';
const FONT_MAX = 120;
const PRECACHE = ['./', './index.html', './quran.json', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
const PRECACHE_BUILT = /*__PRECACHE__*/[];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.allSettled([...new Set([...PRECACHE, ...PRECACHE_BUILT])].map(u => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => (k.startsWith(SHELL_PREFIX) && k !== VERSION) || k === 'noor-v1').map(k => caches.delete(k))))
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
    e.respondWith(caches.open(MUSHAF_OFFLINE).then(o => o.match(req.url)).catch(() => null).then(off => off || caches.open(MUSHAF).then(c => c.match(req.url).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && res.type !== 'opaque') c.put(req.url, res.clone()).then(() => (isLayout ? dropOldLayouts(c) : trimFonts(c))).catch(() => {});
      return res;
    })))));
    return;
  }
  if (url.origin !== location.origin) return;
  // the 72 MB model must never land in a generic cache by accident: leave it to quran-engine.js
  if (url.pathname.includes('/models/') || /\.onnx$/i.test(url.pathname)) return;
  if (url.pathname.includes('/ort/')) {
    e.respondWith(caches.open(ORT).then(c => c.match(req.url).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && res.status === 200) c.put(req.url, res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }
  if (req.headers.has('range')) return;       // media seeking: a cached full 200 would break partial content
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {}); }
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')).then(r => r || new Response(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body dir="rtl" style="font-family:sans-serif;text-align:center;padding:3rem;background:#06120d;color:#f3d98b"><h2>لا يوجد اتصال بالإنترنت</h2><p>افتح التطبيق مرة واحدة وأنت متصل ليعمل بعدها بلا إنترنت.</p></body>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      )))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok && res.status === 200) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }))
  );
});
