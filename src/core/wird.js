// Daily wird (reading plan): finish the Mushaf in N days, or read a fixed number of pages a day. Pure functions: no DOM, no
// storage. store.js keeps { plan, log } and the views call these with the dates they have.
//   plan: { kind: 'khatma' | 'pages', days, perDay, start: 'YYYY-MM-DD', startPage }
//   log:  { 'YYYY-MM-DD': [page, ...] }   pages read that day (page 1..604)
// A planned page counts as done when it was read on its day or before it: reading ahead is never wasted, and a page read late
// is still read (it just does not keep that day's streak).
export const PAGES = 604;
export const KHATMA_CHOICES = [30, 60, 90, 180, 365];

const dnum = k => Math.round(new Date(k + 'T12:00:00').getTime() / 864e5);
const wrap = p => ((p - 1) % PAGES + PAGES) % PAGES + 1;

/** Plan factory. khatma: all 604 pages in `days` days. pages: `perDay` pages a day until the end of the Mushaf. */
export function makePlan({ kind = 'khatma', days = 30, perDay = 5, start, startPage = 1 } = {}) {
  const sp = wrap(startPage);
  if (kind === 'pages') {
    const pd = Math.min(PAGES, Math.max(1, Math.round(perDay) || 1));
    return { kind: 'pages', days: Math.ceil(PAGES / pd), perDay: pd, start, startPage: sp };
  }
  const d = Math.min(PAGES, Math.max(1, Math.round(days) || 30));
  return { kind: 'khatma', days: d, perDay: Math.ceil(PAGES / d), start, startPage: sp };
}

export const dayIndex = (plan, key) => dnum(key) - dnum(plan.start);

/** Pages planned for day index i (0-based), in reading order starting at plan.startPage (wraps after page 604). */
export function pagesFor(plan, i) {
  if (!plan || i < 0 || i >= plan.days) return [];
  const lo = plan.kind === 'pages' ? i * plan.perDay : Math.floor(i * PAGES / plan.days);
  const hi = plan.kind === 'pages' ? Math.min(PAGES, (i + 1) * plan.perDay) : Math.floor((i + 1) * PAGES / plan.days);
  const out = [];
  for (let o = lo; o < hi; o++) out.push(wrap(plan.startPage + o));
  return out;
}

const readBy = (log, key) => {
  // pages read on or before `key`
  const out = new Set();
  for (const [k, ps] of Object.entries(log || {})) if (k <= key) for (const p of ps) out.add(p);
  return out;
};

/**
 * Where the reader stands on `key`:
 *  { idx, finished, today: [pages], todayDone, todayLeft: [pages], owed: [pages], streak, total, readCount }
 * owed = pages planned for earlier days that are still unread (the catch-up); streak = consecutive days (ending today when
 * today is complete, else yesterday) whose whole portion was read on time.
 */
export function status(plan, log, key) {
  if (!plan) return null;
  const idx = dayIndex(plan, key);
  const finished = idx >= plan.days;
  const upto = Math.min(idx, plan.days - 1);
  const have = readBy(log, key);
  const today = idx >= 0 && !finished ? pagesFor(plan, idx) : [];
  const todayLeft = today.filter(p => !have.has(p));
  const owed = [];
  for (let i = 0; i < Math.min(Math.max(idx, 0), plan.days); i++) for (const p of pagesFor(plan, i)) if (!have.has(p)) owed.push(p);
  // streak: a day is on time when all its pages were read on or before that day
  const onTime = i => { const k = shiftKey(plan.start, i); const h = readBy(log, k); return pagesFor(plan, i).every(p => h.has(p)); };
  let streak = 0, i = Math.min(idx, plan.days - 1);
  if (i >= 0 && !(idx < plan.days && onTime(i))) i--;
  for (; i >= 0 && onTime(i); i--) streak++;
  let readCount = 0;
  for (let p = 1; p <= PAGES; p++) if (have.has(p)) readCount++;
  return { idx, finished, today, todayDone: today.length > 0 && todayLeft.length === 0, todayLeft, owed, streak, total: PAGES, readCount };
}

function shiftKey(startKey, n) {
  const d = new Date(startKey + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** The first page the reader should open: the first owed page, else the first unread page of today, else null. */
export function nextPage(st) {
  if (!st) return null;
  return st.owed.length ? st.owed[0] : st.todayLeft.length ? st.todayLeft[0] : null;
}

/** Add a page to a day's log (no duplicates, valid pages only). Returns the log (same object). */
export function logPage(log, key, page) {
  const p = Math.trunc(Number(page));
  if (!(p >= 1 && p <= PAGES)) return log;
  const a = (log[key] ||= []);
  if (!a.includes(p)) a.push(p);
  return log;
}
