// Colour-coded tajweed text: quran.com API v4 (verses[].text_uthmani_tajweed), sanitized and cached offline.
// Network HTML is NEVER inserted as-is: sanitizeTajweed() rebuilds output from an allow-list.
if (typeof document !== 'undefined') import('../styles/tajweed.css');

const API = 'https://api.quran.com/api/v4/quran/verses/uthmani_tajweed?chapter_number=';
const DB_NAME = 'noor-tajweed';
const STORE = 'noor-tajweed';
const CACHE_VER = 1;

export const TAJWEED_LEGEND = [
  { cls: 'ham_wasl', name: 'همزة الوصل', desc: 'تُنطق عند البدء وتسقط عند الوصل' },
  { cls: 'laam_shamsiyah', name: 'اللام الشمسية', desc: 'لام «ال» لا تُنطق ويُشدَّد ما بعدها' },
  { cls: 'slnt', name: 'حرف لا يُنطق', desc: 'حرف مكتوب غير منطوق' },
  { cls: 'madda_normal', name: 'مدّ طبيعي', desc: 'حركتان' },
  { cls: 'madda_permissible', name: 'مدّ جائز', desc: 'مدّ منفصل أو عارض: ٢ أو ٤ أو ٦ حركات' },
  { cls: 'madda_obligatory', name: 'مدّ واجب متصل', desc: 'أربع أو خمس حركات' },
  { cls: 'madda_necessary', name: 'مدّ لازم', desc: 'ست حركات' },
  { cls: 'qalaqah', name: 'قلقلة', desc: 'اضطراب الصوت في ق ط ب ج د عند السكون' },
  { cls: 'ghunnah', name: 'غنّة', desc: 'نون أو ميم مشدّدة، حركتان' },
  { cls: 'ikhafa', name: 'إخفاء', desc: 'نطق النون الساكنة بين الإظهار والإدغام' },
  { cls: 'ikhafa_shafawi', name: 'إخفاء شفوي', desc: 'الميم الساكنة قبل الباء' },
  { cls: 'idgham_ghunnah', name: 'إدغام بغنّة', desc: 'إدخال النون الساكنة في حروف «ينمو» مع غنّة' },
  { cls: 'idgham_wo_ghunnah', name: 'إدغام بلا غنّة', desc: 'في اللام والراء بلا غنّة' },
  { cls: 'idgham_shafawi', name: 'إدغام شفوي', desc: 'الميم الساكنة قبل ميم' },
  { cls: 'iqlab', name: 'إقلاب', desc: 'قلب النون الساكنة ميمًا قبل الباء مع غنّة' }
];

const KNOWN = new Set([
  ...TAJWEED_LEGEND.map(l => l.cls),
  'idgham_mutajanisayn', 'idgham_mutaqaribayn'
]);
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'wbr']);

const escText = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    if (k === 'nbsp') return ' ';
    const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

/** Tiny regex tokenizer (node / fallback). Tokens: {t:'text',v} {t:'open',name,cls,selfClose} {t:'close',name}. */
export function tokenize(html) {
  const out = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>|<!--[\s\S]*?-->|<[^>]*>/g;
  let last = 0, m;
  const text = v => { if (v) out.push({ t: 'text', v: decode(v) }); };
  const src = String(html ?? '');
  while ((m = re.exec(src))) {
    text(src.slice(last, m.index));
    last = re.lastIndex;
    if (!m[2]) continue; // comment / junk tag: dropped
    const name = m[2].toLowerCase();
    if (m[1]) { out.push({ t: 'close', name }); continue; }
    const cm = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[3]);
    const cls = cm ? (cm[1] ?? cm[2] ?? cm[3] ?? '') : '';
    out.push({ t: 'open', name, cls: cls.trim(), selfClose: /\/\s*$/.test(m[3]) || VOID.has(name) });
  }
  text(src.slice(last));
  return out;
}

/** Browser parser: DOMParser tree walked into the same token stream (text already decoded). */
export function domTokens(html) {
  const doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html ?? ''), 'text/html');
  const out = [];
  const walk = n => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push({ t: 'text', v: c.nodeValue });
      else if (c.nodeType === 1) {
        const name = c.localName.toLowerCase();
        const cls = (c.getAttribute('class') || '').trim();
        const sc = VOID.has(name);
        out.push({ t: 'open', name, cls, selfClose: sc });
        if (!sc) { walk(c); out.push({ t: 'close', name }); }
      }
    }
  };
  walk(doc.body);
  return out;
}

const defaultParse = html => (typeof DOMParser !== 'undefined' ? domTokens(html) : tokenize(html));

/**
 * Rebuild safe HTML from untrusted markup. Output contains ONLY escaped text and
 * <span class="tj tj-X"> (X from the allow-list). Every other element/attribute is dropped
 * (its text is kept); <... class=end> ayah-number spans are removed with their content.
 */
export function sanitizeTajweed(html, parse = defaultParse) {
  const toks = parse(html);
  const stack = []; // {name, emit, skip}
  let out = '', skipDepth = 0, inTj = 0;
  for (const k of toks) {
    if (k.t === 'text') { if (!skipDepth) out += escText(k.v); continue; }
    if (k.t === 'open') {
      if (k.selfClose) continue;
      const skip = skipDepth > 0 || (k.name === 'span' && k.cls.split(/\s+/).includes('end'));
      const okCls = k.name === 'tajweed' && /^[a-z_]+$/.test(k.cls) && KNOWN.has(k.cls);
      const emit = !skip && okCls && inTj === 0;
      if (skip) skipDepth++;
      if (emit) { out += `<span class="tj tj-${k.cls}">`; inTj++; }
      stack.push({ name: k.name, emit, skip });
      continue;
    }
    // close: pop to the nearest matching open element; ignore stray closers
    let i = stack.length - 1;
    while (i >= 0 && stack[i].name !== k.name) i--;
    if (i < 0) continue;
    while (stack.length > i) {
      const e = stack.pop();
      if (e.emit) { out += '</span>'; inTj--; }
      if (e.skip) skipDepth--;
    }
  }
  while (stack.length) { // unclosed elements
    const e = stack.pop();
    if (e.emit) out += '</span>';
  }
  return out;
}

// ---------------------------------------------------------------- cache + load
const mem = new Map();
const pending = new Map();

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
}
async function idbGet(key) {
  try {
    const db = await openDB();
    return await new Promise(res => {
      const rq = db.transaction(STORE).objectStore(STORE).get(key);
      rq.onsuccess = () => { db.close(); res(rq.result); };
      rq.onerror = () => { db.close(); res(undefined); };
    });
  } catch (e) { return undefined; }
}
async function idbSet(key, val) {
  try {
    const db = await openDB();
    await new Promise(res => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = tx.onabort = () => { db.close(); res(); };
    });
  } catch (e) { /* cache is best-effort */ }
}

async function fetchSurah(s) {
  const r = await fetch(API + s);
  if (!r.ok) throw new Error('tajweed ' + r.status);
  const j = await r.json();
  const verses = j && j.verses;
  if (!Array.isArray(verses) || !verses.length) throw new Error('tajweed empty');
  const arr = [];
  for (const v of verses) {
    const n = parseInt(String(v.verse_key || '').split(':')[1], 10);
    if (n >= 1 && typeof v.text_uthmani_tajweed === 'string') arr[n - 1] = sanitizeTajweed(v.text_uthmani_tajweed);
  }
  for (let i = 0; i < arr.length; i++) if (typeof arr[i] !== 'string') throw new Error('tajweed incomplete');
  return arr;
}

/** Sanitized tajweed HTML per ayah (index 0 = ayah 1). Cached in memory + IndexedDB. */
export function loadTajweed(s) {
  if (mem.has(s)) return Promise.resolve(mem.get(s));
  if (pending.has(s)) return pending.get(s);
  const p = (async () => {
    const c = await idbGet(s);
    if (c && c.v === CACHE_VER && Array.isArray(c.a) && c.a.length) { mem.set(s, c.a); return c.a; }
    const a = await fetchSurah(s);
    mem.set(s, a);
    idbSet(s, { v: CACHE_VER, a });
    return a;
  })().finally(() => pending.delete(s));
  pending.set(s, p);
  return p;
}
