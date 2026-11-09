// Offline Mushaf: the 604 page fonts (QCF v2, King Fahd Complex) and page layouts kept in a Cache Storage bucket of their
// own, `noor-mushaf-offline-v1`. public/sw.js looks there first and never trims it (the lazy bucket `noor-mushaf-v1` is capped).
// The download resumes: pages already stored are skipped, so a dropped connection or a closed app just continues next time.
// Fonts come from the same hosts madani.js reads (static.qurancdn.com, then verses.quran.foundation); nothing here talks to
// any other server, and nothing is sent: only GET requests for the public page fonts.
export const OFFLINE_CACHE = 'noor-mushaf-offline-v1';
export const PAGES = 604;
const HOSTS = ['https://static.qurancdn.com', 'https://verses.quran.foundation'];
const LAYOUT_V = 2;                       // keep equal to LAYOUT_V in madani.js and sw.js
const pad = p => String(p).padStart(3, '0');

export const fontUrl = (p, host = HOSTS[0]) => `${host}/fonts/quran/hafs/v2/woff2/p${p}.woff2`;
export function layoutUrl(p, base = (typeof location !== 'undefined' ? location.href : 'http://localhost/')) {
  const root = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || './';
  return new URL(root + 'mushaf/p/' + pad(p) + '.json?v=' + LAYOUT_V, base).href;
}

export const cacheSupported = () => typeof caches !== 'undefined' && typeof fetch === 'function';

/** Which pages are fully stored (font + layout). -> Set of page numbers. */
export async function storedPages() {
  const out = new Set();
  if (!cacheSupported()) return out;
  const c = await caches.open(OFFLINE_CACHE);
  const have = new Set((await c.keys()).map(r => r.url));
  for (let p = 1; p <= PAGES; p++) if (HOSTS.some(h => have.has(fontUrl(p, h))) && have.has(layoutUrl(p))) out.add(p);
  return out;
}

async function getOk(url, signal) {
  const res = await fetch(url, { signal });
  if (!res || !res.ok || res.type === 'opaque') throw new Error('http ' + (res && res.status));
  return res;
}

/** Fetch and store one page. Throws when neither font host answers. */
export async function storePage(p, cache, signal) {
  const lu = layoutUrl(p);
  if (!(await cache.match(lu))) await cache.put(lu, await getOk(lu, signal));
  for (const h of HOSTS) {
    const fu = fontUrl(p, h);
    if (await cache.match(fu)) return;
    try { await cache.put(fu, await getOk(fu, signal)); return; }
    catch (e) { if (signal && signal.aborted) throw e; /* try the next host */ }
  }
  throw new Error('font p' + p);
}

/**
 * Download every missing page. opts: { onProgress({done, total, failed}), signal, concurrency = 4, tries = 2 }.
 * Resolves { done, total, failed: [pages], aborted } and never throws for a single page: a failed page is retried once more at
 * the end, then reported, so one bad request never loses the rest.
 */
export async function downloadMushaf({ onProgress = () => {}, signal, concurrency = 4, tries = 2 } = {}) {
  if (!cacheSupported()) throw new Error('unsupported');
  const cache = await caches.open(OFFLINE_CACHE);
  const have = await storedPages();
  const todo = [];
  for (let p = 1; p <= PAGES; p++) if (!have.has(p)) todo.push(p);
  let done = have.size, failed = [];
  onProgress({ done, total: PAGES, failed: 0 });
  const queue = todo.slice();
  const worker = async () => {
    while (queue.length && !(signal && signal.aborted)) {
      const p = queue.shift();
      let ok = false;
      for (let t = 0; t < tries && !ok && !(signal && signal.aborted); t++) {
        try { await storePage(p, cache, signal); ok = true; } catch (e) { if (signal && signal.aborted) return; }
      }
      if (ok) done++; else failed.push(p);
      onProgress({ done, total: PAGES, failed: failed.length });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return { done, total: PAGES, failed, aborted: !!(signal && signal.aborted) };
}

/** Delete everything stored for offline reading. */
export async function clearOfflineMushaf() {
  if (!cacheSupported()) return false;
  return caches.delete(OFFLINE_CACHE);
}
