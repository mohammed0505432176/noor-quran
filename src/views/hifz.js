// «متابعة الحفظ»: 604-page memorization tracker + personal goals.
import { S, today, hifzLevel, hifzTotals, setPageMemorized, addGoal, removeGoal, goalProgress, goalStreak } from '../core/store.js';
import { loadQuran, surahName } from '../core/quran.js';
import { PAGE_COUNT, juzOfPage, pageContent } from '../core/pages.js';
import { esc, icon, toast, sheet, header, celebrate, N } from '../ui.js';

const TYPE_L = { memorize: 'حفظ', review: 'مراجعة', recite: 'تسميع' };
const UNIT_L = { page: 'صفحة', ayah: 'آية', minute: 'دقيقة' };
const PERIOD_L = { day: 'يومياً', week: 'أسبوعياً' };
const FIELD_L = { type: 'النوع', unit: 'الوحدة', period: 'المدة' };
const LVL_L = ['غير محفوظة', 'حفظ ضعيف', 'حفظ جيد', 'حفظ متقن'];

const juzPages = (() => { const a = Array.from({ length: 30 }, () => []); for (let p = 1; p <= PAGE_COUNT; p++) a[juzOfPage(p) - 1].push(p); return a; })();
const fmtDate = k => { if (!k) return 'لم تُراجَع بعد'; const [y, m, d] = k.split('-'); return `${N(+d)}/${N(+m)}/${N(y)}`; };

function ringSvg(frac, size = 64) {
  const r = size / 2 - 5, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="6"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--gold)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - f)).toFixed(1)}"/></svg>`;
}
const periodKey = g => g.id + ':' + (g.period === 'week' ? Math.floor(Date.now() / (864e5 * 7)) : today());
const celKey = g => 'noor.hifz.cel.' + g.id;
function celebrateDone() {
  for (const g of S.goals || []) {
    const p = goalProgress(g);
    if (p.done < p.target) continue;
    let seen = null; try { seen = localStorage.getItem(celKey(g)); } catch (e) { /* ignore */ }
    const key = periodKey(g);
    if (seen === key) continue;
    try { localStorage.setItem(celKey(g), key); } catch (e) { /* ignore */ }
    celebrate('🎯', 'أنجزت هدفك!', `${TYPE_L[g.type]} ${N(g.target)} ${UNIT_L[g.unit]} ${PERIOD_L[g.period]}`);
    break;
  }
}

export default {
  async render(el) {
    try { await loadQuran(); } catch (e) { /* names fall back */ }
    const open = new Set();
    const nameOf = s => { try { return surahName(s); } catch (e) { return 'سورة ' + N(s); } };

    const juzBlock = j => {
      const pages = juzPages[j];
      const got = pages.filter(p => hifzLevel(p) > 0).length, pct = Math.round(got / pages.length * 100);
      return `<div class="hf-juz${open.has(j) ? ' open' : ''}">
        <button class="hf-juz-head" data-juz="${j}" aria-expanded="${open.has(j)}"><b>الجزء ${N(j + 1)}</b><span class="progress"><i style="width:${pct}%"></i></span><small>${N(got)}/${N(pages.length)}</small>${icon('back', 16)}</button>
        <div class="hf-grid">${open.has(j) ? pages.map(p => `<button class="hf-cell l${hifzLevel(p)}" data-p="${p}" aria-label="صفحة ${p}">${N(p)}</button>`).join('') : ''}</div></div>`;
    };

    const goalCard = g => {
      const { done, target } = goalProgress(g), st = goalStreak(g);
      return `<div class="card tight hf-goal"><span class="ring">${ringSvg(done / target)}<span class="ring-label" style="font-size:.8rem">${N(Math.min(100, Math.round(done / target * 100)))}٪</span></span>
        <div class="hf-goal-main"><b>${TYPE_L[g.type]} ${N(g.target)} ${UNIT_L[g.unit]} ${PERIOD_L[g.period]}</b>
          <div class="muted small">${N(done)} من ${N(target)}</div>
          ${st ? `<div class="hf-streak">🔥 ${N(st)} ${g.period === 'week' ? 'أسابيع' : 'أيام'} متتالية</div>` : ''}</div>
        <button class="icon-btn" data-del="${esc(g.id)}" aria-label="حذف الهدف">${icon('close', 18)}</button></div>`;
    };

    const draw = () => {
      const t = hifzTotals();
      el.innerHTML = `${header('متابعة الحفظ', { back: 'more' })}
        <div class="card hero center"><div class="gold" style="font-family:var(--font-display);font-size:1.3rem">حفظت ${N(t.pages)} صفحة · ${N(t.pct)}٪</div>
          <div class="progress mt"><i style="width:${t.pct}%"></i></div>
          <div class="hf-legend"><span><i style="background:var(--surface-3)"></i>غير محفوظ</span><span><i style="background:color-mix(in srgb,var(--gold) 25%,transparent)"></i>ضعيف</span><span><i style="background:color-mix(in srgb,var(--gold) 55%,transparent)"></i>جيد</span><span><i style="background:var(--gold)"></i>متقن</span></div>
          <p class="muted small mt">يتراجع المستوى تدريجياً إن لم تراجع الصفحة. اضغط جزءاً ثم صفحة.</p></div>
        <div class="more-sec">الأجزاء</div>
        ${juzPages.map((_, j) => juzBlock(j)).join('')}
        <div class="more-sec">أهدافي</div>
        ${(S.goals || []).length ? S.goals.map(goalCard).join('') : '<div class="card empty"><p>لا أهداف بعد. ضع هدفاً يومياً أو أسبوعياً يعينك على المداومة.</p></div>'}
        <button class="btn block mt" id="hf-add">${icon('plus', 18)} هدف جديد</button>`;
      celebrateDone();
    };

    const pageSheet = p => {
      const lvl = hifzLevel(p), e = (S.hifz.pages || {})[p];
      const segs = pageContent(p);
      const sh = sheet(`<h3>صفحة ${N(p)} · الجزء ${N(juzOfPage(p))}</h3>
        <p class="muted small">${LVL_L[lvl]} · آخر مراجعة: ${fmtDate(e && e.at)}</p>
        <div class="hf-sheet-actions">
          <button class="btn" data-go="mushaf/p${p}">${icon('book', 18)} افتح في المصحف</button>
          ${segs.map(g => `<button class="btn ghost" data-go="recite/${g.s}?from=${g.from}&to=${g.to}">${icon('mic', 18)} سمّعها${segs.length > 1 ? ' — ' + esc(nameOf(g.s)) : ''}</button>`).join('')}
          <button class="btn ghost" id="hf-mem">${lvl > 0 ? 'إلغاء علامة الحفظ' : 'علّمها محفوظة'}</button></div>`);
      sh.addEventListener('click', ev => { if (ev.target.closest('[data-go]')) sh.close(); });
      sh.querySelector('#hf-mem').onclick = () => { setPageMemorized(p, lvl === 0); sh.close(); draw(); };
    };

    const goalSheet = () => {
      const f = { type: 'memorize', unit: 'page', target: 1, period: 'day' };
      const seg = (k, L) => `<div class="field"><label>${FIELD_L[k]}</label><div class="seg" data-k="${k}">${Object.entries(L).map(([v, l]) => `<button data-v="${v}" class="${f[k] === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>`;
      const sh = sheet(`<h3>هدف جديد</h3>${seg('type', TYPE_L)}${seg('unit', UNIT_L)}${seg('period', PERIOD_L)}
        <div class="field"><label>المقدار</label><input class="input" id="hf-t" type="number" inputmode="numeric" min="1" max="999" value="1"></div>
        <button class="btn block" id="hf-ok">إضافة الهدف</button>`);
      sh.querySelectorAll('.seg').forEach(sg => { sg.onclick = ev => {
        const b = ev.target.closest('button'); if (!b) return;
        f[sg.dataset.k] = b.dataset.v; sg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      }; });
      sh.querySelector('#hf-ok').onclick = () => {
        f.target = parseInt(sh.querySelector('#hf-t').value, 10);
        if (!(f.target >= 1)) { toast('أدخل مقداراً صحيحاً'); return; }
        if (!addGoal(f)) { toast('تعذّرت الإضافة (الحد ٣٠ هدفاً)'); return; }
        sh.close(); draw(); toast('تمت إضافة الهدف');
      };
    };

    el.onclick = ev => {
      const jb = ev.target.closest('[data-juz]');
      if (jb) { const j = +jb.dataset.juz; if (open.has(j)) open.delete(j); else open.add(j); const y = window.scrollY; draw(); window.scrollTo(0, y); return; }
      const pb = ev.target.closest('[data-p]'); if (pb) { pageSheet(+pb.dataset.p); return; }
      const del = ev.target.closest('[data-del]');
      if (del) {
        const id = del.dataset.del;
        const sh = sheet('<h3>حذف الهدف؟</h3><div class="hf-sheet-actions"><button class="btn" id="hf-y">حذف</button><button class="btn ghost" id="hf-n">إلغاء</button></div>');
        sh.querySelector('#hf-n').onclick = () => sh.close();
        sh.querySelector('#hf-y').onclick = () => { removeGoal(id); sh.close(); draw(); };
        return;
      }
      if (ev.target.closest('#hf-add')) goalSheet();
    };
    draw();
    return () => { el.onclick = null; };
  }
};
