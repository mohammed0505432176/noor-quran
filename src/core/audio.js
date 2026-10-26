// Shared ayah audio player (everyayah.com). Two HTMLAudioElements ping-pong for gapless playback.
import { S } from './store.js';
import { ayahCount } from './quran.js';

export const RECITERS = [
  { id: 'Alafasy_128kbps', name: 'مشاري العفاسي' },
  { id: 'Abdul_Basit_Murattal_192kbps', name: 'عبد الباسط عبد الصمد (مرتل)' },
  { id: 'Husary_128kbps', name: 'محمود خليل الحصري' },
  { id: 'Minshawy_Murattal_128kbps', name: 'محمد صديق المنشاوي (مرتل)' },
  { id: 'Maher_AlMuaiqly_64kbps', name: 'ماهر المعيقلي' },
  { id: 'Yasser_Ad-Dussary_128kbps', name: 'ياسر الدوسري' },
  { id: 'Abdurrahmaan_As-Sudais_192kbps', name: 'عبد الرحمن السديس' },
  { id: 'Saood_ash-Shuraym_128kbps', name: 'سعود الشريم' }
];

const pad = n => String(n).padStart(3, '0');

export function reciterId() {
  const r = S.settings && S.settings.reciter;
  return RECITERS.some(x => x.id === r) ? r : RECITERS[0].id;
}
export const reciterName = () => RECITERS.find(x => x.id === reciterId()).name;

export function audioUrl(s, a, reciter = reciterId()) {
  const folder = RECITERS.some(x => x.id === reciter) ? reciter : RECITERS[0].id;
  return `https://everyayah.com/data/${folder}/${pad(s)}${pad(a)}.mp3`;
}

const subs = new Set();
export function onAudio(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(type) {
  const c = cur || { s: 0, a: 0 };
  subs.forEach(fn => { try { fn({ type, s: c.s, a: c.a }); } catch (e) { console.error(e); } });
}

let el = null, sb = null, cur = null, q = null, rep = 0, rate = 1, playing = false;
let advanced = false, retried = false, tickId = 0, earlyTimer = 0;
const EARLY = 0.08; // seconds of trailing silence to cut when the next ayah is already buffered

/** ms until the early-advance point (duration - EARLY*rate), or null if unknown. Pure. */
export function earlyDelayMs(duration, currentTime, playbackRate, early = EARLY) {
  if (!isFinite(duration) || duration <= 0) return null;
  const r = playbackRate > 0 ? playbackRate : 1;
  return Math.max(0, (duration - currentTime - early * r) / r * 1000);
}

/** Pure repeat/loop logic. peek=true: what plays after the current play-through would finish (no rep side effects). */
export function nextIndex(qq, c, repDone, peek) {
  if (!qq || !c) return null;
  if (repDone < qq.repeatEach) return { s: c.s, a: c.a, again: !peek };
  if (c.a < qq.to) return { s: c.s, a: c.a + 1 };
  if (qq.loopRange) return { s: qq.s, a: qq.from };
  return null;
}
// What follows the current ayah once its play-through completes (rep is bumped by then).
const upcoming = () => (q && cur ? nextIndex(q, cur, rep + 1, true) : null);

function mk() {
  const x = new Audio();
  x.preload = 'auto';
  x.addEventListener('ended', () => { if (x === el) advance(); });
  x.addEventListener('timeupdate', () => { if (x === el) checkEarly(); });
  x.addEventListener('error', () => {
    if (!q) return;
    if (x !== el) { x.dataset.u = ''; return; } // preloaded one failed: reloaded when needed
    if (!retried) { // retry once
      retried = true;
      try { x.load(); x.playbackRate = rate; const pr = x.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) { /* ignore */ }
      return;
    }
    playing = false; emit('error');
    q = null;
  });
  x.addEventListener('pause', () => { if (x === el) { unschedule(); if (q && !x.ended && playing && !advanced) { playing = false; emit('pause'); } } });
  x.addEventListener('play', () => { if (x === el && q) { if (!playing) { playing = true; emit('play'); } schedule(); } });
  for (const ev of ['playing', 'loadedmetadata', 'ratechange', 'durationchange']) x.addEventListener(ev, () => { if (x === el) armEarlyTimer(); });
  return x;
}

function player() {
  if (!el && typeof Audio !== 'undefined') { el = mk(); sb = mk(); }
  return el;
}

function preloadNext() {
  if (!q || !sb || typeof Audio === 'undefined') return;
  const n = upcoming();
  if (!n) { sb.dataset.u = ''; return; }
  const u = audioUrl(n.s, n.a);
  if (sb.dataset.u === u && !sb.error) return;
  try {
    sb.dataset.u = u; sb.preload = 'auto'; sb.src = u;
    sb.playbackRate = rate; sb.defaultPlaybackRate = rate; sb.load();
  } catch (e) { sb.dataset.u = ''; }
}

function standbyReady() {
  const n = upcoming();
  return !!(n && sb && sb.dataset.u === audioUrl(n.s, n.a) && !sb.error && sb.readyState >= 3);
}

function checkEarly() {
  if (!q || !cur || advanced || !playing || !el) return;
  const d = el.duration;
  if (isFinite(d) && d > 0 && d - el.currentTime <= EARLY * rate + 0.02 && standbyReady()) advance();
}
// Background tabs throttle rAF/timeupdate: a one-shot timer aimed at the early-advance point keeps playback gapless.
function armEarlyTimer() {
  clearEarlyTimer();
  if (!q || !cur || advanced || !playing || !el || el.paused) return;
  const ms = earlyDelayMs(el.duration, el.currentTime, el.playbackRate || rate);
  if (ms == null) return;
  earlyTimer = setTimeout(() => { earlyTimer = 0; checkEarly(); if (q && !advanced && playing) armEarlyTimer(); }, ms + 10);
}
function clearEarlyTimer() { if (earlyTimer) { clearTimeout(earlyTimer); earlyTimer = 0; } }
function tick() {
  tickId = 0;
  if (!q || advanced || !playing) return;
  checkEarly();
  if (q && !advanced && playing) schedule();
}
function schedule() {
  if (tickId || !playing) return;
  tickId = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : setTimeout(tick, 40);
}
function unschedule() {
  clearEarlyTimer();
  if (!tickId) return;
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tickId); else clearTimeout(tickId);
  tickId = 0;
}

function fail() { if (q) { playing = false; emit('error'); q = null; } }

function load(a) {
  if (!player() || !q) return;
  cur = { s: q.s, a };
  advanced = false; retried = false;
  unschedule();
  const url = audioUrl(q.s, a);
  let p = el;
  if (sb.dataset.u === url && !sb.error && sb.readyState >= 1) { // gapless: swap in the buffered element
    const old = el;
    p = sb; sb = old; el = p;
    try { old.pause(); } catch (e) { /* ignore */ }
    try { p.currentTime = 0; } catch (e) { /* ignore */ }
  } else {
    p.src = url; p.dataset.u = url;
  }
  p.playbackRate = rate; p.defaultPlaybackRate = rate;
  emit('ayah');
  const pr = p.play();
  if (pr && pr.catch) pr.catch(() => {
    if (!q || p !== el) return;
    if (retried) { fail(); return; }
    retried = true;
    try { p.load(); const r2 = p.play(); if (r2 && r2.catch) r2.catch(fail); } catch (e) { fail(); }
  });
  preloadNext();
  schedule();
  armEarlyTimer();
}

function advance() {
  if (!q || !cur || advanced) return;
  advanced = true;
  rep++;
  if (rep < q.repeatEach) { load(cur.a); return; }
  const n = nextIndex(q, cur, rep, false);
  if (!n) { stop(); return; }
  rep = 0;
  load(n.a);
}

/** Play ayahs from..to of surah s. repeatEach: times each ayah; loopRange: restart at the end. */
export function playRange(s, from, to, { repeatEach = 1, loopRange = false } = {}) {
  const p = player(); if (!p) { emit('error'); return; }
  const max = ayahCount(s);
  from = Math.max(1, Math.min(from, max));
  to = Math.max(from, Math.min(to == null ? max : to, max));
  q = { s, from, to, repeatEach: Math.max(1, repeatEach | 0 || 1), loopRange: !!loopRange };
  rep = 0; playing = true;
  emit('play');
  load(from);
}
export function playAyah(s, a) { playRange(s, a, a); }

export function pause() { const p = player(); if (p && q && playing) { p.pause(); playing = false; emit('pause'); } }
export function resume() {
  const p = player(); if (!p || !q || playing) return;
  playing = true;
  const pr = p.play();
  if (pr && pr.catch) pr.catch(() => { playing = false; emit('error'); });
  emit('play');
}
export function stop() {
  const p = el;
  const was = !!q;
  q = null; playing = false; rep = 0; advanced = false; unschedule();
  for (const x of [p, sb]) if (x) { try { x.dataset.u = ''; x.pause(); x.removeAttribute('src'); x.load(); } catch (e) { /* ignore */ } }
  if (was) emit('stop');
  cur = null;
}
export const isPlaying = () => playing;
export const current = () => (q && cur ? { s: cur.s, a: cur.a } : null);

/** Jump to next / previous ayah within the current surah (extends the range if needed). */
export function next() {
  if (!q || !cur) return;
  const max = ayahCount(q.s);
  if (cur.a >= max) { stop(); return; }
  q.to = Math.max(q.to, cur.a + 1); rep = 0; load(cur.a + 1);
}
export function prev() {
  if (!q || !cur) return;
  rep = 0; load(Math.max(1, cur.a - 1));
}

export function setRate(r) {
  rate = Math.min(1.5, Math.max(0.75, Number(r) || 1));
  for (const x of [el, sb]) if (x) { x.playbackRate = rate; x.defaultPlaybackRate = rate; }
  return rate;
}
export const getRate = () => rate;
