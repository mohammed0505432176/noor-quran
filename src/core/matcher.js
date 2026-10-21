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

// ---- opener stripping (isti'adha / basmala) ----
const noAl = w => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w);
function isW(w, ref) {
  const a = noAl(w), b = noAl(ref);
  if (a === b) return true;
  return b.length >= 4 && similarity(a, b) >= 0.75;
}

/** Length of an isti'adha at words[i] (0 if none): اعوذ بالله [من] [الشيطان] [الرجيم]. */
function istiadhaLen(W, i) {
  if (!(W[i] && isW(W[i], 'اعوذ') && W[i + 1] && isW(W[i + 1], 'بالله'))) return 0;
  let j = i + 2;
  if (W[j] === 'من') j++;
  if (W[j] && isW(W[j], 'شيطن')) j++;
  if (W[j] && isW(W[j], 'رجيم')) j++;
  return j - i;
}
/** Length of a basmala at words[i] (0 if none): بسم الله [الرحمن] [الرحيم]. */
function basmalaLen(W, i) {
  if (!(W[i] === 'بسم' && W[i + 1] && isW(W[i + 1], 'الله'))) return 0;
  let j = i + 2;
  if (W[j] && isW(W[j], 'رحمن')) j++;
  if (W[j] && isW(W[j], 'رحيم')) j++;
  return j - i;
}

/**
 * Remove isti'adha / basmala openers (repeated, any order) from the START of a transcript.
 * keepBasmala: keep one basmala (passage starts at 1:1). Returns normalized text.
 */
export function stripOpeners(text, keepBasmala = false) {
  const W = norm(text || '').split(' ').filter(Boolean);
  let i = 0, kept = null;
  while (i < W.length) {
    const a = istiadhaLen(W, i);
    if (a) { i += a; continue; }
    const b = basmalaLen(W, i);
    if (b) { if (keepBasmala && !kept) kept = W.slice(i, i + b); i += b; continue; }
    break;
  }
  return (kept || []).concat(W.slice(i)).join(' ');
}

export function createMatcher(expectedWords) {
  const display = expectedWords.slice();
  const E = display.map(w => norm(w));
  const n = E.length;
  let states = new Array(n).fill('pending');
  let pointer = 0;

  const accOf = () => (n ? Math.round(100 * states.filter(s => s === 'ok').length / n) : 0);

  /** Pure alignment of a transcript against the expected words (does not touch matcher state). */
  function align(transcriptText) {
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
      const maxSkip = t.length >= 3 ? 4 : 2;
      for (let k = 1; k <= maxSkip && p + k < n; k++) {
        if (similar(E[p + k], t)) {
          for (let q = p; q < p + k; q++) st[q] = 'bad';
          st[p + k] = 'ok';
          p += k + 1;
          break;
        }
      }
      // otherwise: filler/unrelated word, ignore
    }
    return { st, p };
  }

  function update(transcriptText) {
    const { st, p } = align(transcriptText);
    states = st; pointer = p;
    return { states: states.slice(), pointer, acc: accOf() };
  }

  /** Score a candidate transcript without committing it: higher = better fit (used to pick ASR alternatives). */
  function peek(transcriptText) {
    const { st, p } = align(transcriptText);
    let ok = 0;
    for (const x of st) if (x === 'ok') ok++;
    return { ok, pointer: p, score: ok * 2 - (p - ok) };
  }

  function finish() {
    states = states.map(s => (s === 'ok' ? 'ok' : 'bad'));
    pointer = n;
    return { states: states.slice(), acc: accOf(), missed: display.filter((_, i) => states[i] === 'bad') };
  }

  return { update, peek, finish };
}

/**
 * Stabilises live (interim) matcher results so revised hypotheses never "un-write" confirmed words.
 *   const tr = createLockedTracker(n, { confirm: 2 });
 *   tr.apply(matcherStates, { final }) -> { states, pointer, acc }
 * - 'ok' is shown immediately; once ok for >= confirm consecutive updates (or in a final result) it is locked.
 * - 'bad' is only shown after >= confirm consecutive updates (or in a final result), so transient interim
 *   garbage never flashes red. A shown 'bad' may still be upgraded to 'ok' later.
 */
export function createLockedTracker(n, { confirm = 2 } = {}) {
  const lockedOk = new Array(n).fill(false);
  const shownBad = new Array(n).fill(false);
  const okRun = new Array(n).fill(0), badRun = new Array(n).fill(0);
  let last = new Array(n).fill('pending');

  function apply(states, { final = false } = {}) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const s = states[i];
      if (s === 'ok') { okRun[i]++; badRun[i] = 0; }
      else if (s === 'bad') { badRun[i]++; okRun[i] = 0; }
      else { okRun[i] = 0; badRun[i] = 0; }
      if (s === 'ok' && (final || okRun[i] >= confirm)) lockedOk[i] = true;
      if (s === 'bad' && (final || badRun[i] >= confirm)) shownBad[i] = true;
      if (lockedOk[i] || s === 'ok') out[i] = 'ok';
      else if (shownBad[i]) out[i] = 'bad';
      else out[i] = 'pending';
    }
    last = out;
    let pointer = 0, ok = 0;
    out.forEach((x, i) => { if (x !== 'pending') pointer = i + 1; if (x === 'ok') ok++; });
    return { states: out.slice(), pointer, acc: n ? Math.round(100 * ok / n) : 0 };
  }

  return { apply, get states() { return last.slice(); }, isLocked: i => lockedOk[i] };
}
