// Random spot test: a surprise point inside a page the reader has memorised. The ayah before it is the cue; the reader then
// recites the next ayahs from memory (the recitation screen, text hidden), so mistakes land in the usual history and reviews.
import { S, spotPages, noteSpot } from '../core/store.js';
import { pickSpot, pageWeight } from '../core/spot-test.js';
import { loadQuran, surahName, ayah, ayahCount } from '../core/quran.js';
import { pageContent } from '../core/pages.js';
import { esc, header, icon, N } from '../ui.js';

export default {
  async render(el) {
    try { await loadQuran(); } catch (e) { el.innerHTML = '<div class="card empty"><p>تعذر تحميل نص المصحف.</p></div>'; return; }
    let spot = null;
    const draw = () => {
      const pages = spotPages();
      const n = (S.spot && S.spot.n) || 0;
      if (!pages.length) {
        el.innerHTML = header('اختبار نقطة عشوائية', { back: 'more' }) +
          `<div class="card empty"><div class="gold">${icon('brain', 40)}</div><p>يختبرك التطبيق من موضع مفاجئ داخل الصفحات التي حفظتها.</p>
          <p class="muted small">علّم الصفحات التي حفظتها أولاً من «متابعة الحفظ».</p><button class="btn" data-go="hifz">متابعة الحفظ</button></div>`;
        return;
      }
      if (!spot) spot = pickSpot({ pages: pages.map(x => x.p), weight: p => { const x = pages.find(y => y.p === p); return x ? pageWeight(x.lvl, x.daysAgo) : 1; }, contentOf: p => pageContent(p), ayahsIn: ayahCount, len: 2 });
      const cue = spot && spot.cue ? ayah(spot.cue.s, spot.cue.a) : '';
      el.innerHTML = header('اختبار نقطة عشوائية', { back: 'more' }) +
        `<p class="muted small">يُختبر حفظك من موضع مفاجئ داخل صفحاتك المحفوظة (${N(pages.length)}) · اختُبرتَ ${N(n)} مرة.</p>
        ${spot ? `<div class="card"><div class="muted small">النقطة المختارة (صفحة ${N(spot.page)})</div>
          <b>سورة ${esc(surahName(spot.s))} — من الآية ${N(spot.from)}${spot.to > spot.from ? ` إلى ${N(spot.to)}` : ''}</b>
          ${cue ? `<div class="muted small mt">الآية التي قبلها:</div><p class="quran" style="font-size:1.4rem;line-height:2.1">${esc(cue)}</p>` : '<p class="muted small mt">هذه بداية السورة.</p>'}
          <div class="row mt" style="gap:8px;flex-wrap:wrap"><button class="btn" id="sp-go">${icon('mic', 18)} ابدأ التسميع من هنا</button><button class="btn ghost" id="sp-next">نقطة أخرى</button></div></div>` : '<div class="card empty"><p>تعذّر اختيار نقطة، جرّب مرة أخرى.</p><button class="btn" id="sp-next">نقطة أخرى</button></div>'}`;
      const go = el.querySelector('#sp-go');
      if (go) go.onclick = () => { noteSpot(); window.noorGo(`recite/${spot.s}?from=${spot.from}&to=${spot.to}&display=hidden`); };
      el.querySelector('#sp-next').onclick = () => { spot = null; draw(); };
    };
    draw();
  }
};
