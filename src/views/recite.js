// Tasmee' (recitation checking): voice mode with live word matching, or hide-and-recall mode.
import { esc, $, $$, toast, icon, ayahMark, header, N } from '../ui.js';
import { S, addRecitation, addReview, dueReviews } from '../core/store.js';
import { loadQuran, surahName, ayahCount, ayah, SURAH_COUNT } from '../core/quran.js';
import { words as splitWords } from '../core/arabic.js';
import { createMatcher } from '../core/matcher.js';
import { speechSupport, startListening } from '../core/speech.js';
import { haptic } from '../core/platform.js';

const cfg = { s: 1, from: 1, to: 5, mode: 'voice', showText: false };

function parseQuery(q) {
  if (!q) return {};
  if (q instanceof URLSearchParams) return Object.fromEntries(q);
  if (typeof q === 'object') return q;
  try { return Object.fromEntries(new URLSearchParams(String(q).replace(/^\?/, ''))); } catch (e) { return {}; }
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const accColor = a => (a >= 90 ? 'var(--ok)' : a >= 70 ? 'var(--gold)' : 'var(--bad)');

function normalizeCfg() {
  cfg.s = clamp(parseInt(cfg.s, 10) || 1, 1, SURAH_COUNT);
  const n = ayahCount(cfg.s);
  cfg.from = clamp(parseInt(cfg.from, 10) || 1, 1, n);
  cfg.to = clamp(parseInt(cfg.to, 10) || cfg.from, cfg.from, n);
}

/** Build flat word list for the range: [{w, a}] plus per-ayah groups. */
function buildRange(s, from, to) {
  const flat = [], groups = [];
  for (let a = from; a <= to; a++) {
    const ws = splitWords(ayah(s, a));
    const start = flat.length;
    ws.forEach(w => flat.push({ w, a }));
    groups.push({ a, start, end: flat.length });
  }
  return { flat, groups };
}

export default {
  async render(el, params = {}) {
    let alive = true;
    let stopMic = null;
    const cleanup = () => { alive = false; if (stopMic) { try { stopMic(); } catch (e) {} stopMic = null; } };

    el.innerHTML = header('التسميع') + '<div class="card empty"><p class="muted">جارٍ التحميل…</p></div>';
    try { await loadQuran(); } catch (e) {
      el.innerHTML = header('التسميع') + '<div class="card empty"><p>تعذر تحميل المصحف</p></div>';
      return cleanup;
    }
    if (!alive) return cleanup;

    const q = parseQuery(params.q);
    if (params.id) {
      cfg.s = parseInt(params.id, 10) || cfg.s;
      cfg.from = q.from ? parseInt(q.from, 10) : 1;
      cfg.to = q.to ? parseInt(q.to, 10) : Math.min(ayahCount(clamp(cfg.s, 1, SURAH_COUNT)), 5);
    }
    normalizeCfg();

    // ---------------- setup screen ----------------
    function showSetup() {
      cleanup(); alive = true;
      normalizeCfg();
      const due = dueReviews().length;
      const recent = S.rec.slice(0, 5);
      const opts = Array.from({ length: SURAH_COUNT }, (_, i) => `<option value="${i + 1}"${i + 1 === cfg.s ? ' selected' : ''}>${esc(N(i + 1) + '. ' + surahName(i + 1))}</option>`).join('');
      el.innerHTML = header('التسميع') + `
        <div class="card hero">
          <p>اقرأ من حفظك وسأستمع إليك وأصحح كل كلمة لحظة بلحظة.</p>
        </div>
        ${due ? `<div class="card tight" data-go="review" role="button"><div class="row"><b class="gold">جلسة مراجعة اليوم</b><span class="muted small">لديك ${N(due)} مقاطع مستحقة للمراجعة</span></div></div>` : ''}
        <div class="card">
          <div class="field"><label for="rc-s">السورة</label><select id="rc-s" class="select">${opts}</select></div>
          <div class="grid-2 mt">
            <div class="field"><label for="rc-from">من آية</label><input id="rc-from" class="input" type="number" inputmode="numeric" min="1" value="${cfg.from}"></div>
            <div class="field"><label for="rc-to">إلى آية</label><input id="rc-to" class="input" type="number" inputmode="numeric" min="1" value="${cfg.to}"></div>
          </div>
          <p class="muted small" id="rc-max">عدد آيات السورة: ${N(ayahCount(cfg.s))}</p>
          <div class="seg mt" id="rc-mode">
            <button data-mode="voice" class="${cfg.mode === 'voice' ? 'active' : ''}">تسميع صوتي</button>
            <button data-mode="hide" class="${cfg.mode === 'hide' ? 'active' : ''}">اختبار الحفظ (إخفاء)</button>
          </div>
          <div class="row mt" id="rc-opts" ${cfg.mode === 'voice' ? '' : 'hidden'}>
            <button class="chip ${cfg.showText ? 'active' : ''}" id="rc-show">إظهار النص أثناء التسميع</button>
          </div>
          <button class="btn block mt" id="rc-start">${icon('mic', 20)} ابدأ</button>
        </div>
        ${recent.length ? `<h2 class="section-title">آخر الجلسات</h2><div class="list">${recent.map(r => `
          <div class="list-item"><div class="li-main">${esc(surahName(r.s))}<div class="li-sub">الآيات ${N(r.from)}–${N(r.to)}</div></div><div class="li-end"><b style="color:${accColor(r.acc)}">${N(r.acc)}٪</b></div></div>`).join('')}</div>` : ''}`;

      const sel = $('#rc-s', el), fromI = $('#rc-from', el), toI = $('#rc-to', el);
      const readInputs = () => { cfg.from = parseInt(fromI.value, 10) || 1; cfg.to = parseInt(toI.value, 10) || cfg.from; normalizeCfg(); };
      sel.onchange = () => {
        cfg.s = parseInt(sel.value, 10); cfg.from = 1; cfg.to = Math.min(ayahCount(cfg.s), 5);
        fromI.value = cfg.from; toI.value = cfg.to; fromI.max = toI.max = ayahCount(cfg.s);
        $('#rc-max', el).textContent = 'عدد آيات السورة: ' + N(ayahCount(cfg.s));
      };
      fromI.max = toI.max = ayahCount(cfg.s);
      fromI.onchange = toI.onchange = () => { readInputs(); fromI.value = cfg.from; toI.value = cfg.to; };
      $$('#rc-mode button', el).forEach(b => b.onclick = () => {
        cfg.mode = b.dataset.mode;
        $$('#rc-mode button', el).forEach(x => x.classList.toggle('active', x === b));
        $('#rc-opts', el).hidden = cfg.mode !== 'voice';
      });
      $('#rc-show', el).onclick = e => { cfg.showText = !cfg.showText; e.currentTarget.classList.toggle('active', cfg.showText); };
      $('#rc-start', el).onclick = () => { readInputs(); startSession(); };
    }

    // ---------------- session ----------------
    async function startSession() {
      cleanup(); alive = true;
      normalizeCfg();
      const { s, from, to } = cfg;
      const mode = cfg.mode;
      const showText = mode === 'voice' && cfg.showText;
      const { flat, groups } = buildRange(s, from, to);
      const total = flat.length;
      const matcher = createMatcher(flat.map(x => x.w));
      let mres = { states: new Array(total).fill('pending'), pointer: 0, acc: 0 };
      const hst = new Array(total).fill('pending');   // hide-mode states
      const forced = new Set();                         // hinted words (always bad)
      let finished = false, listening = false, support = 'native';
      if (mode === 'voice') support = await speechSupport();
      if (!alive) return;

      const showBasmala = from === 1 && s !== 1 && s !== 9;
      const body = groups.map(g => {
        const spans = flat.slice(g.start, g.end).map((x, k) => `<span class="word ${showText ? '' : 'hidden'}" data-i="${g.start + k}">${esc(x.w)}</span>`).join(' ');
        return spans + ' ' + ayahMark(g.a);
      }).join(' ');

      const noVoice = mode === 'voice' && support === 'none';
      el.innerHTML = header(mode === 'voice' ? 'تسميع صوتي' : 'اختبار الحفظ') + `
        <div class="card tight">
          <div class="row" style="justify-content:space-between;align-items:center">
            <div><span class="muted small">${esc(surahName(s))} · ${N(from)}–${N(to)}</span></div>
            <div class="score" id="rc-score">٠٪</div>
          </div>
          <div class="progress mt"><i id="rc-prog" style="width:0%"></i></div>
        </div>
        ${noVoice ? `<div class="card"><p>التعرف على الصوت غير متاح على هذا الجهاز أو المتصفح.</p><button class="btn block" id="rc-tohide">جرّب اختبار الحفظ (إخفاء)</button></div>` : ''}
        <div class="mushaf-page">
          ${showBasmala ? '<div class="basmala">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>' : ''}
          <div class="mushaf-text" id="rc-text">${body}</div>
        </div>
        ${mode === 'voice' && !noVoice ? `<div class="center mt"><button class="mic-btn" id="rc-mic" aria-label="تشغيل الميكروفون">${icon('mic', 34)}</button><p class="muted small" id="rc-status">اضغط على الميكروفون وابدأ التسميع</p></div>` : ''}
        <div class="row mt" style="justify-content:center">
          <button class="btn ghost sm" id="rc-hint">إظهار الكلمة التالية</button>
          ${mode === 'hide' ? `<button class="btn ghost sm" id="rc-ok">تذكرتها ${icon('check', 16)}</button>` : ''}
          <button class="btn sm" id="rc-end">إنهاء</button>
        </div>
        ${mode === 'hide' ? '<p class="muted small center mt">اضغط على أي كلمة لكشفها (تُحسب خطأ)، أو اضغط «تذكرتها» عند إتقان الآية التالية.</p>' : ''}`;

      const spans = $$('.word', el);
      const scoreEl = $('#rc-score', el), progEl = $('#rc-prog', el), micEl = $('#rc-mic', el), statusEl = $('#rc-status', el);

      const baseStates = () => (mode === 'voice' ? mres.states : hst);
      const effective = () => baseStates().map((st, i) => (forced.has(i) ? 'bad' : st));
      let lastPointer = -1;

      function paint() {
        const st = effective();
        const ptr = st.indexOf('pending');
        let ok = 0, done = 0;
        st.forEach((x, i) => { if (x === 'ok') ok++; if (x !== 'pending') done++; });
        spans.forEach((sp, i) => {
          sp.classList.toggle('ok', st[i] === 'ok');
          sp.classList.toggle('bad', st[i] === 'bad');
          sp.classList.toggle('hidden', !showText && st[i] === 'pending');
          sp.classList.toggle('current', !finished && i === ptr);
        });
        const acc = total ? Math.round(100 * ok / total) : 0;
        scoreEl.textContent = N(acc) + '٪';
        progEl.style.width = (total ? 100 * done / total : 0) + '%';
        if (ptr !== lastPointer && ptr >= 0 && spans[ptr]) { lastPointer = ptr; try { spans[ptr].scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
        return ptr;
      }

      function setListening(on) {
        listening = on;
        if (micEl) micEl.classList.toggle('live', on);
        if (statusEl) statusEl.textContent = on ? 'أسمعك… اقرأ الآن' : 'اضغط على الميكروفون وابدأ التسميع';
      }
      function stopListeningNow() { if (stopMic) { try { stopMic(); } catch (e) {} stopMic = null; } setListening(false); }

      async function toggleMic() {
        if (finished) return;
        if (listening) { stopListeningNow(); return; }
        setListening(true);
        haptic('light');
        try {
          const stop = await startListening({
            onText: text => {
              if (finished) return;
              mres = matcher.update(text);
              const ptr = paint();
              if (ptr === -1 && !finished) setTimeout(() => { if (alive && !finished) finish(); }, 700);
            },
            onState: st => { if (st === 'stopped' && !stopMic) setListening(false); },
            onError: err => {
              stopListeningNow();
              toast(err === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون ثم حاول مجدداً' : err === 'unsupported' ? 'التعرف على الصوت غير متاح هنا' : 'تعذر تشغيل الميكروفون، حاول مجدداً');
            }
          });
          if (!alive || !listening) { try { stop(); } catch (e) {} return; }
          stopMic = stop;
        } catch (e) { stopListeningNow(); toast('تعذر تشغيل الميكروفون'); }
      }

      function hint() {
        if (finished) return;
        const st = effective();
        const start = mode === 'voice' ? Math.max(0, mres.pointer) : 0;
        let i = -1;
        for (let k = start; k < total; k++) if (st[k] === 'pending') { i = k; break; }
        if (i < 0) return;
        if (mode === 'voice') forced.add(i); else hst[i] = 'bad';
        haptic('light');
        paint();
      }

      function markNextAyah() {
        if (finished) return;
        const st = effective();
        const g = groups.find(x => { for (let k = x.start; k < x.end; k++) if (st[k] === 'pending') return true; return false; });
        if (!g) return;
        for (let k = g.start; k < g.end; k++) if (hst[k] === 'pending' && !forced.has(k)) hst[k] = 'ok';
        haptic('light');
        paint();
        if (effective().indexOf('pending') === -1) setTimeout(() => { if (alive && !finished) finish(); }, 500);
      }

      function finish() {
        if (finished) return;
        finished = true;
        stopListeningNow();
        let st;
        if (mode === 'voice') { st = matcher.finish().states; } else st = hst.map(x => (x === 'ok' ? 'ok' : 'bad'));
        st = st.map((x, i) => (forced.has(i) ? 'bad' : x));
        const ok = st.filter(x => x === 'ok').length;
        const acc = total ? Math.round(100 * ok / total) : 0;
        const missed = flat.filter((_, i) => st[i] === 'bad').map(x => x.w);
        const pts = addRecitation({ s, from, to, acc, miss: missed });
        haptic('heavy');
        showResult({ acc, missed, pts });
      }

      if (noVoice) { $('#rc-tohide', el).onclick = () => { cfg.mode = 'hide'; startSession(); }; }
      if (micEl) micEl.onclick = toggleMic;
      $('#rc-hint', el).onclick = hint;
      const okBtn = $('#rc-ok', el); if (okBtn) okBtn.onclick = markNextAyah;
      $('#rc-end', el).onclick = finish;
      if (mode === 'hide') {
        $('#rc-text', el).addEventListener('click', e => {
          const sp = e.target.closest('.word'); if (!sp || finished) return;
          const i = +sp.dataset.i;
          if (hst[i] === 'pending') { hst[i] = 'bad'; paint(); }
        });
      }
      paint();
    }

    // ---------------- result ----------------
    function showResult({ acc, missed, pts }) {
      const { s, from, to } = cfg;
      const msg = acc >= 90 ? 'ما شاء الله، تسميع متقن' : acc >= 70 ? 'جيد جداً، راجع الكلمات الحمراء' : 'التكرار طريق الإتقان';
      const R = 54, C = 2 * Math.PI * R;
      el.innerHTML = header('نتيجة التسميع') + `
        <div class="card hero center">
          <div class="ring" style="position:relative;width:140px;height:140px;margin:0 auto">
            <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
              <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/>
              <circle cx="70" cy="70" r="${R}" fill="none" stroke="${accColor(acc)}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - acc / 100)}" transform="rotate(-90 70 70)"/>
            </svg>
            <div class="ring-label score" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${N(acc)}٪</div>
          </div>
          <h2 class="mt">${esc(msg)}</h2>
          <p class="muted small">${esc(surahName(s))} · الآيات ${N(from)}–${N(to)} · +${N(pts)} نقطة</p>
        </div>
        ${missed.length ? `<h2 class="section-title">الكلمات التي تحتاج مراجعة</h2><div class="card"><div class="row">${missed.map(w => `<span class="chip quran">${esc(w)}</span>`).join('')}</div></div>` : ''}
        <div class="grid-2 mt">
          <button class="btn" id="rc-again">${icon('repeat', 18)} إعادة</button>
          <button class="btn ghost" id="rc-rev">أضف للمراجعة</button>
        </div>
        <button class="btn ghost block mt" data-go="mushaf/${s}?a=${from}">${icon('play', 18)} استمع للمقطع</button>
        <button class="btn ghost block mt" id="rc-new">تسميع جديد</button>`;
      $('#rc-again', el).onclick = startSession;
      $('#rc-new', el).onclick = showSetup;
      $('#rc-rev', el).onclick = e => {
        const r = addReview(s, from, to);
        toast(r ? 'أُضيف المقطع إلى المراجعة' : 'المقطع موجود في المراجعة مسبقاً');
        e.currentTarget.disabled = true;
      };
    }

    showSetup();
    return cleanup;
  }
};
