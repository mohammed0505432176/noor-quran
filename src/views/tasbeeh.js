// Tasbeeh (digital prayer beads) view.
import { esc, header, icon, toast, N } from '../ui.js';
import { S, tasbeeh } from '../core/store.js';
import { haptic } from '../core/platform.js';

const PHRASES = ['سبحان الله', 'الحمد لله', 'الله أكبر', 'لا إله إلا الله', 'أستغفر الله', 'اللهم صل على محمد'];
const PRAYER_SEQ = [{ p: 0, t: 33 }, { p: 1, t: 33 }, { p: 2, t: 34 }];
const TARGETS = [33, 100, 0];
const R = 46, C = 2 * Math.PI * R;

// session state survives navigation within the app run
const st = { phrase: 0, count: 0, target: 33, prayer: false, step: 0 };

export default {
  render(el) {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const curTarget = () => (st.prayer ? PRAYER_SEQ[st.step].t : st.target);

    el.innerHTML = `<div>${header('المسبحة', { back: 'more' })}
      <div class="row mb" id="tb-phrases" style="justify-content:center">${PHRASES.map((p, i) => `<button class="chip" data-p="${i}">${esc(p)}</button>`).join('')}</div>
      <div class="seg mb" id="tb-targets" style="justify-content:center">
        ${TARGETS.map(t => `<button data-t="${t}">${t ? N(t) : '∞'}</button>`).join('')}
        <button data-t="prayer">تسبيح الصلاة</button>
      </div>
      <div class="center" style="position:relative;display:flex;justify-content:center;margin:12px 0">
        <button class="tasbeeh-btn" id="tb-btn" aria-label="سبّح" style="position:relative;overflow:hidden">
          <svg viewBox="0 0 100 100" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);pointer-events:none">
            <circle cx="50" cy="50" r="${R}" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="3"/>
            <circle id="tb-ring" cx="50" cy="50" r="${R}" fill="none" stroke="var(--gold)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" style="transition:stroke-dashoffset .2s"/>
          </svg>
          <span style="position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none">
            <span id="tb-count" style="font-size:3.4rem;font-weight:700;line-height:1">٠</span>
            <span id="tb-phrase" class="small" style="opacity:.8"></span>
          </span>
        </button>
      </div>
      <div class="grid-2 mb">
        <div class="stat"><b id="tb-total">${N(S.tasbeeh)}</b><span>إجمالي التسبيحات</span></div>
        <div class="stat"><b id="tb-goal"></b><span>هدف الجلسة</span></div>
      </div>
      <button class="btn ghost block" id="tb-reset">${icon('repeat', 18)} إعادة الجلسة</button></div>`;

    const btn = el.querySelector('#tb-btn');
    const ring = el.querySelector('#tb-ring');
    const cnt = el.querySelector('#tb-count');
    const ph = el.querySelector('#tb-phrase');
    const total = el.querySelector('#tb-total');
    const goal = el.querySelector('#tb-goal');

    function paint() {
      const t = curTarget();
      cnt.textContent = N(st.count);
      ph.textContent = PHRASES[st.phrase];
      goal.textContent = t ? N(t) : '∞';
      ring.style.strokeDashoffset = t ? C * (1 - Math.min(1, st.count / t)) : C;
      el.querySelectorAll('#tb-phrases .chip').forEach(b => b.classList.toggle('active', +b.dataset.p === st.phrase));
      el.querySelectorAll('#tb-targets button').forEach(b => {
        const on = b.dataset.t === 'prayer' ? st.prayer : !st.prayer && +b.dataset.t === st.target;
        b.classList.toggle('active', on);
      });
      total.textContent = N(S.tasbeeh);
    }

    function ripple() {
      if (reduce || !btn.animate) return;
      const r = document.createElement('span');
      r.style.cssText = 'position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(circle,var(--gold-2) 0%,transparent 70%)';
      btn.appendChild(r);
      const a = r.animate([{ opacity: .7, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 600, easing: 'ease-out' });
      a.onfinish = () => r.remove();
    }

    function tap() {
      tasbeeh();
      st.count++;
      const t = curTarget();
      if (t && st.count >= t) {
        haptic('heavy');
        ripple();
        toast('اكتمل ' + N(t) + ' ✨');
        st.count = 0;
        if (st.prayer) {
          if (st.step < PRAYER_SEQ.length - 1) {
            st.step++;
            st.phrase = PRAYER_SEQ[st.step].p;
          } else {
            st.step = 0;
            st.phrase = PRAYER_SEQ[0].p;
            toast('تقبّل الله، اكتمل تسبيح الصلاة ✨');
          }
        }
      } else {
        haptic('light');
      }
      paint();
    }

    btn.addEventListener('click', tap);
    // Space/Enter on the button fire click natively; make sure they do not also scroll the page.
    btn.addEventListener('keydown', e => { if (e.key === ' ') e.preventDefault(); });

    el.querySelector('#tb-phrases').addEventListener('click', e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      st.phrase = +b.dataset.p; st.count = 0; st.prayer = false; paint();
    });
    el.querySelector('#tb-targets').addEventListener('click', e => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      st.count = 0;
      if (b.dataset.t === 'prayer') { st.prayer = true; st.step = 0; st.phrase = PRAYER_SEQ[0].p; }
      else { st.prayer = false; st.target = +b.dataset.t; }
      paint();
    });
    el.querySelector('#tb-reset').addEventListener('click', () => {
      st.count = 0; st.step = 0;
      if (st.prayer) st.phrase = PRAYER_SEQ[0].p;
      paint();
    });

    paint();
  }
};
