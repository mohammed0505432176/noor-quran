// Prayer times, qibla, and notification scheduling. Pure logic is node-importable.
import { Coordinates, CalculationMethod, PrayerTimes, Madhab, Qibla } from 'adhan';
import { S, updateSettings, dayStat, on } from './store.js';

export const METHODS = {
  UmmAlQura: 'أم القرى (السعودية)',
  Egyptian: 'الهيئة المصرية',
  MuslimWorldLeague: 'رابطة العالم الإسلامي',
  Karachi: 'كراتشي',
  Dubai: 'دبي',
  Qatar: 'قطر',
  Kuwait: 'الكويت',
  Turkey: 'تركيا',
  NorthAmerica: 'أمريكا الشمالية'
};
export const PRAYERS = [
  { key: 'fajr', name: 'الفجر' }, { key: 'sunrise', name: 'الشروق' }, { key: 'dhuhr', name: 'الظهر' },
  { key: 'asr', name: 'العصر' }, { key: 'maghrib', name: 'المغرب' }, { key: 'isha', name: 'العشاء' }
];
export const MAKKAH = { lat: 21.4225, lng: 39.8262 };
const RIYADH = { lat: 24.7136, lng: 46.6753, city: 'الرياض' };

function isUmmAlQuraRamadan(date) {
  try {
    return Number(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' }).format(date)) === 9;
  } catch (e) { return false; }
}

export function timesFor(date, { lat, lng, method = 'UmmAlQura', madhab = 'shafi' }) {
  const params = (CalculationMethod[method] || CalculationMethod.UmmAlQura)();
  params.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  if (method === 'UmmAlQura' && isUmmAlQuraRamadan(date)) params.ishaInterval = 120;
  const t = new PrayerTimes(new Coordinates(lat, lng), date, params);
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

export function nextPrayer(now, cfg) {
  const t = timesFor(now, cfg);
  for (const p of PRAYERS) {
    if (p.key !== 'sunrise' && t[p.key] > now) return { key: p.key, name: p.name, time: t[p.key] };
  }
  const tomorrow = new Date(now.getTime() + 864e5);
  return { key: 'fajr', name: 'الفجر', time: timesFor(tomorrow, cfg).fajr };
}

export function qiblaDirection(lat, lng) { return Qibla(new Coordinates(lat, lng)); }

export function distanceToMakkah(lat, lng) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(MAKKAH.lat - lat), dLng = r(MAKKAH.lng - lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(MAKKAH.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatTime(date) {
  return date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
}

/** Current config from settings (falls back to Riyadh when no location yet). */
export function currentConfig() {
  const p = S.settings.prayer;
  const has = typeof p.lat === 'number' && typeof p.lng === 'number';
  return { lat: has ? p.lat : RIYADH.lat, lng: has ? p.lng : RIYADH.lng, method: p.method, madhab: p.madhab, city: has ? p.city : RIYADH.city, known: has };
}

/** Get device location and store it. On failure the Riyadh fallback is NOT persisted (in-memory default only). Returns { ok, fallback, city }. */
export async function ensureLocation(force = false) {
  const p = S.settings.prayer;
  const has = typeof p.lat === 'number' && typeof p.lng === 'number';
  if (has && !force) return { ok: true, fallback: false, city: p.city };
  try {
    const { getLocation } = await import('./platform.js');
    const { lat, lng } = await getLocation();
    let city = '';
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=ar`);
      const j = await r.json();
      city = j.city || j.locality || '';
    } catch (e) { /* ignore */ }
    updateSettings({ prayer: { lat, lng, city } });
    return { ok: true, fallback: false, city };
  } catch (e) {
    if (!has) {
      return { ok: false, fallback: true, city: RIYADH.city };
    }
    return { ok: false, fallback: false, city: p.city };
  }
}

let goalSubscribed = false;
function subscribeGoal() {
  if (goalSubscribed) return;
  goalSubscribed = true;
  on('goal', async () => {
    try {
      const notify = await import('./notify.js');
      const { isNative } = await import('./platform.js');
      if (isNative()) await notify.cancelRange(notify.ID.wird[0], notify.ID.wird[0]);
      else if (S.settings.prayer.notify) await refreshSchedule(); // web timers are cleared together
    } catch (e) { /* ignore */ }
  });
}
subscribeGoal();

/** Reschedule 7 days of adhan notifications + daily wird reminder. Safe no-op on errors. */
let refreshing = null;
export function refreshSchedule() {
  if (refreshing) return refreshing;
  refreshing = doRefreshSchedule().finally(() => { refreshing = null; });
  return refreshing;
}
async function doRefreshSchedule() {
  try {
    const p = S.settings.prayer;
    if (!p.notify) return { scheduled: 0 };
    const cfg = currentConfig();
    if (!cfg.known) return { scheduled: 0 };
    const notify = await import('./notify.js');
    const perm = await notify.ensurePermission();
    if (!perm.granted) return { scheduled: 0, denied: true };
    const { ID } = notify;
    await notify.cancelRange(ID.prayer[0], ID.wird[1]);
    const list = [];
    const city = cfg.city || '';
    const now = new Date();
    let pid = ID.prayer[0], rid = ID.pre[0];
    const pre = p.preOn ? Number(p.preAlert) || 0 : 0;
    const ch = notify.adhanChannel(p.adhan);
    const onMap = p.adhanOn || {};
    for (let d = 0; d < 7; d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 12, 0, 0);
      const t = timesFor(day, cfg);
      for (const pr of PRAYERS) {
        if (pr.key === 'sunrise') continue;
        const at = t[pr.key];
        if (at <= now || onMap[pr.key] === false) { pid++; rid++; continue; }
        const pname = pr.key === 'dhuhr' && day.getDay() === 5 ? 'الجمعة' : pr.name;
        list.push({ id: pid++, title: `حان الآن وقت صلاة ${pname}`, body: city ? `حيّ على الصلاة · ${city}` : 'حيّ على الصلاة', at, channel: ch });
        if (pre > 0) {
          const pat = new Date(at.getTime() - pre * 60000);
          if (pat > now) list.push({ id: rid, title: `صلاة ${pr.name} قريبة`, body: `بقي ${pre} دقائق على صلاة ${pr.name}`, at: pat, channel: 'reminders' });
        }
        rid++;
      }
      // daily wird reminder at 9 PM unless today's goal is already met (re-checked on the 'goal' event below)
      const wird = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 21, 0, 0);
      const done = d === 0 && dayStat(0).a >= S.settings.goal;
      if (wird > now && !done) list.push({ id: ID.wird[0] + d, title: 'وردك اليومي بانتظارك 📖', body: 'خصّص دقائق مع كتاب الله قبل أن ينقضي يومك', at: wird, channel: 'reminders' });
    }
    const r = await notify.schedule(list);
    return { scheduled: r.count ?? list.length, web: !!r.web };
  } catch (e) {
    return { scheduled: 0, error: true };
  }
}

// ---------- in-app adhan (app open at prayer time) ----------
let adhanAudio = null, adhanTimer = null, watcher = null;
const baseUrl = () => (import.meta.env && import.meta.env.BASE_URL) || './';

let adhanOn = false;
export const isAdhanPlaying = () => adhanOn;
function setAdhan(on) {
  if (adhanOn === on) return;
  adhanOn = on;
  try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('noor:adhan', { detail: { on } })); } catch (e) { /* ignore */ }
}

export function stopAdhan() {
  clearTimeout(adhanTimer);
  try { if (adhanAudio) { adhanAudio.pause(); adhanAudio.removeAttribute('src'); } } catch (e) { /* ignore */ }
  adhanAudio = null;
  if (typeof document !== 'undefined') document.getElementById('adhan-ov')?.remove();
  setAdhan(false);
}

/** Full-screen adhan card + play the chosen sound once. choice = 'full'|'short'|'silent'. */
export function playAdhanNow(name, choice = 'full', city = '') {
  if (typeof document === 'undefined') return;
  stopAdhan();
  import('./audio.js').then(a => a.stop()).catch(() => {});
  setAdhan(true);
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ov = document.createElement('div');
  ov.id = 'adhan-ov'; ov.className = 'adhan-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'adhan-title');
  ov.innerHTML = `<div class="adhan-card">
    <img class="adhan-art" src="${baseUrl()}kids/img/mosque.webp" alt="" draggable="false">
    <div class="adhan-sub">حان الآن وقت</div>
    <div class="adhan-name" id="adhan-title">${esc(name)}</div>
    <div class="adhan-hay">حيّ على الصلاة${city ? ' · ' + esc(city) : ''}</div>
    <button class="btn adhan-stop" id="adhan-stop">${choice === 'silent' ? 'إغلاق' : 'إيقاف الأذان'}</button></div>`;
  document.body.appendChild(ov);
  const stopBtn = ov.querySelector('#adhan-stop');
  stopBtn.onclick = stopAdhan;
  try { stopBtn.focus(); } catch (e) { /* ignore */ }
  if (choice === 'silent') { adhanTimer = setTimeout(stopAdhan, 8000); return; }
  try {
    const a = new Audio(baseUrl() + (choice === 'short' ? 'adhan/adhan-short.mp3' : 'adhan/adhan.mp3'));
    adhanAudio = a;
    a.onended = () => { if (adhanAudio === a) stopAdhan(); };
    a.play().catch(() => { /* autoplay blocked: card stays, notification still sounds */ });
  } catch (e) { /* ignore */ }
}

function adhanCheck() {
  try {
    const p = S.settings.prayer;
    if (!p.notify || document.hidden) return;
    const cfg = currentConfig();
    if (!cfg.known) return;
    const now = new Date();
    const t = timesFor(now, cfg);
    const onMap = p.adhanOn || {};
    let idx = -1;
    for (const pr of PRAYERS) {
      if (pr.key === 'sunrise') continue;
      idx++;
      if (onMap[pr.key] === false) continue;
      const diff = now - t[pr.key];
      if (diff < 0 || diff > 120000) continue;
      const stamp = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.${pr.key}`;
      if (localStorage.getItem('noor.adhan.last') === stamp) continue; // never twice for the same prayer/day
      localStorage.setItem('noor.adhan.last', stamp);
      const name = pr.key === 'dhuhr' && now.getDay() === 5 ? 'صلاة الجمعة' : 'صلاة ' + pr.name;
      import('./notify.js').then(async n => {
        const id = n.ID.prayer[0] + idx; // today's slot (day 0) of this prayer
        await n.cancelIds([id]);
        await n.clearDelivered(n.ID.prayer[0], n.ID.prayer[1]);
        setTimeout(() => n.clearDelivered(n.ID.prayer[0], n.ID.prayer[1]), 5000);
      }).catch(() => {});
      playAdhanNow(name, p.adhan || 'full', cfg.city || '');
      return;
    }
  } catch (e) { /* ignore */ }
}

/** Start the foreground watcher (idempotent). Call on start and on resume. */
// one-time cleanup of the old per-day keys
try {
  if (typeof localStorage !== 'undefined') {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('noor.adhan.') && k !== 'noor.adhan.last') localStorage.removeItem(k);
    }
  }
} catch (e) { /* ignore */ }

let recvBound = false;
async function bindReceived() {
  if (recvBound) return;
  recvBound = true;
  try {
    const { isNative } = await import('./platform.js');
    if (!isNative()) return;
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const n = await import('./notify.js');
    LocalNotifications.addListener('localNotificationReceived', note => {
      if (document.hidden || note.id < n.ID.prayer[0] || note.id > n.ID.prayer[1]) return;
      // foreground: the in-app adhan owns the sound; never start a second one
      if (isAdhanPlaying()) n.clearDelivered(n.ID.prayer[0], n.ID.prayer[1]);
    });
  } catch (e) { recvBound = false; }
}

let lastResched = 0;
export function startAdhanWatcher() {
  if (typeof document === 'undefined') return;
  bindReceived();
  // keep the 7-day window topped up: re-schedule on resume at most every 3 hours
  if (Date.now() - lastResched > 3 * 3600 * 1000 && S.settings.prayer.notify) { lastResched = Date.now(); refreshSchedule(); }
  if (!watcher) watcher = setInterval(adhanCheck, 4000);
  adhanCheck();
}
