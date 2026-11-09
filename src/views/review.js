// Spaced-repetition hifz review.
import { S, save, today, dueReviews, addReview, removeReview, gradeReview, recallNow } from '../core/store.js';
import { loadQuran, surahName, ayahCount, SURAH_COUNT } from '../core/quran.js';
import { esc, icon, toast, sheet, header, N } from '../ui.js';

const dayNum = k => Math.round(new Date(k + 'T12:00:00').getTime() / 864e5);
function rel(due) {
  const d = dayNum(due) - dayNum(today());
  if (d <= 0) return 'اليوم';
  if (d === 1) return 'غداً';
  if (d === 2) return 'بعد يومين';
  if (d <= 10) return `بعد ${N(d)} أيام`;
  return `بعد ${N(d)} يوماً`;
}
const range = r => (r.from === 1 && r.to === ayahCount(r.s) ? 'السورة كاملة' : `الآيات ${N(r.from)}–${N(r.to)}`);
// how likely the passage is remembered right now (FSRS): a small bar and a percentage; «جديد» before its first review
const recallMeter = r => {
  const p = recallNow(r);
  if (p === null) return '<span class="muted small">جديد</span>';
  const pct = Math.round(p * 100);
  return `<span class="small" style="display:inline-flex;align-items:center;gap:6px" aria-label="احتمال التذكّر ${N(pct)} بالمئة"><span style="width:46px;height:6px;border-radius:3px;background:var(--line);overflow:hidden;direction:ltr"><i style="display:block;height:100%;width:${pct}%;background:${pct >= 85 ? 'var(--ok, var(--gold))' : pct >= 60 ? 'var(--gold)' : 'var(--bad)'}"></i></span><b>${N(pct)}٪</b></span>`;
};

function item(r, isDue) {
  return `<div class="card tight" data-id="${esc(r.id)}">
    <div class="row" style="align-items:center;justify-content:space-between">
      <div><b>${esc(surahName(r.s))}</b> <span class="muted small">${range(r)}</span></div>
      ${recallMeter(r)}</div>
    ${isDue ? '' : `<div class="muted small">موعد المراجعة: ${rel(r.due)}</div>`}
    <div class="row mt" style="gap:6px">
      <button class="btn sm" data-act="rec">${icon('mic', 16)} سمّع الآن</button>
      ${isDue ? `<button class="btn sm ghost" data-act="g0">نسيت</button><button class="btn sm ghost" data-act="g1">تردد</button><button class="btn sm ghost" data-act="g2">جيد</button><button class="btn sm ghost" data-act="g3">سهل</button>` : ''}
      <button class="icon-btn" data-act="del" aria-label="حذف">${icon('close', 18)}</button>
    </div></div>`;
}

function addSheet(rerender) {
  const opts = Array.from({ length: SURAH_COUNT }, (_, i) => `<option value="${i + 1}">${N(i + 1)}. ${esc(surahName(i + 1))}</option>`).join('');
  const sh = sheet(`<h3>إضافة مقطع للمراجعة</h3>
    <div class="field"><label>السورة</label><select class="select" id="a-s">${opts}</select></div>
    <div class="grid-2"><div class="field"><label>من آية</label><input class="input" id="a-f" type="number" min="1" value="1" inputmode="numeric"></div>
    <div class="field"><label>إلى آية</label><input class="input" id="a-t" type="number" min="1" inputmode="numeric"></div></div>
    <button class="btn block mt" id="a-ok">إضافة</button>`);
  const sel = sh.querySelector('#a-s'), f = sh.querySelector('#a-f'), t = sh.querySelector('#a-t');
  const sync = () => { const n = ayahCount(+sel.value); f.max = t.max = n; f.value = 1; t.value = n; };
  sel.onchange = sync; sync();
  sh.querySelector('#a-ok').onclick = () => {
    const s = +sel.value, n = ayahCount(s);
    let from = Math.round(+f.value), to = Math.round(+t.value);
    if (!(from >= 1 && to >= from && to <= n)) return toast(`أدخل مدى صحيحاً بين ١ و ${N(n)}`);
    if (!addReview(s, from, to)) toast('هذا المقطع مضاف مسبقاً');
    else toast('تمت إضافة المقطع للمراجعة');
    sh.close(); rerender();
  };
}

function confirmDel(r, rerender) {
  const sh = sheet(`<h3>حذف المقطع؟</h3><p class="muted">سيُحذف ${esc(surahName(r.s))} (${range(r)}) من المراجعة.</p>
    <div class="row mt"><button class="btn danger" id="d-ok">حذف</button><button class="btn ghost" id="d-no">إلغاء</button></div>`);
  sh.querySelector('#d-no').onclick = sh.close;
  sh.querySelector('#d-ok').onclick = () => { removeReview(r.id); sh.close(); toast('تم الحذف'); rerender(); };
}

export default {
  async render(el) {
    try { await loadQuran(); } catch (e) { el.innerHTML = '<div class="card empty"><p>تعذر تحميل نص المصحف.</p></div>'; return; }
    const draw = () => {
      const due = dueReviews();
      const dueIds = new Set(due.map(r => r.id));
      const upcoming = S.reviews.filter(r => !dueIds.has(r.id)).sort((a, b) => a.due.localeCompare(b.due));
      el.innerHTML = `${header('المراجعة', { back: 'more', actions: `<button class="icon-btn" id="add" aria-label="إضافة مقطع">${icon('plus')}</button>` })}
        <p class="muted small">جدولة ذكية (FSRS): يتعلّم التطبيق مدى ثبات كل مقطع عندك، فيراجعه قبل أن تنساه ويباعد ما أتقنته.</p>
        ${S.reviews.length ? '' : `<div class="card empty"><div class="gold">${icon('brain', 40)}</div>
          <p>ابدأ بإضافة مقاطع حفظتها لتراجعها في مواعيدها. نقترح قصار السور من جزء عمّ.</p>
          <button class="btn" id="juz">أضف قصار السور (الناس → الضحى)</button>
          <button class="btn ghost mt" id="add2">إضافة مقطع</button></div>`}
        ${due.length ? `<div class="section-title">مراجعة اليوم (${N(due.length)})</div>${due.map(r => item(r, true)).join('')}` : (S.reviews.length ? '<div class="card empty"><p>أحسنت، لا مراجعات مستحقة اليوم.</p></div>' : '')}
        ${upcoming.length ? `<div class="section-title mt">القادمة</div>${upcoming.map(r => item(r, false)).join('')}` : ''}`;
      const byId = id => S.reviews.find(r => r.id === id);
      el.querySelectorAll('[data-act]').forEach(b => {
        b.onclick = () => {
          const r = byId(b.closest('[data-id]').dataset.id); if (!r) return;
          const a = b.dataset.act;
          if (a === 'rec') window.noorGo(`recite/${r.s}?from=${r.from}&to=${r.to}`);
          else if (a === 'del') confirmDel(r, draw);
          else {
            gradeReview(r.id, +a[1]);
            const nr = byId(r.id);
            toast(`المراجعة القادمة: ${rel(nr.due)}`);
            draw();
          }
        };
      });
      const open = () => addSheet(draw);
      el.querySelector('#add').onclick = open;
      const a2 = el.querySelector('#add2'); if (a2) a2.onclick = open;
      const j = el.querySelector('#juz');
      if (j) j.onclick = () => {
        let c = 0;
        for (let s = 114; s >= 93; s--) { const r = addReview(s, 1, ayahCount(s)); if (r) { r.id += '-' + s; c++; } }
        save();
        toast(`تمت إضافة ${N(c)} سورة للمراجعة`); draw();
      };
    };
    draw();
  }
};
