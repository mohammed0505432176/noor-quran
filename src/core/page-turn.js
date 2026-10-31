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
