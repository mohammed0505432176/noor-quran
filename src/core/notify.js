// Notification wrapper: Capacitor local notifications on Android, best-effort Notification API on web.
// IDs: prayers 1000-1999, pre-alerts 2000-2999, wird 3000-3099.
import { isNative } from './platform.js';

export const ID = { prayer: [1000, 1999], pre: [2000, 2999], wird: [3000, 3099] };

let webTimers = [];

/** Web notification: Android Chrome throws on `new Notification`, so prefer the service worker registration. */
async function webNotify(title, opts) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && reg.showNotification) { await reg.showNotification(title, opts); return; }
  } catch (e) { /* fall through */ }
  try { new Notification(title, opts); } catch (e) { /* ignore */ }
}

async function LN() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

/** adhan sound choice ('full'|'short'|'silent') -> notification channel id */
export function adhanChannel(choice) {
  return choice === 'short' ? 'adhan_short' : choice === 'silent' ? 'adhan_silent' : 'adhan_full';
}

export async function ensurePermission() {
  if (isNative()) {
    try {
      const ln = await LN();
      // channel creation needs no permission; do it first
      try {
        await ln.createChannel({ id: 'adhan', name: 'الأذان', importance: 5, visibility: 1, vibration: true });
        // channels are immutable once created: sound changes need NEW ids (sound = res/raw file name, no extension)
        await ln.createChannel({ id: 'adhan_full', name: 'الأذان كاملًا', description: 'أذان كامل عند دخول وقت الصلاة', importance: 5, visibility: 1, vibration: true, sound: 'adhan' });
        await ln.createChannel({ id: 'adhan_short', name: 'تكبيرات قصيرة', description: 'تكبيرات قصيرة عند دخول وقت الصلاة', importance: 5, visibility: 1, vibration: true, sound: 'adhan_short' });
        await ln.createChannel({ id: 'adhan_silent', name: 'إشعار صامت', description: 'إشعار وقت الصلاة بدون صوت', importance: 2, visibility: 1, vibration: false });
        await ln.createChannel({ id: 'reminders', name: 'التذكيرات', importance: 3, visibility: 1, vibration: true });
      } catch (e) { /* channels are Android-only */ }
      const r = await ln.requestPermissions();
      const ok = r.display === 'granted';
      return { granted: ok, web: false };
    } catch (e) { return { granted: false, web: false }; }
  }
  try {
    if (typeof Notification === 'undefined') return { granted: false, web: true };
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    return { granted: p === 'granted', web: true };
  } catch (e) { return { granted: false, web: true }; }
}

/** list: [{id, title, body, at: Date, channel}] */
export async function schedule(list) {
  if (!list.length) return { web: !isNative(), count: 0 };
  if (isNative()) {
    const ln = await LN();
    const now = Date.now();
    const notifications = list.filter(n => n.at.getTime() > now).map(n => ({
      id: n.id, title: n.title, body: n.body,
      schedule: { at: n.at, allowWhileIdle: true },
      channelId: n.channel, smallIcon: 'ic_stat_noor'
    }));
    // Android caps pending alarms; schedule in chunks
    for (let i = 0; i < notifications.length; i += 50) await ln.schedule({ notifications: notifications.slice(i, i + 50) });
    return { web: false, count: notifications.length };
  }
  let count = 0;
  const now = Date.now();
  for (const n of list) {
    const ms = n.at.getTime() - now;
    if (ms <= 0 || ms > 12 * 3600 * 1000) continue;
    webTimers.push(setTimeout(() => {
      try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') webNotify(n.title, { body: n.body, icon: 'icon-192.png' }); } catch (e) { /* ignore */ }
    }, ms));
    count++;
  }
  return { web: true, count };
}

export async function cancelRange(min, max) {
  if (isNative()) {
    try {
      const ln = await LN();
      const { notifications } = await ln.getPending();
      const ids = notifications.filter(n => n.id >= min && n.id <= max).map(n => ({ id: n.id }));
      if (ids.length) await ln.cancel({ notifications: ids });
    } catch (e) { /* ignore */ }
    return;
  }
  // web timers are all cleared together; they get re-created on the next schedule()
  webTimers.forEach(clearTimeout); webTimers = [];
}

/** Cancel specific pending notification ids. */
export async function cancelIds(ids) {
  if (!isNative() || !ids.length) return;
  try { const ln = await LN(); await ln.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) { /* ignore */ }
}

/** Test notification after delaySec seconds on the given channel (default: full adhan). */
export async function testNotification(channel = 'adhan_full', delaySec = 10) {
  const p = await ensurePermission();
  if (!p.granted) return { ...p, sent: false };
  const at = new Date(Date.now() + delaySec * 1000);
  const item = { id: 3099, title: 'تجربة الأذان', body: 'حيّ على الصلاة · هكذا سيصلك التنبيه', at, channel };
  if (isNative()) {
    const ln = await LN();
    await ln.schedule({ notifications: [{ id: item.id, title: item.title, body: item.body, schedule: { at, allowWhileIdle: true }, channelId: channel, smallIcon: 'ic_stat_noor' }] });
    return { ...p, sent: true };
  }
  setTimeout(() => { webNotify(item.title, { body: item.body, icon: 'icon-192.png' }); }, delaySec * 1000);
  return { ...p, sent: true };
}

/** Remove delivered prayer notifications in [min,max] (stops their sound) when the in-app adhan takes over. */
export async function clearDelivered(min, max) {
  if (!isNative()) return;
  try {
    const ln = await LN();
    const { notifications } = await ln.getDeliveredNotifications();
    const ids = notifications.filter(n => n.id >= min && n.id <= max).map(n => ({ id: n.id, tag: n.tag }));
    if (ids.length) await ln.removeDeliveredNotifications({ notifications: ids });
  } catch (e) { /* ignore */ }
}
