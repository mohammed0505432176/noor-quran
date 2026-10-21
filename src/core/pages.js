// Mushaf page, rub' (quarter) and juz/hizb helpers over the Madani 604-page layout (pure, no DOM).
// Uses PAGE_STARTS / QUARTER_STARTS / AYAH_COUNTS from mushaf-data.js and juzOf from quran.js.
import { PAGE_STARTS, QUARTER_STARTS, AYAH_COUNTS } from './mushaf-data.js';
import { juzOf } from './quran.js';

export const PAGE_COUNT = 604;

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const toArabicDigits = n => String(n).replace(/[0-9]/g, d => AR_DIGITS[d]);

// Lexicographic compare of [s,a] positions: <0, 0, >0.
const cmp = (s1, a1, s2, a2) => (s1 - s2) || (a1 - a2);

// Largest index i in [0, starts.length-2] (sentinel excluded) with starts[i] <= (s,a); returns i+1 (1-based).
function floorIndex(starts, s, a) {
  let lo = 0, hi = starts.length - 2, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(starts[mid][0], starts[mid][1], s, a) <= 0) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return ans + 1;
}

export function pageOf(s, a) {
  return floorIndex(PAGE_STARTS, s, a);
}

const cp = p => Math.min(PAGE_COUNT, Math.max(1, Math.trunc(Number(p)) || 1));

export function pageFirst(p) {
  p = cp(p);
  const [s, a] = PAGE_STARTS[p - 1];
  return { s, a };
}

// Ayah segments on page p, in reading order: [{ s, from, to }].
export function pageContent(p) {
  p = cp(p);
  const [s0, a0] = PAGE_STARTS[p - 1];
  const [sEnd, aEnd] = PAGE_STARTS[p];
  const out = [];
  let s = s0, a = a0;
  while (true) {
    if (s === sEnd) {
      if (aEnd > a) out.push({ s, from: a, to: aEnd - 1 });
      break;
    }
    out.push({ s, from: a, to: AYAH_COUNTS[s - 1] });
    s++;
    a = 1;
  }
  return out;
}

export const side = p => (cp(p) % 2 === 1 ? 'right' : 'left');

export function quarterOf(s, a) {
  return floorIndex(QUARTER_STARTS, s, a);
}

export function quarterStartsOn(p) {
  p = cp(p);
  const out = [];
  for (let q = 1; q <= QUARTER_STARTS.length - 1; q++) {
    const [s, a] = QUARTER_STARTS[q - 1];
    if (pageOf(s, a) === p) out.push({ s, a, q });
  }
  return out;
}

export function hizbLabel(q) {
  const n = toArabicDigits(Math.ceil(q / 4));
  switch (q % 4) {
    case 1: return `الحزب ${n}`;
    case 2: return `ربع الحزب ${n}`;
    case 3: return `نصف الحزب ${n}`;
    default: return `ثلاثة أرباع الحزب ${n}`;
  }
}

export function juzOfPage(p) {
  p = cp(p);
  const { s, a } = pageFirst(p);
  return juzOf(s, a);
}

export function surahStartsOn(p) {
  p = cp(p);
  const out = [];
  for (let s = 1; s <= 114; s++) if (pageOf(s, 1) === p) out.push(s);
  return out;
}
