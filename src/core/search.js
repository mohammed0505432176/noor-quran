// Quran text search. Arabic is compared by its skeleton (arabic.js skel): tashkeel, Quranic marks and alif letters are
// ignored, so «الله نور السماوات والأرض» finds 24:35. A multi-word query first matches the phrase; only when no ayah has the
// phrase, the ayahs that contain every query word (as whole words) are returned, and the caller says which kind they are.
import { skel } from './arabic.js';

/** Index of the verses: [{ s, a, n (skeleton), words (Set of the skeleton words) }]. */
export function buildIndex(verses) {
  const out = [];
  verses.forEach((su, i) => su.v.forEach((t, j) => {
    const n = skel(t);
    out.push({ s: i + 1, a: j + 1, n, words: new Set(n.split(' ')) });
  }));
  return out;
}

/** -> { results: [{ s, a, text }], mode: 'phrase' | 'words' | 'none' } */
export function searchQuran(index, query, verses, limit = 60) {
  const q = skel(query);
  if (q.replace(/ /g, '').length < 2) return { results: [], mode: 'none' };
  const text = e => (verses ? verses[e.s - 1].v[e.a - 1] : undefined);
  const phrase = [];
  for (const e of index) {
    if (e.n.includes(q)) { phrase.push({ s: e.s, a: e.a, text: text(e) }); if (phrase.length >= limit) break; }
  }
  if (phrase.length || !q.includes(' ')) return { results: phrase, mode: phrase.length ? 'phrase' : 'none' };
  const qw = q.split(' ').filter(w => w.length >= 2);
  if (qw.length < 2) return { results: [], mode: 'none' };
  const all = [];
  for (const e of index) {
    if (qw.every(w => e.words.has(w))) { all.push({ s: e.s, a: e.a, text: text(e) }); if (all.length >= limit) break; }
  }
  return { results: all, mode: all.length ? 'words' : 'none' };
}