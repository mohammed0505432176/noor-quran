// Home-screen prayer times widget feed (Android only). Pushes 14 days of times to the native
// NoorWidget plugin, which stores them and redraws the widget. Older APKs lack the plugin: errors are swallowed.
import { isNative } from './platform.js';
import { PRAYERS, timesFor, currentConfig } from './prayer.js';

const DAYS = 14;
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let plugin = null;

/** Build the payload: { city, days: [{ date: "YYYY-MM-DD", fajr, sunrise, dhuhr, asr, maghrib, isha }] } (epoch ms). */
export function widgetPayload(now = new Date(), cfg = currentConfig()) {
  if (!cfg.known) return { city: '', days: [] }; // no real location yet: widget shows "افتح نور لتحديد موقعك"
  const days = [];
  for (let i = 0; i < DAYS; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12, 0, 0);
    const t = timesFor(day, cfg);
    const row = { date: dateKey(day) };
    for (const p of PRAYERS) row[p.key] = t[p.key].getTime();
    days.push(row);
  }
  return { city: cfg.city || '', days };
}

/** Fire-and-forget safe: never throws, resolves true when the native widget was updated. */
export async function updatePrayerWidget() {
  try {
    if (!isNative()) return false;
    if (!plugin) {
      const { registerPlugin } = await import('@capacitor/core');
      plugin = registerPlugin('NoorWidget');
    }
    await plugin.update(widgetPayload());
    return true;
  } catch (e) {
    return false; // older APK without the plugin, or native error
  }
}

/** Route requested by a widget tap ('prayer' or ''). Native only; never throws. */
export async function consumeWidgetRoute() {
  try {
    if (!isNative()) return '';
    if (!plugin) {
      const { registerPlugin } = await import('@capacitor/core');
      plugin = registerPlugin('NoorWidget');
    }
    const r = await plugin.consumeRoute();
    return r && r.route === 'prayer' ? 'prayer' : '';
  } catch (e) {
    return '';
  }
}
