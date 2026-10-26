// Central app state. Single source of truth, persisted to localStorage.
// CONTRACT: other modules import { S, save, on, emit, ... } from './store.js'.
// Ayah keys are always `${s}:${a}` with 1-based surah (1..114) and ayah numbers.

import { pageOf, pageContent, PAGE_COUNT } from './pages.js';

const KEY = 'noor.v1';

const DEFAULTS = () => ({
  v: 1,
  profile: { name: '' },
  settings: {
    goal: 10,                    // ayahs per day
    reciter: 'Alafasy_128kbps',  // everyayah.com folder id
    fontSize: 30,                // mushaf font size px
    theme: 'dark',               // 'auto' | 'dark' | 'light'
    ai: { provider: 'auto', chosen: false, baseUrl: '', apiKey: '', model: '' }, // 'auto' (family backend) | 'free' | 'custom' (OpenAI-compatible, e.g. OmniRoute)
    prayer: { method: 'UmmAlQura', madhab: 'shafi', notify: true, adhan: 'full', adhanOn: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }, preOn: false, preAlert: 10, lat: null, lng: null, city: '' }
  },
  pts: 0,
  days: {},        // 'YYYY-MM-DD' -> { a: ayahsRead, r: recitations, z: azkarDone }
  read: {},        // 's:a' -> 'YYYY-MM-DD' first time read
  last: null,      // { s, a } last reading position
  bookmarks: [],   // [{ s, a, at }]
  rec: [],         // recitation history [{ d, s, from, to, acc, miss: [words] }] newest first
  reviews: [],     // spaced repetition [{ id, s, from, to, box, due, added, last }]
  hifz: { pages: {} }, // memorization tracker: pages[p] = { lvl 0..3, at 'YYYY-MM-DD', n, m? first-memorized date }
  goals: [],       // [{ id, type:'memorize'|'review'|'recite', unit:'page'|'ayah'|'minute', target, period:'day'|'week', created }]
  wm: {},          // per-word recitation history 's:a:w' -> { n, k, d, ok } (w 1-based within ayah)
  tasbeeh: 0,
  badges: {}       // badgeId -> 'YYYY-MM-DD' unlocked
});

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.v === 1) return deepMerge(DEFAULTS(), raw);
  } catch (e) { /* ignore */ }
  return DEFAULTS();
}
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function deepMerge(base, over) {
  for (const k of Object.keys(over)) {
    if (BAD_KEYS.has(k)) continue;           // no prototype pollution from stored / imported data
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) base[k] = deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

export const S = load();
// Migration: old default 'free' (never explicitly chosen) becomes 'auto'.
if (S.settings && S.settings.ai && S.settings.ai.provider === 'free' && !S.settings.ai.chosen) S.settings.ai.provider = 'auto';

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ }
  emit('change');
}

// ---- tiny event bus ----
const subs = {};
export function on(evt, fn) { (subs[evt] ||= new Set()).add(fn); return () => subs[evt].delete(fn); }
export function emit(evt, data) { (subs[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
// Events: 'change', 'points' {n, reason}, 'badge' {id, icon, title, desc}, 'goal'

// ---- dates ----
export function dateKey(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() - offset);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export const today = () => dateKey(0);
export function dayStat(offset = 0) { return S.days[dateKey(offset)] || { a: 0, r: 0, z: 0 }; }
function todayRec() { return (S.days[today()] ||= { a: 0, r: 0, z: 0 }); }
const active = d => d && (d.a > 0 || d.r > 0);

export function streak() {
  let c = 0, o = active(S.days[dateKey(0)]) ? 0 : 1;
  while (active(S.days[dateKey(o)])) { c++; o++; }
  return c;
}
export function bestStreak() {
  const keys = Object.keys(S.days).filter(k => active(S.days[k])).sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime();
    cur = prev && Math.round((t - prev) / 864e5) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur); prev = t;
  }
  return best;
}

// ---- points & levels ----
export const LEVELS = ['مبتدئ', 'مداوم', 'قارئ', 'مجتهد', 'متقن', 'حافظ', 'صاحب القرآن'];
const LEVEL_STEP = 300;
export function addPoints(n, reason = '') { S.pts += n; emit('points', { n, reason }); }
export function level() {
  const index = Math.min(LEVELS.length - 1, Math.floor(S.pts / LEVEL_STEP));
  const max = index === LEVELS.length - 1;
  return { index, name: LEVELS[index], progress: max ? 1 : (S.pts % LEVEL_STEP) / LEVEL_STEP, toNext: max ? 0 : LEVEL_STEP - (S.pts % LEVEL_STEP) };
}

// ---- reading ----
export const totalRead = () => Object.keys(S.read).length;
export function surahReadCount(s) { const p = s + ':'; let c = 0; for (const k in S.read) if (k.startsWith(p)) c++; return c; }

/** Mark an ayah as read today. Returns { counted, goalHit }. Same ayah counts once per day. */
// Per-day dedupe of counted ayahs, persisted so reopening the app doesn't recount.
const RT_KEY = () => 'noor.rt.' + today();
let readToday = new Set(); let rtDay = '';
function loadRT() { const k = RT_KEY(); if (rtDay === k) return; rtDay = k; try { readToday = new Set(JSON.parse(localStorage.getItem(k) || '[]')); } catch (e) { readToday = new Set(); } try { for (const key of Object.keys(localStorage)) if (key.startsWith('noor.rt.') && key !== k) localStorage.removeItem(key); } catch (e) {} }
export function markRead(s, a) {
  const k = s + ':' + a, t = today();
  loadRT();
  if (readToday.has(k)) return { counted: false, goalHit: false };
  readToday.add(k);
  try { localStorage.setItem(RT_KEY(), JSON.stringify([...readToday])); } catch (e) {}
  if (!S.read[k]) S.read[k] = t;
  const d = todayRec(); d.a++;
  addPoints(2, 'read');
  let goalHit = false;
  if (d.a === S.settings.goal) { addPoints(25, 'goal'); goalHit = true; emit('goal'); }
  S.last = { s, a };
  checkBadges(); save();
  return { counted: true, goalHit };
}
export function setLast(s, a) { S.last = { s, a }; save(); }

// ---- bookmarks ----
export const isBookmarked = (s, a) => S.bookmarks.some(b => b.s === s && b.a === a);
export function toggleBookmark(s, a) {
  const i = S.bookmarks.findIndex(b => b.s === s && b.a === a);
  if (i >= 0) S.bookmarks.splice(i, 1); else S.bookmarks.unshift({ s, a, at: Date.now() });
  save(); return i < 0;
}

// ---- recitation (tasmee') ----
/** acc: 0..100, miss: array of words the user missed. Returns points earned. */
export function addRecitation({ s, from, to, acc, miss = [] }) {
  S.rec.unshift({ d: today(), s, from, to, acc, miss: miss.slice(0, 30) });
  S.rec = S.rec.slice(0, 200);
  todayRec().r++;
  const words = Math.max(1, to - from + 1);
  const p = Math.round(5 + (acc / 100) * 10 * Math.min(words, 10) / 2);
  addPoints(p, 'recite');
  // feed spaced repetition if this range is under review
  const rv = S.reviews.find(r => r.s === s && r.from === from && r.to === to);
  if (rv) gradeReview(rv.id, acc >= 90 ? 2 : acc >= 70 ? 1 : 0, false);
  checkBadges(); save();
  return p;
}

// ---- per-word mistake history ----
const WM_MAX = 5000;
const MISTAKE_KINDS = ['skip', 'wrong', 'hint', 'vowel', 'repeat'];
/** items: [{ a, w, kind }] kind 'ok' | 'skip' | 'wrong' | 'hint' | 'vowel' | 'repeat'. Saves once. */
export function recordWords(s, items) {
  const wm = (S.wm ||= {});
  for (const it of items || []) {
    const key = s + ':' + it.a + ':' + it.w;
    if (it.kind === 'ok') { const e = wm[key]; if (e) e.ok = Math.min(99, e.ok + 1); continue; }
    if (!MISTAKE_KINDS.includes(it.kind)) continue;
    const e = wm[key] || (wm[key] = { n: 0, k: '', d: '', ok: 0 });
    e.n = Math.min(9999, e.n + 1); e.k = it.kind; e.d = today(); e.ok = 0;
  }
  let keys = Object.keys(wm);
  if (keys.length > WM_MAX) {
    for (const k of keys) if (wm[k].ok >= 3) delete wm[k];
    keys = Object.keys(wm);
    if (keys.length > WM_MAX) {
      keys.sort((x, y) => wm[x].d.localeCompare(wm[y].d));
      for (const k of keys.slice(0, keys.length - WM_MAX)) delete wm[k];
    }
  }
  save();
}
function activeWords() {
  const out = [];
  for (const key of Object.keys(S.wm || {})) {
    const e = S.wm[key]; if (!e || e.ok >= 3) continue;
    const [s, a, w] = key.split(':').map(Number);
    out.push({ s, a, w, n: e.n, k: e.k, d: e.d });
  }
  return out;
}
export function weakWords(limit = 30) {
  return activeWords().sort((x, y) => y.n - x.n || y.d.localeCompare(x.d)).slice(0, limit).map(({ s, a, w, n, k }) => ({ s, a, w, n, k }));
}
export function weakAyahs(limit = 10) {
  const g = new Map();
  for (const x of activeWords()) {
    const key = x.s + ':' + x.a;
    const o = g.get(key) || { s: x.s, a: x.a, n: 0, words: [] };
    o.n += x.n; o.words.push(x.w); g.set(key, o);
  }
  return [...g.values()].map(o => ({ ...o, words: o.words.sort((p, q) => p - q) })).sort((x, y) => y.n - x.n).slice(0, limit);
}
export function ayahMistakeMap(s, a) {
  const out = {}, p = s + ':' + a + ':';
  for (const key of Object.keys(S.wm || {})) {
    if (!key.startsWith(p)) continue;
    const e = S.wm[key]; if (e && e.ok < 3) out[+key.slice(p.length)] = e.n;
  }
  return out;
}
/** Nth newest recitation of the same range (skip = how many matching entries to pass), or null. */
export function lastAttempt(s, from, to, skip = 0) {
  let i = skip;
  for (const r of S.rec) if (r.s === s && r.from === from && r.to === to && i-- === 0) return r;
  return null;
}

// ---- hifz tracker, goals, word heat ----
const dayNum = k => Math.round(new Date(k + 'T12:00:00').getTime() / 864e5);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OLD_DAYS = 1e6; // invalid or empty date: treated as very old so that it decays
const daysSince = k => {
  if (!DATE_RE.test(String(k || ''))) return OLD_DAYS;
  const n = dayNum(today()) - dayNum(k);
  return Number.isFinite(n) ? Math.max(0, n) : OLD_DAYS;
};
const HIFZ_DECAY_DAYS = 14;
const pageEntry = p => (S.hifz && S.hifz.pages && S.hifz.pages[p]) || null;
/** Page memorization level 0..3, dropping 1 level per ~14 days since the last review. */
export function hifzLevel(p) {
  const e = pageEntry(p); if (!e || !(e.lvl > 0)) return 0;
  const v = Math.max(0, Math.min(3, e.lvl) - Math.floor(daysSince(e.at) / HIFZ_DECAY_DAYS));
  return Number.isFinite(v) ? v : 0;
}
/** Called after a recitation: quality 0..1 per page. >=0.9 raises the level (at most once per day), 0.6..0.9 only refreshes it. */
export function notePagesRecited(pages, quality) {
  const q = Number(quality); if (!(q >= 0.6)) return;
  const pg = ((S.hifz ||= { pages: {} }).pages ||= {});
  for (const raw of pages || []) {
    const p = Math.trunc(Number(raw)); if (!(p >= 1 && p <= PAGE_COUNT)) continue;
    const cur = hifzLevel(p), e = pg[p] || (pg[p] = { lvl: 0, at: '', n: 0 });
    const raiseToday = e.at !== today();
    if (q >= 0.9 && raiseToday) { e.lvl = Math.min(3, cur + 1); e.n = Math.min(9999, (e.n || 0) + 1); }
    else e.lvl = Math.max(cur, 1);
    if (!e.m) e.m = today();
    e.at = today();
  }
  save();
}
export function setPageMemorized(p, on) {
  p = Math.trunc(Number(p)); if (!(p >= 1 && p <= PAGE_COUNT)) return;
  const pg = ((S.hifz ||= { pages: {} }).pages ||= {});
  if (on) { const e = pg[p] || (pg[p] = { lvl: 0, at: '', n: 0 }); e.lvl = 3; e.at = today(); if (!e.m) e.m = today(); }
  else delete pg[p];
  save();
}
export function hifzTotals() {
  let c = 0; for (let p = 1; p <= PAGE_COUNT; p++) if (hifzLevel(p) > 0) c++;
  return { pages: c, pct: Math.round(c / PAGE_COUNT * 100) };
}

const GOAL_TYPES = ['memorize', 'review', 'recite'], GOAL_UNITS = ['page', 'ayah', 'minute'], GOAL_PERIODS = ['day', 'week'], GOALS_MAX = 30;
export function addGoal(g) {
  g = g || {};
  if (!GOAL_TYPES.includes(g.type) || !GOAL_UNITS.includes(g.unit) || !GOAL_PERIODS.includes(g.period)) return null;
  const target = Math.min(9999, Math.trunc(Number(g.target)));
  if (!(target >= 1)) return null;
  const goals = (S.goals ||= []);
  if (goals.length >= GOALS_MAX) return null;
  const goal = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: g.type, unit: g.unit, target, period: g.period, created: today() };
  goals.push(goal); save(); return goal;
}
export function removeGoal(id) { S.goals = (S.goals || []).filter(g => g.id !== id); save(); }

// Window of dates [lo, hi] for the period `k` periods ago (0 = current).
function goalWindow(g, k) {
  const span = g.period === 'week' ? 7 : 1;
  return [dateKey(k * span + span - 1), dateKey(k * span)];
}
const SEC_PER_AYAH = 15; // S.rec has no duration: minutes are estimated from ayahs
function rangePages(s, from, to) { const o = new Set(); if (s >= 1 && from >= 1 && to >= from) for (let p = pageOf(s, from), e = pageOf(s, to); p <= e; p++) o.add(p); return o; }
const pageAyahs = p => pageContent(p).reduce((t, x) => t + (x.to - x.from + 1), 0);
/** Progress of a goal in the period `back` periods ago (default current). -> { done, target } */
export function goalProgress(g, back = 0) {
  const [lo, hi] = goalWindow(g, back), inW = d => !!d && d >= lo && d <= hi;
  const pages = new Set(); let ayahs = 0;
  const hp = (S.hifz && S.hifz.pages) || {};
  if (g.type === 'recite') {
    for (const r of S.rec || []) if (inW(r.d) && r.to >= r.from) { ayahs += r.to - r.from + 1; rangePages(r.s, r.from, r.to).forEach(p => pages.add(p)); }
  } else if (g.type === 'review') {
    for (const r of S.reviews || []) if (inW(r.last) && r.to >= r.from) { ayahs += r.to - r.from + 1; rangePages(r.s, r.from, r.to).forEach(p => pages.add(p)); }
    for (const k of Object.keys(hp)) { const e = hp[k]; if (e && e.lvl > 0 && inW(e.at) && !pages.has(+k)) { pages.add(+k); ayahs += pageAyahs(+k); } }
  } else {
    for (const k of Object.keys(hp)) { const e = hp[k]; if (e && e.lvl > 0 && inW(e.m)) { pages.add(+k); ayahs += pageAyahs(+k); } }
  }
  const done = g.unit === 'page' ? pages.size : g.unit === 'ayah' ? ayahs : Math.round(ayahs * SEC_PER_AYAH / 60);
  return { done, target: g.target };
}
/** Consecutive completed periods (the current one counts only once completed). */
export function goalStreak(g) {
  const met = i => { const p = goalProgress(g, i); return p.done >= p.target; };
  let c = met(0) ? 1 : 0;
  for (let k = 1; k < 400 && met(k); k++) c++;
  return c;
}

/** 0..1 heat of mistakes for a word: frequency, fading over time (half-life ~3 weeks) and with later correct reads. */
export function wordErrorHeat(s, a, w) {
  const e = S.wm && S.wm[s + ':' + a + ':' + w];
  if (!e || !(e.n > 0) || e.ok >= 3) return 0;
  const h = Math.min(1, e.n / 4) * Math.pow(0.5, daysSince(e.d) / 21) * (1 - (e.ok || 0) / 3);
  return Math.max(0, Math.min(1, h));
}

// ---- spaced repetition review (Leitner boxes) ----
const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60];
export function addReview(s, from, to) {
  if (S.reviews.some(r => r.s === s && r.from === from && r.to === to)) return null;
  const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), s, from, to, box: 0, due: today(), added: today(), last: null };
  S.reviews.push(r); save(); return r;
}
export function removeReview(id) { S.reviews = S.reviews.filter(r => r.id !== id); save(); }
export function dueReviews() { const t = today(); return S.reviews.filter(r => r.due <= t).sort((a, b) => a.due.localeCompare(b.due)); }
/** quality: 0 forgot, 1 hesitant, 2 perfect */
export function gradeReview(id, quality, doSave = true) {
  const r = S.reviews.find(x => x.id === id); if (!r) return;
  r.box = quality === 2 ? Math.min(BOX_DAYS.length - 1, r.box + 1) : quality === 1 ? r.box : 0;
  const d = new Date(); d.setDate(d.getDate() + Math.max(1, BOX_DAYS[r.box]));
  r.due = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  r.last = today();
  addPoints(quality === 2 ? 8 : 3, 'review');
  if (doSave) { checkBadges(); save(); }
}

// ---- tasbeeh & azkar ----
export function tasbeeh() { S.tasbeeh++; if (S.tasbeeh % 33 === 0) addPoints(3, 'tasbeeh'); save(); return S.tasbeeh; }
export function azkarDone() { todayRec().z++; addPoints(10, 'azkar'); checkBadges(); save(); }

// ---- badges ----
export const BADGES = [
  { id: 'first', icon: '🌱', title: 'أول خطوة', desc: 'اقرأ أول آية', test: () => totalRead() >= 1 },
  { id: 'streak3', icon: '🔥', title: 'ثلاثة أيام', desc: 'سلسلة ٣ أيام', test: () => streak() >= 3 },
  { id: 'streak7', icon: '🌙', title: 'أسبوع نور', desc: 'سلسلة ٧ أيام', test: () => streak() >= 7 },
  { id: 'streak30', icon: '⭐', title: 'شهر المداومة', desc: 'سلسلة ٣٠ يوماً', test: () => streak() >= 30 },
  { id: 'read100', icon: '📖', title: 'قارئ نشيط', desc: 'اقرأ ١٠٠ آية', test: () => totalRead() >= 100 },
  { id: 'read1000', icon: '📚', title: 'ألف آية', desc: 'اقرأ ١٠٠٠ آية', test: () => totalRead() >= 1000 },
  { id: 'khatma', icon: '👑', title: 'ختمة كاملة', desc: 'اقرأ القرآن كاملاً', test: () => totalRead() >= 6236 },
  { id: 'rec1', icon: '🎙️', title: 'أول تسميع', desc: 'أنهِ أول تسميع', test: () => S.rec.length >= 1 },
  { id: 'rec90', icon: '💎', title: 'إتقان', desc: 'تسميع بدقة ٩٠٪ فأكثر', test: () => S.rec.some(r => r.acc >= 90) },
  { id: 'rec50', icon: '🏆', title: 'خمسون تسميعاً', desc: 'أنهِ ٥٠ تسميعاً', test: () => S.rec.length >= 50 },
  { id: 'goal', icon: '🎯', title: 'هدف اليوم', desc: 'حقق هدفك اليومي', test: () => dayStat(0).a >= S.settings.goal },
  { id: 'review', icon: '🧠', title: 'مراجع', desc: 'أضف ٥ مقاطع للمراجعة', test: () => S.reviews.length >= 5 },
  { id: 'azkar', icon: '🤲', title: 'ذاكر', desc: 'أكمل أذكارك', test: () => Object.values(S.days).some(d => d.z > 0) },
  { id: 'level3', icon: '🏅', title: 'مجتهد', desc: 'بلغ مستوى مجتهد', test: () => level().index >= 3 }
];
export function checkBadges() {
  const fresh = [];
  for (const b of BADGES) {
    if (!S.badges[b.id] && b.test()) { S.badges[b.id] = today(); fresh.push(b); }
  }
  fresh.forEach(b => { S.pts += 20; emit('badge', b); });
  return fresh;
}

// ---- settings & data ----
export function updateSettings(patch) { deepMerge(S.settings, patch); save(); }
export function exportData() {
  // never put the private API key into a backup file that may be shared
  const ai = S.settings && S.settings.ai ? { ...S.settings.ai, apiKey: '' } : undefined;
  return JSON.stringify({ ...S, settings: { ...S.settings, ...(ai ? { ai } : {}) } });
}
export function importData(json) {
  const d = JSON.parse(json); if (!d || d.v !== 1) throw new Error('bad file');
  const int = x => Math.max(0, Math.min(10000, parseInt(x, 10) || 0));
  d.bookmarks = (Array.isArray(d.bookmarks) ? d.bookmarks : []).map(b => ({ s: int(b.s), a: int(b.a), at: +b.at || 0 })).filter(b => b.s >= 1 && b.s <= 114 && b.a >= 1);
  d.last = d.last ? { s: Math.min(114, Math.max(1, int(d.last.s))), a: Math.max(1, int(d.last.a)) } : null;
  d.rec = (Array.isArray(d.rec) ? d.rec : []).map(r => ({ d: String(r.d || '').slice(0, 10), s: int(r.s), from: int(r.from), to: int(r.to), acc: int(r.acc), miss: (Array.isArray(r.miss) ? r.miss : []).map(String).slice(0, 30) }));
  d.reviews = (Array.isArray(d.reviews) ? d.reviews : []).map(r => ({ id: String(r.id).replace(/[^\w-]/g, ''), s: int(r.s), from: int(r.from), to: int(r.to), box: int(r.box), due: String(r.due || '').slice(0, 10), added: String(r.added || '').slice(0, 10), last: r.last ? String(r.last).slice(0, 10) : null }));
  const wm = {};
  if (d.wm && typeof d.wm === 'object' && !Array.isArray(d.wm)) {
    let count = 0;
    for (const key of Object.keys(d.wm)) {
      if (count >= 5000) break;
      const e = d.wm[key];
      if (!/^\d{1,3}:\d{1,3}:\d{1,3}$/.test(key) || !e || typeof e !== 'object') continue;
      const [ks, ka, kw] = key.split(':').map(Number);
      if (ks < 1 || ks > 114 || ka < 1 || ka > 286 || kw < 1 || kw > 200) continue;
      count++;
      wm[key] ={ n: Math.min(9999, int(e.n)), k: MISTAKE_KINDS.includes(e.k) ? e.k : 'wrong', d: String(e.d || '').slice(0, 10), ok: Math.min(99, int(e.ok)) };
    }
  }
  d.wm = wm;
  const hp = {};
  if (d.hifz && d.hifz.pages && typeof d.hifz.pages === 'object' && !Array.isArray(d.hifz.pages)) {
    for (const key of Object.keys(d.hifz.pages)) {
      const p = parseInt(key, 10), e = d.hifz.pages[key];
      if (!(p >= 1 && p <= PAGE_COUNT) || String(p) !== key || !e || typeof e !== 'object') continue;
      const at = String(e.at || '');
      if (!DATE_RE.test(at)) continue; // invalid date: drop the entry rather than keep a broken level
      hp[p] = { lvl: Math.min(3, int(e.lvl)), at, n: Math.min(9999, int(e.n)) };
      if (e.m) { const m = String(e.m); if (DATE_RE.test(m)) hp[p].m = m; }
    }
  }
  d.hifz = { pages: hp };
  const seenGoalIds = new Set();
  d.goals = (Array.isArray(d.goals) ? d.goals : []).filter(g => g && GOAL_TYPES.includes(g.type) && GOAL_UNITS.includes(g.unit) && GOAL_PERIODS.includes(g.period))
    .map((g, i) => ({ id: String(g.id || '').replace(/[^\w-]/g, '').slice(0, 24) || (Date.now().toString(36) + i), type: g.type, unit: g.unit, target: Math.max(1, Math.min(9999, int(g.target))), period: g.period, created: String(g.created || '').slice(0, 10) }))
    .filter(g => { if (seenGoalIds.has(g.id)) return false; seenGoalIds.add(g.id); return true; })
    .slice(0, GOALS_MAX);
  // an imported file must not redirect the AI to another server: keep this device's AI settings
  const keepAi = S.settings && S.settings.ai ? JSON.parse(JSON.stringify(S.settings.ai)) : null;
  if (d.settings && typeof d.settings === 'object') delete d.settings.ai;
  if (d.settings && typeof d.settings === 'object') {
    d.settings.fontSize = Math.min(52, Math.max(18, int(d.settings.fontSize) || 30));
    d.settings.goal = Math.min(1000, Math.max(1, int(d.settings.goal) || 10));
    if (d.settings.prayer && typeof d.settings.prayer === 'object') d.settings.prayer.adhan = ['full', 'short', 'silent'].includes(d.settings.prayer.adhan) ? d.settings.prayer.adhan : 'full';
    if (d.settings.prayer && typeof d.settings.prayer === 'object') {
      const pr = d.settings.prayer;
      pr.preAlert = [5, 10, 15, 20, 30].includes(Number(pr.preAlert)) ? Number(pr.preAlert) : 10;
      pr.preOn = pr.preOn === true;
      const om = {}, src = pr.adhanOn && typeof pr.adhanOn === 'object' ? pr.adhanOn : {};
      for (const k of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) om[k] = src[k] !== false;
      pr.adhanOn = om;
    }
    d.settings.theme = ['auto', 'dark', 'light'].includes(d.settings.theme) ? d.settings.theme : 'dark';
    if (!(typeof d.settings.reciter === 'string' && /^[\w.-]{1,60}$/.test(d.settings.reciter))) delete d.settings.reciter;
  }
  Object.keys(S).forEach(k => delete S[k]); Object.assign(S, deepMerge(DEFAULTS(), d));
  if (keepAi) S.settings.ai = keepAi;
  save();
}
export function resetAll() { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, DEFAULTS()); save(); }
