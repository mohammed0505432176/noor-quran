// Pure recitation matcher (no DOM). Aligns a growing speech transcript to expected Quran words.
import { norm } from './arabic.js';

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity ratio 0..1 based on Levenshtein distance. */
export function similarity(a, b) {
  const m = Math.max(a.length, b.length);
  return m ? 1 - levenshtein(a, b) / m : 1;
}

function strip(w) {
  let r = w;
  if (r.length > 3 && (r[0] === 'و' || r[0] === 'ف')) r = r.slice(1);
  if (r.length > 4 && r.startsWith('ال')) r = r.slice(2);
  return r;
}

function similar(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const sa = strip(a), sb = strip(b);
  if (sa === sb) return true;
  if (Math.min(a.length, b.length) <= 2) return false;
  const long = Math.max(a.length, b.length) >= 6;
  const th = long ? 0.6 : 0.7;
  return similarity(a, b) >= th || (sa.length > 2 && sb.length > 2 && similarity(sa, sb) >= th);
}

export function createMatcher(expectedWords) {
  const display = expectedWords.slice();
  const E = display.map(w => norm(w));
  const n = E.length;
  let states = new Array(n).fill('pending');
  let pointer = 0;

  const accOf = () => (n ? Math.round(100 * states.filter(s => s === 'ok').length / n) : 0);

  function update(transcriptText) {
    const T = norm(transcriptText || '').split(' ').filter(Boolean);
    const st = new Array(n).fill('pending');
    let p = 0;
    for (let j = 0; j < T.length && p < n; j++) {
      const t = T[j];
      if (similar(E[p], t)) { st[p++] = 'ok'; continue; }
      // noise / repetition: the expected word shows up again within the next 3 transcript words
      let noise = false;
      for (let d = 1; d <= 3 && j + d < T.length; d++) if (similar(E[p], T[j + d])) { noise = true; break; }
      if (noise) continue;
      // skipped word(s): current transcript word matches expected p+1 or p+2
      for (let k = 1; k <= 2 && p + k < n; k++) {
        if (similar(E[p + k], t)) {
          for (let q = p; q < p + k; q++) st[q] = 'bad';
          st[p + k] = 'ok';
          p += k + 1;
          break;
        }
      }
      // otherwise: filler/unrelated word, ignore
    }
    states = st; pointer = p;
    return { states: states.slice(), pointer, acc: accOf() };
  }

  function finish() {
    states = states.map(s => (s === 'ok' ? 'ok' : 'bad'));
    pointer = n;
    return { states: states.slice(), acc: accOf(), missed: display.filter((_, i) => states[i] === 'bad') };
  }

  return { update, finish };
}
