// Daily wird: a reading plan (finish the Mushaf in N days, or a fixed number of pages a day) with today's portion, the pages
// owed from missed days, a streak and the overall progress. The maths is core/wird.js; the state lives in store.js (S.wird).
import { S, save, setWird, clearWird, markWirdPage, wirdStatus } from '../core/store.js';
import { KHATMA_CHOICES, PAGES, nextPage } from '../core/wird.js';
import { esc, icon, toast, sheet, header, N } from '../ui.js';

const rangeText = pages => {
  if (!pages.length) return '';
  const a = pages[0], b = pages[pages.length - 1];
  return pages.length === 1 ? `صفحة ${N(a)}` : `من صفحة ${N(a)} إلى صفحة ${N(b)}`;
};
const bar = pct => `<div class="progress mt"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;

function setupHtml(sel) {
  const chips = KHATMA_CHOICES.map(d => `<button class="chip${sel.kind === 'khatma' && sel.days === d ? ' active' : ''}" data-days="${d}">${d === 365 ? 'سنة' : d === 30 ? 'شهر' : d === 60 ? 'شهران' : d === 90 ? '٣ أشهر' : '٦ أشهر'}</button>`).join('');
  const per = sel.kind === 'khatma' ? Math.round(PAGES / sel.days) : sel.perDay;
  return `<div class="card"><div class="section-title">ابدأ وِردك اليومي</div>
    <p class="muted small">اختر مدة الختمة فيُقسَّم المصحف على الأيام، أو اختر عدد صفحات ثابتاً كل يوم.</p>
    <div class="field"><label>ختمة في</label><div class="row" style="gap:6px;flex-wrap:wrap">${chips}</div></div>
    <div class="field"><label>أو عدد الصفحات يومياً</label>
      <div class="row" style="align-items:center;gap:10px">
        <button class="icon-btn" data-per="-1" aria-label="أقل">${icon('minus', 18)}</button><b id="w-per" style="min-width:2.5rem;text-align:center">${N(sel.kind === 'pages' ? sel.perDay : per)}</b><button class="icon-btn" data-per="1" aria-label="أكثر">${icon('plus', 18)}</button>
      </div></div>
    <p class="small" id="w-sum">وِردك: نحو ${N(per)} صفحة يومياً — ${sel.kind === 'khatma' ? `تختم في ${N(sel.days)} يوماً` : `تختم في ${N(Math.ceil(PAGES / sel.perDay))} يوماً`}</p>
    <button class="btn block mt" id="w-start">ابدأ الخطة</button></div>`;
}

function planHtml(st, plan) {
  const todayPct = st.today.length ? Math.round(100 * (st.today.length - st.todayLeft.length) / st.today.length) : 0;
  const overall = Math.round(100 * st.readCount / PAGES);
  const go = nextPage(st);
  let lead;
  if (st.finished) lead = '<b class="gold">انتهت مدة الخطة</b><p class="muted small">يمكنك البدء بخطة جديدة.</p>';
  else if (st.idx < 0) lead = '<p class="muted">تبدأ الخطة في موعدها.</p>';
  else lead = `<div class="row" style="justify-content:space-between;align-items:center"><div><div class="muted small">وِردك اليوم</div><b>${rangeText(st.today)}</b></div>
      ${st.streak ? `<span class="chip active small">${icon('fire', 14)} ${N(st.streak)} ${st.streak === 1 ? 'يوم' : 'أيام'}</span>` : ''}</div>
      ${bar(todayPct)}
      <p class="small mt">${st.todayDone ? 'أتممت وِردك اليوم، بارك الله فيك ✓' : `بقي ${N(st.todayLeft.length)} من ${N(st.today.length)} صفحة`}</p>`;
  return `<div class="card">${lead}
      ${st.owed.length ? `<p class="small mt" style="color:var(--bad)">متأخر: ${N(st.owed.length)} صفحة من أيام سابقة — تُقرأ أولاً.</p>` : ''}
      <div class="row mt" style="gap:8px;flex-wrap:wrap">
        ${go ? `<button class="btn" id="w-open">${icon('book', 18)} افتح المصحف عند وِردك</button>` : ''}
        ${st.todayLeft.length ? '<button class="btn ghost" id="w-mark">علّم صفحات اليوم مقروءة</button>' : ''}
      </div></div>
    <div class="card mt"><div class="section-title">المصحف كاملاً</div>
      <p class="small">${N(st.readCount)} من ${N(PAGES)} صفحة (${N(overall)}٪)</p>${bar(overall)}
      <p class="muted small mt">الخطة: ${plan.kind === 'khatma' ? `ختمة في ${N(plan.days)} يوماً` : `${N(plan.perDay)} صفحات يومياً`} · بدأت ${esc(plan.start)}</p></div>
    <button class="btn ghost block mt" id="w-reset">تغيير الخطة</button>`;
}

export default {
  async render(el) {
    const sel = { kind: 'khatma', days: 30, perDay: 5 };
    const draw = () => {
      const st = wirdStatus(), plan = S.wird && S.wird.plan;
      el.innerHTML = header('الورد اليومي', { back: 'more' }) + (st && plan ? planHtml(st, plan) : setupHtml(sel));
      if (!(st && plan)) {
        el.querySelectorAll('[data-days]').forEach(b => { b.onclick = () => { sel.kind = 'khatma'; sel.days = +b.dataset.days; draw(); }; });
        el.querySelectorAll('[data-per]').forEach(b => { b.onclick = () => {
          const cur = sel.kind === 'pages' ? sel.perDay : Math.max(1, Math.round(PAGES / sel.days));
          sel.kind = 'pages'; sel.perDay = Math.min(100, Math.max(1, cur + +b.dataset.per)); draw();
        }; });
        el.querySelector('#w-start').onclick = () => { setWird(sel.kind === 'pages' ? { kind: 'pages', perDay: sel.perDay } : { kind: 'khatma', days: sel.days }); toast('بدأت خطة الورد'); draw(); };
        return;
      }
      const open = el.querySelector('#w-open');
      if (open) open.onclick = () => window.noorGo(`mushaf/p${nextPage(st)}`);
      const mark = el.querySelector('#w-mark');
      if (mark) mark.onclick = () => { for (const p of st.todayLeft) markWirdPage(p); toast('عُلّمت صفحات اليوم'); draw(); };
      el.querySelector('#w-reset').onclick = () => {
        const sh = sheet(`<h3>تغيير خطة الورد؟</h3><p class="muted">تبدأ خطة جديدة من اليوم. تبقى الصفحات التي قرأتها محفوظة في سجلك.</p>
          <div class="row mt"><button class="btn" id="r-ok">نعم، غيّر</button><button class="btn ghost" id="r-no">إلغاء</button></div>`);
        sh.querySelector('#r-no').onclick = sh.close;
        sh.querySelector('#r-ok').onclick = () => { const keep = S.wird.log; clearWird(); S.wird.log = keep; save(); sh.close(); draw(); };
      };
    };
    draw();
  }
};
