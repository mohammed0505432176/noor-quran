// Spaced-repetition scheduler for the hifz review, based on the open FSRS-4.5 algorithm (Free Spaced Repetition Scheduler,
// published formulas and default parameters). Pure functions, no DOM, no storage: store.js keeps the card fields.
//
// A card is a passage (surah + ayah range) with:
//   st  stability in days: how long until recall probability falls to 90 %
//   df  difficulty 1..10
//   rp  successful reviews, lp  lapses (forgotten), last  date of the last review (YYYY-MM-DD)
// Ratings: 1 forgot (Again), 2 hesitant (Hard), 3 good, 4 easy.
// Memorising the Quran is not a flashcard deck: forgetting costs more, so the target retention is 92 % and the longest gap
// between two reviews is capped at MAX_DAYS.

export const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const DESIRED_RETENTION = 0.92;
export const MAX_DAYS = 120;
export const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampD = d => clamp(d, 1, 10);

/** Probability of recalling the passage after `days` days, given stability `st`. R = 0.9 exactly when days == st. */
export const retrievability = (days, st) => (st > 0 ? Math.pow(1 + FACTOR * Math.max(0, days) / st, DECAY) : 0);

/** Days until recall probability falls to `retention`; at least 1, at most MAX_DAYS. */
export function nextInterval(st, retention = DESIRED_RETENTION) {
  const raw = (st / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_DAYS);
}

const initStability = g => Math.max(0.1, W[g - 1]);
const initDifficulty = g => clampD(W[4] - (g - 3) * W[5]);
const nextDifficulty = (d, g) => clampD(W[7] * initDifficulty(3) + (1 - W[7]) * (d - W[6] * (g - 3)));
const recallStability = (d, st, r, g) =>
  st * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(st, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === HARD ? W[15] : 1) * (g === EASY ? W[16] : 1));
const forgetStability = (d, st, r) => Math.max(0.1, Math.min(st, W[11] * Math.pow(d, -W[12]) * (Math.pow(st + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r))));

/** A card that has never been scheduled by FSRS (older Leitner cards are converted by fromBox). */
export const newCard = () => ({ st: 0, df: 0, rp: 0, lp: 0 });

/** Convert an old Leitner box (0..6) to a card, so nobody's review history is lost: box days become the stability. */
export function fromBox(box = 0, days = [0, 1, 3, 7, 14, 30, 60]) {
  const b = clamp(Math.round(box) || 0, 0, days.length - 1);
  return { st: Math.max(1, days[b]), df: 5, rp: b, lp: 0 };
}

/**
 * Review a card. elapsed = whole days since the last review (0 for a first review). rating 1..4.
 * Returns { card, interval, r }: the new card fields, days until the next review, and the recall probability before it.
 */
export function review(card, rating, elapsed = 0, retention = DESIRED_RETENTION) {
  const g = clamp(Math.round(rating) || AGAIN, AGAIN, EASY);
  const first = !(card && card.st > 0);
  let st, df, rp = (card && card.rp) || 0, lp = (card && card.lp) || 0, r = 0;
  if (first) {
    st = initStability(g); df = initDifficulty(g);
  } else {
    r = retrievability(elapsed, card.st);
    df = nextDifficulty(card.df || 5, g);
    st = g === AGAIN ? forgetStability(card.df || 5, card.st, r) : recallStability(card.df || 5, card.st, r, g);
  }
  if (g === AGAIN) lp++; else rp++;
  // a forgotten passage always comes back the next day, whatever the new stability says
  const interval = g === AGAIN ? 1 : nextInterval(st, retention);
  return { card: { st: +st.toFixed(4), df: +df.toFixed(4), rp, lp }, interval, r };
}
