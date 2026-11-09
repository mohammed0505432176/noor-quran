// Platform detection + small native helpers. Works in browser (PWA) and Capacitor Android.
import { Capacitor } from '@capacitor/core';

// never throws: a broken/missing Capacitor bridge means plain web. Every @capacitor/* plugin import elsewhere is dynamic and behind isNative().
export const isNative = () => { try { return !!Capacitor.isNativePlatform(); } catch (e) { return false; } };
export const platform = () => { try { return Capacitor.getPlatform(); } catch (e) { return 'web'; } }; // 'web' | 'android' | 'ios'

/** kind: 'light' | 'medium' | 'heavy' (UI taps) | 'mistake' (one short, clearly felt buzz for a wrong word: the same on every device). */
export async function haptic(kind = 'light') {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      if (kind === 'mistake') await Haptics.vibrate({ duration: 45 });
      else await Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (navigator.vibrate) navigator.vibrate(kind === 'mistake' ? 45 : kind === 'heavy' ? 40 : 12);
  } catch (e) { /* ignore */ }
}

/** Minimum gap (ms) between two mistake buzzes: one wrong word reported twice (verdict + issue) buzzes once. */
export const BUZZ_GAP_MS = 900;
export function createMistakeBuzz(now = () => Date.now(), gap = BUZZ_GAP_MS, fire = k => haptic(k)) {
  let last = -Infinity;
  return () => { const t = now(); if (t - last < gap) return false; last = t; fire('mistake'); return true; };
}

/** Current position {lat, lng}. Throws on denial. */
export async function getLocation() {
  if (isNative()) {
    const { Geolocation } = await import('@capacitor/geolocation');
    try { await Geolocation.requestPermissions(); } catch (e) {}
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000 });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  }
  return new Promise((res, rej) => navigator.geolocation
    ? navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), rej, { timeout: 15000 })
    : rej(new Error('no geolocation')));
}
