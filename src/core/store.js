// Central app state. Single source of truth, persisted to localStorage.
// CONTRACT: other modules import { S, save, on, emit, ... } from './store.js'.
// Ayah keys are always `${s}:${a}` with 1-based surah (1..114) and ayah numbers.

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
    prayer: { method: 'UmmAlQura', madhab: 'shafi', notify: true, preAlert: 10, lat: null, lng: null, city: '' }
  },
  pts: 0,
  days: {},        // 'YYYY-MM-DD' -> { a: ayahsRead, r: recitations, z: azkarDone }
  read: {},        // 's:a' -> 'YYYY-MM-DD' first time read
  last: null,      // { s, a } last reading position
  bookmarks: [],   // [{ s, a, at }]
  rec: [],         // recitation history [{ d, s, from, to, acc, miss: [words] }] newest first
  reviews: [],     // spaced repetition [{ id, s, from, to, box, due, added, last }]
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
function deepMerge(base, over) {
  for (const k of Object.keys(over)) {
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
export function exportData() { return JSON.stringify(S); }
export function importData(json) {
  const d = JSON.parse(json); if (!d || d.v !== 1) throw new Error('bad file');
  const int = x => Math.max(0, Math.min(10000, parseInt(x, 10) || 0));
  d.bookmarks = (Array.isArray(d.bookmarks) ? d.bookmarks : []).map(b => ({ s: int(b.s), a: int(b.a), at: +b.at || 0 })).filter(b => b.s >= 1 && b.s <= 114 && b.a >= 1);
  d.last = d.last ? { s: Math.min(114, Math.max(1, int(d.last.s))), a: Math.max(1, int(d.last.a)) } : null;
  d.rec = (Array.isArray(d.rec) ? d.rec : []).map(r => ({ d: String(r.d || '').slice(0, 10), s: int(r.s), from: int(r.from), to: int(r.to), acc: int(r.acc), miss: (Array.isArray(r.miss) ? r.miss : []).map(String).slice(0, 30) }));
  d.reviews = (Array.isArray(d.reviews) ? d.reviews : []).map(r => ({ id: String(r.id).replace(/[^\w-]/g, ''), s: int(r.s), from: int(r.from), to: int(r.to), box: int(r.box), due: String(r.due || '').slice(0, 10), added: String(r.added || '').slice(0, 10), last: r.last ? String(r.last).slice(0, 10) : null }));
  Object.keys(S).forEach(k => delete S[k]); Object.assign(S, deepMerge(DEFAULTS(), d)); save();
}
export function resetAll() { Object.keys(S).forEach(k => delete S[k]); Object.assign(S, DEFAULTS()); save(); }
