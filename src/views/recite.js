// Tasmee' (recitation checking): voice mode with live word matching, or hide-and-recall mode.
import { esc, $, $$, toast, icon, ayahMark, header, N } from '../ui.js';
import { S, addRecitation, addReview, dueReviews, recordWords, lastAttempt, ayahMistakeMap } from '../core/store.js';
import { analyzeMistakes } from '../core/feedback.js';
import { wrongRuns, findSimilar } from '../core/mutashabih.js';
import { loadQuran, surahName, ayahCount, ayah, SURAH_COUNT } from '../core/quran.js';
import { words as splitWords } from '../core/arabic.js';
import { createMatcher, createLockedTracker, stripOpeners } from '../core/matcher.js';
import { speechSupport, startListening } from '../core/speech.js';
import { haptic } from '../core/platform.js';
import { startRecorder, recorderSupported } from '../core/recorder.js';
import { cloudStatus, transcribe, tajweedReview } from '../core/cloud.js';
import { playRange, playAyah, stop as stopReciter, isPlaying as reciterPlaying } from '../core/audio.js';
import * as recordings from '../core/recordings.js';
import { engineSupported, engineCached, downloadEngine, openEngine, mapVerdicts, freeSegments, ENGINE_MB } from '../core/quran-engine.js';
import * as madani from '../core/madani.js';
import { renderPageLines, pageGlyphs, fitLines, BASMALA } from '../core/madani-render.js';
import { pageOf, pageContent, side, juzOfPage } from '../core/pages.js';
import '../styles/recite.css';

// free recitation / sard: per-viewer preferences (localStorage only, like the other noor.recite.* keys)
const TEXT_KEY = 'noor.recite.showtext';   // '1': ghost text visible (not memorising)
const WARN_KEY = 'noor.recite.warn';       // '0': sard warnings without tone / vibration
const POS_KEY = 'noor.recite.lastpos';     // {s, a} where the last free session ended (tie-break hint for discovery)
const loadFlag = (k, def) => { try { const v = localStorage.getItem(k); return v === null ? def : v === '1'; } catch (e) { return def; } };
const saveFlag = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) { /* ignore */ } };
function loadPos() {
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); return p && p.s >= 1 && p.s <= 114 && p.a >= 1 ? { surah: p.s | 0, ayah: p.a | 0 } : null; } catch (e) { return null; }
}
const savePos = (s, a) => { try { localStorage.setItem(POS_KEY, JSON.stringify({ s, a })); } catch (e) { /* ignore */ } };
// sard: correction-rule mistakes that get the light warning (vowel / repetition notes stay silent)
const WARN_KINDS = new Set(['possible_omission', 'possible_substitution', 'possible_skipped_ayah', 'unclear_ayah']);
const clock = secs => { const t = Math.max(0, Math.round(secs || 0)); return N(Math.floor(t / 60)) + ':' + N(String(t % 60).padStart(2, '0')); };

const MODE_KEY = 'noor.recite.mode';
const MODES = ['quran', 'device', 'ai', 'hide'];
const FS_KEY = 'noor.recite.fs';
const FS_MIN = 26, FS_MAX = 52;
// Whisper chunking tuned for latency (shorter chunks, quicker cut after a pause)
const FAST_VAD = { minSpeechMs: 600, silenceMs: 320, maxMs: 6000 };
const DISPLAYS = ['hidden', 'first', 'full'];
const MAX_REVIEW_SECS = 240;

const MISTAKE_KIND = { missing: 'نقص', wrong: 'خطأ', extra: 'زيادة', harakah: 'حركة' };
// per-word verdicts from feedback.js
const KIND_LABEL = { skip: 'محذوفة', wrong: 'مبدّلة', hint: 'تلقين', vowel: 'حركة', repeat: 'تكرار' };
// on-device engine issues -> feedback kinds
const ISSUE_KIND = { possible_omission: 'skip', possible_substitution: 'wrong', possible_vowel: 'vowel', possible_repetition: 'repeat', possible_skipped_ayah: 'skip', unclear_ayah: 'wrong' };
function loadMode() {
  try {
    // v1.3: instant on-device mode became the default — reset choices saved by older versions once.
    // v1.6: the on-device Quran engine becomes the default once downloaded — reset older saved choices once.
    if (localStorage.getItem('noor.recite.modev') !== '4') { localStorage.removeItem(MODE_KEY); localStorage.setItem('noor.recite.modev', '4'); }
    const m = localStorage.getItem(MODE_KEY); return MODES.includes(m) ? m : null;
  } catch (e) { return null; }
}
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
const MODE_TITLE = { quran: 'التسميع القرآني', ai: 'تسميع دقيق', device: 'تسميع فوري', hide: 'اختبار الحفظ' };

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
    let activeEngine = null;     // on-device Quran engine with a running session
    let freeStop = null;         // free / sard session teardown (timer, tone context, resize listener)
    let lastFree = 'free';       // kind of the last free session ('free' | 'sard'), for «إعادة»
    const cleanup = () => {
      alive = false; gen++; setupTok++;
      if (freeStop) { const f = freeStop; freeStop = null; try { f(); } catch (e) {} }
      if (stopMic) { try { stopMic(); } catch (e) {} stopMic = null; }
      if (recCtl) { const r = recCtl; recCtl = null; try { r.stop().catch(() => {}); } catch (e) {} }
      if (aiCtl) { try { aiCtl.abort(); } catch (e) {} aiCtl = null; }
      if (tjCtl) { try { tjCtl.abort(); } catch (e) {} tjCtl = null; }
      if (wAudio) { try { wAudio.pause(); wAudio.removeAttribute('src'); wAudio.load(); } catch (e) {} wAudio = null; }
      if (resAudio) { try { resAudio.pause(); resAudio.removeAttribute('src'); resAudio.load(); } catch (e) {} resAudio = null; }
      if (resUrl) { try { URL.revokeObjectURL(resUrl); } catch (e) {} resUrl = null; }
      // leaving mid-session: abandon the on-device engine session so it never feeds a later one
      if (activeEngine) { try { activeEngine.cancel(); } catch (e) {} activeEngine = null; }
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


    /** Play one word (1-based w within ayah a) from quran.com word audio, falling back to the whole ayah. */
    function playWordAt(s, a, w) {
      try { stopReciter(); } catch (e) {}
      if (resAudio && !resAudio.paused) { try { resAudio.pause(); } catch (e) {} }
      if (wAudio) { try { wAudio.pause(); } catch (e) {} }
      const myGen = gen;
      let fell = false;
      const fallback = () => {
        if (fell || !alive || gen !== myGen) return; fell = true;
        try { playAyah(s, a); } catch (e) { toast('تعذر تشغيل الصوت'); }
      };
      try {
        wAudio = new Audio(wordAudioUrl(s, a, w));
        wAudio.onerror = fallback;
        const pr = wAudio.play();
        if (pr && pr.catch) pr.catch(fallback);
      } catch (e) { fallback(); }
    }

    const lastPosHtml = () => {
      const p = loadPos();
      return p ? `<p class="muted small mt rc-lastpos">آخر موضع وصلت إليه: سورة ${esc(surahName(p.surah))} · الآية ${N(p.ayah)} — ابدأ منه أو من أي موضع آخر</p>` : '';
    };

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
        ${engineSupported() ? `<div class="card rc-free">
          <button class="btn block rc-freebtn" id="rc-free">${icon('mic', 22)}<span><b>تسميع حر</b><small>اقرأ من أي موضع بلا تحديد، وأنا أتعرّف عليه وأتابعك على صفحات المصحف</small></span></button>
          <button class="btn ghost block rc-freebtn rc-sardbtn mt" id="rc-sard">${icon('book', 20)}<span><b>السرد</b><small>تلاوة متواصلة طويلة، مع تنبيه خفيف عند الخطأ ليبقى تركيزك</small></span></button>
          ${lastPosHtml()}
          <div class="mt" id="rc-eng"></div>
        </div>
        <h2 class="section-title">تسميع مقطع محدد</h2>` : ''}
        <div class="card">
          <div class="field"><label for="rc-s">السورة</label><select id="rc-s" class="select">${opts}</select></div>
          <div class="grid-2 mt">
            <div class="field"><label for="rc-from">من آية</label><input id="rc-from" class="input" type="number" inputmode="numeric" min="1" value="${cfg.from}"></div>
            <div class="field"><label for="rc-to">إلى آية</label><input id="rc-to" class="input" type="number" inputmode="numeric" min="1" value="${cfg.to}"></div>
          </div>
          <p class="muted small" id="rc-max">عدد آيات السورة: ${N(ayahCount(cfg.s))}</p>
          <div class="row mt" id="rc-mode">
            ${engineSupported() ? modeChip('quran', 'القرآني ✨') : ''}
            ${modeChip('device', 'فوري')}
            ${modeChip('ai', 'دقيق (Whisper)')}
            ${modeChip('hide', 'اختبار الحفظ (إخفاء)')}
          </div>
          ${engineSupported() ? '' : '<div class="mt" id="rc-eng"></div>'}
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
      const markMode = () => $$('#rc-mode button', el).forEach(x => x.classList.toggle('active', x.dataset.mode === cfg.mode));
      $$('#rc-mode button', el).forEach(b => b.onclick = () => {
        cfg.mode = userMode = b.dataset.mode; saveMode(cfg.mode);
        markMode(); engineCard();
      });

      // on-device Quran engine: one-time download card, then it becomes the default mode
      let engReady = false, dl = false;
      function engineCard() {
        const box = $('#rc-eng', el); if (!box || !engineSupported()) return;
        if (engReady) {
          box.innerHTML = '<span class="chip active small">المحرك القرآني جاهز ويعمل بلا إنترنت ✓</span>';
          return;
        }
        if (dl) return;
        box.innerHTML = `<div class="rc-engcard">
          <b class="gold">محرك التسميع القرآني</b>
          <p class="small">نموذج ذكاء مدرّب على تلاوة القرآن يعمل على جهازك بلا إنترنت: يستمع بلا انقطاع ويكشف الكلمة المحذوفة والمبدّلة وأخطاء الحركات والتكرار وتخطّي الآيات.</p>
          <button class="btn block sm" id="rc-engdl">${icon('download', 16)} تحميل المحرك (${N(ENGINE_MB)} ميغابايت — مرة واحدة)</button>
        </div>`;
        $('#rc-engdl', box).onclick = async () => {
          dl = true;
          box.innerHTML = '<div class="rc-engcard"><b class="gold">جارٍ تحميل المحرك…</b><div class="progress mt"><i id="rc-engp" style="width:0%"></i></div><p class="muted small mt" id="rc-engt">٠٪</p></div>';
          try {
            await downloadEngine(p => {
              const bar = $('#rc-engp', el), t = $('#rc-engt', el);
              if (bar) bar.style.width = Math.round(p * 100) + '%';
              if (t) t.textContent = N(Math.round(p * 100)) + '٪';
            });
            engReady = true; dl = false;
            if (!userMode || cfg.mode !== 'hide') { cfg.mode = userMode = 'quran'; saveMode('quran'); }
            if (alive && tok === setupTok) { markMode(); engineCard(); toast('تم تحميل المحرك القرآني ✓'); }
          } catch (e) {
            dl = false;
            if (alive && tok === setupTok) { engineCard(); toast('تعذّر التحميل، تحقق من الإنترنت وحاول مجدداً (يكمل من حيث توقف)'); }
          }
        };
      }
      if (engineSupported()) engineCached().then(ok => {
        engReady = ok;
        if (!alive || tok !== setupTok) return;
        if (!ok && cfg.mode === 'quran') { cfg.mode = 'device'; markMode(); }
        engineCard();
      });
      $$('#rc-disp button', el).forEach(b => b.onclick = () => {
        cfg.display = b.dataset.display;
        $$('#rc-disp button', el).forEach(x => x.classList.toggle('active', x === b));
      });
      $('#rc-start', el).onclick = () => { readInputs(); startSession(); };
      // free recitation / sard need the on-device engine (it is what discovers the position)
      const freeGo = kind => {
        if (engReady) { startFree(kind); return; }
        toast('حمّل المحرك القرآني أولاً (مرة واحدة) ثم ابدأ');
        const b = $('#rc-engdl', el); if (b) { try { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.focus(); } catch (e) {} }
      };
      const fb = $('#rc-free', el), sb = $('#rc-sard', el);
      if (fb) fb.onclick = () => freeGo('free');
      if (sb) sb.onclick = () => freeGo('sard');

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
        if (!aiReady()) { toast('الوضع الدقيق غير متاح الآن — سيُستخدم الفوري'); mode = 'device'; }
      }
      if (mode === 'quran' && !(engineSupported() && await engineCached())) { toast('حمّل المحرك القرآني أولاً — سيُستخدم الفوري'); mode = 'device'; }
      if (!isLive()) return;
      const voiceLike = mode !== 'hide';
      // may fall back ai/quran -> device mid-session
      let engine = mode === 'ai' ? 'ai' : mode === 'quran' ? 'quran' : 'device';
      const disp = mode === 'hide' && cfg.display === 'full' ? 'hidden' : cfg.display;
      const { flat, groups } = buildRange(s, from, to);
      const total = flat.length;
      const matcher = createMatcher(flat.map(x => x.w));
      const tracker = createLockedTracker(total, { confirm: 2 });
      let raw = new Array(total).fill('pending');       // last raw matcher states (before locking)
      let mres = { states: new Array(total).fill('pending'), pointer: 0, acc: 0 };
      const hst = new Array(total).fill('pending');   // hide-mode states
      const forced = new Set();                         // hinted words (always bad)
      const groupOf = new Array(total);
      groups.forEach(g => { for (let k = g.start; k < g.end; k++) groupOf[k] = g; });
      let finished = false, ending = false, listening = false, support = 'native';
      let base = '', lastFull = '', sess = 0;               // base = transcript of earlier device-mic sessions
      const keepBasmala = s === 1 && from === 1;
      // AI engine state
      let rec = null, starting = false, aiState = 'idle', chain = Promise.resolve(), inflight = 0, fails = 0;
      let aiText = '', recBlob = null, recSecs = 0, allDone = false;
      // on-device Quran engine state
      let qe = null, qVerdicts = [];
      const qIssues = new Map();                        // flat index -> feedback kind (from the engine's correction rules)
      const qVowel = new Set();                         // words read with a vowel (haraka) slip
      if (engine === 'device' && voiceLike) support = await speechSupport();
      if (!isLive()) return;
      if (engine === 'ai') aiCtl = new AbortController();

      let fs = loadFs();
      const showBanner = from === 1;
      const showBasmala = from === 1 && s !== 1 && s !== 9;
      const body = groups.map(g => {
        const spans = flat.slice(g.start, g.end).map((x, k) => `<span class="word w-pend" data-i="${g.start + k}">${esc(x.w)}</span>`).join(' ');
        return spans + ' ' + ayahMark(g.a);
      }).join(' ');

      const noVoice = engine === 'device' && voiceLike && support === 'none';
      const fsCtl = `<button class="icon-btn rc-fsbtn" id="rc-fsm" aria-label="تصغير خط التسميع">أ<small>−</small></button><button class="icon-btn rc-fsbtn" id="rc-fsp" aria-label="تكبير خط التسميع">أ<small>+</small></button>`;
      const centerBtn = mode === 'hide'
        ? `<button class="btn rc-okbtn" id="rc-ok">${icon('check', 18)} تذكرتها</button>`
        : (noVoice ? '<span></span>' : `<button class="mic-btn rc-mic" id="rc-mic" aria-label="تشغيل الميكروفون">${icon('mic', 30)}</button>`);
      el.innerHTML = header(MODE_TITLE[mode], { actions: fsCtl }) + `
        ${noVoice ? `<div class="card"><p>التعرف على الصوت غير متاح على هذا الجهاز أو المتصفح.</p><button class="btn block" id="rc-tohide">جرّب اختبار الحفظ (إخفاء)</button></div>` : ''}
        <div class="rc-sub muted small">${esc(surahName(s))} · الآيات ${N(from)}–${N(to)}</div>
        <div class="mushaf-page rc-page${disp === 'full' ? ' rc-full' : ''}" id="rc-page" style="--rc-fs:${fs}px">
          ${showBanner ? `<div class="surah-banner">سورة ${esc(surahName(s))}</div>` : ''}
          ${showBasmala ? '<div class="basmala">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</div>' : ''}
          <div class="mushaf-text" id="rc-text">${body}</div>
        </div>
        ${mode === 'hide' ? '<p class="muted small center mt">اضغط على مكان أي كلمة لكشفها (تُحسب خطأ)، أو «تذكرتها» عند إتقان الآية التالية.</p>'
          : '<p class="muted small center mt">تُكتب الكلمة عند نطقها صحيحة، والأخطاء بالأحمر — اضغط عليها لسماعها.</p>'}
        <div class="rc-spacer"></div>
        <div class="rc-dock" id="rc-dock">
          <div class="rc-dock-top"><span class="small muted" id="rc-status">${voiceLike ? 'جارٍ تشغيل الميكروفون…' : 'تذكّر الآية التالية'}</span><b class="score" id="rc-score">٠٪</b></div>
          <div class="progress rc-prog"><i id="rc-prog" style="width:0%"></i></div>
          <div class="rc-dock-row">
            <button class="btn ghost sm" id="rc-hint">${icon('eye', 16)} تلميح</button>
            ${centerBtn}
            <button class="btn sm" id="rc-end">إنهاء</button>
          </div>
        </div>`;

      { const hd = $('.page-head', el); if (hd) hd.classList.add('sticky-head'); }
      const spans = $$('.word', el);
      // words the user got wrong in earlier sessions get a faint marker, so they recite them with extra care
      groups.forEach(g => {
        const mm = ayahMistakeMap(s, g.a);
        for (const w in mm) { const sp = spans[g.start + (+w) - 1]; if (sp && g.start + (+w) - 1 < g.end) sp.classList.add('w-weak'); }
      });
      const shown = new Array(total).fill(null);
      const pageEl = $('#rc-page', el);
      const scoreEl = $('#rc-score', el), progEl = $('#rc-prog', el), micEl = $('#rc-mic', el), statusEl = $('#rc-status', el);
      const setLevel = v => { if (micEl) micEl.style.setProperty('--lvl', Math.max(0, Math.min(1, v)).toFixed(2)); };

      const setFs = v => {
        fs = Math.max(FS_MIN, Math.min(FS_MAX, v));
        saveFs(fs);
        pageEl.style.setProperty('--rc-fs', fs + 'px');
        lastLineTop = null; scrollToCurrent(true);
      };
      $('#rc-fsm', el).onclick = () => setFs(fs - 2);
      $('#rc-fsp', el).onclick = () => setFs(fs + 2);

      const baseStates = () => (voiceLike ? mres.states : hst);
      const effective = () => baseStates().map((st, i) => (forced.has(i) ? 'bad' : st));
      const setStatus = t => { if (statusEl) statusEl.textContent = t; };

      // ---- keep the current line around the upper-middle of the viewport ----
      let curPtr = -1, lastLineTop = null;
      function scrollToCurrent(force = false) {
        const sp = curPtr >= 0 ? spans[curPtr] : null;
        if (!sp) return;
        let r;
        try { r = sp.getBoundingClientRect(); } catch (e) { return; }
        const lineTop = Math.round(r.top + window.scrollY);
        if (!force && lastLineTop !== null && Math.abs(lineTop - lastLineTop) < 8) return;   // same line
        lastLineTop = lineTop;
        const target = window.innerHeight * 0.3;
        if (!force && r.top > target - 40 && r.top < window.innerHeight * 0.55) return;
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try { window.scrollTo({ top: Math.max(0, window.scrollY + r.top - target), behavior: reduce ? 'auto' : 'smooth' }); } catch (e) {}
      }

      let prevSt = new Array(total).fill('pending');
      let prevPtr = -2;
      const ayahDone = new Set();
      /** Repaint only what changed since the last update (cheap even for a whole surah). */
      function paint() {
        const st = effective();
        const ptr = st.indexOf('pending');
        let ok = 0, done = 0, newBad = false, newAyah = false;
        for (let i = 0; i < total; i++) {
          const x = st[i];
          if (x === 'ok') ok++;
          if (x !== 'pending') done++;
          if (x === prevSt[i]) continue;
          const sp = spans[i];
          sp.classList.toggle('w-ok', x === 'ok');
          sp.classList.toggle('w-bad', x === 'bad');
          sp.classList.toggle('w-pend', x === 'pending');
          if (x === 'bad') newBad = true;
          const first = x === 'pending' && disp === 'first';
          if (shown[i] !== first) { shown[i] = first; sp.textContent = first ? firstLetter(flat[i].w) : flat[i].w; sp.classList.toggle('w-first', first); }
          const g = groupOf[i];
          if (x === 'pending') ayahDone.delete(g.a);
          else if (!ayahDone.has(g.a)) {
            let all = true;
            for (let k = g.start; k < g.end; k++) if (st[k] === 'pending') { all = false; break; }
            if (all) { ayahDone.add(g.a); newAyah = true; }
          }
        }
        const curNow = finished ? -1 : ptr;
        if (curNow !== prevPtr) {
          if (prevPtr >= 0 && spans[prevPtr]) spans[prevPtr].classList.remove('w-cur');
          if (curNow >= 0) spans[curNow].classList.add('w-cur');
          prevPtr = curNow;
        }
        prevSt = st;
        if (newBad || newAyah) haptic('light');      // no haptic per written word: only mistakes / ayah completion
        const acc = total ? Math.round(100 * ok / total) : 0;
        scoreEl.textContent = N(acc) + '٪';
        progEl.style.width = (total ? 100 * done / total : 0) + '%';
        if (ptr !== curPtr) { curPtr = ptr; if (ptr >= 0) scrollToCurrent(); }
        return ptr;
      }
      // first paint of "first letters" display
      if (disp === 'first') for (let i = 0; i < total; i++) { shown[i] = true; spans[i].textContent = firstLetter(flat[i].w); spans[i].classList.add('w-first'); }

      function setListening(on) {
        listening = on;
        if (micEl) micEl.classList.toggle('live', on);
        if (!on) setLevel(0);
        setStatus(on ? 'أسمعك… اقرأ الآن' : 'اضغط على الميكروفون وابدأ التسميع');
      }
      function stopListeningNow() { base = lastFull; if (stopMic) { try { stopMic(); } catch (e) {} stopMic = null; } setListening(false); }

      /** Apply a (partial or final) transcript: match, lock confirmed words, repaint immediately. */
      function applyTranscript(full, isFinal) {
        raw = matcher.update(stripOpeners(full, keepBasmala)).states;
        mres = tracker.apply(raw, { final: !!isFinal });
        return paint();
      }

      /** Choose the ASR alternative that best fits the expected words. */
      function pickAlt(cands) {
        let best = 0, bestScore = -Infinity;
        cands.forEach((c, k) => {
          const sc = matcher.peek(stripOpeners(joinT(base, c), keepBasmala)).score;
          if (sc > bestScore) { bestScore = sc; best = k; }
        });
        return best;
      }

      // ----- on-device engine (streams partial results) -----
      async function toggleMic() {
        if (finished || ending) return;
        if (listening) { stopListeningNow(); return; }
        setListening(true);
        const my = ++sess;
        try {
          const stop = await startListening({
            pick: pickAlt,
            onLevel: setLevel,
            onText: (text, isFinal) => {
              if (finished || my !== sess || !listening) return;
              lastFull = joinT(base, text);
              const ptr = applyTranscript(lastFull, isFinal);
              if (ptr === -1 && !finished) setTimeout(() => { if (isLive() && !finished) finish(); }, 600);
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

      // ----- precise (Whisper) engine -----
      const showBusy = () => { if (pageEl) pageEl.classList.toggle('rc-busy', inflight > 0 && !finished); };

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
        inflight++; showBusy();
        // requests run concurrently, but results are applied strictly in chunk order
        const p = transcribe(blob, { prompt, signal, fast: true }).then(r => ({ ok: true, text: (r && r.text) || '' }), e => ({ ok: false, e }));
        chain = chain.then(() => p).then(res => {
          inflight = Math.max(0, inflight - 1); showBusy();
          if (isLive() && engine === 'ai') applyChunk(res);
        });
      }

      function applyChunk(res) {
        if (!res.ok) {
          if (finished || ending) return;
          const code = res.e && res.e.code;
          if (res.e && (res.e.name === 'AbortError' || code === 'aborted')) return;
          if (code === 'rate_limited' || code === 'daily_limit') { toast('تحوّلنا إلى الوضع الفوري'); switchToDevice(true); return; }
          if (++fails >= 2) { toast('تعذّر الوضع الدقيق — تحوّلنا إلى الفوري'); switchToDevice(true); }
          return;
        }
        fails = 0;
        const t = String(res.text || '').trim();
        if (!t || finished || ending) return;
        aiText = joinT(aiText, t);
        lastFull = aiText;
        const ptr = applyTranscript(aiText, true);
        if (ptr === -1 && !finished) { allDone = true; setTimeout(() => { if (isLive() && !finished) finish(); }, 0); }
      }

      function onRecError(err) {
        if (!isLive() || engine !== 'ai') return;
        toast(err === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون ثم حاول مجدداً' : 'تعذر تسجيل الصوت — سيُستخدم الوضع الفوري');
        switchToDevice(err !== 'permission');
      }

      async function switchToDevice(autoStart) {
        if (engine !== 'ai') return;
        engine = 'device';
        aiState = 'idle';
        const r = rec; rec = null; recCtl = null;
        if (r) r.stop().then(b => { recBlob = b; recSecs = r.elapsed(); }).catch(() => {});
        if (aiCtl) { try { aiCtl.abort(); } catch (e) {} aiCtl = null; }
        inflight = 0; showBusy();
        setListening(false);
        base = lastFull;
        support = await speechSupport();
        if (!isLive() || finished || ending) return;
        if (support === 'none') { toast('التعرف على الصوت غير متاح هنا'); return; }
        if (autoStart) toggleMic();
      }

      // ----- on-device Quran engine (continuous mic, no gaps between ayahs) -----
      let qRaf = 0;
      function applyQuran(words, now = false) {
        // the engine drops its tracker once the passage is complete: an empty list must not erase the page
        if (!words.length && qVerdicts.length) words = qVerdicts;
        qVerdicts = words;
        // bursts of verdicts/issues coalesce into one paint per frame (paint only touches words that changed)
        if (now || document.hidden) { if (qRaf) { cancelAnimationFrame(qRaf); qRaf = 0; } renderQuran(); }
        else if (!qRaf) qRaf = requestAnimationFrame(() => { qRaf = 0; if (isLive() && !finished) renderQuran(); });
      }
      function renderQuran() {
        const m = mapVerdicts(qVerdicts, groups);
        const st = new Array(total).fill('pending');
        for (const [i, v] of m) {
          st[i] = v.st === 'ok' || v.st === 'unsure' ? 'ok' : v.st === 'pending' ? 'pending' : 'bad';
          if (v.vowel > 0 && st[i] === 'ok') qVowel.add(i);
        }
        for (const [i, k] of qIssues) if (k !== 'vowel' && k !== 'repeat') st[i] = 'bad';
        // the worker already accumulates settled verdicts: no locking here, so a later correction can still turn a word red
        raw = st;
        mres = { states: st.slice() };
        const ptr = paint();
        if (ptr === -1 && !finished) setTimeout(() => { if (isLive() && !finished) finish(); }, 900);
      }
      function onQuranIssue(issue) {
        const kind = ISSUE_KIND[issue.kind]; if (!kind) return;
        const n = issue.kind === 'possible_skipped_ayah' || issue.kind === 'unclear_ayah' ? Math.max(1, issue.words | 0) : 1;
        const items = [];
        for (let k = 0; k < n; k++) items.push({ a: issue.a, w: issue.w + k, st: 'wrong' });
        for (const i of mapVerdicts(items, groups).keys()) { if (!qIssues.has(i) || kind !== 'vowel') qIssues.set(i, kind); if (kind === 'vowel') qVowel.add(i); }
        if (kind !== 'vowel' && kind !== 'repeat') haptic('light');
        applyQuran(qVerdicts);
      }
      async function toggleQuran() {
        if (finished || ending || starting) return;
        if (aiState === 'rec') { rec.pause(); aiState = 'paused'; listening = false; micEl.classList.remove('live'); setStatus('متوقف مؤقتاً — اضغط للمتابعة'); setLevel(0); return; }
        if (aiState === 'paused') { rec.resume(); aiState = 'rec'; setListening(true); return; }
        starting = true;
        setStatus('جارٍ تجهيز المحرك القرآني…');
        // the recorder starts first, inside the user's tap (an AudioContext created later may stay suspended);
        // audio captured while the engine loads is buffered and handed over once it is ready
        let r = null, early = [], earlyLen = 0, live = false, appAudioTill = 0;
        const fallback = async msg => {
          if (!isLive() || engine !== 'quran' || finished || ending) return;
          toast(msg);
          engine = 'device'; aiState = 'idle';
          const old = rec || r; rec = null; recCtl = null;
          if (old) old.stop().catch(() => {});
          if (qe) { try { qe.cancel(); } catch (e) {} } qe = null; activeEngine = null;
          setListening(false);
          support = await speechSupport();
          if (isLive() && support !== 'none') toggleMic();
        };
        try {
          r = await startRecorder({ onPcm: pcm => {
            if (finished || aiState === 'paused') return;
            // the mic runs without echo cancellation: while the app's own audio plays (hint / word taps) and ~300 ms
            // after, the engine gets silence of the same length instead of the speaker, so its timeline stays continuous
            const now = Date.now();
            if ((wAudio && !wAudio.paused && !wAudio.ended) || reciterPlaying()) appAudioTill = now + 300;
            if (now < appAudioTill) pcm = new Float32Array(pcm.length);
            if (live && qe) { qe.pcm(pcm); return; }
            if (earlyLen < 16000 * 20) { early.push(new Float32Array(pcm)); earlyLen += pcm.length; }
          }, onLevel: setLevel, onError: err => {
            if (!isLive() || engine !== 'quran') return;
            toast(err === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون ثم حاول مجدداً' : 'تعذر تسجيل الصوت');
            setListening(false); aiState = 'idle';
          } });
          if (!r) { starting = false; return; }        // onError already explained why
          if (!isLive() || engine !== 'quran' || ending) { starting = false; r.stop().catch(() => {}); return; }
          rec = r; recCtl = r; aiState = 'rec';
          setListening(true);
          qe = await openEngine();
          if (!isLive() || engine !== 'quran' || ending) { starting = false; return; }
          qe.start(s, from, to, {
            onVerdicts: w => { if (isLive() && !finished) applyQuran(w); },
            onIssue: i => { if (isLive() && !finished) onQuranIssue(i); },
            onError: () => fallback('توقف المحرك القرآني — تحوّلنا إلى الفوري'),
            onSlow: () => { if (isLive() && !finished) toast('الجهاز أبطأ من المحرك، قد تتأخر الكلمات قليلاً'); }
          });
          activeEngine = qe;
          for (const b of early) qe.pcm(b);
          early = []; earlyLen = 0; live = true;
          setStatus('أسمعك… اقرأ الآن');
        } catch (e) {
          starting = false;
          await fallback('تعذّر تشغيل المحرك القرآني — سيُستخدم الفوري');
          return;
        }
        starting = false;
      }

      async function toggleAi() {
        if (finished || ending || starting) return;
        if (aiState === 'rec') { rec.pause(); aiState = 'paused'; listening = false; micEl.classList.remove('live'); setStatus('متوقف مؤقتاً — اضغط للمتابعة'); setLevel(0); return; }
        if (aiState === 'paused') { rec.resume(); aiState = 'rec'; setListening(true); return; }
        starting = true;
        let r = null;
        try {
          r = await startRecorder({
            chunkMs: 4500,
            vad: FAST_VAD,
            onChunk,
            onLevel: setLevel,
            onError: onRecError
          });
        } catch (e) { onRecError('error'); }
        starting = false;
        if (!isLive() || engine !== 'ai' || ending) { if (r) { r.stop().catch(() => {}); } return; }
        if (!r) return;     // onError already handled the fallback
        rec = r; recCtl = r; aiState = 'rec';
        setListening(true);
      }

      // ----- word audio (hints / mistakes) -----
      function playWord(i) {
        const g = groupOf[i]; if (!g) return;
        playWordAt(s, g.a, i - g.start + 1);
      }

      function hint() {
        if (finished || ending) return;
        const st = effective();
        const start = voiceLike ? Math.max(0, st.indexOf('pending')) : 0;
        let i = -1;
        for (let k = start; k < total; k++) if (st[k] === 'pending') { i = k; break; }
        if (i < 0) return;
        if (voiceLike) forced.add(i); else hst[i] = 'bad';
        paint();
        playWord(i);
      }

      function markNextAyah() {
        if (finished || ending) return;
        const st = effective();
        const g = groups.find(x => { for (let k = x.start; k < x.end; k++) if (st[k] === 'pending') return true; return false; });
        if (!g) return;
        for (let k = g.start; k < g.end; k++) if (hst[k] === 'pending' && !forced.has(k)) hst[k] = 'ok';
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
        } else if (engine === 'quran' && (rec || qe)) {
          const r = rec; rec = null;
          if (micEl) micEl.disabled = true;
          setListening(false);
          setStatus('جارٍ إكمال التحليل…');
          if (r) { try { recBlob = await r.stop(); } catch (e) { /* ignore */ } recSecs = r.elapsed(); recCtl = null; }
          if (!isLive()) return;
          if (qe) { const w = await qe.stop(); activeEngine = null; if (!isLive()) return; applyQuran(w, true); }
        } else {
          stopListeningNow();
        }
        finalize();
      }

      function finalize() {
        finished = true;
        if (pageEl) pageEl.classList.remove('rc-busy');
        // the on-device engine's states are final as they are (engine corrections must not be locked away)
        const pre = engine === 'quran' ? raw.slice() : voiceLike ? tracker.apply(raw, { final: true }).states : hst.slice();
        // words after the last one reached (session ended early) are not mistakes: they are only left out
        let reached = -1;
        pre.forEach((x, i) => { if (x !== 'pending' || forced.has(i)) reached = i; });
        let st = pre.map(x => (x === 'ok' ? 'ok' : 'bad'));
        try { matcher.finish(); } catch (e) { /* ignore */ }
        st = st.map((x, i) => (forced.has(i) ? 'bad' : x));
        const ok = st.filter(x => x === 'ok').length;
        const acc = total ? Math.round(100 * ok / total) : 0;
        const missed = flat.filter((_, i) => st[i] === 'bad').map(x => x.w);
        // detailed verdict per word: skipped / substituted (with what was heard) / hinted, plus inserted words
        let analysis = { words: st.map((x, i) => ({ i, kind: x === 'ok' ? 'ok' : forced.has(i) ? 'hint' : 'skip', heard: '' })), extras: [] };
        try {
          const heard = voiceLike ? stripOpeners(lastFull, keepBasmala) : '';
          // hide mode: only words actually revealed (tapped / hinted) count as «كُشفت»
          const hinted = voiceLike ? forced : new Set(pre.map((x, i) => (x === 'bad' || forced.has(i) ? i : -1)).filter(i => i >= 0));
          if (engine === 'quran') {
            // the engine judged every word acoustically: use its verdicts and correction rules directly
            const m = mapVerdicts(qVerdicts, groups);
            analysis = { words: st.map((x, i) => {
              if (forced.has(i)) return { i, kind: 'hint', heard: '' };
              const iss = qIssues.get(i);
              if (x === 'ok') return { i, kind: iss === 'vowel' || iss === 'repeat' ? iss : qVowel.has(i) ? 'vowel' : 'ok', heard: '' };
              const v = m.get(i);
              return { i, kind: iss && iss !== 'vowel' && iss !== 'repeat' ? iss : v && v.st === 'wrong' ? 'wrong' : 'skip', heard: '' };
            }), extras: [] };
          } else analysis = analyzeMistakes(flat.map(x => x.w), heard, st, hinted);
        } catch (e) { /* keep the simple verdict */ }
        analysis.words.forEach(x => { if (x.i > reached && x.kind !== 'ok') { x.kind = 'unreached'; x.heard = ''; } });
        analysis.extras = analysis.extras.filter(x => x.after < reached);
        try {
          recordWords(s, analysis.words.filter(x => x.kind !== 'unreached').map(x => ({ a: flat[x.i].a, w: x.i - groupOf[x.i].start + 1, kind: x.kind })));
        } catch (e) { /* ignore */ }
        // drifted into a similar ayah elsewhere (mutashabihat)?
        const similar = [];
        try {
          for (const run of wrongRuns(analysis.words).slice(0, 3)) {
            const at = { s, a: flat[run.from].a };
            const hits = findSimilar(run.heard, at);
            if (hits.length) similar.push({ at, heard: run.heard, hits });
            if (similar.length >= 3) break;
          }
        } catch (e) { /* ignore */ }
        const ayahStats = groups.map(g => {
          let okN = 0;
          for (let k = g.start; k < g.end; k++) if (st[k] === 'ok') okN++;
          return { a: g.a, ok: okN, n: g.end - g.start, acc: g.end > g.start ? Math.round(100 * okN / (g.end - g.start)) : 100 };
        });
        const pts = addRecitation({ s, from, to, acc, miss: missed });
        const prev = lastAttempt(s, from, to, 1);
        haptic('heavy');
        showResult({ acc, missed, pts, blob: recBlob && recBlob.size > 0 ? recBlob : null, secs: recSecs, analysis, flat, groupOf, ayahStats, similar, prev, hideMode: !voiceLike });
      }

      if (noVoice) { $('#rc-tohide', el).onclick = () => { cfg.mode = 'hide'; startSession(); }; }
      if (micEl) micEl.onclick = () => (engine === 'ai' ? toggleAi() : engine === 'quran' ? toggleQuran() : toggleMic());
      $('#rc-hint', el).onclick = hint;
      const okBtn = $('#rc-ok', el); if (okBtn) okBtn.onclick = markNextAyah;
      $('#rc-end', el).onclick = () => { finish(); };
      $('#rc-text', el).addEventListener('click', e => {
        const sp = e.target.closest('.word'); if (!sp || finished || ending) return;
        const i = +sp.dataset.i;
        const st = effective()[i];
        if (st === 'bad') { playWord(i); toast('الصواب: ' + flat[i].w); return; }
        if (mode === 'hide' && hst[i] === 'pending') { hst[i] = 'bad'; paint(); playWord(i); }
      });
      paint();
      // jump to the first word and start listening right away (the «ابدأ» tap is the user gesture)
      curPtr = effective().indexOf('pending');
      requestAnimationFrame(() => { if (isLive()) scrollToCurrent(true); });
      if (micEl && !noVoice) micEl.onclick();
      else if (!voiceLike) setStatus('تذكّر الآية التالية ثم اضغط «تذكرتها»');
    }

    // ---------------- free recitation (تسميع حر) and sard (السرد) ----------------
    // No range: the on-device engine starts in discovery mode (whole Quran), locates the reciter from the first seconds
    // of audio and follows across ayahs, surahs and pages. The current page is shown as the Madinah Mushaf (QCF v2):
    // words stay hidden until recited (ink), mistakes red, unsure amber. Ends only with «إنهاء» (never on a pause).
    async function startFree(kind, { auto = true } = {}) {
      cleanup(); alive = true;
      const myGen = gen;
      const isLive = () => alive && gen === myGen;
      const sard = kind === 'sard';
      lastFree = kind;
      if (!(engineSupported() && await engineCached())) { if (isLive()) { if (auto) toast('حمّل المحرك القرآني أولاً (مرة واحدة)'); showSetup(); } return; }
      if (!isLive()) return;
      let showText = loadFlag(TEXT_KEY, false), warnOn = loadFlag(WARN_KEY, true);
      // the tone context is created inside the start tap (a context made later may stay suspended)
      let toneCtx = null, timer = 0;
      if (sard) { try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) toneCtx = new AC(); } catch (e) { toneCtx = null; } }
      const onResize = () => { if (page && page.mode === 'madani') fitLines($('.mq-lines', el)); };
      freeStop = () => {
        if (timer) { clearInterval(timer); timer = 0; }
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        window.removeEventListener('resize', onResize);
        window.removeEventListener('noor:adhan', onAdhan);
        if (toneCtx) { try { toneCtx.close(); } catch (e) {} toneCtx = null; }
      };
      window.addEventListener('resize', onResize);

      const title = sard ? 'السرد' : 'التسميع';
      const actions = sard ? `<button class="icon-btn rc-warnbtn${warnOn ? ' on' : ''}" id="rc-warnbtn" aria-pressed="${warnOn}" aria-label="صوت واهتزاز التنبيه">${icon('bell', 18)}</button>` : '';
      el.innerHTML = header(title, { actions }) + `
        <div class="rc-ftools">
          <div class="seg rc-txtseg" role="group" aria-label="عرض النص">
            <button id="rc-hid" class="${showText ? '' : 'active'}" aria-pressed="${!showText}">مخفي</button>
            <button id="rc-shw" class="${showText ? 'active' : ''}" aria-pressed="${showText}">ظاهر</button>
          </div>
          <button class="chip small${sard ? ' active' : ''}" id="rc-kind" aria-pressed="${sard}">السرد</button>
          <button class="chip small" id="rc-range">تحديد مقطع</button>
        </div>
        <div class="rc-fhead" id="rc-fhead">${sard ? 'اضغط المايك واسرد من حفظك من أي موضع، وسأنبّهك بلطف عند الخطأ' : 'اضغط المايك واقرأ من أي موضع، وسأنتقل إلى الآية التي تقرؤها وأتابعك'}</div>
        <div class="rc-fwrap${showText ? ' shown' : ''}" id="rc-fwrap"></div>
        <div class="rc-spacer"></div>
        <div class="rc-dock" id="rc-dock">
          <div class="rc-dock-top"><span class="small muted" id="rc-status">${auto ? 'جارٍ تشغيل الميكروفون…' : 'اضغط على المايك وابدأ القراءة'}</span><b class="small rc-fcount" id="rc-count"></b></div>
          <div class="rc-dock-row">
            <span class="small muted rc-ftime" id="rc-time">${clock(0)}</span>
            <button class="mic-btn rc-mic" id="rc-mic" aria-label="تشغيل الميكروفون">${icon('mic', 30)}</button>
            <button class="btn sm" id="rc-end">إنهاء</button>
          </div>
        </div>`;
      { const hd = $('.page-head', el); if (hd) hd.classList.add('sticky-head'); }
      const micEl = $('#rc-mic', el), statusEl = $('#rc-status', el), countEl = $('#rc-count', el), timeEl = $('#rc-time', el);
      const wrap = $('#rc-fwrap', el), headEl = $('#rc-fhead', el);
      const setStatus = t => { if (statusEl) statusEl.textContent = t; };
      const setLevel = v => { if (micEl) micEl.style.setProperty('--lvl', Math.max(0, Math.min(1, v)).toFixed(2)); };
      const listenText = () => (cur ? (sard ? 'أتابعك… واصل السرد' : 'أتابعك… واصل القراءة') : 'أسمعك… أبحث عن الموضع');

      let rec = null, qe = null, starting = false, recState = 'idle', ending = false, finished = false;
      let recBlob = null, recSecs = 0, muteTill = 0, lastWarn = 0, warnCount = 0, mistakes = 0;
      let adhanOn = false;              // the adhan is playing: the engine hears silence (like app audio)
      const onAdhan = e => { adhanOn = !!(e && e.detail && e.detail.on); };
      window.addEventListener('noor:adhan', onAdhan);
      let qWords = [];
      const judgedKeys = new Set();     // 's:a:w' (engine numbering) judged at least once
      const ayahsRead = new Set();      // 's:a' with a judged word
      const issues = new Map();         // 's:a:w' -> feedback kind (correction rules)
      const issueAyahs = new Set();
      const visited = new Set();        // pages the recitation went through
      let cur = null;                   // { s, a } where the reciter is now
      let page = null;                  // shown page: { p, mode:'madani'|'text', spans, base, prev, groups, ends, endSet, keys }
      let pageTok = 0, pageWant = 0, raf = 0, mdWarnedHere = false;
      const counts = () => (qe ? qe.counts() : {});

      const updateCount = () => {
        if (countEl) countEl.textContent = ayahsRead.size ? `${N(ayahsRead.size)} آية · ${N(mistakes)} ${mistakes === 1 ? 'خطأ' : 'أخطاء'}` : '';
      };
      const updateHead = () => {
        if (!cur || !headEl) return;
        const p = pageOf(cur.s, cur.a);
        headEl.innerHTML = `<b class="gold">سورة ${esc(surahName(cur.s))}</b><span>الآية ${N(cur.a)}</span><span>الصفحة ${N(p)}</span><span>الجزء ${N(juzOfPage(p))}</span>`;
      };
      timer = setInterval(() => { if (isLive() && rec && timeEl) timeEl.textContent = clock(rec.elapsed()); }, 1000);

      const hidB = $('#rc-hid', el), shwB = $('#rc-shw', el);
      const setText = v => {
        showText = v; saveFlag(TEXT_KEY, v);
        hidB.classList.toggle('active', !v); shwB.classList.toggle('active', v);
        hidB.setAttribute('aria-pressed', String(!v)); shwB.setAttribute('aria-pressed', String(v));
        wrap.classList.toggle('shown', v);
      };
      hidB.onclick = () => setText(false);
      shwB.onclick = () => setText(true);
      const kindEl = $('#rc-kind', el);
      // free <-> sard changes the tone/warnings, so it is only offered before the session starts (it never throws a running one away)
      const syncKind = () => { if (kindEl) kindEl.disabled = recState !== 'idle' || starting || ending; };
      kindEl.onclick = () => { if (recState !== 'idle' || starting || ending) return; startFree(sard ? 'free' : 'sard', { auto: false }); };
      $('#rc-range', el).onclick = showSetup;
      const wb = $('#rc-warnbtn', el);
      if (wb) wb.onclick = () => {
        warnOn = !warnOn; saveFlag(WARN_KEY, warnOn);
        wb.classList.toggle('on', warnOn); wb.setAttribute('aria-pressed', String(warnOn));
        toast(warnOn ? 'التنبيه بالصوت والاهتزاز مفعّل' : 'التنبيه بالصوت والاهتزاز متوقف (تبقى العلامة على الشاشة)');
      };

      // ---- page display: Madinah Mushaf page (QCF v2), or the plain text of the same page if it cannot load ----
      function textPage(p) {
        let h = '<div class="mushaf-text rc-ftext">', i = 0;
        const groups = [], ends = new Map();
        for (const seg of pageContent(p)) {
          if (seg.from === 1) h += `</div><div class="surah-banner">سورة ${esc(surahName(seg.s))}</div>${seg.s !== 1 && seg.s !== 9 ? `<div class="basmala">${BASMALA}</div>` : ''}<div class="mushaf-text rc-ftext">`;
          for (let a = seg.from; a <= seg.to; a++) {
            const start = i;
            for (const w of splitWords(ayah(seg.s, a))) h += `<span class="word" data-i="${i++}">${esc(w)}</span> `;
            groups.push({ s: seg.s, a, start, end: i });
            ends.set(seg.s + ':' + a, i);
            h += `<span class="rc-aend" data-i="${i++}">${ayahMark(a)}</span> `;
          }
        }
        return { html: h + '</div>', groups, ends };
      }
      async function showPage(p, dir) {
        const tok = ++pageTok;
        pageWant = p;
        let L = null, fam = null;
        try { [L, fam] = await Promise.all([madani.loadPage(p), madani.loadFont(p)]); } catch (e) { L = null; }
        if (!isLive() || tok !== pageTok) return;
        let html, groups, ends, mode;
        if (L) { const pg = pageGlyphs(L); groups = pg.groups; ends = pg.ends; mode = 'madani'; html = renderPageLines(L, { hideText: true, family: fam }); }
        else {
          ({ html, groups, ends } = textPage(p)); mode = 'text';
          if (!mdWarnedHere) { mdWarnedHere = true; toast('تعذّر تحميل خط مصحف المدينة، عُرضت الصفحة بالخط العادي'); }
        }
        const names = [...new Set(pageContent(p).map(g => g.s))].map(s => 'سورة ' + surahName(s)).join(' · ');
        wrap.innerHTML = `<div class="mp-page rc-fpage page-${side(p)}${dir ? ' turn-' + dir : ''}" data-p="${p}">
          <div class="mp-top"><span class="mp-surah">${esc(names)}</span><span class="mp-juz">الجزء ${N(juzOfPage(p))}</span></div>
          <div class="mp-body${mode === 'madani' ? ' madani' : ''}">${html}</div>
          <div class="mp-foot"><span class="mp-num">${N(p)}</span></div>
        </div>`;
        const spans = $$('[data-i]', wrap);
        page = {
          p, mode, spans, groups, ends, endSet: new Set(ends.values()),
          base: spans.map(x => x.className), prev: spans.map(() => ''), keys: new Set(groups.map(g => g.s + ':' + g.a))
        };
        if (mode === 'madani') { madani.setShown([p]); fitLines($('.mq-lines', wrap)); madani.prefetch(p); }
        paintPage();
        try { const r = wrap.getBoundingClientRect(); if (r.top < 0 || r.top > window.innerHeight * 0.5) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 70), behavior: 'auto' }); } catch (e) {}
      }

      /** Classes of every unit on the shown page from the engine verdicts + correction-rule issues. */
      function paintPage() {
        if (!page) return;
        const keys = page.keys, cn = counts();
        const m = mapVerdicts(qWords.filter(v => keys.has(v.s + ':' + v.a)), page.groups, cn);
        const iss = [];
        for (const [k, kind] of issues) {
          if (kind === 'vowel' || kind === 'repeat') continue;
          const [s, a, w] = k.split(':').map(Number);
          if (keys.has(s + ':' + a)) iss.push({ s, a, w, st: 'wrong' });
        }
        const bad = mapVerdicts(iss, page.groups, cn);
        const st = new Array(page.spans.length).fill('f-pend');
        let lastJ = -1;
        for (const g of page.groups) {
          let all = true;
          for (let i = g.start; i < g.end; i++) {
            const v = m.get(i);
            const x = bad.has(i) ? 'f-bad' : !v || v.st === 'pending' ? 'f-pend' : v.st === 'ok' ? 'f-ok' : v.st === 'unsure' ? 'f-uns' : 'f-bad';
            st[i] = x;
            if (x === 'f-pend') all = false; else if (i > lastJ) lastJ = i;
          }
          const e = page.ends.get(g.s + ':' + g.a);
          if (e != null) st[e] = all ? 'f-ok' : 'f-pend';       // ayah-end mark shows once the ayah is complete
        }
        let curI = -1;
        if (!finished && lastJ >= 0) for (let i = lastJ + 1; i < st.length; i++) if (!page.endSet.has(i) && st[i] === 'f-pend') { curI = i; break; }
        for (let i = 0; i < st.length; i++) {
          const c = st[i] + (i === curI ? ' f-cur' : '');
          if (c === page.prev[i]) continue;
          page.prev[i] = c;
          page.spans[i].className = page.base[i] + ' ' + c;
        }
        // keep the line being recited in the upper part of the screen (the dock covers the bottom)
        const sp = page.spans[curI >= 0 ? curI : lastJ];
        if (sp && curI !== page.curI) {
          page.curI = curI;
          try {
            const r = sp.getBoundingClientRect();
            if (r.top < 70 || r.bottom > window.innerHeight * 0.6) {
              const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              window.scrollTo({ top: Math.max(0, window.scrollY + r.top - window.innerHeight * 0.3), behavior: reduce ? 'auto' : 'smooth' });
            }
          } catch (e) { /* ignore */ }
        }
      }
      const schedulePaint = () => {
        if (document.hidden) { paintPage(); return; }
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (isLive()) paintPage(); });
      };

      function moveTo(s, a) {
        const first = !cur;
        cur = { s, a };
        const p = pageOf(s, a);
        visited.add(p);
        if (p !== pageWant) showPage(p, page && !first ? (p > page.p ? 'next' : 'prev') : '');
        updateHead();
        if (first) setStatus(listenText());
      }
      function applyWords(words) {
        if (!words.length && qWords.length) return;           // the engine dropped its tracker: keep the page
        let latest = null;
        for (const v of words) {
          if (v.st === 'pending') continue;
          ayahsRead.add(v.s + ':' + v.a);
          const k = v.s + ':' + v.a + ':' + v.w;
          if (!judgedKeys.has(k)) { judgedKeys.add(k); latest = v; }   // Quran order: the last new word is the frontier
        }
        qWords = words;
        if (latest) moveTo(latest.s, latest.a);
        updateCount();
        schedulePaint();
      }

      // ---- the light warning (sard): soft tone + short vibration + a fading «انتبه» near the word ----
      function beep() {
        if (!toneCtx) return;
        try {
          if (toneCtx.state === 'suspended') toneCtx.resume().catch(() => {});
          const t = toneCtx.currentTime, o = toneCtx.createOscillator(), g = toneCtx.createGain();
          o.type = 'sine'; o.frequency.value = 660;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
          o.connect(g); g.connect(toneCtx.destination);
          o.start(t); o.stop(t + 0.13);
          // the mic has no echo cancellation: the engine hears silence instead of the tone (+300 ms tail)
          muteTill = Date.now() + 120 + 300;
        } catch (e) { /* ignore */ }
      }
      function showPill(s, a, w) {
        if (!wrap) return;
        const pill = document.createElement('div');
        pill.className = 'rc-warn'; pill.setAttribute('role', 'status'); pill.textContent = 'انتبه';
        let placed = false;
        if (page && page.keys.has(s + ':' + a)) {
          const idx = [...mapVerdicts([{ s, a, w, st: 'wrong' }], page.groups, counts()).keys()][0];
          const sp = idx != null ? page.spans[idx] : null;
          if (sp) {
            const r = sp.getBoundingClientRect(), b = wrap.getBoundingClientRect();
            pill.style.left = Math.max(36, Math.min(b.width - 36, r.left + r.width / 2 - b.left)) + 'px';
            pill.style.top = Math.max(0, r.top - b.top) + 'px';
            placed = true;
          }
        }
        if (!placed) pill.classList.add('top');
        wrap.appendChild(pill);
        setTimeout(() => { try { pill.remove(); } catch (e) {} }, 1600);
      }
      function warn(s, a, w) {
        const now = Date.now();
        if (now - lastWarn < 2000) return;                       // one warning per burst of flags
        lastWarn = now; warnCount++;
        if (warnOn) {
          beep();
          let vib = false;
          try { vib = !!(navigator.vibrate && navigator.vibrate(60)); } catch (e) { vib = false; }
          if (!vib) haptic('light');
        }
        showPill(s, a, w);
      }
      function onIssue(issue) {
        const kind = ISSUE_KIND[issue.kind]; if (!kind) return;
        const s = issue.s || (cur && cur.s); if (!s) return;
        const n = issue.kind === 'possible_skipped_ayah' || issue.kind === 'unclear_ayah' ? Math.max(1, issue.words | 0) : 1;
        for (let k = 0; k < n; k++) { const key = s + ':' + issue.a + ':' + (issue.w + k); if (!issues.has(key) || kind !== 'vowel') issues.set(key, kind); }
        issueAyahs.add(s + ':' + issue.a);
        if (kind !== 'vowel' && kind !== 'repeat') {
          mistakes++;
          if (sard && WARN_KINDS.has(issue.kind)) warn(s, issue.a, issue.w); else haptic('light');
        }
        updateCount();
        schedulePaint();
      }

      // ---- mic + engine (continuous; a pause never ends the session) ----
      async function toggle() {
        if (finished || ending || starting) return;
        if (recState === 'rec') { rec.pause(); recState = 'paused'; micEl.classList.remove('live'); setLevel(0); setStatus('متوقف مؤقتاً — اضغط للمتابعة'); return; }
        if (recState === 'paused') { rec.resume(); recState = 'rec'; micEl.classList.add('live'); setStatus(listenText()); return; }
        starting = true; syncKind();
        setStatus('جارٍ تجهيز المحرك القرآني…');
        let early = [], earlyLen = 0, live = false, appTill = 0, r = null;
        try {
          r = await startRecorder({ onPcm: pcm => {
            if (finished || recState === 'paused') return;
            // app audio (word taps) or the warning tone: the engine gets silence of the same length (timeline stays continuous)
            const now = Date.now();
            if ((wAudio && !wAudio.paused && !wAudio.ended) || reciterPlaying()) appTill = now + 300;
            if (now < appTill || now < muteTill || adhanOn) pcm = new Float32Array(pcm.length);   // the adhan is not recitation: silence
            if (live && qe) { qe.pcm(pcm); return; }
            if (earlyLen < 16000 * 20) { early.push(new Float32Array(pcm)); earlyLen += pcm.length; }
          }, onLevel: setLevel, onError: err => {
            if (!isLive()) return;
            toast(err === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون ثم حاول مجدداً' : 'تعذر تسجيل الصوت');
            recState = 'idle'; syncKind(); micEl.classList.remove('live'); setStatus('اضغط على الميكروفون للمحاولة مجدداً');
          } });
          if (!r) { starting = false; return; }
          if (!isLive() || ending) { starting = false; r.stop().catch(() => {}); return; }
          rec = r; recCtl = r; recState = 'rec'; micEl.classList.add('live');
          qe = await openEngine();
          if (!isLive() || ending) { starting = false; return; }
          qe.startFree({
            onVerdicts: w => { if (isLive() && !finished) applyWords(w); },
            onIssue: i => { if (isLive() && !finished) onIssue(i); },
            onError: () => { if (isLive() && !finished && !ending) { toast('توقف المحرك القرآني — عرضنا ما سُمع'); finish(); } },
            onSlow: () => { if (isLive() && !finished) toast('الجهاز أبطأ من المحرك، قد تتأخر الكلمات قليلاً'); }
          }, { hint: loadPos() });
          activeEngine = qe;
          for (const b of early) qe.pcm(b);
          early = []; earlyLen = 0; live = true;
          setStatus(listenText());
        } catch (e) {
          toast('تعذّر تشغيل المحرك القرآني');
          if (r) { r.stop().catch(() => {}); }
          rec = null; recCtl = null; recState = 'idle'; micEl.classList.remove('live');
          setStatus('اضغط على الميكروفون للمحاولة مجدداً');
        }
        starting = false; syncKind();
      }

      async function finish() {
        if (finished || ending) return;
        ending = true; syncKind();
        if (micEl) { micEl.disabled = true; micEl.classList.remove('live'); }
        setStatus('جارٍ إكمال التحليل…');
        const r = rec; rec = null;
        if (r) { try { recBlob = await r.stop(); } catch (e) { /* ignore */ } recSecs = r.elapsed(); recCtl = null; }
        if (!isLive()) return;
        // stop only the engine whose startFree ran; one opened but never started would hand back a stale previous result
        if (qe && activeEngine === qe) { const w = await qe.stop(); activeEngine = null; if (!isLive()) return; if (w.length) applyWords(w); }
        else qe = null;
        finalizeFree();
      }

      /** Results over the ayahs actually covered: the expected word list is built from them, per surah range. */
      function finalizeFree() {
        finished = true;
        paintPage();
        const segs = freeSegments(qWords, [...issueAyahs], 2, 3);   // < 3 words read ok = a brief false lock, not a recitation
        if (!segs.length) { toast('لم أتعرّف على تلاوة — حاول مجدداً بصوت أوضح'); showSetup(); return; }
        const flat = [], groups = [];
        for (const g of segs) for (let a = g.from; a <= g.to; a++) {
          const start = flat.length;
          for (const w of splitWords(ayah(g.s, a))) flat.push({ w, a, s: g.s });
          groups.push({ s: g.s, a, start, end: flat.length });
        }
        const groupOf = [];
        groups.forEach(g => { for (let k = g.start; k < g.end; k++) groupOf[k] = g; });
        const cn = counts();
        const m = mapVerdicts(qWords, groups, cn);
        const iss = new Map();
        for (const [k, kind] of issues) {
          const [s, a, w] = k.split(':').map(Number);
          for (const i of mapVerdicts([{ s, a, w, st: 'wrong' }], groups, cn).keys()) if (!iss.has(i) || kind !== 'vowel') iss.set(i, kind);
        }
        const isBad = i => { const k = iss.get(i); return k && k !== 'vowel' && k !== 'repeat'; };
        const pre = flat.map((_, i) => {
          const v = m.get(i);
          if (isBad(i)) return 'bad';
          return !v || v.st === 'pending' ? 'pending' : v.st === 'ok' || v.st === 'unsure' ? 'ok' : 'bad';
        });
        // words before the first and after the last word reached in each range were never recited: left out, not mistakes
        const out = new Array(flat.length).fill(false);
        for (const g of segs) {
          const idx = []; flat.forEach((x, i) => { if (x.s === g.s && x.a >= g.from && x.a <= g.to) idx.push(i); });
          let lo = idx.findIndex(i => pre[i] !== 'pending'), hi = -1;
          for (let k = idx.length - 1; k >= 0; k--) if (pre[idx[k]] !== 'pending') { hi = k; break; }
          idx.forEach((i, k) => { if (lo < 0 || k < lo || k > hi) out[i] = true; });
        }
        const st = pre.map(x => (x === 'ok' ? 'ok' : 'bad'));
        const analysis = { words: st.map((x, i) => {
          if (out[i]) return { i, kind: 'unreached', heard: '' };
          const k = iss.get(i), v = m.get(i);
          if (x === 'ok') return { i, kind: k === 'vowel' || k === 'repeat' ? k : v && v.vowel > 0 ? 'vowel' : 'ok', heard: '' };
          return { i, kind: isBad(i) ? k : v && v.st === 'wrong' ? 'wrong' : 'skip', heard: '' };
        }), extras: [] };
        const inScope = analysis.words.filter(x => x.kind !== 'unreached');
        const okN = inScope.filter(x => st[x.i] === 'ok').length;
        const acc = inScope.length ? Math.round(100 * okN / inScope.length) : 0;
        const missed = inScope.filter(x => st[x.i] === 'bad').map(x => flat[x.i].w);
        try {
          const byS = new Map();
          for (const x of inScope) { const s = flat[x.i].s; if (!byS.has(s)) byS.set(s, []); byS.get(s).push({ a: flat[x.i].a, w: x.i - groupOf[x.i].start + 1, kind: x.kind }); }
          for (const [s, items] of byS) recordWords(s, items);
        } catch (e) { /* ignore */ }
        const ayahStats = [];
        for (const g of groups) {
          let n = 0, ok = 0;
          for (let k = g.start; k < g.end; k++) if (!out[k]) { n++; if (st[k] === 'ok') ok++; }
          if (n) ayahStats.push({ s: g.s, a: g.a, ok, n, acc: Math.round(100 * ok / n) });
        }
        // history: one entry per surah range recited
        let pts = 0;
        for (const g of segs) {
          const ws = inScope.filter(x => flat[x.i].s === g.s && flat[x.i].a >= g.from && flat[x.i].a <= g.to);
          if (!ws.length) continue;
          const ok = ws.filter(x => st[x.i] === 'ok').length;
          pts += addRecitation({ s: g.s, from: g.from, to: g.to, acc: Math.round(100 * ok / ws.length), miss: ws.filter(x => st[x.i] === 'bad').map(x => flat[x.i].w) }) || 0;
        }
        if (cur) savePos(cur.s, cur.a);
        const prev = segs.length === 1 ? lastAttempt(segs[0].s, segs[0].from, segs[0].to, 1) : null;
        haptic('heavy');
        showResult({
          acc, missed, pts, blob: recBlob && recBlob.size > 0 ? recBlob : null, secs: recSecs, analysis, flat, groupOf, ayahStats, similar: [], prev, hideMode: false,
          span: { segs, kind, pages: visited.size, ayahs: ayahStats.length, warns: warnCount, mistakes: inScope.filter(x => st[x.i] === 'bad').length }
        });
      }

      micEl.onclick = toggle;
      $('#rc-end', el).onclick = () => { if (recState === 'idle' && !qe && !starting) { toast('اضغط على المايك وابدأ القراءة'); return; } finish(); };
      // a red word: tap to hear it
      wrap.addEventListener('click', e => {
        const sp = e.target.closest('.f-bad'); if (!sp || !page || ending) return;
        const i = +sp.dataset.i, g = page.groups.find(x => i >= x.start && i < x.end);
        if (!g) return;
        const n = g.end - g.start, en = counts()[g.s + ':' + g.a] | 0;
        playWordAt(g.s, g.a, (page.mode === 'madani' ? i - g.start : en && en !== n ? Math.floor((i - g.start) * en / n) : i - g.start) + 1);
      });
      // the page where the last free session ended (or the first page) waits under the mic until the engine locates
      { const h = loadPos(); showPage(h ? pageOf(h.surah, h.ayah) : 1, ''); }
      if (auto) toggle();
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
        ${arr(r && r.plan).length ? `<h2 class="section-title">خطة العلاج</h2><div class="card"><ol class="rc-plan">${arr(r.plan).map(p => `<li>${esc(p)}</li>`).join('')}</ol></div>` : ''}
        ${!mistakes.length && !groupsMap.size ? '<div class="card"><p class="center">لم تُرصد ملاحظات، بارك الله فيك</p></div>' : ''}`;
    }

    /** Detailed feedback: change vs last attempt, mistake counts, ayah map, per-ayah mistakes, mutashabihat. */
    function feedbackHtml({ acc, analysis, flat, groupOf, ayahStats, similar, prev, hideMode, free = false }) {
      // free / sard sessions may span surahs: ayahs are then named with their surah
      const multi = new Set(flat.map(x => x.s || 0)).size > 1;
      const ayahLabel = (s, a) => (multi && s ? `سورة ${esc(surahName(s))} · الآية ${N(a)}` : `الآية ${N(a)}`);
      const bad = analysis.words.filter(x => x.kind !== 'ok' && x.kind !== 'unreached');
      const unreached = analysis.words.length - analysis.words.filter(x => x.kind !== 'unreached').length;
      const count = k => bad.filter(x => x.kind === k).length;
      const label = k => (hideMode && k === 'hint' ? 'كُشفت' : KIND_LABEL[k] || k);
      let html = '';
      if (prev) {
        const d = acc - prev.acc;
        html += `<div class="rc-delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ تحسّنت ' + N(d) + '٪' : d < 0 ? '▼ أقل بـ ' + N(-d) + '٪' : '= نفس الدقة'} عن محاولتك السابقة (${N(prev.acc)}٪)</div>`;
      }
      if (bad.length || analysis.extras.length) {
        const stat = (n, t, cls) => `<div class="rc-stat ${cls}"><b>${N(n)}</b><span>${t}</span></div>`;
        html += `<div class="rc-stats">${hideMode
          ? stat(count('hint'), 'كلمات كُشفت', 'hint')
          : stat(count('skip'), 'محذوفة', 'skip') + stat(count('wrong'), 'مبدّلة', 'wrong') + stat(count('hint'), 'تلقين', 'hint')
            + (count('vowel') ? stat(count('vowel'), 'حركات', 'vowel') : '') + (count('repeat') ? stat(count('repeat'), 'تكرار', 'extra') : '')
            + (analysis.extras.length ? stat(analysis.extras.length, 'زيادة', 'extra') : '')}</div>`;
      }
      if (ayahStats.length > 1) {
        html += `<h2 class="section-title">خريطة الآيات</h2><div class="card"><div class="rc-amap">${ayahStats.map(x =>
          `<button class="rc-acell" data-ayah="${x.a}"${x.s ? ` data-s="${x.s}"` : ''} style="--c:${accColor(x.acc)}" aria-label="${x.s ? esc(surahName(x.s)) + ' ' : ''}آية ${N(x.a)}: ${N(x.acc)}٪"><span>${N(x.a)}</span><small>${N(x.acc)}٪</small></button>`).join('')}</div>
          <p class="muted small mt">اضغط على آية لتسميعها وحدها</p></div>`;
      }
      if (similar.length) {
        html += `<div class="card rc-similar"><b class="gold">تنبيه متشابهات</b>${similar.map(m => `
          <p class="mt">في الآية ${N(m.at.a)} انتقلت إلى موضع مشابه: «${esc(m.heard.join(' '))}» — وهي من ${m.hits.map(h => `<span class="chip">${esc(surahName(h.s))} ${N(h.a)}</span>`).join(' ')}</p>`).join('')}
          <p class="muted small">ركّز على الكلمة التي يفترق فيها الموضعان، وسمّعهما متتاليين.</p></div>`;
      }
      if (bad.length) {
        const byAyah = new Map();
        bad.forEach(x => { const k = (flat[x.i].s || 0) + ':' + flat[x.i].a; if (!byAyah.has(k)) byAyah.set(k, []); byAyah.get(k).push(x); });
        html += `<h2 class="section-title">ملاحظات التسميع</h2>${[...byAyah].map(([k, items]) => { const [s, a] = k.split(':').map(Number); return `
          <div class="card rc-mist">
            <div class="row"><b class="gold">${ayahLabel(s, a)}</b><span class="muted small">${N(items.length)} ${items.length > 2 ? 'ملاحظات' : 'ملاحظة'}</span></div>
            ${items.map(x => `<button class="rc-mrow k-${x.kind}" data-i="${x.i}" data-w="${x.i - groupOf[x.i].start + 1}" data-a="${a}"${s ? ` data-s="${s}"` : ''}>
              <span class="quran rc-mword">${esc(flat[x.i].w)}</span>
              <span class="rc-mkind">${esc(label(x.kind))}</span>
              ${x.kind === 'wrong' && x.heard ? `<span class="muted small">قلتَ: «${esc(x.heard)}»</span>` : ''}
              <span class="rc-mplay">${icon('play', 14)}</span>
            </button>`).join('')}
          </div>`; }).join('')}`;
      }
      if (unreached && !free) html += `<p class="muted small center mt">لم تصل إلى ${N(unreached)} كلمة في آخر المقطع، فلم تُحتسب في ملاحظاتك (لكنها تُنقص الدقة).</p>`;
      if (!hideMode) html += '<p class="muted small center mt">الملاحظات آلية وقد تخطئ، ولا تغني عن التلقّي من معلّم متقن.</p>';
      if (analysis.extras.length) {
        html += `<div class="card"><b class="gold">كلمات زائدة لم ترد في النص</b><div class="row mt">${analysis.extras.slice(0, 12).map(x =>
          `<span class="chip">${esc(x.heard)}${x.after >= 0 ? ` <small class="muted">بعد «${esc(flat[x.after].w)}»</small>` : ''}</span>`).join('')}</div></div>`;
      }
      return html;
    }

    function showResult({ acc, missed, pts, blob, secs, analysis = { words: [], extras: [] }, flat = [], groupOf = [], ayahStats = [], similar = [], prev = null, hideMode = false, span = null }) {
      // span: a free / sard session ({ segs:[{s,from,to}], kind, pages, ayahs, warns, mistakes }); otherwise the cfg range
      const segs = span ? span.segs : [{ s: cfg.s, from: cfg.from, to: cfg.to }];
      const { s, from, to } = segs[0];
      const rg = gen;
      const msg = acc >= 90 ? 'ما شاء الله، تسميع متقن' : acc >= 70 ? 'جيد جداً، راجع الكلمات الحمراء' : 'التكرار طريق الإتقان';
      // retry the ayahs with mistakes (in the surah of the first one)
      const badSt = ayahStats.filter(x => x.ok < x.n);
      const rs = badSt.length ? badSt[0].s || s : s;
      const badAyahs = badSt.filter(x => (x.s || s) === rs).map(x => x.a);
      const retry = badAyahs.length && (span || badAyahs[0] !== from || badAyahs[badAyahs.length - 1] !== to) ? { s: rs, from: badAyahs[0], to: badAyahs[badAyahs.length - 1] } : null;
      const where = segs.map(g => `${surahName(g.s)} ${g.from === g.to ? N(g.from) : N(g.from) + '–' + N(g.to)}`).join('، ');
      const summary = span ? `<div class="card rc-fsum">
          <b class="gold">${span.kind === 'sard' ? 'ملخص السرد' : 'ملخص التسميع الحر'}</b>
          <div class="rc-stats">
            <div class="rc-stat"><b>${N(span.pages)}</b><span>${span.pages === 1 ? 'صفحة' : 'صفحات'}</span></div>
            <div class="rc-stat"><b>${N(span.ayahs)}</b><span>آية</span></div>
            <div class="rc-stat skip"><b>${N(span.mistakes)}</b><span>أخطاء</span></div>
            <div class="rc-stat"><b>${clock(secs)}</b><span>المدة</span></div>
          </div>
          ${span.kind === 'sard' && span.warns ? `<p class="muted small mt">نُبّهت ${N(span.warns)} ${span.warns === 1 ? 'مرة' : 'مرات'} أثناء السرد</p>` : ''}
        </div>` : '';
      const detected = analysis.words.filter(x => x.kind !== 'ok' && x.kind !== 'unreached').slice(0, 40).map(x => ({ word: flat[x.i] ? flat[x.i].w : '', kind: x.kind, heard: x.heard || '' }));
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
          <p class="muted small">${span ? esc(where) : `${esc(surahName(s))} · الآيات ${N(from)}–${N(to)}`} · +${N(pts)} نقطة</p>
        </div>
        ${summary}
        ${feedbackHtml({ acc, analysis, flat, groupOf, ayahStats, similar, prev, hideMode, free: !!span })}
        ${!analysis.words.length && missed.length ? `<h2 class="section-title">الكلمات التي تحتاج مراجعة</h2><div class="card"><div class="row">${missed.map(w => `<span class="chip quran">${esc(w)}</span>`).join('')}</div></div>` : ''}
        ${retry ? `<button class="btn block mt" id="rc-retry">${icon('repeat', 18)} أعد الآيات التي أخطأت فيها (${N(retry.from)}–${N(retry.to)})</button>` : ''}
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
      // a range session from a free one uses the on-device engine when it is there
      const toRange = (ss, f, t) => { cfg.s = ss; cfg.from = f; cfg.to = t; if (span && engineSupported()) cfg.mode = 'quran'; startSession(); };
      $('#rc-again', el).onclick = () => (span ? startFree(span.kind) : startSession());
      $('#rc-new', el).onclick = () => (span ? startFree(span.kind, { auto: false }) : showSetup());
      const retryBtn = $('#rc-retry', el);
      if (retryBtn) retryBtn.onclick = () => toRange(retry.s, retry.from, retry.to);
      $$('.rc-acell', el).forEach(b => b.onclick = () => toRange(+b.dataset.s || s, +b.dataset.ayah, +b.dataset.ayah));
      $$('.rc-mrow', el).forEach(b => b.onclick = () => {
        playWordAt(+b.dataset.s || s, +b.dataset.a, +b.dataset.w);
        const i = +b.dataset.i; if (flat[i]) toast('الصواب: ' + flat[i].w);
      });
      $('#rc-rev', el).onclick = e => {
        let r = false;
        for (const g of segs) r = addReview(g.s, g.from, g.to) || r;
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
      if (box && tjBtn && segs.length > 1) box.innerHTML = '<div class="card"><p class="muted small center">تقييم التجويد بالذكاء متاح لتلاوة من سورة واحدة.</p></div>';
      else if (box && tjBtn) {
        const text = Array.from({ length: to - from + 1 }, (_, k) => ayah(s, from + k)).join(' ');
        const idle = () => { box.innerHTML = '<button class="btn block" id="rc-tjbtn">تقييم التجويد بالذكاء ✨</button>'; $('#rc-tjbtn', box).onclick = run; };
        async function run() {
          if (tjCtl) { try { tjCtl.abort(); } catch (e) {} }
          const ctl = tjCtl = new AbortController();
          box.innerHTML = '<div class="card center"><p class="muted">يستمع الذكاء إلى تلاوتك ويحلل التجويد… قد يستغرق ذلك دقيقة</p><button class="btn ghost sm" id="rc-tjx">إلغاء</button></div>';
          $('#rc-tjx', box).onclick = () => { ctl.abort(); idle(); };
          try {
            const r = await tajweedReview(blob, { s, from, to, text, signal: ctl.signal, detected });
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

    if (!params.id && !q.mode && engineSupported()) {
      engineCached().then(ok => { if (!alive) return; if (ok) startFree('free', { auto: false }); else showSetup(); }).catch(() => { if (alive) showSetup(); });
    } else showSetup();
    return cleanup;
  }
};
