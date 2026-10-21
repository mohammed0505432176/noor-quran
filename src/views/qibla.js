import { esc, $, toast, header, N } from '../ui.js';
import { haptic } from '../core/platform.js';
import { currentConfig, qiblaDirection, distanceToMakkah } from '../core/prayer.js';

export default {
  async render(el) {
    const cfg = currentConfig();
    const q = qiblaDirection(cfg.lat, cfg.lng);
    const km = Math.round(distanceToMakkah(cfg.lat, cfg.lng));
    let heading = null, aligned = false, listening = false, got = false;
    const needsPerm = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

    el.innerHTML = `
      ${header('اتجاه القبلة', { back: 'prayer' })}
      <div class="card center">
        <div class="compass" id="cp">
          <div class="compass-dial" id="dial"><span class="gold" style="position:absolute;top:6px;left:50%;transform:translateX(-50%)">ش</span></div>
          <div class="compass-needle" id="needle" style="transform:rotate(${q}deg)"></div>
        </div>
        <h2 class="gold mt">اتجاه القبلة: ${esc(N(Math.round(q)))}° من الشمال</h2>
        <p class="muted">المسافة إلى مكة المكرمة: ${esc(N(km.toLocaleString('en')))} كم${cfg.city ? ' · ' + esc(cfg.city) : ''}</p>
        <p class="muted small" id="msg">${needsPerm ? '' : 'جارٍ قراءة البوصلة…'}</p>
        ${needsPerm ? '<button class="btn" id="en">تفعيل البوصلة</button>' : ''}
      </div>`;
    const dial = $('#dial', el), needle = $('#needle', el), cp = $('#cp', el), msg = $('#msg', el);

    function apply() {
      if (heading == null) return;
      dial.style.transform = `rotate(${-heading}deg)`;
      needle.style.transform = `rotate(${q - heading}deg)`;
      const diff = Math.abs(((q - heading + 540) % 360) - 180);
      const ok = diff <= 5;
      cp.classList.toggle('aligned', ok);
      if (ok && !aligned) haptic('medium');
      aligned = ok;
      msg.textContent = ok ? 'أنت متجه نحو القبلة' : 'أدر هاتفك حتى يشير السهم إلى الأعلى';
    }
    function onOrient(e) {
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (e.alpha != null && (e.absolute || e.type === 'deviceorientationabsolute')) h = (360 - e.alpha) % 360;
      if (h == null) return;
      got = true; heading = h; apply();
    }
    function listen() {
      if (listening) return; listening = true;
      window.addEventListener('deviceorientationabsolute', onOrient, true);
      window.addEventListener('deviceorientation', onOrient, true);
      setTimeout(() => { if (!got) msg.textContent = `لا يتوفر حساس البوصلة. وجّه وجهك نحو الزاوية ${N(Math.round(q))}° من الشمال (استعن ببوصلة أو بخرائط جوجل)، والسهم يبيّن اتجاه القبلة بالنسبة للشمال.`; }, 2500);
    }

    if (needsPerm) {
      $('#en', el).onclick = async () => {
        try {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r === 'granted') { $('#en', el).remove(); msg.textContent = 'جارٍ قراءة البوصلة…'; listen(); } else toast('لم يتم السماح باستخدام البوصلة');
        } catch (e) { toast('تعذر تفعيل البوصلة'); }
      };
    } else if (typeof window.DeviceOrientationEvent !== 'undefined') listen();
    else msg.textContent = `لا يتوفر حساس البوصلة. اتجه نحو ${N(Math.round(q))}° من الشمال.`;

    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient, true);
      window.removeEventListener('deviceorientation', onOrient, true);
    };
  }
};
