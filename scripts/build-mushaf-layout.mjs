// Build public/mushaf/p/NNN.json (Madinah Mushaf, 15 lines, QCF v2 glyphs) from api.quran.com.
// Run manually: node scripts/build-mushaf-layout.mjs   (generated files are committed; not part of prebuild)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageOf, pageContent } from '../src/core/pages.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'mushaf');
const PAGES = 604, CONC = 4, UA = 'noor-quran-build/1.0 (mushaf layout builder; non-profit)';
const API = p => `https://api.quran.com/api/v4/verses/by_page/${p}?words=true&word_fields=code_v2,line_number,char_type_name&per_page=300&fields=verse_key`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  let err;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) return await r.json();
      err = new Error(`HTTP ${r.status} ${url}`);
    } catch (e) { err = e; }
    await sleep(500 * 2 ** i + Math.random() * 300);
  }
  throw err;
}

async function fetchPage(p) {
  const cf = process.env.MUSHAF_CACHE && join(process.env.MUSHAF_CACHE, p + ".json");
  if (cf) { try { return JSON.parse(await readFile(cf, "utf8")); } catch {} }
  const r = await fetchPageRaw(p);
  if (cf) await writeFile(cf, JSON.stringify(r));
  return r;
}
async function fetchPageRaw(p) {
  const verses = [];
  let url = API(p), page = 1;
  while (true) {
    const j = await getJson(url + (page > 1 ? `&page=${page}` : ''));
    verses.push(...j.verses);
    const next = j.pagination && j.pagination.next_page;
    if (!next) break;
    page = next;
  }
  return verses;
}

// Words are grouped by their own word.page_number (the font page that holds the glyph), NOT by the by_page
// request page: for ~56 ayahs that straddle a page break the verse-level page differs from the print page.
const pages = Array.from({ length: PAGES + 2 }, () => new Map());
const seenIds = new Set();
function absorb(verses) {
  for (const v of verses) {
    const [s, a] = v.verse_key.split(':').map(Number);
    for (const w of v.words) {
      if (!w.code_v2 || seenIds.has(w.id)) continue;
      seenIds.add(w.id);
      const p = w.page_number, n = w.line_number;
      if (!(p >= 1 && p <= PAGES) || !(n >= 1 && n <= 15)) throw new Error(`bad word page/line ${v.verse_key}:${w.position} p=${p} n=${n}`);
      if (!pages[p].has(n)) pages[p].set(n, []);
      pages[p].get(n).push({ g: w.code_v2, s, a, k: w.char_type_name === 'end' ? 1 : 0, pos: w.position });
    }
  }
}
const fetched = new Array(PAGES + 1);
let next = 1, done = 0;
async function worker() {
  while (true) {
    const p = next++;
    if (p > PAGES) return;
    fetched[p] = await fetchPage(p);
    if (++done % 50 === 0) console.log(`fetched ${done}/${PAGES}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
for (let p = 1; p <= PAGES; p++) absorb(fetched[p]);

// ---- build ----
const need = s => (s === 1 || s === 9 ? 1 : 2); // header (+ basmala)
const remaining = new Map(); // surah -> lines still unplaced
const startPage = new Map(); // surah -> page of its first word
const firstWord = new Array(PAGES + 2); // first word per page
const tops = []; // per page: first word record
for (let p = 1; p <= PAGES; p++) {
  const ls = [...pages[p].keys()].sort((x, y) => x - y);
  if (!ls.length) throw new Error(`page ${p} has no lines`);
  const w = pages[p].get(ls[0])[0];
  tops[p] = w;
  for (const n of ls) for (const x of pages[p].get(n)) {
    if (x.a === 1 && x.pos === 1 && !startPage.has(x.s)) { startPage.set(x.s, p); remaining.set(x.s, need(x.s)); }
  }
}
if (startPage.size !== 114) throw new Error(`surah starts found: ${startPage.size}`);

const out = [];
let ends = 0;
const ayahPages = new Map();
for (let p = 1; p <= PAGES; p++) {
  const lines = pages[p];
  const maxLine = Math.max(...lines.keys());
  const total = p <= 2 ? maxLine : 15;
  if (maxLine > total) throw new Error(`page ${p}: line ${maxLine} > ${total}`);
  const empties = [];
  for (let n = 1; n <= total; n++) if (!lines.has(n)) empties.push(n);

  // queue: surahs starting on p (in order), then surah starting at the top of p+1
  const queue = [];
  for (let s = 1; s <= 114; s++) if (startPage.get(s) === p) queue.push(s);
  // surahs starting on p whose lines were already placed on p-1 have remaining 0 (skipped below)
  const nt = p < PAGES ? tops[p + 1] : null;
  if (nt && nt.a === 1 && nt.pos === 1 && startPage.get(nt.s) === p + 1) queue.push(nt.s);

  // headers on this page must sit before the surah's first text line; trailing empties belong to next top surah
  const lineSpec = new Map();
  let qi = 0;
  const lastTextLine = maxLine;
  for (const n of empties) {
    while (qi < queue.length && remaining.get(queue[qi]) === 0) qi++;
    if (qi >= queue.length) throw new Error(`page ${p}: unexplained empty line ${n}`);
    const s = queue[qi], rem = remaining.get(s);
    const isNextTop = startPage.get(s) === p + 1;
    if (isNextTop && n < lastTextLine) throw new Error(`page ${p}: empty line ${n} is before text but assigned to next page surah ${s}`);
    const t = rem === need(s) ? 'surah' : 'basmala';
    lineSpec.set(n, { n, t, s });
    remaining.set(s, rem - 1);
  }
  // all surahs starting on p must be fully placed (header may be partially on previous page only if fully consumed there)
  for (const s of queue) if (startPage.get(s) === p && remaining.get(s) !== 0) throw new Error(`page ${p}: surah ${s} header/basmala incomplete`);

  const outLines = [];
  for (let n = 1; n <= total; n++) {
    if (lineSpec.has(n)) { outLines.push(lineSpec.get(n)); continue; }
    const w = lines.get(n).sort((x, y) => x.s - y.s || x.a - y.a || x.pos - y.pos)
      .map(x => { if (x.k) ends++; return [x.g, x.s, x.a, x.k]; });
    outLines.push({ n, t: 'text', w });
  }
  // pages 1-2: header sits only where it exists; ensure no gaps
  if (!outLines.length) throw new Error(`page ${p}: no lines`);

  for (const l of outLines) if (l.t === 'text') for (const [, s, a] of l.w) {
    const k = s * 1000 + a;
    if (!ayahPages.has(k)) ayahPages.set(k, { s, a, first: p, last: p });
    else ayahPages.get(k).last = p;
  }
  out.push({ p, lines: outLines });
}
for (const [s, r] of remaining) if (r !== 0) throw new Error(`surah ${s}: ${r} header lines unplaced`);
// pageOf agreement: pageOf must lie within the ayah's page span; layout/pageOf may differ by at most 1 page
// (known: ~56 ayahs next to page breaks; the font layout is authoritative for rendering).
const mismatches = [];
for (const { s, a, first, last } of ayahPages.values()) {
  const po = pageOf(s, a);
  if (po >= first && po <= last) continue;
  const d = po < first ? first - po : po - last;
  if (d > 1) throw new Error(`ayah ${s}:${a}: pageOf ${po} vs layout pages ${first}-${last}`);
  mismatches.push(`${s}:${a} pageOf=${po} layout=${first}${last > first ? '-' + last : ''}`);
}
if (ayahPages.size !== 6236) throw new Error(`ayahs: ${ayahPages.size}`);
console.log(`pageOf vs layout: ${mismatches.length} ayahs off by 1 page`);
if (ends !== 6236) throw new Error(`ayah-end glyphs = ${ends}, expected 6236`);

await mkdir(join(OUT, 'p'), { recursive: true });
for (const o of out) await writeFile(join(OUT, 'p', String(o.p).padStart(3, '0') + '.json'), JSON.stringify(o));
await writeFile(join(OUT, 'CREDITS.txt'),
`Mushaf page layout data (public/mushaf/p/*.json)
- Source: Quran.com API v4 (https://api.quran.com) - verses by page, word line numbers and QCF v2 glyph codes.
- Page fonts (QCF v2): King Fahd Glorious Quran Printing Complex, Madinah (Madani Mushaf), served by Quran.com.
- Used for free, non-profit purposes. Please keep this credit.
`);
console.log(`OK: ${out.length} pages, ${ends} ayah-end glyphs`);
