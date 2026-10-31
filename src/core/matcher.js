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

// the lam of ال assimilates into a following lam: الله is recognised as لله (and the reverse)
const assim = w => w.replace(/^ال(?=ل)/, 'ل');
function similar(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  a = assim(a); b = assim(b);
  if (a === b) return true;
  const sa = strip(a), sb = strip(b);
  if (sa === sb) return true;
  if (Math.min(a.length, b.length) <= 2) return false;
  // a recognised word must be the expected one with at most a letter or two off in longer words: 'الرحمن' is not 'الرحيم'
  // (a 0.6 similarity used to accept it as a correct word); three-letter words must match exactly
  const th = Math.max(a.length, b.length) >= 4 ? 0.8 : 1;
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

const LOOK = 3;          // a decision at transcript word j may look at T[j+1..j+LOOK]
const RECENT = 6;        // repeated recent words (user re-reciting to correct himself) are ignored
const FAR = 30;          // a forgotten passage of up to FAR words can be jumped over

export function createMatcher(expectedWords) {
  const display = expectedWords.slice();
  const E = display.map(w => norm(w));
  const n = E.length;
  let states = new Array(n).fill('pending');
  let pointer = 0;

  // memoised word similarity (the same pairs are compared again and again on every partial result)
  const memo = new Map();
  const sim = (a, b) => {
    const k = a + '|' + b;
    let v = memo.get(k);
    if (v === undefined) { if (memo.size > 50000) memo.clear(); v = similar(a, b); memo.set(k, v); }
    return v;
  };
  const simJoin = (e, a, b) => { const j = a + b; return j.length >= 3 && similarity(e, j) >= 0.8; };

  /**
   * One alignment step for transcript word T[j]. Mutates st, records every write in undo, returns new
   * {p, eat}. eat = 1 means the next transcript word was already consumed (a word split in two).
   */
  function step(T, j, st, p, undo) {
    const set = (q, v) => { if (st[q] !== v) { undo.push(q, st[q]); st[q] = v; } };
    const t = T[j];
    if (sim(E[p], t)) { set(p, 'ok'); return { p: p + 1, eat: 0 }; }
    // the recognizer split one Quran word in two («يا ايها» → يايها)
    if (j + 1 < T.length && t.length <= 4 && simJoin(E[p], t, T[j + 1])) { set(p, 'ok'); return { p: p + 1, eat: 1 }; }
    // or merged two Quran words into one («بسمالله»)
    if (p + 1 < n && t.length >= 4 && !sim(E[p + 1], t) && similarity(E[p] + E[p + 1], t) >= 0.8) { set(p, 'ok'); set(p + 1, 'ok'); return { p: p + 2, eat: 0 }; }
    // noise / stutter: the expected word shows up within the next LOOK transcript words
    for (let d = 1; d <= LOOK && j + d < T.length; d++) if (sim(E[p], T[j + d])) return { p, eat: 0 };
    // repetition of what was just recited (going back to correct oneself): ignore, but upgrade a red word
    for (let q = p - 1; q >= 0 && q >= p - RECENT; q--) {
      if (sim(E[q], t)) { if (st[q] === 'bad' && q >= p - 3) set(q, 'ok'); return { p, eat: 0 }; }
    }
    // skipped / forgotten words: t matches a word further ahead. Prefer the nearest place that the following
    // transcript word(s) confirm (so a repeated phrase like «ولم» lands on the right ayah); without
    // confirmation only a short skip is accepted.
    const maxSkip = t.length >= 3 ? 4 : 2;
    const confirmed = k => {
      const need = k > 12 ? 2 : 1;
      for (let d = 1; d <= need; d++) {
        if (!(j + d < T.length && p + k + d < n && sim(E[p + k + d], T[j + d]))) return false;
      }
      return true;
    };
    let pick = 0, fallback = 0;
    const far = t.length >= 3 ? FAR : maxSkip;
    for (let k = 1; k <= far && p + k < n; k++) {
      if (!sim(E[p + k], t)) continue;
      if (confirmed(k)) { pick = k; break; }
      if (!fallback && k <= maxSkip) fallback = k;
    }
    // an unconfirmed short skip is only trusted when there is nothing after t to confirm with yet
    // or the next word does not match anything nearby (a genuine skip followed by a slip)
    if (!pick && fallback) pick = fallback;
    if (pick) {
      for (let q = p; q < p + pick; q++) set(q, 'bad');
      set(p + pick, 'ok');
      return { p: p + pick + 1, eat: 0 };
    }
    return { p, eat: 0 };   // filler / unrelated word
  }

  // Incremental cache: the transcript only grows at its end on most updates, so alignment resumes from
  // just before the first changed word instead of re-scanning the whole passage every partial result.
  let cache = { T: [], st: new Array(n).fill('pending'), p: 0, eat: 0, cp: [], ce: [], undo: [] };

  function align(transcriptText, commit) {
    const T = norm(transcriptText || '').split(' ').filter(Boolean);
    const C = cache;
    let lcp = 0;
    while (lcp < T.length && lcp < C.T.length && T[lcp] === C.T[lcp]) lcp++;
    const done = C.cp.length;                         // steps processed last time
    const start = Math.min(Math.max(0, lcp - LOOK - 1), done);
    const st = commit ? C.st : C.st.slice();
    for (let j = done - 1; j >= start; j--) {         // roll back steps start..done-1
      const u = C.undo[j];
      for (let x = u.length - 2; x >= 0; x -= 2) st[u[x]] = u[x + 1];
    }
    let p = start < done ? C.cp[start] : C.p, eat = start < done ? C.ce[start] : C.eat;
    const cp = C.cp.slice(0, start), ce = C.ce.slice(0, start), undoL = C.undo.slice(0, start);
    for (let j = start; j < T.length && p < n; j++) {
      cp.push(p); ce.push(eat);
      const undo = [];
      undoL.push(undo);
      if (eat) { eat = 0; continue; }
      const r = step(T, j, st, p, undo);
      p = r.p; eat = r.eat;
    }
    if (commit) cache = { T, st, p, eat, cp, ce, undo: undoL };
    return { st, p };
  }

  function update(transcriptText) {
    const { st, p } = align(transcriptText, true);
    states = st.slice(); pointer = p;
    return { states: states.slice(), pointer, acc: accOf() };
  }

  /** Score a candidate transcript without committing it: higher = better fit (used to pick ASR alternatives). */
  function peek(transcriptText) {
    const { st, p } = align(transcriptText, false);
    let ok = 0;
    for (const x of st) if (x === 'ok') ok++;
    return { ok, pointer: p, score: ok * 2 - (p - ok) };
  }

  const accOf = () => (n ? Math.round(100 * states.filter(s => s === 'ok').length / n) : 0);

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
