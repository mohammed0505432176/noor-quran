// Pure mistake analysis (no DOM). Aligns a transcript to expected Quran words to say what went wrong.
import { norm } from './arabic.js';
import { similarity } from './matcher.js';

const MAX_WORDS = 800;

function strip(w) {
  let r = w;
  if (r.length > 3 && (r[0] === 'و' || r[0] === 'ف')) r = r.slice(1);
  if (r.length > 4 && r.startsWith('ال')) r = r.slice(2);
  return r;
}

function close(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return similarity(a, b) >= 0.7 || similarity(strip(a), strip(b)) >= 0.7;
}

/** Explain what went wrong. states: 'ok'|'bad' per expected word; hinted: Set of indices shown as hints.
 *  kinds: ok | skip | wrong | hint | swap (words read in the wrong order); extras are inserted words. */
export function analyzeMistakes(expected, heard, states, hinted = new Set()) {
  const E = expected.map(norm);
  const T = norm(heard || '').split(' ').filter(Boolean);
  const n = E.length, m = T.length;
  const words = expected.map((_, i) => ({ i, kind: 'ok', heard: '' }));
  const extras = [];
  const aligned = new Array(n).fill(null); // transcript word (or '' for gap) per expected index

  if (n && m && n <= MAX_WORDS && m <= MAX_WORDS) {
    // Map distinct words to small ids, then compute each distinct pair's closeness once.
    const eId = new Map(), tId = new Map();
    const eWords = [], tWords = [];
    const ei = new Uint32Array(n), tj = new Uint32Array(m);
    for (let i = 0; i < n; i++) {
      let id = eId.get(E[i]);
      if (id === undefined) { id = eWords.length; eId.set(E[i], id); eWords.push(E[i]); }
      ei[i] = id;
    }
    for (let j = 0; j < m; j++) {
      let id = tId.get(T[j]);
      if (id === undefined) { id = tWords.length; tId.set(T[j], id); tWords.push(T[j]); }
      tj[j] = id;
    }
    const nt = tWords.length;
    const pair = new Int8Array(eWords.length * nt).fill(-1); // -1 unknown, 0 mismatch, 1 match
    const cost = new Uint8Array(n * m); // 0 = match, 1 = mismatch
    for (let i = 0; i < n; i++) {
      const base = ei[i] * nt;
      for (let j = 0; j < m; j++) {
        const k = base + tj[j];
        let v = pair[k];
        if (v < 0) { v = close(eWords[ei[i]], tWords[tj[j]]) ? 1 : 0; pair[k] = v; }
        cost[i * m + j] = v ? 0 : 1;
      }
    }
    const W = m + 1;
    const D = new Uint16Array((n + 1) * W);
    for (let i = 1; i <= n; i++) D[i * W] = i;
    for (let j = 1; j <= m; j++) D[j] = j;
    for (let i = 1; i <= n; i++) {
      const r = i * W, p = r - W, c = (i - 1) * m - 1;
      for (let j = 1; j <= m; j++) {
        let best = D[p + j - 1] + cost[c + j];
        const up = D[p + j] + 1; if (up < best) best = up;
        const left = D[r + j - 1] + 1; if (left < best) best = left;
        D[r + j] = best;
      }
    }
    let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && D[i * W + j] === D[(i - 1) * W + j - 1] + cost[(i - 1) * m + j - 1]) {
        aligned[i - 1] = T[j - 1]; i--; j--;
      } else if (i > 0 && D[i * W + j] === D[(i - 1) * W + j] + 1) {
        aligned[i - 1] = ''; i--;
      } else {
        const after = i - 1;
        let rep = false;
        for (let k = Math.max(0, after - 5); k <= Math.min(n - 1, after + 1); k++) {
          if (cost[k * m + j - 1] === 0) { rep = true; break; }
        }
        if (!rep) extras.push({ after, heard: T[j - 1] });
        j--;
      }
    }
    extras.reverse();
  }

  for (let i = 0; i < n; i++) {
    if (states[i] === 'ok') continue;
    if (hinted.has(i)) { words[i].kind = 'hint'; continue; }
    const h = aligned[i];
    if (!h) words[i].kind = 'skip';
    // said = the aligned transcript word (used to rebuild phrases); heard is only shown when it differs
    else { words[i].kind = 'wrong'; words[i].said = h; if (!close(E[i], h)) words[i].heard = h; }
  }
  // transposition, case 1: two neighbours substituted by each other (A B read as B A)
  for (let i = 0; i + 1 < n; i++) {
    if (words[i].kind !== 'wrong' || words[i + 1].kind !== 'wrong') continue;
    if (close(E[i], aligned[i + 1]) && close(E[i + 1], aligned[i])) {
      words[i].kind = words[i + 1].kind = 'swap';
      words[i].heard = words[i + 1].heard = '';
      i++;
    }
  }
  // transposition, case 2: a skipped word that shows up as an «extra» right next to its own place was read in the wrong order
  for (let i = 0; i < n; i++) {
    if (words[i].kind !== 'skip') continue;
    const k = extras.findIndex(x => Math.abs(x.after - i) <= 3 && close(E[i], x.heard));
    if (k >= 0) { words[i].kind = 'swap'; extras.splice(k, 1); }
  }
  return { words, extras };
}

/** Arabic name of a verdict kind (engine issue kinds + analyzeMistakes kinds), for the «what went wrong» sheet. */
export const MISTAKE_TYPE_AR = {
  skip: 'حذف', extra: 'إضافة', wrong: 'إبدال', vowel: 'تشكيل', repeat: 'تكرار', swap: 'تقديم وتأخير',
  hint: 'تلقين', peek: 'تلميح', unsure: 'غير واضحة'
};
