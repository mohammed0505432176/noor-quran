// Shared ayah audio player (everyayah.com). One HTMLAudioElement for the whole app.
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

let el = null, cur = null, q = null, rep = 0, rate = 1, playing = false, preloaded = null;

function player() {
  if (!el && typeof Audio !== 'undefined') {
    el = new Audio();
    el.preload = 'auto';
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', () => {
      if (!q) return;
      playing = false; emit('error');
      q = null;
    });
    el.addEventListener('pause', () => { if (q && !el.ended && playing) { playing = false; emit('pause'); } });
    el.addEventListener('play', () => { if (q && !playing) { playing = true; emit('play'); } });
  }
  return el;
}

function preloadNext() {
  if (!q || typeof Audio === 'undefined') return;
  const n = nextOf(cur, true);
  if (!n) { preloaded = null; return; }
  const u = audioUrl(n.s, n.a);
  if (preloaded && preloaded.src === u) return;
  try { preloaded = new Audio(u); preloaded.preload = 'auto'; preloaded.src = u; } catch (e) { preloaded = null; }
}

function nextOf(c, peek) {
  if (!q) return null;
  if (!peek && rep < q.repeatEach) return { s: c.s, a: c.a, again: true };
  if (peek && rep < q.repeatEach) return { s: c.s, a: c.a };
  if (c.a < q.to) return { s: c.s, a: c.a + 1 };
  if (q.loopRange) return { s: q.s, a: q.from };
  return null;
}

function load(a) {
  const p = player(); if (!p || !q) return;
  cur = { s: q.s, a };
  p.src = audioUrl(q.s, a);
  p.playbackRate = rate; p.defaultPlaybackRate = rate;
  emit('ayah');
  const pr = p.play();
  if (pr && pr.catch) pr.catch(() => { if (q) { playing = false; emit('error'); q = null; } });
  preloadNext();
}

function onEnded() {
  if (!q || !cur) return;
  rep++;
  if (rep < q.repeatEach) { load(cur.a); return; }
  const n = nextOf(cur, false);
  if (!n) { const last = cur; stop(); void last; return; }
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
  q = null; playing = false; rep = 0; preloaded = null;
  if (p) { try { p.pause(); p.removeAttribute('src'); p.load(); } catch (e) { /* ignore */ } }
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
  if (el) { el.playbackRate = rate; el.defaultPlaybackRate = rate; }
  return rate;
}
export const getRate = () => rate;
