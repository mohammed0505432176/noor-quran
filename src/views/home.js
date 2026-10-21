// Home dashboard.
import { S, today, dayStat, streak, level, totalRead, dueReviews } from '../core/store.js';
import { loadQuran, surahName, ayah, ayahCount, SURAH_COUNT } from '../core/quran.js';
import { esc, icon, N } from '../ui.js';

function greeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء النور';
  const n = (S.profile.name || '').trim();
  return n ? `${g}، ${n}` : g;
}

function ring(done, goal) {
  const pct = Math.min(1, goal > 0 ? done / goal : 0);
  const r = 52, c = 2 * Math.PI * r;
  return `<div class="ring" style="position:relative;width:128px;height:128px;flex:none">
    <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden="true">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--line)" stroke-width="9"/>
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--gold)" stroke-width="9" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" transform="rotate(-90 64 64)"
        style="filter:drop-shadow(0 0 6px var(--gold));transition:stroke-dashoffset .8s ease"/>
    </svg>
    <div class="ring-label" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2">
      <b style="font-size:1.6rem">${N(done)}</b><span class="muted small">من ${N(goal)}</span>
    </div>
  </div>`;
}

/** Deterministic ayah of the day across all 6236 ayahs. */
function ayahOfDay() {
  const d = new Date();
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  let h = (d.getFullYear() * 366 + doy) >>> 0;
  h = (Math.imul(h ^ (h >>> 15), 2246822519) >>> 0);
  h = (Math.imul(h ^ (h >>> 13), 3266489917) >>> 0);
  let idx = (h ^ (h >>> 16)) % 6236;
  for (let s = 1; s <= SURAH_COUNT; s++) {
    const n = ayahCount(s);
    if (idx < n) return { s, a: idx + 1 };
    idx -= n;
  }
  return { s: 1, a: 1 };
}

function fmtCountdown(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = x => String(x).padStart(2, '0').replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export default {
  async render(el) {
    let alive = true;
    const timers = [];
    const done = dayStat(0).a;
    const goal = S.settings.goal || 10;
    const lv = level();
    const due = dueReviews();
    const last = S.last;

    try { await loadQuran(); } catch (e) { /* offline fallback below */ }
    if (!alive) return;
    let ad = null;
    try { ad = ayahOfDay(); } catch (e) { ad = null; }

    const continueBtn = last && last.s
      ? `<button class="btn block" data-go="mushaf/${last.s}?a=${last.a}">تابع القراءة: سورة ${esc(surahName(last.s))} آية ${N(last.a)}</button>`
      : `<button class="btn block" data-go="mushaf/1">ابدأ ورد اليوم</button>`;

    const adCard = ad ? `<div class="card">
      <div class="section-title">آية اليوم</div>
      <p class="quran" style="font-size:1.45rem;line-height:2.2;margin:.4rem 0">${esc(ayah(ad.s, ad.a))}</p>
      <p class="muted small">${esc(surahName(ad.s))} · ${N(ad.a)}</p>
      <div class="row mt">
        <button class="btn sm" data-go="mushaf/${ad.s}?a=${ad.a}">${icon('play', 18)} استمع</button>
        <button class="btn sm ghost" data-go="ai?s=${ad.s}&a=${ad.a}">${icon('spark', 18)} تفسير بالذكاء</button>
      </div></div>` : '';

    const quick = [['recite', 'mic', 'التسميع'], ['ai', 'spark', 'المساعد الذكي'], ['azkar', 'hands', 'الأذكار'], ['train', 'trophy', 'مركز التدريب']]
      .map(([r, ic, t]) => `<button class="card tight center" data-go="${r}" style="cursor:pointer"><span class="gold">${icon(ic, 26)}</span><div class="small mt">${t}</div></button>`).join('');

    el.innerHTML = `
      <header class="page-head"><h1 class="page-title">${esc(greeting())}</h1></header>
      <div class="card hero">
        <div class="row" style="align-items:center;gap:1rem;flex-wrap:nowrap">
          ${ring(done, goal)}
          <div style="flex:1;min-width:0">
            <div class="muted small">ورد اليوم</div>
            <div class="gold" style="font-family:var(--font-display);font-size:1.3rem">${esc(lv.name)}</div>
            <div class="progress mt" aria-label="التقدم للمستوى التالي"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
            <div class="muted small">${lv.toNext ? `${N(lv.toNext)} نقطة للمستوى التالي` : 'أعلى مستوى'}</div>
          </div>
        </div>
        <div class="mt">${continueBtn}</div>
      </div>
      ${adCard}
      <div class="grid-3 mt">
        <div class="stat"><b>${icon('fire', 20)} ${N(streak())}</b><span>أيام متتالية</span></div>
        <div class="stat"><b>${N(totalRead())}</b><span>آية مقروءة</span></div>
        <div class="stat"><b>${N(S.rec.length)}</b><span>تسميع</span></div>
      </div>
      <div id="prayer-box" class="mt"></div>
      ${due.length ? `<div class="card mt" data-go="review" style="cursor:pointer"><div class="row" style="align-items:center"><span class="gold">${icon('brain', 24)}</span><div style="flex:1"><b>لديك ${N(due.length)} مقاطع للمراجعة اليوم</b><div class="muted small">المراجعة المنتظمة تثبّت الحفظ</div></div></div></div>` : ''}
      <div class="section-title mt">اختصارات</div>
      <div class="grid-2">${quick}</div>`;

    // Next prayer (lazy)
    const box = el.querySelector('#prayer-box');
    const fallback = () => {
      if (box) box.innerHTML = `<div class="card tight"><div class="row" style="align-items:center"><span class="gold">${icon('mosque', 22)}</span><div style="flex:1">مواقيت الصلاة</div><button class="btn sm ghost" data-go="prayer">فعّل مواقيت الصلاة</button></div></div>`;
    };
    try {
      const p = await import('../core/prayer.js');
      if (!alive) return;
      const cfg = p.currentConfig();
      if (!cfg.known) fallback();
      else {
        const np = p.nextPrayer(new Date(), cfg);
        box.innerHTML = `<div class="card tight" data-go="prayer" style="cursor:pointer"><div class="row" style="align-items:center"><span class="gold">${icon('mosque', 22)}</span>
          <div style="flex:1"><div class="muted small">الصلاة القادمة</div><b>${esc(np.name)}</b> <span class="muted small">${esc(p.formatTime(np.time))}</span></div>
          <b class="gold" id="cd" dir="ltr">--:--:--</b></div></div>`;
        const cd = box.querySelector('#cd');
        const tick = () => {
          const ms = np.time - Date.now();
          if (cd) cd.textContent = fmtCountdown(ms);
          if (ms <= 0) { clearInterval(iv); }
        };
        const iv = setInterval(tick, 1000);
        timers.push(iv); tick();
      }
    } catch (e) { if (alive) fallback(); }

    return () => { alive = false; timers.forEach(clearInterval); };
  }
};
