// Tasmee' (recitation checking): voice mode with live word matching, or hide-and-recall mode.
import { esc, $, $$, toast, icon, ayahMark, header, N } from '../ui.js';
import { S, addRecitation, addReview, dueReviews } from '../core/store.js';
import { loadQuran, surahName, ayahCount, ayah, SURAH_COUNT } from '../core/quran.js';
import { words as splitWords } from '../core/arabic.js';
import { createMatcher, createLockedTracker, stripOpeners } from '../core/matcher.js';
import { speechSupport, startListening } from '../core/speech.js';
import { haptic } from '../core/platform.js';
import { startRecorder, recorderSupported } from '../core/recorder.js';
import { cloudStatus, transcribe, tajweedReview } from '../core/cloud.js';
import { playRange, playAyah, stop as stopReciter } from '../core/audio.js';
import * as recordings from '../core/recordings.js';
import '../styles/recite.css';

const MODE_KEY = 'noor.recite.mode';
const MODES = ['device', 'ai', 'hide'];
const FS_KEY = 'noor.recite.fs';
const FS_MIN = 26, FS_MAX = 52;
// Whisper chunking tuned for latency (shorter chunks, quicker cut after a pause)
const FAST_VAD = { minSpeechMs: 600, silenceMs: 320, maxMs: 6000 };
const DISPLAYS = ['hidden', 'first', 'full'];
const MAX_REVIEW_SECS = 240;

const MISTAKE_KIND = { missing: 'نقص', wrong: 'خطأ', extra: 'زيادة', harakah: 'حركة' };
function loadMode() { try { const m = localStorage.getItem(MODE_KEY); return MODES.includes(m) ? m : null; } catch (e) { return null; } }
function saveMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ } }
function loadFs() {
  let v = NaN;
  try { v = parseInt(localStorage.getItem(FS_KEY), 10); } catch (e) { /* ignore */ }
  if (!Number.isFinite(v)) v = Math.max(Number(S.settings && S.settings.fontSize) || 0, 32);
  return Math.max(FS_MIN, Math.min(FS_MAX, v));
}
function saveFs(v) { try { localStorage.setItem(FS_KEY, String(v)); } catch (e) { /* ignore */ } }
const pad3 = n => String(n).padStart(3, '0');
/** quran.com word-by-word audio (word index is 1-based within the ayah). */
const wordAudioUrl = (s, a, w) => `https://audio.qurancdn.com/wbw/${pad3(s)}_${pad3(a)}_${pad3(w)}.mp3`;

// userMode: explicit choice (saved or deep-linked). Without one the instant on-device engine is the default.
let userMode = loadMode();
const cfg = { s: 1, from: 1, to: 5, mode: userMode || 'device', display: 'hidden' };

const joinT = (a, b) => (a && b ? a + ' ' + b : a || b || '');
/** First base letter of a word + tatweel, e.g. «قـ». */
function firstLetter(w) {
  const m = /[\u0621-\u064A\u0671]/.exec(w || '');
  return m ? m[0] + '\u0640' : '…';
}
const MODE_TITLE = { ai: 'تسميع دقيق', device: 'تسميع فوري', hide: 'اختبار الحفظ' };

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
    let gen = 0;                 // bumped on every cleanup; stale async work checks it
    let stopMic = null;
    let recCtl = null;           // active recorder controller
    let aiCtl = null;            // AbortController for transcribe requests
    let tjCtl = null;            // AbortController for the tajweed review
    let resUrl = null, resAudio = null;
    let setupTok = 0;
    let cloud = null;            // last cloudStatus()
    let wAudio = null;           // word-by-word audio for hints / mistakes
    const cleanup = () => {
      alive = false; gen++; setupTok++;
      if (stopMic) { try { stopMic(); } catch (e) {} stopMic = null; }
      if (recCtl) { const r = recCtl; recCtl = null; try { r.stop().catch(() => {}); } catch (e) {} }
      if (aiCtl) { try { aiCtl.abort(); } catch (e) {} aiCtl = null; }
      if (tjCtl) { try { tjCtl.abort(); } catch (e) {} tjCtl = null; }
      if (wAudio) { try { wAudio.pause(); wAudio.removeAttribute('src'); wAudio.load(); } catch (e) {} wAudio = null; }
      if (resAudio) { try { resAudio.pause(); resAudio.removeAttribute('src'); resAudio.load(); } catch (e) {} resAudio = null; }
      if (resUrl) { try { URL.revokeObjectURL(resUrl); } catch (e) {} resUrl = null; }
    };

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
    if (MODES.includes(q.mode)) { cfg.mode = q.mode; userMode = q.mode; }
    if (DISPLAYS.includes(q.display)) cfg.display = q.display;
    normalizeCfg();


    // ---------------- setup screen ----------------
    const aiReady = () => navigator.onLine && recorderSupported() && !!(cloud && cloud.stt);
    const chipHtml = () => {
      if (!cloud) return '<span class="muted small">جارٍ فحص الذكاء…</span>';
      return aiReady()
        ? '<span class="chip active small">الذكاء متصل ✓</span>'
        : '<span class="chip small">الوضع الدقيق غير متاح الآن — سيُستخدم الفوري</span>';
    };

    function showSetup() {
      cleanup(); alive = true;
      const tok = setupTok;
      normalizeCfg();
      const due = dueReviews().length;
      const recent = S.rec.slice(0, 5);
      const opts = Array.from({ length: SURAH_COUNT }, (_, i) => `<option value="${i + 1}"${i + 1 === cfg.s ? ' selected' : ''}>${esc(N(i + 1) + '. ' + surahName(i + 1))}</option>`).join('');
      const modeChip = (m, label) => `<button class="chip ${cfg.mode === m ? 'active' : ''}" data-mode="${m}">${label}</button>`;
      const dispChip = (d, label) => `<button class="chip ${cfg.display === d ? 'active' : ''}" data-display="${d}">${label}</button>`;
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
          <div class="row mt" id="rc-mode">
            ${modeChip('device', 'فوري')}
            ${modeChip('ai', 'دقيق (Whisper)')}
            ${modeChip('hide', 'اختبار الحفظ (إخفاء)')}
          </div>
          <div class="mt" id="rc-cloud">${chipHtml()}</div>
          <p class="muted small mt">عرض النص</p>
          <div class="row" id="rc-disp">
            ${dispChip('hidden', 'مخفي')}
            ${dispChip('first', 'أوائل الكلمات')}
            ${dispChip('full', 'ظاهر')}
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
        cfg.mode = userMode = b.dataset.mode; saveMode(cfg.mode);
        $$('#rc-mode button', el).forEach(x => x.classList.toggle('active', x === b));
      });
      $$('#rc-disp button', el).forEach(b => b.onclick = () => {
        cfg.display = b.dataset.display;
        $$('#rc-disp button', el).forEach(x => x.classList.toggle('active', x === b));
      });
      $('#rc-start', el).onclick = () => { readInputs(); startSession(); };

      // Cloud status is checked lazily (cached) only to show whether the precise mode is reachable.
      cloudStatus().then(st => {
        cloud = st;
        if (!alive || tok !== setupTok) return;
        const box = $('#rc-cloud', el); if (box) box.innerHTML = chipHtml();
      }).catch(() => {});
    }

    // ---------------- session ----------------
    async function startSession() {
      cleanup(); alive = true;
      const myGen = gen;
      const isLive = () => alive && gen === myGen;
      normalizeCfg();
      const { s, from, to } = cfg;
      let mode = cfg.mode;
      if (mode === 'ai') {
        if (!cloud) { try { cloud = await cloudStatus(); } catch (e) { cloud = null; } }
        if (!isLive()) return;
        if (!aiReady()) { toast('الذكاء غير متاح الآن — سيُستخدم التعرف على الجهاز'); mode = 'device'; }
      }
      const voiceLike = mode !== 'hide';
      let engine = mode === 'ai' ? 'ai' : 'device';       // may fall back ai -> device mid-session
      const disp = mode === 'hide' && cfg.display === 'full' ? 'hidden' : cfg.display;
      const { flat, groups } = buildRange(s, from, to);
      const total = flat.length;
      const matcher = createMatcher(flat.map(x => x.w));
      let mres = { states: new Array(total).fill('pending'), pointer: 0, acc: 0 };
      const hst = new Array(total).fill('pending');   // hide-mode states
      const forced = new Set();                         // hinted words (always bad)
      let finished = false, ending = false, listening = false, support = 'native';
      let base = '', lastFull = '', sess = 0;               // base = transcript of earlier device-mic sessions
      const keepBasmala = s === 1 && from === 1;
      // AI engine state
      let rec = null, starting = false, aiState = 'idle', chain = Promise.resolve(), inflight = 0, fails = 0;
      let aiText = '', recBlob = null, recSecs = 0, allDone = false;
      if (engine === 'device' && voiceLike) support = await speechSupport();
      if (!isLive()) return;
      if (engine === 'ai') aiCtl = new AbortController();

      const showBasmala = from === 1 && s !== 1 && s !== 9;
      const body = groups.map(g => {
        const spans = flat.slice(g.start, g.end).map((x, k) => `<span class="word" data-i="${g.start + k}">${esc(x.w)}</span>`).join(' ');
        return spans + ' ' + ayahMark(g.a);
      }).join(' ');

      const noVoice = engine === 'device' && voiceLike && support === 'none';
      el.innerHTML = header(MODE_TITLE[mode]) + `
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
        ${voiceLike && !noVoice ? `<div class="center mt"><button class="mic-btn" id="rc-mic" aria-label="تشغيل الميكروفون">${icon('mic', 34)}</button><p class="muted small" id="rc-status">اضغط على الميكروفون وابدأ التسميع</p>
          ${mode === 'ai' ? `<div class="progress" id="rc-lvlw" style="max-width:200px;margin:8px auto 0"><i id="rc-lvl" style="width:0%;transition:none"></i></div><p class="muted small" id="rc-ana" hidden>يُحلل…</p>` : ''}</div>` : ''}
        <div class="row mt" style="justify-content:center">
          <button class="btn ghost sm" id="rc-hint">إظهار الكلمة التالية</button>
          ${mode === 'hide' ? `<button class="btn ghost sm" id="rc-ok">تذكرتها ${icon('check', 16)}</button>` : ''}
          <button class="btn sm" id="rc-end">إنهاء</button>
        </div>
        ${mode === 'hide' ? '<p class="muted small center mt">اضغط على أي كلمة لكشفها (تُحسب خطأ)، أو اضغط «تذكرتها» عند إتقان الآية التالية.</p>' : ''}`;

      const spans = $$('.word', el);
      const shown = new Array(total).fill(null);
      const scoreEl = $('#rc-score', el), progEl = $('#rc-prog', el), micEl = $('#rc-mic', el), statusEl = $('#rc-status', el);
      const lvlEl = $('#rc-lvl', el), anaEl = $('#rc-ana', el);

      const baseStates = () => (voiceLike ? mres.states : hst);
      const effective = () => baseStates().map((st, i) => (forced.has(i) ? 'bad' : st));
      let lastPointer = -1;
      const setStatus = t => { if (statusEl) statusEl.textContent = t; };

      function paint() {
        const st = effective();
        const ptr = st.indexOf('pending');
        let ok = 0, done = 0;
        st.forEach(x => { if (x === 'ok') ok++; if (x !== 'pending') done++; });
        spans.forEach((sp, i) => {
          const pend = st[i] === 'pending';
          sp.classList.toggle('ok', st[i] === 'ok');
          sp.classList.toggle('bad', st[i] === 'bad');
          sp.classList.toggle('hidden', pend && disp === 'hidden');
          sp.classList.toggle('current', !finished && i === ptr);
          const first = pend && disp === 'first';
          if (shown[i] !== first) {
            shown[i] = first;
            sp.textContent = first ? firstLetter(flat[i].w) : flat[i].w;
            sp.style.opacity = first ? '.75' : '';
          }
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
        setStatus(on ? 'أسمعك… اقرأ الآن' : 'اضغط على الميكروفون وابدأ التسميع');
      }
      function stopListeningNow() { base = lastFull; if (stopMic) { try { stopMic(); } catch (e) {} stopMic = null; } setListening(false); }

      // ----- on-device engine -----
      async function toggleMic() {
        if (finished || ending) return;
        if (listening) { stopListeningNow(); return; }
        setListening(true);
        haptic('light');
        const my = ++sess;
        try {
          const stop = await startListening({
            onText: text => {
              if (finished || my !== sess || !listening) return;
              lastFull = joinT(base, text);
              mres = matcher.update(stripOpeners(lastFull, keepBasmala));
              const ptr = paint();
              if (ptr === -1 && !finished) setTimeout(() => { if (isLive() && !finished) finish(); }, 700);
            },
            onState: st => { if (st === 'stopped' && !stopMic) { base = lastFull; setListening(false); } },
            onError: err => {
              stopListeningNow();
              toast(err === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون ثم حاول مجدداً' : err === 'unsupported' ? 'التعرف على الصوت غير متاح هنا' : 'تعذر تشغيل الميكروفون، حاول مجدداً');
            }
          });
          if (!isLive() || !listening) { try { stop(); } catch (e) {} return; }
          stopMic = stop;
        } catch (e) { stopListeningNow(); toast('تعذر تشغيل الميكروفون'); }
      }

      // ----- AI engine -----
      const showAna = () => { if (anaEl) anaEl.hidden = inflight <= 0; };

      /** Only words already recited correctly (never upcoming ones) so the model isn't biased toward them. */
      function buildPrompt() {
        const okWords = [];
        mres.states.forEach((st, i) => { if (st === 'ok') okWords.push(flat[i].w); });
        return 'تلاوة قرآنية من سورة ' + surahName(s) + '. ' + okWords.slice(-25).join(' ');
      }

      function onChunk(blob) {
        if (!isLive() || engine !== 'ai' || allDone || !aiCtl) return;
        const prompt = buildPrompt();
        const signal = aiCtl.signal;
        inflight++; showAna();
        // requests run concurrently, but results are applied strictly in chunk order
        const p = transcribe(blob, { prompt, signal }).then(r => ({ ok: true, text: (r && r.text) || '' }), e => ({ ok: false, e }));
        chain = chain.then(() => p).then(res => {
          inflight = Math.max(0, inflight - 1); showAna();
          if (isLive() && engine === 'ai') applyChunk(res);
        });
      }

      function applyChunk(res) {
        if (!res.ok) {
          if (finished || ending) return;
          if (res.e && (res.e.name === 'AbortError' || res.e.code === 'aborted')) return;
          if (++fails >= 2) { toast('تعذّر التحليل بالذكاء — سيُستخدم التعرف على الجهاز'); switchToDevice(true); }
          return;
        }
        fails = 0;
        const t = String(res.text || '').trim();
        if (!t || finished || ending) return;
        aiText = joinT(aiText, t);
        lastFull = aiText;
        mres = matcher.update(stripOpeners(aiText, keepBasmala));
        const ptr = paint();
        if (ptr === -1 && !finished) { allDone = true; setTimeout(() => { if (isLive() && !finished) finish(); }, 0); }
      }

      function onRecError(err) {
        if (!isLive() || engine !== 'ai') return;
        toast(err === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون ثم حاول مجدداً' : 'تعذر تسجيل الصوت — سيُستخدم التعرف على الجهاز');
        switchToDevice(err !== 'permission');
      }

      async function switchToDevice(autoStart) {
        if (engine !== 'ai') return;
        engine = 'device';
        aiState = 'idle';
        const r = rec; rec = null; recCtl = null;
        if (r) r.stop().then(b => { recBlob = b; recSecs = r.elapsed(); }).catch(() => {});
        if (aiCtl) { try { aiCtl.abort(); } catch (e) {} aiCtl = null; }
        inflight = 0; showAna();
        const lw = $('#rc-lvlw', el); if (lw) lw.hidden = true;
        setListening(false);
        base = lastFull;
        support = await speechSupport();
        if (!isLive() || finished || ending) return;
        if (support === 'none') { toast('التعرف على الصوت غير متاح هنا'); return; }
        if (autoStart) toggleMic();
      }

      async function toggleAi() {
        if (finished || ending || starting) return;
        if (aiState === 'rec') { rec.pause(); aiState = 'paused'; listening = false; micEl.classList.remove('live'); setStatus('متوقف مؤقتاً — اضغط للمتابعة'); if (lvlEl) lvlEl.style.width = '0%'; return; }
        if (aiState === 'paused') { rec.resume(); aiState = 'rec'; setListening(true); return; }
        starting = true; haptic('light');
        let r = null;
        try {
          r = await startRecorder({
            chunkMs: 4500,
            onChunk,
            onLevel: v => { if (lvlEl) lvlEl.style.width = Math.round(v * 100) + '%'; },
            onError: onRecError
          });
        } catch (e) { onRecError('error'); }
        starting = false;
        if (!isLive() || engine !== 'ai' || ending) { if (r) { r.stop().catch(() => {}); } return; }
        if (!r) return;     // onError already handled the fallback
        rec = r; recCtl = r; aiState = 'rec';
        setListening(true);
      }

      function hint() {
        if (finished || ending) return;
        const st = effective();
        const start = voiceLike ? Math.max(0, mres.pointer) : 0;
        let i = -1;
        for (let k = start; k < total; k++) if (st[k] === 'pending') { i = k; break; }
        if (i < 0) return;
        if (voiceLike) forced.add(i); else hst[i] = 'bad';
        haptic('light');
        paint();
      }

      function markNextAyah() {
        if (finished || ending) return;
        const st = effective();
        const g = groups.find(x => { for (let k = x.start; k < x.end; k++) if (st[k] === 'pending') return true; return false; });
        if (!g) return;
        for (let k = g.start; k < g.end; k++) if (hst[k] === 'pending' && !forced.has(k)) hst[k] = 'ok';
        haptic('light');
        paint();
        if (effective().indexOf('pending') === -1) setTimeout(() => { if (isLive() && !finished) finish(); }, 500);
      }

      async function finish() {
        if (finished || ending) return;
        ending = true;
        if (engine === 'ai' && rec) {
          const r = rec; rec = null;
          if (micEl) micEl.disabled = true;
          setStatus('جارٍ إكمال التحليل…');
          try { recBlob = await r.stop(); } catch (e) { /* ignore */ }
          recSecs = r.elapsed(); recCtl = null;
          if (!isLive()) return;
          // the final partial chunk was queued by stop(); wait for the queue (max ~8s)
          await Promise.race([chain, new Promise(res => setTimeout(res, 8000))]);
          if (!isLive()) return;
          if (aiCtl) { try { aiCtl.abort(); } catch (e) {} aiCtl = null; }
        } else {
          stopListeningNow();
        }
        finalize();
      }

      function finalize() {
        finished = true;
        let st;
        if (voiceLike) { st = matcher.finish().states; } else st = hst.map(x => (x === 'ok' ? 'ok' : 'bad'));
        st = st.map((x, i) => (forced.has(i) ? 'bad' : x));
        const ok = st.filter(x => x === 'ok').length;
        const acc = total ? Math.round(100 * ok / total) : 0;
        const missed = flat.filter((_, i) => st[i] === 'bad').map(x => x.w);
        const pts = addRecitation({ s, from, to, acc, miss: missed });
        haptic('heavy');
        showResult({ acc, missed, pts, blob: recBlob && recBlob.size > 0 ? recBlob : null, secs: recSecs });
      }

      if (noVoice) { $('#rc-tohide', el).onclick = () => { cfg.mode = 'hide'; startSession(); }; }
      if (micEl) micEl.onclick = () => (engine === 'ai' ? toggleAi() : toggleMic());
      $('#rc-hint', el).onclick = hint;
      const okBtn = $('#rc-ok', el); if (okBtn) okBtn.onclick = markNextAyah;
      $('#rc-end', el).onclick = () => { finish(); };
      if (mode === 'hide') {
        $('#rc-text', el).addEventListener('click', e => {
          const sp = e.target.closest('.word'); if (!sp || finished || ending) return;
          const i = +sp.dataset.i;
          if (hst[i] === 'pending') { hst[i] = 'bad'; paint(); }
        });
      }
      paint();
    }

    // ---------------- result ----------------
    function ringSvg(value, color, size = 140) {
      const R = size * 0.386, C = 2 * Math.PI * R, c = size / 2;
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
        <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--line)" stroke-width="10"/>
        <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - value / 100)}" transform="rotate(-90 ${c} ${c})"/>
      </svg>`;
    }
    const sevColor = v => {
      const t = String(v || '').toLowerCase();
      if (/high|major|severe|critical|عالي|كبير|شديد|جسيم|خطير/.test(t)) return 'var(--bad)';
      if (/med|moder|متوسط/.test(t)) return 'var(--gold)';
      return 'var(--ok)';
    };
    const arr = v => (Array.isArray(v) ? v : []);

    function renderTajweed(r) {
      const score = Number(r && r.score);
      const hasScore = Number.isFinite(score);
      const sc = hasScore ? Math.max(0, Math.min(100, Math.round(score))) : 0;
      const mistakes = arr(r && r.mistakes);
      const tj = arr(r && r.tajweed);
      const groupsMap = new Map();
      tj.forEach(x => { const k = String((x && x.rule) || 'أحكام أخرى'); if (!groupsMap.has(k)) groupsMap.set(k, []); groupsMap.get(k).push(x || {}); });
      const advice = Array.isArray(r && r.advice) ? r.advice : (r && r.advice ? [r.advice] : []);
      return `
        <div class="card center">
          ${hasScore ? `<div class="ring" style="position:relative;width:110px;height:110px;margin:0 auto">${ringSvg(sc, accColor(sc), 110)}<div class="ring-label score" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${N(sc)}</div></div>` : ''}
          <h3 class="mt">تقييم التجويد بالذكاء</h3>
          ${r && r.summary ? `<p>${esc(r.summary)}</p>` : ''}
          <p class="muted small">تقييم استرشادي ولا يغيّر نسبة الدقة المسجلة</p>
        </div>
        ${mistakes.length ? `<h2 class="section-title">أخطاء في التلاوة</h2><div class="card">${mistakes.map(m => `
          <div class="mb"><span class="chip quran">${esc(m && m.word)}</span> ${m && m.kind ? `<b class="gold small">${esc(MISTAKE_KIND[m.kind] || m.kind)}</b>` : ''}${m && m.note ? `<div class="muted small">${esc(m.note)}</div>` : ''}</div>`).join('')}</div>` : ''}
        ${groupsMap.size ? `<h2 class="section-title">ملاحظات التجويد</h2>${[...groupsMap].map(([rule, items]) => `
          <div class="card"><b class="gold">${esc(rule)}</b>${items.map(x => `
            <div class="mt" style="border-inline-start:3px solid ${sevColor(x.severity)};padding-inline-start:10px"><span class="quran">${esc(x.word)}</span>${x.note ? `<div class="muted small">${esc(x.note)}</div>` : ''}</div>`).join('')}</div>`).join('')}` : ''}
        ${advice.length ? `<h2 class="section-title">نصيحة</h2><div class="card">${advice.map(a => `<p>${esc(a)}</p>`).join('')}</div>` : ''}
        ${!mistakes.length && !groupsMap.size ? '<div class="card"><p class="center">لم تُرصد ملاحظات، بارك الله فيك</p></div>' : ''}`;
    }

    function showResult({ acc, missed, pts, blob, secs }) {
      const { s, from, to } = cfg;
      const rg = gen;
      const msg = acc >= 90 ? 'ما شاء الله، تسميع متقن' : acc >= 70 ? 'جيد جداً، راجع الكلمات الحمراء' : 'التكرار طريق الإتقان';
      const tooLong = secs > MAX_REVIEW_SECS;
      if (blob) { try { resUrl = URL.createObjectURL(blob); } catch (e) { resUrl = null; } }
      let recId = null, pendingTj = null;
      if (blob) {
        recordings.save({ blob, s, from, to, acc, durationMs: Math.round((secs || 0) * 1000) }).then(id => {
          recId = id;
          if (id && pendingTj != null) recordings.update(id, { tajweedScore: pendingTj });
        }).catch(() => {});
      }
      el.innerHTML = header('نتيجة التسميع') + `
        <div class="card hero center">
          <div class="ring" style="position:relative;width:140px;height:140px;margin:0 auto">
            ${ringSvg(acc, accColor(acc), 140)}
            <div class="ring-label score" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${N(acc)}٪</div>
          </div>
          <h2 class="mt">${esc(msg)}</h2>
          <p class="muted small">${esc(surahName(s))} · الآيات ${N(from)}–${N(to)} · +${N(pts)} نقطة</p>
        </div>
        ${missed.length ? `<h2 class="section-title">الكلمات التي تحتاج مراجعة</h2><div class="card"><div class="row">${missed.map(w => `<span class="chip quran">${esc(w)}</span>`).join('')}</div></div>` : ''}
        <div class="card mt">
          ${resUrl ? `<div class="center muted small mb">استمع لتلاوتك وقارنها بالقارئ</div>
          <div class="seg" role="group" aria-label="قارن بالقارئ">
            <button id="rc-mine">${icon('play', 16)} صوتي</button>
            <button id="rc-sheikh">${icon('play', 16)} القارئ</button>
          </div>
          <div class="center mt"><a class="small gold" data-go="recordings">كل تلاواتي</a></div>`
          : `<div class="row" style="justify-content:center"><button class="btn ghost sm" id="rc-sheikh">${icon('play', 16)} استمع للشيخ</button></div>`}
        </div>
        ${resUrl ? `<div id="rc-tj" class="mt">${tooLong
          ? '<div class="card"><p class="muted small center">التسجيل أطول من ٤ دقائق، قسّمه إلى مقاطع أقصر للحصول على تقييم التجويد.</p></div>'
          : '<button class="btn block" id="rc-tjbtn">تقييم التجويد بالذكاء ✨</button>'}</div>` : ''}
        <div class="grid-2 mt">
          <button class="btn" id="rc-again">${icon('repeat', 18)} إعادة</button>
          <button class="btn ghost" id="rc-rev">أضف للمراجعة</button>
        </div>
        <button class="btn ghost block mt" id="rc-new">تسميع جديد</button>`;
      $('#rc-again', el).onclick = startSession;
      $('#rc-new', el).onclick = showSetup;
      $('#rc-rev', el).onclick = e => {
        const r = addReview(s, from, to);
        toast(r ? 'أُضيف المقطع إلى المراجعة' : 'المقطع موجود في المراجعة مسبقاً');
        e.currentTarget.disabled = true;
      };

      const mine = $('#rc-mine', el), sheikh = $('#rc-sheikh', el);
      const mark = which => { if (mine && resUrl) { mine.classList.toggle('active', which === 'mine'); sheikh.classList.toggle('active', which === 'sheikh'); } };
      const stopMine = () => { if (resAudio && !resAudio.paused) resAudio.pause(); };
      if (mine && resUrl) {
        mine.onclick = () => {
          if (!resAudio) {
            resAudio = new Audio(resUrl);
            resAudio.onended = () => mark(null);
            resAudio.onerror = () => { mark(null); toast('تعذر تشغيل التسجيل'); };
          }
          if (!resAudio.paused) { resAudio.pause(); mark(null); return; }
          try { stopReciter(); } catch (e) {}
          resAudio.play().then(() => mark('mine')).catch(() => toast('تعذر تشغيل التسجيل'));
        };
      }
      sheikh.onclick = () => {
        stopMine();
        try { playRange(s, from, to); mark('sheikh'); } catch (e) { toast('تعذر تشغيل التلاوة'); }
      };

      const box = $('#rc-tj', el), tjBtn = $('#rc-tjbtn', el);
      if (box && tjBtn) {
        const text = Array.from({ length: to - from + 1 }, (_, k) => ayah(s, from + k)).join(' ');
        const idle = () => { box.innerHTML = '<button class="btn block" id="rc-tjbtn">تقييم التجويد بالذكاء ✨</button>'; $('#rc-tjbtn', box).onclick = run; };
        async function run() {
          if (tjCtl) { try { tjCtl.abort(); } catch (e) {} }
          const ctl = tjCtl = new AbortController();
          box.innerHTML = '<div class="card center"><p class="muted">يستمع الذكاء إلى تلاوتك ويحلل التجويد… قد يستغرق ذلك دقيقة</p><button class="btn ghost sm" id="rc-tjx">إلغاء</button></div>';
          $('#rc-tjx', box).onclick = () => { ctl.abort(); idle(); };
          try {
            const r = await tajweedReview(blob, { s, from, to, text, signal: ctl.signal });
            if (ctl.signal.aborted || gen !== rg) return;
            box.innerHTML = renderTajweed(r);
            const sc = Number(r && r.score);
            if (Number.isFinite(sc)) { const v = Math.max(0, Math.min(100, Math.round(sc))); if (recId) recordings.update(recId, { tajweedScore: v }); else pendingTj = v; }
          } catch (e) {
            if (ctl.signal.aborted || gen !== rg) return;
            box.innerHTML = `<div class="card center"><p>${esc(e && e.message ? e.message : 'تعذّر تقييم التجويد')}</p><button class="btn sm" id="rc-tjr">أعد المحاولة</button></div>`;
            $('#rc-tjr', box).onclick = run;
          } finally { if (tjCtl === ctl) tjCtl = null; }
        }
        tjBtn.onclick = run;
      }
    }

    showSetup();
    return cleanup;
  }
};
