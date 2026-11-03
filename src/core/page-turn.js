// Page turn of the free recitation (views/recite.js). The next page follows at the end of the shown one: a stray word of
// the next page never turns it early, the reciter's last word on the page is what counts, and jittery verdicts never make
// the page flip back and forth. The reader can always turn the pages by hand; while they do, the reciter's place waits.

/** Audio the reciter may stay on the page's last word without a verdict before the page counts as reached (3 s at 16 kHz). */
export const HOLD_SAMPLES = 16000 * 3;

/**
 * Has the reciter reached the last printed word of the shown page?
 *  lastJ: index of the last judged unit on the page (-1: none); lastWordIdx: index of the page's last word (not an ayah
 *  mark; -1: no words); curI: the unit being recited now (-1: none); samplesHeld: audio since the frontier last moved.
 * The last word is reached when it is judged. When the reciter is still on it, the page counts as reached once the
 * reciter has held it for HOLD_SAMPLES of audio: the last word is only judged with the right context that follows it.
 */
export function pageEndReached({ lastJ = -1, lastWordIdx = -1, curI = -1, samplesHeld = 0 } = {}) {
  if (lastWordIdx < 0) return true;
  if (lastJ >= lastWordIdx) return true;
  return curI === lastWordIdx && samplesHeld >= HOLD_SAMPLES;
}

/**
 * What to do with the page the reciter is on (target) while `shown` is on screen.
 *  'stay': nothing; 'wait': remember the target, turn when the shown page ends; 'turn': show the target now.
 *  manual: the reader turned the pages by hand and is not back on the reciter's page yet; auto: the setting.
 */
export function pageAction({ shown, target, ended = false, manual = false, auto = true }) {
  if (target === shown || manual || !auto) return 'stay';
  if (target < shown) return 'turn';                // the reciter is on an earlier page: follow it back
  return ended ? 'turn' : 'wait';                    // the next page: only once the shown page is done
}

// ---- pure decisions of the recitation screen (views/recite.js): hints, position marker, error mode, position guard ----

/** Minimum gap between two automatic page turns (ms): repeated recogniser results never turn the page twice. */
export const TURN_GAP_MS = 1500;
export const turnCooldownOk = (now, lastTurnAt = 0, gap = TURN_GAP_MS) => !lastTurnAt || now - lastTurnAt >= gap;

/**
 * Which words does a hint reveal? Only inside the chosen range / locked surah, only words not yet recited.
 *  isPending(i): is unit i still unread (and a real word, not an ayah mark)? groups: [{ start, end, s?, a }] (end exclusive).
 *  kind 'word' -> the next pending word; 'ayah' -> every pending word of the ayah the next pending word belongs to.
 *  lock: surah number the session is bound to (free mode), null for none. Returns { indices, group } (indices may be []).
 */
export function planHint({ isPending, groups = [], kind = 'word', lock = null, from = 0 } = {}) {
  const inLock = g => lock == null || g.s == null || g.s === lock;
  for (const g of groups) {
    if (!inLock(g)) continue;
    for (let i = Math.max(g.start, from); i < g.end; i++) {
      if (!isPending(i)) continue;
      if (kind === 'word') return { indices: [i], group: g };
      const out = [];
      for (let k = g.start; k < g.end; k++) if (isPending(k)) out.push(k);
      return { indices: out, group: g };
    }
  }
  return { indices: [], group: null };
}

/**
 * Where to put the position marker. A confident place marks the next word; an unsure one (the last judged word is only
 * «unsure», or there is no next word in the ayah yet) marks the whole ayah and says the place is being located.
 *  lastState: verdict of the last judged word ('ok'|'unsure'|'wrong'|null); ayahRange: { start, end } of its ayah.
 * Returns { level: 'word'|'ayah'|'none', index, range, locating }.
 */
export function markerPlan({ curI = -1, lastState = null, ayahRange = null, enabled = true } = {}) {
  if (!enabled) return { level: 'none', index: -1, range: null, locating: false };
  if (lastState === 'unsure' && ayahRange) return { level: 'ayah', index: -1, range: ayahRange, locating: true };
  if (curI >= 0) return { level: 'word', index: curI, range: null, locating: false };
  if (ayahRange) return { level: 'ayah', index: -1, range: ayahRange, locating: true };
  return { level: 'none', index: -1, range: null, locating: false };
}

/**
 * What an error does under the chosen behaviour. Only a CONFIRMED error may stop the session; unclear recognition
 * (amber / «possible» doubts) is never allowed to block, it is shown softly and counted as unsure.
 *  mode: 'stop' | 'continue'; certainty: 'confirmed' | 'unclear'.
 */
export function errorAction({ mode = 'continue', certainty = 'unclear' } = {}) {
  if (certainty !== 'confirmed') return { stop: false, record: false, note: true };
  return { stop: mode === 'stop', record: true, note: false };
}
/** An engine issue kind is a confirmed error only when it is a plain verdict-level miss, never a «possible»/«unclear» doubt. */
export const issueCertainty = issueKind => (/^(possible_|unclear_)/.test(String(issueKind || '')) ? 'unclear' : 'confirmed');
export const normErrorMode = v => (v === 'stop' ? 'stop' : 'continue');

/**
 * Does a reported position belong to this session? The session never jumps to another surah because an ayah there sounds
 * similar: only the natural continuation (first ayah of the next surah after the last ayah of the current one) or an
 * explicit re-lock may change surah. A fixed range (lockRange) never leaves its range.
 */
export function acceptPosition({ cur = null, next, relock = false, lastAyahOf = () => 0, lockRange = null } = {}) {
  if (!next || !(next.s >= 1) || !(next.a >= 1)) return false;
  if (lockRange) return next.s === lockRange.s && next.a >= lockRange.from && next.a <= lockRange.to;
  if (!cur || relock) return true;
  if (next.s === cur.s) return true;
  return next.s === cur.s + 1 && next.a <= 2 && cur.a >= lastAyahOf(cur.s);
}

/** Inside one surah an ayah further than NEAR_AYAHS away (one back) is only believed after FAR_CONFIRM consecutive reports of it:
 *  a common word or a repeated phrase seen once never moves the place. Surah changes stay with acceptPosition. */
export const NEAR_AYAHS = 3, NEAR_BACK = 1, FAR_CONFIRM = 3;
export function createPositionGuard({ near = NEAR_AYAHS, back = NEAR_BACK, confirm = FAR_CONFIRM } = {}) {
  let pend = null, n = 0;
  const reset = () => { pend = null; n = 0; };
  return {
    reset,
    /** same arguments as acceptPosition. -> { ok, pending }: pending = a far jump waiting for confirmation */
    check(args = {}) {
      if (!acceptPosition(args)) { reset(); return { ok: false, pending: false }; }
      const { cur, next, relock, lockRange } = args;
      if (!cur || relock || lockRange || next.s !== cur.s) { reset(); return { ok: true, pending: false }; }
      const d = next.a - cur.a;
      if (d <= near && d >= -back) { reset(); return { ok: true, pending: false }; }
      const key = next.s + ':' + next.a;
      if (pend === key) n++; else { pend = key; n = 1; }
      if (n >= confirm) { reset(); return { ok: true, pending: false }; }
      return { ok: false, pending: true };
    }
  };
}
