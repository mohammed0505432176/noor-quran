// Notification wrapper: Capacitor local notifications on Android, best-effort Notification API on web.
// IDs: prayers 1000-1999, pre-alerts 2000-2999, wird 3000-3099.
import { isNative } from './platform.js';

export const ID = { prayer: [1000, 1999], pre: [2000, 2999], wird: [3000, 3099] };

let webTimers = [];

async function LN() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

export async function ensurePermission() {
  if (isNative()) {
    try {
      const ln = await LN();
      const r = await ln.requestPermissions();
      const ok = r.display === 'granted';
      if (ok) {
        try {
          await ln.createChannel({ id: 'adhan', name: 'الأذان', importance: 5, visibility: 1, vibration: true });
          await ln.createChannel({ id: 'reminders', name: 'التذكيرات', importance: 3, visibility: 1, vibration: true });
        } catch (e) { /* channels are Android-only */ }
      }
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
      try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(n.title, { body: n.body, icon: 'icon-192.png' }); } catch (e) { /* ignore */ }
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

export async function testNotification() {
  const p = await ensurePermission();
  if (!p.granted) return { ...p, sent: false };
  const at = new Date(Date.now() + 5000);
  const item = { id: 3099, title: 'تجربة التنبيه', body: 'التنبيهات تعمل بنجاح، بارك الله فيك', at, channel: 'adhan' };
  if (isNative()) {
    const ln = await LN();
    await ln.schedule({ notifications: [{ id: item.id, title: item.title, body: item.body, schedule: { at, allowWhileIdle: true }, channelId: 'adhan', smallIcon: 'ic_stat_noor' }] });
    return { ...p, sent: true };
  }
  setTimeout(() => { try { new Notification(item.title, { body: item.body }); } catch (e) { /* ignore */ } }, 5000);
  return { ...p, sent: true };
}
