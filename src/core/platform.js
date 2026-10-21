// Platform detection + small native helpers. Works in browser (PWA) and Capacitor Android.
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'web' | 'android' | 'ios'

export async function haptic(kind = 'light') {
  try {
    if (isNative()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 40 : 12);
  } catch (e) { /* ignore */ }
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
