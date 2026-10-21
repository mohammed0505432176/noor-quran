// Full Quran text (Uthmani, 114 surahs, 6236 ayahs) bundled offline in /public/quran.json.
// Format of each surah: { n: name, t: 'm'|'d' (Meccan/Medinan), v: [ayah texts...] }
import { norm } from './arabic.js';

let Q = null, loading = null, index = null;
export const SURAH_COUNT = 114;

export function loadQuran() {
  if (Q) return Promise.resolve(Q);
  return (loading ||= fetch(import.meta.env.BASE_URL + 'quran.json').then(r => r.json()).then(d => (Q = d)));
}
export const isLoaded = () => !!Q;

/** 1-based surah. Requires loadQuran() first. */
export function surah(s) { return Q[s - 1]; }
export function ayah(s, a) { return Q[s - 1].v[a - 1]; }
export const surahName = s => Q ? Q[s - 1].n : '';
export const ayahCount = s => Q[s - 1].v.length;
export const typeName = s => Q[s - 1].t === 'm' ? 'مكية' : 'مدنية';

/** Global ayah number 1..6236 (used by audio CDNs). */
export function globalAyah(s, a) {
  let g = 0; for (let i = 0; i < s - 1; i++) g += Q[i].v.length; return g + a;
}

/** Search ayahs by normalized text. Returns up to `limit` results [{s,a,text}]. */
export function search(query, limit = 60) {
  const q = norm(query); if (q.length < 2) return [];
  if (!index) { index = []; Q.forEach((su, i) => su.v.forEach((t, j) => index.push([i + 1, j + 1, norm(t)]))); }
  const out = [];
  for (const [s, a, n] of index) { if (n.includes(q)) { out.push({ s, a, text: Q[s - 1].v[a - 1] }); if (out.length >= limit) break; } }
  return out;
}

// Juz (part) start positions [surah, ayah], index 0 = juz 1.
export const JUZ = [[1,1],[2,142],[2,253],[3,93],[4,24],[4,148],[5,82],[6,111],[7,88],[8,41],[9,93],[11,6],[12,53],[15,1],[17,1],[18,75],[21,1],[23,1],[25,21],[27,56],[29,46],[33,31],[36,28],[39,32],[41,47],[46,1],[51,31],[58,1],[67,1],[78,1]];
export function juzOf(s, a) {
  let j = 0; for (let i = 0; i < 30; i++) { const [js, ja] = JUZ[i]; if (s > js || (s === js && a >= ja)) j = i; } return j + 1;
}
