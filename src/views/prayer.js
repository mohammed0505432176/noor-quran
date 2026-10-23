import { esc, $, $$, toast, icon, header, N } from '../ui.js';
import { S, updateSettings } from '../core/store.js';
import { isNative } from '../core/platform.js';
import { PRAYERS, METHODS, timesFor, nextPrayer, formatTime, currentConfig, ensureLocation, refreshSchedule, playAdhanNow, stopAdhan, isAdhanPlaying } from '../core/prayer.js';
import { updatePrayerWidget } from '../core/widget.js';

const pad = n => String(n).padStart(2, '0');
const hijri = d => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
const greg = d => new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`.replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

export default {
  async render(el) {
    let timer = null;
    let alive = true;
    let testStarted = false;
    const web = !isNative();

    function draw() {
      const cfg = currentConfig();
      const p = S.settings.prayer;
      const now = new Date();
      const t = timesFor(now, cfg);
      const nx = nextPrayer(now, cfg);
      const friday = now.getDay() === 5;
      const rows = PRAYERS.map(pr => {
        const passed = t[pr.key] <= now && nx.key !== pr.key;
        const isNext = nx.key === pr.key && nx.time.toDateString() === now.toDateString();
        const name = pr.key === 'dhuhr' && friday ? 'الجمعة' : pr.name;
        return `<div class="prayer-row${isNext ? ' next' : ''}${passed ? ' passed' : ''}"><span class="prayer-name">${esc(name)}</span><span class="prayer-time">${esc(formatTime(t[pr.key]))}</span></div>`;
      }).join('');
      el.innerHTML = `
        ${header('مواقيت الصلاة', { actions: `<button class="icon-btn" data-go="qibla" aria-label="القبلة">${icon('compass')}</button>` })}
        <section class="prayer-hero card hero center">
          <div class="muted small">${esc(cfg.city || 'موقعك')}</div>
          <div class="gold">${esc(hijri(now))}</div>
          <div class="muted small">${esc(greg(now))}</div>
          <div class="mt">الصلاة القادمة: <b>${esc(nx.key === 'dhuhr' && friday ? 'الجمعة' : nx.name)}</b> · ${esc(formatTime(nx.time))}</div>
          <div class="prayer-countdown" id="cd" style="font-size:2.2rem;font-weight:700;direction:ltr">${countdown(nx.time - now)}</div>
          ${cfg.known ? '' : '<div class="muted small mt">نستخدم موقع الرياض مؤقتاً. اضغط «تحديث موقعي» لتحديد موقعك.</div>'}
        </section>
        <div class="list mt">${rows}</div>
        <div class="card mt adhan-card-set">
          <div class="section-title">الأذان عند دخول الوقت</div>
          <p class="muted small">يصلك إشعار بصوت الأذان في وقت الصلاة تمامًا</p>
          <div class="seg mt" id="ad-snd">${[['full', 'الأذان كاملًا'], ['short', 'تكبيرات قصيرة'], ['silent', 'إشعار صامت']].map(([v, l]) => `<button data-v="${v}" class="${(p.adhan || 'full') === v ? 'active' : ''}">${l}</button>`).join('')}</div>
          <div class="muted small mt">الأذان لكل صلاة</div>
          <div class="adhan-days" id="ad-days">${PRAYERS.filter(x => x.key !== 'sunrise').map(x => `<button type="button" class="chip ${(p.adhanOn || {})[x.key] === false ? '' : 'active'}" data-k="${x.key}" aria-pressed="${(p.adhanOn || {})[x.key] === false ? 'false' : 'true'}" style="cursor:pointer">${esc(x.name)}</button>`).join('')}</div>
          <button class="btn mt" id="tst">${icon('bell', 18)} تجربة الأذان</button>
        </div>
        <div class="card mt">
          <div class="section-title">الإعدادات</div>
          <div class="list-item"><div class="li-main">تنبيهات الأذان</div><div class="li-end"><label class="switch"><input type="checkbox" id="pn" ${p.notify ? 'checked' : ''}><span></span></label></div></div>
          <div class="list-item mt"><div class="li-main">تذكير قبل الصلاة</div><div class="li-end"><label class="switch"><input type="checkbox" id="pre-on" ${p.preOn ? 'checked' : ''}><span></span></label></div></div>
          ${p.preOn ? `<div class="field mt"><label for="pa">قبل الصلاة بـ</label><select class="select" id="pa">${[5, 10, 15, 20, 30].map(m => `<option value="${m}" ${Number(p.preAlert) === m ? 'selected' : ''}>${N(m)} دقيقة</option>`).join('')}</select></div>` : ''}
          <div class="field mt"><label for="pm">طريقة الحساب</label><select class="select" id="pm">${Object.entries(METHODS).map(([k, v]) => `<option value="${k}" ${p.method === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          <div class="field mt"><label>المذهب (العصر)</label><div class="seg" id="pd"><button data-v="shafi" class="${p.madhab !== 'hanafi' ? 'active' : ''}">شافعي/جمهور</button><button data-v="hanafi" class="${p.madhab === 'hanafi' ? 'active' : ''}">حنفي</button></div></div>
          <div class="row mt"><button class="btn ghost" id="loc">${icon('compass', 18)} تحديث موقعي</button></div>
          ${web ? '<p class="muted small mt">للتنبيه حتى والتطبيق مغلق ثبّت نسخة الأندرويد</p>' : ''}
        </div>
        ${web ? '' : `<div class="card mt">
          <div class="section-title">ويدجت الشاشة الرئيسية</div>
          <p class="muted small">أضف ويدجت مواقيت الصلاة إلى الشاشة الرئيسية: اضغط مطولاً على الشاشة ← الأدوات (Widgets) ← نور</p>
        </div>`}`;
      wire();
      updatePrayerWidget(); // keep the home-screen widget in sync with the times shown here
      tick();
    }

    function tick() {
      const cd = $('#cd', el); if (!cd) return;
      const now = new Date();
      const nx = nextPrayer(now, currentConfig());
      const left = nx.time - now;
      cd.textContent = countdown(left);
      if (left <= 1000) setTimeout(() => { if (alive) draw(); }, 1200);
    }

    async function resched(msg) {
      updatePrayerWidget();
      const r = await refreshSchedule();
      if (!msg) return;
      if (!S.settings.prayer.notify) return toast('تم الحفظ. تنبيهات الأذان متوقفة حالياً');
      if (r.denied) return toast('فعّل الإذن بالإشعارات من إعدادات الجوال');
      if (r.error) return toast('تعذر جدولة التنبيهات');
      if (!r.scheduled) return toast(currentConfig().known ? 'لا توجد تنبيهات لضبطها الآن' : 'حدّد موقعك أولاً لضبط التنبيهات');
      toast(r.web ? 'تم الحفظ. التنبيه على الويب يعمل أثناء فتح التطبيق فقط' : 'تم ضبط التنبيهات للأيام السبعة القادمة');
    }

    function wire() {
      $('#pn', el).onchange = async e => {
        const on = e.target.checked;
        if (on) {
          const { ensurePermission } = await import('../core/notify.js');
          const r = await ensurePermission();
          if (!r.granted) { e.target.checked = false; updateSettings({ prayer: { notify: false } }); return toast('لم يتم السماح بالإشعارات'); }
          updateSettings({ prayer: { notify: true } });
          await ensureLocation();
          await resched(true);
        } else {
          updateSettings({ prayer: { notify: false } });
          try { const n = await import('../core/notify.js'); await n.cancelRange(n.ID.prayer[0], n.ID.wird[1]); } catch (err) { /* ignore */ }
          toast('تم إيقاف التنبيهات');
        }
      };
      $('#pre-on', el).onchange = async e => { const pp = { preOn: e.target.checked };
        if (pp.preOn && ![5, 10, 15, 20, 30].includes(Number(S.settings.prayer.preAlert))) pp.preAlert = 10;
        updateSettings({ prayer: pp }); draw(); await resched(true); };
      const pa = $('#pa', el); if (pa) pa.onchange = async e => { updateSettings({ prayer: { preAlert: Number(e.target.value) } }); await resched(true); };
      $$('#ad-snd button', el).forEach(b => b.onclick = async () => { updateSettings({ prayer: { adhan: b.dataset.v } }); draw(); await resched(true); });
      $$('#ad-days .chip', el).forEach(c => c.onclick = async () => {
        const cur = { ...(S.settings.prayer.adhanOn || {}) }; cur[c.dataset.k] = cur[c.dataset.k] === false;
        updateSettings({ prayer: { adhanOn: cur } }); draw(); await resched(false);
      });
      $('#pm', el).onchange = async e => { updateSettings({ prayer: { method: e.target.value } }); draw(); await resched(false); };
      $$('#pd button', el).forEach(b => b.onclick = async () => { updateSettings({ prayer: { madhab: b.dataset.v } }); draw(); await resched(false); });
      $('#loc', el).onclick = async () => {
        toast('جارٍ تحديد موقعك…');
        const r = await ensureLocation(true);
        if (!alive) return;
        draw();
        toast(r.ok ? 'تم تحديث موقعك' + (r.city ? ': ' + r.city : '') : r.fallback ? 'تعذر تحديد موقعك، نستخدم الرياض ويمكنك تغييره لاحقاً' : 'تعذر تحديث الموقع');
        resched(false);
      };
      $('#tst', el).onclick = async () => {
        try {
          const n = await import('../core/notify.js');
          const choice = S.settings.prayer.adhan || 'full';
          if (web) { testStarted = true; playAdhanNow('تجربة الأذان', choice, ''); return; }
          const r = await n.testNotification(n.adhanChannel(choice), 10);
          toast(r.sent ? 'سيصلك إشعار تجريبي خلال ١٠ ثوانٍ' : 'فعّل إذن الإشعارات لتصلك التجربة');
        } catch (err) { toast('تعذر إرسال التنبيه'); }
      };
    }

    draw();
    timer = setInterval(tick, 1000);
    // first visit: try to get the real location in the background
    if (typeof S.settings.prayer.lat !== 'number') ensureLocation().then(r => {
      if (!alive) return;
      if (r.fallback) toast('تعذر تحديد موقعك، نستخدم الرياض. اضغط «تحديث موقعي» لتغييره');
      draw();
      if (S.settings.prayer.notify) refreshSchedule();
    }).catch(() => {});
    return () => { alive = false; clearInterval(timer); if (testStarted && isAdhanPlaying()) stopAdhan(); };
  }
};
