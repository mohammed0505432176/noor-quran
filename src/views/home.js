// Home dashboard.
import { S, today, dayStat, streak, level, totalRead, dueReviews } from '../core/store.js';
import { loadQuran, surahName, ayah, ayahCount, SURAH_COUNT } from '../core/quran.js';
import { pageOf } from '../core/pages.js';
import { ayahOfDay } from '../core/ayah-of-day.js';
import { esc, icon, N } from '../ui.js';

function greeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'صباح الخير' : 'مساء الخير';
  const n = (S.profile.name || '').trim();
  return n ? `${g}، ${n}` : g;
}

function dateLine() {
  const d = new Date();
  let hj = '', gr = '';
  try { hj = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) { /* no locale data */ }
  try { gr = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(d); } catch (e) { /* no locale data */ }
  return [hj, gr].filter(Boolean).join(' · ');
}

function ring(done, goal) {
  const pct = Math.min(1, goal > 0 ? done / goal : 0);
  const r = 40, c = 2 * Math.PI * r;
  return `<div class="ring" style="position:relative;width:96px;height:96px;flex:none">
    <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" transform="rotate(-90 48 48)"
        style="filter:drop-shadow(0 0 5px var(--gold-glow));transition:stroke-dashoffset .8s ease"/>
    </svg>
    <div class="ring-label" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2">
      <b style="font-size:1.35rem">${N(done)}</b><span class="muted small">من ${N(goal)}</span>
    </div>
  </div>`;
}

/** The ayah of today (core/ayah-of-day.js). */
const ayahOfToday = () => ayahOfDay(new Date(), ayahCount, SURAH_COUNT);

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
    try { ad = ayahOfToday(); } catch (e) { ad = null; }

    let pg = '';
    try { if (last && last.s) pg = `صفحة ${N(pageOf(last.s, last.a))}`; } catch (e) { pg = ''; }
    const continueCard = last && last.s
      ? `<button class="card hm-continue" data-go="mushaf/${last.s}?a=${last.a}">
          <span class="hm-ic" style="--t:var(--tint-a)">${icon('book', 24)}</span>
          <span class="hm-grow"><span class="muted small">تابع القراءة</span><b class="hm-big">سورة ${esc(surahName(last.s))}</b>
            <span class="muted small">آية ${N(last.a)}${pg ? ' · ' + pg : ''}</span></span>
          <span class="hm-go">${icon('back', 20)}</span></button>`
      : `<button class="card hm-continue" data-go="mushaf/1">
          <span class="hm-ic" style="--t:var(--tint-a)">${icon('book', 24)}</span>
          <span class="hm-grow"><span class="muted small">ورد اليوم</span><b class="hm-big">ابدأ القراءة</b><span class="muted small">من سورة الفاتحة</span></span>
          <span class="hm-go">${icon('back', 20)}</span></button>`;

    const adCard = ad ? `<div class="card hm-ayah">
      <div class="hm-ayah-tag">آية اليوم</div>
      <p class="quran hm-ayah-text">${esc(ayah(ad.s, ad.a))}</p>
      <p class="muted small hm-ayah-ref">${esc(surahName(ad.s))} · ${N(ad.a)}</p>
      <div class="row">
        <button class="btn sm" data-go="mushaf/${ad.s}?a=${ad.a}">${icon('play', 18)} استمع</button>
        <button class="btn sm ghost" data-go="ai?s=${ad.s}&a=${ad.a}">${icon('spark', 18)} تفسير بالذكاء</button>
      </div></div>` : '';

    const quick = [['recite', 'mic', 'التسميع', 'a'], ['ai', 'spark', 'المساعد الذكي', 'e'], ['azkar', 'hands', 'الأذكار', 'b'], ['train', 'trophy', 'مركز التدريب', 'd'], ['tasbeeh', 'beads', 'المسبحة', 'c'], ['qibla', 'compass', 'القبلة', 'a']]
      .map(([r, ic, t, c]) => `<button class="hm-quick" data-go="${r}"><span class="hm-ic" style="--t:var(--tint-${c})">${icon(ic, 24)}</span><span class="hm-quick-t">${t}</span></button>`).join('');

    el.innerHTML = `
      <header class="hm-head"><div><div class="hm-date muted small">${esc(dateLine())}</div><h1 class="page-title">${esc(greeting())}</h1></div></header>
      <div class="card hero hm-prayer"><div id="prayer-box"></div></div>
      ${continueCard}
      <div class="card hm-goal"><div class="row" style="align-items:center;gap:16px;flex-wrap:nowrap">
          ${ring(done, goal)}
          <div style="flex:1;min-width:0">
            <div class="muted small">ورد اليوم</div>
            <div class="gold" style="font-family:var(--font-display);font-size:1.3rem">${esc(lv.name)}</div>
            <div class="progress" style="margin-top:8px" aria-label="التقدم للمستوى التالي"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
            <div class="muted small">${lv.toNext ? `${N(lv.toNext)} نقطة للمستوى التالي` : 'أعلى مستوى'}</div>
          </div>
      </div></div>
      ${adCard}
      <div class="grid-3">
        <div class="stat"><b>${icon('fire', 20)} ${N(streak())}</b><span>أيام متتالية</span></div>
        <div class="stat"><b>${N(totalRead())}</b><span>آية مقروءة</span></div>
        <div class="stat"><b>${N(S.rec.length)}</b><span>تسميع</span></div>
      </div>
      ${due.length ? `<div class="card tight mt" data-go="review" style="cursor:pointer"><div class="row" style="align-items:center;flex-wrap:nowrap"><span class="hm-ic sm" style="--t:var(--tint-e)">${icon('brain', 20)}</span><div style="flex:1"><b>لديك ${N(due.length)} مقاطع للمراجعة اليوم</b><div class="muted small">المراجعة المنتظمة تثبّت الحفظ</div></div></div></div>` : ''}
      <div id="fam-box"></div>
      <div class="section-title">اختصارات</div>
      <div class="grid-3 hm-quick-grid">${quick}</div>
      <button class="k-entry mt" data-go="kids"><span class="k-entry-art"><img class="k-art" src="${import.meta.env.BASE_URL}kids/img/mascot.webp" alt=""></span>
          <span style="flex:1"><b>ركن الأطفال ✨</b><small>تعلّم ممتع بالصوت والنجوم</small></span></button>`;

    // Next prayer (lazy)
    const box = el.querySelector('#prayer-box');
    const fallback = () => {
      if (box) box.innerHTML = `<div class="hm-pr"><span class="hm-ic" style="--t:var(--tint-b)">${icon('mosque', 24)}</span><div class="hm-grow"><div class="muted small">مواقيت الصلاة</div><b class="hm-big">الصلاة القادمة</b></div><button class="btn sm" data-go="prayer">فعّل المواقيت</button></div>`;
    };
    try {
      const p = await import('../core/prayer.js');
      if (!alive) return;
      const cfg = p.currentConfig();
      if (!cfg.known) fallback();
      else {
        const np = p.nextPrayer(new Date(), cfg);
        box.innerHTML = `<div class="hm-pr" data-go="prayer" style="cursor:pointer"><span class="hm-ic" style="--t:var(--tint-b)">${icon('mosque', 24)}</span>
          <div class="hm-grow"><div class="muted small">الصلاة القادمة</div><b class="hm-big">${esc(np.name)}</b><span class="muted small">${esc(p.formatTime(np.time))}</span></div>
          <div class="hm-cd-wrap"><span class="muted small">متبقي</span><b class="hm-cd gold" id="cd" dir="ltr">--:--:--</b></div></div>`;
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

    // Family rank (lazy, silent on failure)
    (async () => {
      try {
        const fm = await import('../core/family.js');
        if (!fm.getFamily()) return;
        const r = await fm.board(); // cached (60 s)
        if (!alive || !r.family || !r.members.length) return;
        const w = m => Number(m.stats && m.stats.week) || 0;
        const sorted = [...r.members].sort((a, b) => w(b) - w(a));
        const mine = sorted.findIndex(m => m.me), lead = sorted[0];
        const fb = el.querySelector('#fam-box'); if (!fb) return;
        const msg = mine === 0 ? 'أنت في الصدارة هذا الأسبوع 🥇' : `ترتيبك ${N(mine + 1)} من ${N(sorted.length)}`;
        fb.innerHTML = `<div class="card tight mt" data-go="family" style="cursor:pointer"><div class="row" style="align-items:center;flex-wrap:nowrap"><span class="hm-ic sm" style="--t:var(--tint-d)">${icon('home', 20)}</span>
          <div style="flex:1;min-width:0"><div class="muted small">${esc(r.family.name || 'دائرة العائلة')}</div><b>${mine >= 0 ? msg : 'دائرة العائلة'}</b>
          ${mine !== 0 && lead ? `<div class="muted small">المتصدر: ${esc(lead.name)} · ${N(w(lead))} آية</div>` : ''}</div></div></div>`;
      } catch (e) { /* silent */ }
    })();

    return () => { alive = false; timers.forEach(clearInterval); };
  }
};
