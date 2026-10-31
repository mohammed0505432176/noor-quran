// Similar-verse (mutashabihat) detection: finds other ayahs containing the words the user said by mistake.
//
// DATA SOURCE (what this module actually uses): there is NO curated/scholarly mutashabihat list here. The index is built at
// runtime from the bundled Quran text (public/quran.json via quran.js surah(s).v), each ayah normalized with arabic.js norm().
// A "similar verse" is therefore purely algorithmic: another ayah whose normalized text contains the same contiguous run of
// >= 3 normalized words (first 10 words of the query ayah / heard words; max 3 results). Results are textual overlap, not an
// authoritative list. Origin of quran.json itself (Tanzil, King Fahd complex, etc.) is not stated in the repo: source unverified.
import { norm } from './arabic.js';
import { SURAH_COUNT, isLoaded, surah } from './quran.js';

let index = null;

/** Test hook: replace the index with [[s, a, normalizedText], ...] and bypass the isLoaded check. */
export function _setIndexForTest(arr) { index = arr && arr.map(([s, a, t]) => [s, a, ' ' + t + ' ']); }

function getIndex() {
  if (index) return index;
  if (!isLoaded()) return null;
  index = [];
  for (let s = 1; s <= SURAH_COUNT; s++) surah(s).v.forEach((t, j) => index.push([s, j + 1, ' ' + norm(t) + ' ']));
  return index;
}

/** Group consecutive 'wrong' words (one 'skip' between wrongs is tolerated) into phrases [{ from, to, heard }] (>=3 heard words). */
export function wrongRuns(words) {
  const out = [];
  let cur = null;
  const close = () => { if (cur && cur.heard.length >= 3) out.push(cur); cur = null; };
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w.kind === 'wrong') {
      cur ||= { from: w.i, to: w.i, heard: [] };
      cur.to = w.i;
      for (const h of String(w.said || w.heard || '').split(/\s+/)) if (h) cur.heard.push(h);
    } else if (w.kind === 'skip' && cur && words[k - 1]?.kind === 'wrong' && words[k + 1]?.kind === 'wrong') {
      cur.to = w.i;
    } else close();
  }
  close();
  return out;
}

/** Other ayahs (max 3) whose text contains heardWords contiguously; same surah first by distance, then by surah number. */
export function findSimilar(heardWords, at) {
  heardWords = Array.isArray(heardWords) ? heardWords.slice(0, 10) : [];
  const idx = getIndex();
  if (!idx || !Array.isArray(heardWords) || heardWords.length < 3) return [];
  const find = seq => {
    const needle = ' ' + seq.join(' ') + ' ';
    return idx.filter(([s, a, t]) => !(s === at.s && a === at.a) && t.includes(needle));
  };
  let hits = find(heardWords);
  for (let L = Math.min(heardWords.length - 1, 8); !hits.length && L >= 3; L--) {
    const seen = new Set();
    for (let st = 0; st + L <= heardWords.length; st++) {
      for (const h of find(heardWords.slice(st, st + L))) if (!seen.has(h)) { seen.add(h); hits.push(h); }
    }
  }
  hits.sort((x, y) => {
    const xs = x[0] === at.s, ys = y[0] === at.s;
    if (xs !== ys) return xs ? -1 : 1;
    if (xs) return Math.abs(x[1] - at.a) - Math.abs(y[1] - at.a) || x[1] - y[1];
    return x[0] - y[0] || x[1] - y[1];
  });
  return hits.slice(0, 3).map(([s, a]) => ({ s, a }));
}
