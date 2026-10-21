// Reports + achievements.
import { S, dateKey, streak, bestStreak, totalRead, level, LEVELS, BADGES } from '../core/store.js';
import { loadQuran, surahName, ayahCount, juzOf, SURAH_COUNT } from '../core/quran.js';
import { esc, icon, toast, header, N } from '../ui.js';

const WD = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']; // Sunday..Saturday
const avgAcc = () => (S.rec.length ? Math.round(S.rec.reduce((t, r) => t + (r.acc || 0), 0) / S.rec.length) : 0);
const accColor = a => (a >= 90 ? 'var(--ok)' : a >= 70 ? 'var(--gold)' : 'var(--bad)');
const dayRead = off => (S.days[dateKey(off)] || {}).a || 0;

function weekAyahs() { let t = 0; for (let i = 0; i < 7; i++) t += dayRead(i); return t; }

function bars() {
  const items = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    items.push({ v: dayRead(i), l: WD[d.getDay()] });
  }
  const max = Math.max(1, ...items.map(x => x.v));
  return `<div class="bars" style="direction:ltr">${items.map(x =>
    `<div><small>${N(x.v)}</small><i style="height:${Math.max(x.v ? 6 : 2, Math.round(x.v / max * 100))}%"></i>${x.l}</div>`).join('')}</div>`;
}

function heat() {
  const goal = S.settings.goal || 10;
  let cells = '';
  for (let i = 83; i >= 0; i--) {
    const a = dayRead(i);
    const l = a <= 0 ? 0 : a >= goal ? 4 : a >= goal * 0.6 ? 3 : a >= goal * 0.3 ? 2 : 1;
    cells += `<div class="heat-cell l${l}" title="${esc(dateKey(i))}: ${N(a)}"></div>`;
  }
  return `<div class="heat" style="direction:ltr;display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,1fr);grid-auto-columns:1fr;gap:3px">${cells}</div>
    <div class="row small muted mt" style="justify-content:center;align-items:center;gap:4px;direction:ltr">أقل ${[0, 1, 2, 3, 4].map(l => `<span class="heat-cell l${l}" style="display:inline-block;width:14px;height:14px"></span>`).join('')} أكثر</div>`;
}

function spark() {
  const pts = S.rec.slice(0, 10).reverse().map(r => r.acc || 0);
  if (pts.length < 2) return '<p class="muted small center">أنهِ تسميعين على الأقل لرؤية المنحنى</p>';
  const W = 300, H = 70, p = 8;
  const xy = pts.map((v, i) => [p + i * (W - 2 * p) / (pts.length - 1), p + (1 - v / 100) * (H - 2 * p)]);
  const d = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="منحنى الدقة" style="direction:ltr">
    <path d="${d}" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${xy.map((q, i) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" fill="${accColor(pts[i])}"/>`).join('')}</svg>`;
}

function juzGrid() {
  const tot = new Array(30).fill(0), got = new Array(30).fill(0);
  for (let s = 1; s <= SURAH_COUNT; s++) for (let a = 1, n = ayahCount(s); a <= n; a++) tot[juzOf(s, a) - 1]++;
  for (const k in S.read) { const [s, a] = k.split(':').map(Number); if (s && a) got[juzOf(s, a) - 1]++; }
  return `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">${tot.map((t, i) => {
    const p = Math.round(got[i] / t * 100);
    return `<div class="card tight center" style="padding:.4rem .2rem;${p ? `background:linear-gradient(to top,var(--gold-soft) ${p}%,transparent ${p}%)` : ''}"><b>${N(i + 1)}</b><div class="muted small">${N(p)}٪</div></div>`;
  }).join('')}</div>`;
}

function recList() {
  if (!S.rec.length) return '<div class="card empty"><p>لا توجد تسميعات بعد. ابدأ أول تسميع لك.</p><button class="btn" data-go="recite">ابدأ التسميع</button></div>';
  return `<div class="list">${S.rec.slice(0, 8).map(r => {
    const miss = (r.miss || []).slice(0, 6);
    return `<div class="list-item"><div class="li-main"><b>${esc(surahName(r.s))}</b> ${N(r.from)}–${N(r.to)}
      <div class="li-sub">${esc(r.d)}</div>
      ${miss.length ? `<div class="row" style="gap:4px;margin-top:4px">${miss.map(w => `<span class="chip quran" style="color:var(--bad)">${esc(w)}</span>`).join('')}</div>` : ''}</div>
      <div class="li-end"><b style="color:${accColor(r.acc)}">${N(Math.round(r.acc))}٪</b></div></div>`;
  }).join('')}</div>`;
}

function reports() {
  const tr = totalRead(), pct = tr / 6236 * 100;
  return `
    <div class="grid-2">
      <div class="stat"><b>${N(weekAyahs())}</b><span>آيات هذا الأسبوع</span></div>
      <div class="stat"><b>${S.rec.length ? N(avgAcc()) + '٪' : '—'}</b><span>متوسط دقة التسميع</span></div>
      <div class="stat"><b>${N(Math.max(bestStreak(), streak()))}</b><span>أفضل سلسلة (يوم)</span></div>
      <div class="stat"><b>${N(S.pts)}</b><span>مجموع النقاط</span></div>
    </div>
    <div class="section-title mt">القراءة آخر ٧ أيام</div>
    <div class="card">${bars()}</div>
    <div class="section-title mt">نشاطك آخر ١٢ أسبوعاً</div>
    <div class="card">${heat()}</div>
    <div class="section-title mt">دقة آخر التسميعات</div>
    <div class="card">${spark()}</div>
    <div class="section-title mt">تقدم الختمة</div>
    <div class="card"><div class="row" style="justify-content:space-between"><b>${N(tr)} / ${N(6236)}</b><b class="gold">${N(pct.toFixed(1))}٪</b></div>
      <div class="progress mt"><i style="width:${pct.toFixed(1)}%"></i></div></div>
    <div class="section-title mt">الأجزاء</div>
    <div class="card">${juzGrid()}</div>
    <div class="section-title mt">آخر التسميعات</div>
    ${recList()}`;
}

function achievements() {
  const lv = level();
  const path = LEVELS.map((n, i) => {
    const cur = i === lv.index, done = i < lv.index;
    return `<div class="row" style="align-items:center;gap:.6rem;opacity:${done || cur ? 1 : .5}">
      <span class="num-diamond">${N(i + 1)}</span>
      <b class="${cur ? 'gold' : ''}">${esc(n)}</b>${cur ? '<span class="chip active small">أنت هنا</span>' : done ? `<span class="gold">${icon('check', 16)}</span>` : ''}</div>`;
  }).join('<div style="width:2px;height:12px;background:var(--line);margin-inline-start:18px"></div>');
  const badges = BADGES.map(b => {
    const d = S.badges[b.id];
    return `<div class="badge${d ? '' : ' locked'}"><div class="badge-icon">${d ? b.icon : '🔒'}</div><b>${esc(b.title)}</b><small>${d ? esc(d) : esc(b.desc)}</small></div>`;
  }).join('');
  const pts = [['قراءة آية', '+٢'], ['تحقيق الهدف اليومي', '+٢٥'], ['تسميع', '+٥ إلى +٥٥'], ['مراجعة', '+٣ / +٨'], ['إنجاز جديد', '+٢٠'], ['إكمال الأذكار', '+١٠']];
  return `
    <div class="card hero"><div class="muted small">مستواك الحالي</div>
      <div class="gold" style="font-family:var(--font-display);font-size:1.6rem">${esc(lv.name)}</div>
      <div class="progress mt"><i style="width:${Math.round(lv.progress * 100)}%"></i></div>
      <div class="muted small">${N(S.pts)} نقطة${lv.toNext ? ` · ${N(lv.toNext)} للمستوى التالي` : ''}</div></div>
    <div class="card mt">${path}</div>
    <div class="section-title mt">الأوسمة</div>
    <div class="badge-grid">${badges}</div>
    <div class="section-title mt">كيف تكسب النقاط؟</div>
    <div class="list">${pts.map(([t, v]) => `<div class="list-item"><div class="li-main">${t}</div><div class="li-end gold"><b>${v}</b></div></div>`).join('')}</div>`;
}

function shareText() {
  const lv = level();
  const name = (S.profile.name || '').trim();
  return `${name ? name + ' - ' : ''}تقدمي في تطبيق نور للقرآن 🌙\n` +
    `🔥 سلسلة: ${N(streak())} يوم\n📖 آيات مقروءة: ${N(totalRead())}\n🏅 المستوى: ${lv.name}\n` +
    (S.rec.length ? `🎙️ دقة التسميع: ${N(avgAcc())}٪\n` : '') + 'شاركنا الأجر، حمّل تطبيق نور للقرآن.';
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('تم نسخ ملخص تقدمك، الصقه في واتساب'); }
  catch (e) { toast('تعذر المشاركة على هذا الجهاز'); }
}

export default {
  async render(el) {
    try { await loadQuran(); } catch (e) { /* juz grid needs it */ }
    let tab = 'reports';
    const draw = () => {
      el.innerHTML = `${header('تقاريري وإنجازاتي', { back: 'more' })}
        <div class="seg mb"><button data-t="reports" class="${tab === 'reports' ? 'active' : ''}">التقارير</button><button data-t="ach" class="${tab === 'ach' ? 'active' : ''}">الإنجازات</button></div>
        ${tab === 'reports' ? reports() : achievements()}
        <button class="btn block mt" id="share">${icon('send', 18)} مشاركة تقدمي</button>`;
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { tab = b.dataset.t; draw(); window.scrollTo(0, 0); }; });
      el.querySelector('#share').onclick = share;
    };
    try { draw(); } catch (e) { console.error(e); el.innerHTML = '<div class="card empty"><p>تعذر عرض التقارير.</p></div>'; }
  }
};
