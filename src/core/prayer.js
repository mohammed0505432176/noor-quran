// Prayer times, qibla, and notification scheduling. Pure logic is node-importable.
import { Coordinates, CalculationMethod, PrayerTimes, Madhab, Qibla } from 'adhan';
import { S, updateSettings, dayStat } from './store.js';

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

export function timesFor(date, { lat, lng, method = 'UmmAlQura', madhab = 'shafi' }) {
  const params = (CalculationMethod[method] || CalculationMethod.UmmAlQura)();
  params.madhab = madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
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

/** Get device location, store it. Falls back to Riyadh if never set. Returns { ok, fallback, city }. */
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
      updateSettings({ prayer: { lat: RIYADH.lat, lng: RIYADH.lng, city: RIYADH.city } });
      return { ok: false, fallback: true, city: RIYADH.city };
    }
    return { ok: false, fallback: false, city: p.city };
  }
}

/** Reschedule 7 days of adhan notifications + daily wird reminder. Safe no-op on errors. */
export async function refreshSchedule() {
  try {
    const p = S.settings.prayer;
    if (!p.notify) return { scheduled: 0 };
    const cfg = currentConfig();
    if (!cfg.known) return { scheduled: 0 };
    const notify = await import('./notify.js');
    const { ID } = notify;
    await notify.cancelRange(ID.prayer[0], ID.wird[1]);
    const list = [];
    const city = cfg.city || '';
    const now = new Date();
    let pid = ID.prayer[0], rid = ID.pre[0];
    const pre = Number(p.preAlert) || 0;
    for (let d = 0; d < 7; d++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, 12, 0, 0);
      const t = timesFor(day, cfg);
      for (const pr of PRAYERS) {
        if (pr.key === 'sunrise') continue;
        const at = t[pr.key];
        if (at <= now) { pid++; rid++; continue; }
        list.push({ id: pid++, title: `حان الآن وقت صلاة ${pr.name}`, body: `حيّ على الصلاة — ${city}`, at, channel: 'adhan' });
        if (pre > 0) {
          const pat = new Date(at.getTime() - pre * 60000);
          if (pat > now) list.push({ id: rid, title: `صلاة ${pr.name} قريبة`, body: `بقي ${pre} دقائق على صلاة ${pr.name}`, at: pat, channel: 'reminders' });
        }
        rid++;
      }
      // daily wird reminder at 9 PM unless today's goal is already met
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
