// Madinah Mushaf (King Fahd Complex print, QCF v2 per-page fonts): page layouts + fonts.
const HOSTS = ['https://static.qurancdn.com', 'https://verses.quran.foundation'];
const TIMEOUT = 8000;
const pad = p => String(p).padStart(3, '0');
const layouts = new Map(); // p -> layout (resolved)
const layoutP = new Map(); // p -> Promise
const fontP = new Map(); // p -> Promise<family>
const LAYOUT_V = 2;
const FONT_MAX = 12;
const faces = new Map(); // p -> FontFace (insertion order = LRU, oldest first)
const pinned = new Set();

export const familyOf = p => 'qcf-p' + p;
export const cachedLayout = p => layouts.get(p) || null;

const timeout = (pr, ms, msg) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(msg || 'timeout')), ms);
  pr.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
});

export function loadPage(p) {
  if (layoutP.has(p)) return layoutP.get(p);
  const base = (import.meta.env && import.meta.env.BASE_URL) || './';
  const pr = timeout(fetch(base + 'mushaf/p/' + pad(p) + '.json?v=' + LAYOUT_V).then(r => {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }), TIMEOUT, 'layout timeout').then(j => {
    if (!j || !Array.isArray(j.lines) || !j.lines.length) throw new Error('bad layout');
    layouts.set(p, j);
    return j;
  });
  layoutP.set(p, pr);
  pr.catch(() => layoutP.delete(p));
  return pr;
}

async function tryFont(p, host) {
  const fam = familyOf(p);
  const face = new FontFace(fam, `url(${host}/fonts/quran/hafs/v2/woff2/p${p}.woff2) format("woff2")`, { display: 'block' });
  await timeout(face.load(), TIMEOUT, 'font timeout');
  document.fonts.add(face);
  faces.set(p, face);
  evict();
  return fam;
}

/** Mark a page as in use (most recent); pages currently shown are never evicted. */
export function touch(p) {
  const f = faces.get(p);
  if (f) { faces.delete(p); faces.set(p, f); }
}
export const hasFont = p => faces.has(p);
/** Pages currently on screen: protected from eviction. */
export function setShown(ps) { pinned.clear(); for (const p of ps) { pinned.add(p); touch(p); } }
function evict() {
  for (const [p, face] of faces) {
    if (faces.size <= FONT_MAX) break;
    if (pinned.has(p)) continue;
    faces.delete(p);
    try { document.fonts.delete(face); } catch (e) { /* ignore */ }
    fontP.delete(p);
  }
}

export function loadFont(p) {
  if (fontP.has(p)) { touch(p); return fontP.get(p); }
  const pr = tryFont(p, HOSTS[0]).catch(() => tryFont(p, HOSTS[1]));
  fontP.set(p, pr);
  pr.catch(() => fontP.delete(p));
  return pr;
}

const idle = fn => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 400));

export function prefetch(p) {
  idle(() => {
    for (const q of [p + 1, p - 1, p + 2, p - 2]) {
      if (q < 1 || q > 604) continue;
      loadPage(q).catch(() => {});
      loadFont(q).catch(() => {});
    }
  });
}
