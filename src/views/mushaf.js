// Mushaf: index (surahs / juz / bookmarks / pages) and the page-based reader with audio.
import { esc, $, $$, toast, sheet, icon, ayahMark, header, N } from '../ui.js';
import { S, markRead, setLast, isBookmarked, toggleBookmark, addReview } from '../core/store.js';
import { loadQuran, surahName, ayahCount, typeName, ayah, JUZ, SURAH_COUNT } from '../core/quran.js';
import { PAGE_COUNT, pageOf, pageContent, pageFirst, side, quarterOf, quarterStartsOn, hizbLabel, juzOfPage } from '../core/pages.js';
import * as audio from '../core/audio.js';
import { loadTajweed, TAJWEED_LEGEND } from '../core/tajweed.js';
import * as madani from '../core/madani.js';
import * as store from '../core/store.js';
import { findSimilar } from '../core/mutashabih.js';
import { norm } from '../core/arabic.js';

const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
const ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون', 'الحادي والعشرون', 'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون', 'الخامس والعشرون', 'السادس والعشرون', 'السابع والعشرون', 'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون'];
const RATES = [0.75, 1, 1.25, 1.5];
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TJ_KEY = 'noor.tajweed';
const MD_KEY = 'noor.madani';
const HEAT_KEY = 'noor.heat';
const HID_KEY = 'noor.rd.hidden';
const FRAME_KEY = 'noor.rd.frame';
const INK_KEY = 'noor.rd.ink';
const AWAKE_KEY = 'noor.rd.awake';
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const pad3 = n => String(n).padStart(3, '0');
const wordAudioUrl = (s, a, w) => `https://audio.qurancdn.com/wbw/${pad3(s)}_${pad3(a)}_${pad3(w)}.mp3`;
const trCache = new Map();
// extra stroke icons (ui.js icon() has no menu / share / copy / globe ...)
const XP = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  similar: '<path d="M9 7H7a4 4 0 0 0 0 8h2M15 7h2a4 4 0 0 1 0 8h-2M8 11h8"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  peekWord: '<path d="M15 6l-6 6 6 6"/>',
  peekAyah: '<path d="M13 6l-6 6 6 6M19 6l-6 6 6 6"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2h.01"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'
};
const ic = (n, size = 22) => XP[n] ? `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${XP[n]}</svg>` : icon(n, size);
let mdWarned = false;
const clampP = p => Math.min(PAGE_COUNT, Math.max(1, p | 0));

function readCounts() {
  const c = new Array(SURAH_COUNT + 1).fill(0);
  for (const k in S.read) { const s = parseInt(k, 10); if (s > 0 && s <= SURAH_COUNT) c[s]++; }
  return c;
}

// ---------------------------------------------------------------- index
function surahListHTML() {
  const counts = readCounts();
  let h = '';
  for (let s = 1; s <= SURAH_COUNT; s++) {
    const total = ayahCount(s), r = counts[s];
    const done = r >= total;
    h += `<div class="list-item" data-go="mushaf/p${pageOf(s, 1)}"><div class="li-start"><span class="num-diamond">${N(s)}</span></div>` +
      `<div class="li-main"><div>${esc(surahName(s))}</div><div class="li-sub">${typeName(s)} · ${N(total)} آية · ص ${N(pageOf(s, 1))}${r ? ` · مقروءة ${N(r)}` : ''}</div></div>` +
      `<div class="li-end">${done ? `<span class="gold">${icon('check', 20)}</span>` : ''}</div></div>`;
  }
  return h;
}

function juzListHTML() {
  return JUZ.map(([s, a], i) =>
    `<div class="list-item" data-go="mushaf/p${pageOf(s, a)}"><div class="li-start"><span class="num-diamond">${N(i + 1)}</span></div>` +
    `<div class="li-main"><div>الجزء ${ORD[i]}</div><div class="li-sub">يبدأ من سورة ${esc(surahName(s))} · الآية ${N(a)} · ص ${N(pageOf(s, a))}</div></div></div>`).join('');
}

function bookmarksHTML() {
  if (!S.bookmarks.length) {
    return `<div class="card empty"><p>لا توجد علامات بعد.</p><p class="muted small">اضغط على أي آية ثم اختر «علامة» لحفظ موضعك.</p></div>`;
  }
  return S.bookmarks.map(b => {
    const t = ayah(b.s, b.a) || '';
    const snip = t.length > 70 ? t.slice(0, 70) + '…' : t;
    return `<div class="list-item" data-go="mushaf/${b.s}?a=${b.a}"><div class="li-start"><span class="num-diamond">${N(b.s)}</span></div>` +
      `<div class="li-main"><div>${esc(surahName(b.s))} · الآية ${N(b.a)}</div><div class="li-sub quran">${esc(snip)}</div></div>` +
      `<div class="li-end"><button class="icon-btn" data-unbm="${b.s}:${b.a}" aria-label="حذف العلامة">${icon('close', 18)}</button></div></div>`;
  }).join('');
}

function pagesTabHTML() {
  return `<div class="card mb"><div class="muted small mb">اذهب إلى صفحة (١ – ${N(PAGE_COUNT)})</div>` +
    `<div class="row" style="gap:8px"><input class="input" id="pgIn" type="number" inputmode="numeric" min="1" max="${PAGE_COUNT}" placeholder="رقم الصفحة" style="flex:1">` +
    `<button class="btn" id="pgGo">اذهب</button></div></div>` +
    `<div class="muted small mb">بدايات الأجزاء</div><div class="grid-2">` +
    JUZ.map(([s, a], i) => `<button class="btn ghost" data-go="mushaf/p${pageOf(s, a)}">الجزء ${N(i + 1)} · ص ${N(pageOf(s, a))}</button>`).join('') + `</div>`;
}

function renderIndex(el, tab0) {
  const last = S.last && S.last.s >= 1 && S.last.s <= SURAH_COUNT ? S.last : null;
  const hero = last ? `<div class="card hero mb"><div class="muted small">متابعة القراءة</div>` +
    `<h3 class="gold">صفحة ${N(pageOf(last.s, last.a))} · سورة ${esc(surahName(last.s))}</h3>` +
    `<button class="btn" data-go="mushaf/p${pageOf(last.s, last.a)}">${icon('book', 18)} تابع القراءة</button></div>` : '';
  el.innerHTML = header('المصحف', { actions: `<button class="icon-btn" data-go="search" aria-label="بحث">${icon('search')}</button>` }) +
    hero +
    `<div class="seg mb"><button class="active" data-tab="s">السور</button><button data-tab="j">الأجزاء</button><button data-tab="b">العلامات</button><button data-tab="p">الصفحات</button></div>` +
    `<div class="list" data-panel="s">${surahListHTML()}</div>` +
    `<div class="list" data-panel="j" hidden>${juzListHTML()}</div>` +
    `<div data-panel="b" hidden>${bookmarksHTML()}</div>` +
    `<div data-panel="p" hidden>${pagesTabHTML()}</div>`;

  const onClick = e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      $$('[data-tab]', el).forEach(b => b.classList.toggle('active', b === tab));
      $$('[data-panel]', el).forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
      return;
    }
    if (e.target.closest('#pgGo')) {
      const n = Number($('#pgIn', el).value);
      if (Number.isInteger(n) && n >= 1 && n <= PAGE_COUNT) location.hash = '#/mushaf/p' + n; else toast('أدخل رقمًا من ١ إلى ٦٠٤');
      return;
    }
    const rm = e.target.closest('[data-unbm]');
    if (rm) {
      e.stopPropagation();
      const [s, a] = rm.dataset.unbm.split(':').map(Number);
      toggleBookmark(s, a);
      $('[data-panel="b"]', el).innerHTML = bookmarksHTML();
      toast('أُزيلت العلامة');
    }
  };
  const onKey = e => { if (e.key === 'Enter' && e.target.id === 'pgIn') $('#pgGo', el).click(); };
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);
  { const t0 = tab0 && ['s', 'j', 'b', 'p'].includes(tab0) && $(`[data-tab="${tab0}"]`, el); if (t0) t0.click(); }
  return () => { el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); };
}

// ---------------------------------------------------------------- reader
const isWide = () => window.matchMedia && window.matchMedia('(min-width:900px)').matches;
const pageSurahs = p => { const r = []; for (const g of pageContent(p)) if (!r.includes(g.s)) r.push(g.s); return r; };
const pageTitle = p => pageSurahs(p).map(surahName).join(' · ');

async function renderPages(el, page, focusS, focusA) {
  let cur = clampP(page);
  let shown = [];
  let rubs = new Set();
  let sel = null, playing = null;
  let userStopped = false;
  let dead = false, tafsirAbort = null, openSheet = null, hiTimer = null, animTimer = null, tjSeq = 0;
  const tjCache = new Map();
  let tjOn = false;
  try { tjOn = localStorage.getItem(TJ_KEY) === '1'; } catch (e) { /* ignore */ }
  let mdOn = true;
  try { mdOn = localStorage.getItem(MD_KEY) !== '0'; } catch (e) { /* ignore */ }
  let heatOn = false;
  try { heatOn = localStorage.getItem(HEAT_KEY) === '1'; } catch (e) { /* ignore */ }
  let hiddenOn = lsGet(HID_KEY, '0') === '1';
  let frameOn = lsGet(FRAME_KEY, '0') === '1';
  let ink = lsGet(INK_KEY, 'auto');
  let awakeOn = lsGet(AWAKE_KEY, '0') === '1';
  let dialOpen = false, wake = null, wAudio = null, lpTimer = 0, lpFired = false, lpX = 0, lpY = 0;
  const revW = new Set(), revA = new Set(); // revealed words ('page:idx') / ayahs ('s:a') in hidden mode
  const mdReady = new Set(), mdFail = new Set(), mdPending = new Set();
  const useMd = () => mdOn && !tjOn;

  const pagesFor = p => {
    if (!isWide()) return [p];
    const base = p % 2 ? p : p - 1;
    return base + 1 <= PAGE_COUNT ? [base, base + 1] : [base];
  };
  const step = () => (isWide() ? 2 : 1);

  const ayahInner = (s, a) => {
    const html = tjOn && tjCache.get(s) && tjCache.get(s)[a - 1];
    return (rubs.has(s + ':' + a) && s + a > 2 ? '<span class="rub">۞</span> ' : '') + (html || esc(ayah(s, a))) + ' ' + ayahMark(a);
  };
  const mdSkeleton = p => '<div class="mq-lines' + (p <= 2 ? ' short' : '') + ' sk">' + '<div class="mq-line"><i></i></div>'.repeat(p <= 2 ? 8 : 15) + '</div>';
  const madaniBody = p => {
    const L = madani.cachedLayout(p);
    const byN = new Map(L.lines.map(l => [l.n, l]));
    const rows = p <= 2 ? L.lines.map(l => l.n) : Array.from({ length: 15 }, (_, i) => i + 1);
    let h = `<div class="mq-lines${p <= 2 ? ' short' : ''}" style="font-family:'${madani.familyOf(p)}',var(--font-quran)">`;
    for (const n of rows) {
      const l = byN.get(n);
      if (!l) { h += '<div class="mq-line"></div>'; continue; }
      if (l.t === 'surah') h += `<div class="mq-line mq-sline"><div class="surah-banner">سورة ${esc(surahName(l.s))}</div></div>`;
      else if (l.t === 'basmala') h += `<div class="mq-line mq-bline"><div class="basmala">${BASMALA}</div></div>`;
      else {
        h += '<div class="mq-line">';
        for (const w of l.w) h += `<span class="mq-w${w[3] ? ' mq-end' : ''}${S.read[w[1] + ':' + w[2]] ? ' read' : ''}" data-s="${w[1]}" data-a="${w[2]}">${esc(w[0])}</span>`;
        h += '</div>';
      }
    }
    return h + '</div>';
  };
  const fitPage = pg => {
    const box = $('.mq-lines:not(.sk)', pg);
    if (!box) return;
    const W = box.clientWidth;
    if (W < 40) return;
    let fs = W / 15;
    for (let i = 0; i < 3; i++) {
      box.style.setProperty('--mq-fs', fs.toFixed(2) + 'px');
      let mx = 1;
      for (const ln of box.children) {
        if (ln.querySelector('.mq-w')) {
          let sum = 0; for (const c of ln.children) sum += c.getBoundingClientRect().width;
          if (sum > mx) mx = sum;
        }
      }
      if (mx <= 1) break;
      const nf = fs * W / mx * 0.985;
      if (Math.abs(nf - fs) < 0.2) { fs = Math.min(fs, nf); break; }
      fs = nf;
    }
    box.style.setProperty('--mq-fs', Math.max(10, fs).toFixed(2) + 'px');
    // short lines (end of a surah) are centred in print, not stretched edge to edge
    for (const ln of box.children) {
      if (!ln.querySelector('.mq-w')) continue;
      ln.classList.remove('mq-center');
      let sum = 0; for (const c of ln.children) sum += c.getBoundingClientRect().width;
      if (sum < W * 0.72) ln.classList.add('mq-center');
    }
  };
  const fitAll = () => { $$('.mp-page', el).forEach(fitPage); paintBand(); };
  const refreshPage = p => {
    const old = $(`.mp-page[data-p="${p}"]`, el);
    if (!old) return;
    const t = document.createElement('div');
    t.innerHTML = pageHTML(p);
    old.replaceWith(t.firstElementChild);
    applyMarks();
    fitAll();
  };
  const ensureMadani = () => {
    if (!useMd()) return;
    madani.setShown(shown);
    for (const p of shown) {
      if ((mdReady.has(p) && madani.hasFont(p)) || mdFail.has(p) || mdPending.has(p)) continue;
      mdPending.add(p);
      Promise.all([madani.loadPage(p), madani.loadFont(p)]).then(() => {
        mdPending.delete(p);
        if (dead) return;
        mdReady.add(p);
        if (useMd() && shown.includes(p)) refreshPage(p);
        madani.prefetch(cur);
      }).catch(() => {
        mdPending.delete(p);
        if (dead) return;
        mdFail.add(p);
        if (!mdWarned) { mdWarned = true; toast('تعذّر تحميل خط المصحف، عُرض بالخط العادي'); }
        if (shown.includes(p)) refreshPage(p);
      });
    }
  };
  const pageHTML = p => {
    const segs = pageContent(p);
    const first = pageFirst(p);
    const qs = quarterStartsOn(p);
    const hz = qs.length ? qs.map(x => hizbLabel(x.q)).join(' · ') : hizbLabel(quarterOf(first.s, first.a));
    let body = '';
    const md = useMd() && !mdFail.has(p);
    if (md) body = mdReady.has(p) ? madaniBody(p) : mdSkeleton(p);
    else for (const g of segs) {
      if (g.from === 1) {
        body += `<div class="surah-banner">سورة ${esc(surahName(g.s))} · ${typeName(g.s)} · آياتها ${N(ayahCount(g.s))}</div>` +
          (g.s !== 1 && g.s !== 9 ? `<div class="basmala">${BASMALA}</div>` : '');
      }
      let t = '';
      for (let a = g.from; a <= g.to; a++) {
        t += `<span class="ayah${S.read[g.s + ':' + a] ? ' read' : ''}" data-s="${g.s}" data-a="${a}">${ayahInner(g.s, a)}</span> `;
      }
      body += `<div class="mushaf-text">${t}</div>`;
    }
    return `<section class="mp-page page-${side(p)}" data-p="${p}">` +
      `<div class="mp-top"><span class="mp-surah">${esc(pageTitle(p))}</span><span class="mp-hizb">${esc(hz)}</span><span class="mp-juz">الجزء ${ORD[juzOfPage(p) - 1]}</span></div>` +
      `<div class="mp-heat-legend" aria-hidden="true"><span>قليل</span><i></i><span>كثير</span></div>` +
      `<div class="mp-body${md ? ' madani' : ''}">${body}</div>` +
      `<div class="mp-foot"><span class="mp-num">${N(p)}</span><span class="mp-side">${side(p) === 'right' ? 'صفحة يمنى' : 'صفحة يسرى'}</span></div></section>`;
  };
  const progressHTML = () => `<div class="mp-progress"><i style="width:${(cur / PAGE_COUNT * 100).toFixed(2)}%"></i></div>`;
  const bookHTML = () => `<div class="mp-book${shown.length > 1 ? ' spread' : ''}${heatOn ? ' heat-on' : ''}">${shown.map(pageHTML).join('')}</div>`;
  shown = pagesFor(cur);
  rubs = new Set(shown.flatMap(p => quarterStartsOn(p).map(x => x.s + ':' + x.a)));

  const hizbNo = p => { const f = pageFirst(p); return Math.ceil(quarterOf(f.s, f.a) / 4); };
  const cardHTML = () => {
    const f = pageFirst(cur), bm = isBookmarked(f.s, f.a);
    return `<div class="rd-card"><div class="rd-card-main"><div class="rd-sname">${esc(pageTitle(cur))}</div>` +
      `<button class="rd-meta" id="rdGoto" aria-label="اذهب إلى صفحة"><span>صفحة ${N(cur)}</span><i>|</i><span>جزء ${N(juzOfPage(cur))}</span><i>|</i><span>حزب ${N(hizbNo(cur))}</span></button></div>` +
      `<button class="rd-bm${bm ? ' on' : ''}" id="rdBm" aria-pressed="${bm}" aria-label="إشارة مرجعية">${icon('bookmark', 22)}</button></div>`;
  };
  const dialBtn = (k, label, ico) => `<button class="rd-dial-it" data-dial="${k}" role="menuitem"><span class="rd-dial-bt">${icon(ico, 24)}</span><span class="rd-dial-lb">${label}</span></button>`;
  el.innerHTML = `<div class="rd${hiddenOn ? ' rd-hidden' : ''}${frameOn ? ' rd-framed' : ''}${tjOn ? ' rd-tj' : ''} rd-ink-${ink}" id="rd">` +
    `<div class="rd-top"><button class="rd-ic" id="rdMenu" aria-label="القائمة">${ic('menu')}</button>${'<div id="rdCardBox" class="rd-cardbox">' + cardHTML() + '</div>'}` +
    `<button class="rd-ic" data-go="search" aria-label="بحث">${icon('search')}</button><button class="rd-ic" id="rdSet" aria-label="إعدادات القارئ">${icon('gear')}</button>${progressHTML()}</div>` +
    `<div class="tj-bar rd-tjbar" id="tjBar"${tjOn ? '' : ' hidden'}><button class="chip" id="tjLegend">دليل الألوان</button><span class="small muted" id="tjState"></span></div>` +
    `<div class="rd-stage">${bookHTML()}<button class="rd-edge rd-edge-r mp-prev" aria-label="الصفحة السابقة"${shown[0] <= 1 ? ' disabled' : ''}>${icon('back')}</button>` +
    `<button class="rd-edge rd-edge-l mp-next" aria-label="الصفحة التالية"${shown[shown.length - 1] >= PAGE_COUNT ? ' disabled' : ''}>${icon('back')}</button></div>` +
    `<div class="player-bar rd-player" id="playerBar"></div>` +
    `<div class="rd-dimmer" id="rdDim"></div>` +
    `<div class="rd-dial" id="rdDial" role="menu">${dialBtn('test', 'اختبار', 'brain')}${dialBtn('recite', 'تلاوة', 'mic')}${dialBtn('listen', 'استمع', 'play')}</div>` +
    `<div class="rd-bottom"><div class="rd-peek" id="rdPeek"><button class="rd-pk" id="pkAyah" aria-label="كشف بقية الآية">${ic('peekAyah', 20)}<span>بقية الآية</span></button><button class="rd-pk" id="pkWord" aria-label="كشف الكلمة التالية">${ic('peekWord', 20)}<span>كلمة</span></button></div>` +
    `<div class="rd-bar"><div class="rd-tools"><button class="rd-pill" id="rdMist">${ic('warn', 18)}<span>أخطاء</span><b class="rd-badge" id="rdMistN" hidden></b></button>` +
    `<button class="rd-tool" id="rdIdx" aria-label="فهرس المصحف">${icon('book', 22)}</button>` +
    `<button class="rd-tool rd-eye${hiddenOn ? ' on' : ''}" id="rdEye" aria-pressed="${hiddenOn}" aria-label="إخفاء الآيات">${ic(hiddenOn ? 'eyeoff' : 'eye', 22)}</button></div></div></div>` +
    `<button class="rd-fab" id="rdFab" aria-label="الميكروفون والأدوات" aria-expanded="false"><span class="rd-fab-mic">${icon('mic', 30)}</span><span class="rd-fab-x">${icon('close', 28)}</span></button></div>`;

  document.body.classList.add('rd-mode');
  const root = $('#rd', el);
  const setPlayIcon = () => { const b = $('[data-dial="listen"] .rd-dial-bt', el); if (b) b.innerHTML = icon(audio.isPlaying() ? 'pause' : 'play', 24); };
  const bar = $('#playerBar', el);
  const tjBar = $('#tjBar', el), tjState = $('#tjState', el);
  const spansOf = (s, a) => $$(`[data-s="${s}"][data-a="${a}"]`, el).filter(x => x.classList.contains('ayah') || x.classList.contains('mq-w'));
  const addCls = (s, a, c) => spansOf(s, a).forEach(x => x.classList.add(c));
  const onShown = (s, a) => shown.includes(pageOf(s, a));

  const select = o => {
    $$('.selected', el).forEach(x => x.classList.remove('selected'));
    sel = o;
    if (o) addCls(o.s, o.a, 'selected');
    paintBand();
  };
  const paintBand = () => {
    $$('.rd-bandbox', el).forEach(x => x.remove());
    if (!sel) return;
    for (const box of $$('.mq-lines:not(.sk)', el)) {
      const byLine = new Map();
      for (const w of $$('.mq-w', box)) if (+w.dataset.s === sel.s && +w.dataset.a === sel.a) {
        const ln = w.parentElement; if (!byLine.has(ln)) byLine.set(ln, []); byLine.get(ln).push(w);
      }
      if (!byLine.size) continue;
      const br = box.getBoundingClientRect();
      for (const [ln, arr] of byLine) {
        const lr = ln.getBoundingClientRect();
        let l = Infinity, r = -Infinity;
        for (const w of arr) { const b = w.getBoundingClientRect(); l = Math.min(l, b.left); r = Math.max(r, b.right); }
        if (!(r > l)) continue;
        const i = document.createElement('i');
        i.className = 'rd-bandbox';
        i.style.cssText = `left:${(l - br.left - 5).toFixed(1)}px;width:${(r - l + 10).toFixed(1)}px;top:${(lr.top - br.top + lr.height * .06).toFixed(1)}px;height:${(lr.height * .88).toFixed(1)}px`;
        box.appendChild(i);
      }
    }
  };
  const mark = o => {
    $$('.playing', el).forEach(x => x.classList.remove('playing'));
    playing = o;
    if (o) addCls(o.s, o.a, 'playing');
  };
  // ---- mistake heat map (word index per ayah + decayed error frequency)
  const heatOf = (s, a, w) => { try { const f = store.wordErrorHeat; const v = typeof f === 'function' ? +f(s, a, w) : 0; return v > 0 ? Math.min(1, v) : 0; } catch (e) { return 0; } };
  const paintHeat = (node, h) => {
    if (h > 0.03) { node.dataset.heat = h.toFixed(2); node.style.setProperty('--h', h.toFixed(2)); }
    else { delete node.dataset.heat; node.style.removeProperty('--h'); }
  };
  const applyHeat = () => {
    for (const pg of $$('.mp-page', el)) {
      const mw = $$('.mq-w', pg);
      if (mw.length) {
        const cnt = new Map();
        const p = +pg.dataset.p;
        const f0 = pageFirst(p);
        if (f0 && p > 1) { // an ayah that began on the previous page continues here
          try {
            const L = madani.cachedLayout(p - 1);
            let n = 0;
            if (L) for (const l of L.lines) for (const w of (l.w || [])) if (w[1] === f0.s && w[2] === f0.a && !w[3]) n++;
            if (n) cnt.set(f0.s + ':' + f0.a, n);
          } catch (e) { /* ignore */ }
        }
        for (const sp of mw) {
          if (sp.classList.contains('mq-end')) { delete sp.dataset.heat; sp.style.removeProperty('--h'); continue; }
          const s = +sp.dataset.s, a = +sp.dataset.a, k = s + ':' + a;
          const w = (cnt.get(k) || 0) + 1; cnt.set(k, w);
          sp.dataset.w = w;
          paintHeat(sp, heatOn ? heatOf(s, a, w) : 0);
        }
      }
      for (const sp of $$('.ayah', pg)) {
        let mx = 0;
        if (heatOn) { const s = +sp.dataset.s, a = +sp.dataset.a, n = ayah(s, a).split(/\s+/).filter(Boolean).length; for (let w = 1; w <= n; w++) mx = Math.max(mx, heatOf(s, a, w)); }
        paintHeat(sp, mx);
      }
    }
  };
  const setHeat = on => {
    heatOn = on;
    const bk = $('.mp-book', el); if (bk) bk.classList.toggle('heat-on', on);
    try { localStorage.setItem(HEAT_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    applyHeat();
  };
  const openHeatSheet = (s, a, w0) => {
    const n = ayah(s, a).split(/\s+/).filter(Boolean).length;
    let w = w0 || 1, best = -1;
    if (!w0) for (let i = 1; i <= n; i++) { const h = heatOf(s, a, i); if (h > best) { best = h; w = i; } }
    const e = (S.wm || {})[s + ':' + a + ':' + w] || {};
    const cnt = e.n || 1;
    let when = '';
    if (e.d) { try { when = new Date(e.d + 'T00:00:00').toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (x) { when = e.d; } }
    const html = `<div class="center mb"><div class="small muted mb">سورة ${esc(surahName(s))} · الآية ${N(a)} · الكلمة ${N(w)}</div>` +
      `<b>أخطأت هنا ${N(cnt)} ${cnt === 1 ? 'مرة' : cnt === 2 ? 'مرتين' : 'مرات'}${when ? ' · آخرها ' + esc(when) : ''}</b></div>` +
      `<div class="grid-2"><button class="btn" data-go="recite/${s}?from=${a}&to=${a}" data-act="close">${icon('mic', 18)} تدرّب على هذه الآية</button>` +
      `<button class="btn ghost" data-act="play">${icon('play', 18)} استمع</button></div>`;
    if (openSheet) openSheet.close();
    const sh = openSheet = sheet(html, { onClose: () => { if (openSheet === sh) openSheet = null; } });
    sh.addEventListener('click', ev => {
      const b = ev.target.closest('[data-act]'); if (!b) return;
      sh.close();
      if (b.dataset.act === 'play') audio.playRange(s, a, a);
    });
  };
  const applyMarks = () => { if (sel) select(sel); if (playing) mark(playing); applyHeat(); applyReveal(); };
  const rerender = () => {
    $('.mp-book', el).outerHTML = bookHTML();
    applyMarks(); fitAll(); ensureMadani();
  };
  const setMd = on => {
    mdOn = on;
    try { localStorage.setItem(MD_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (tjOn) return;
    rerender();
  };

  // ---- tajweed colours
  const repaint = () => {
    $$('.ayah', el).forEach(sp => { sp.innerHTML = ayahInner(+sp.dataset.s, +sp.dataset.a); });
  };
  const applyTj = async () => {
    const my = ++tjSeq;
    const need = [...new Set(shown.flatMap(pageSurahs))].filter(s => !tjCache.has(s));
    if (!need.length) { repaint(); tjState.textContent = ''; const b0 = $('.mp-book', el); if (b0) b0.classList.remove('tj-load'); return; }
    const book = $('.mp-book', el);
    book.classList.add('tj-load');
    tjState.textContent = 'جارٍ تحميل الألوان…';
    try {
      for (const s of need) {
        const html = await loadTajweed(s);
        if (dead) return;
        if (html.length < ayahCount(s)) { if (my !== tjSeq) return; throw new Error('short'); }
        tjCache.set(s, html);
        if (my !== tjSeq) return;
      }
      repaint();
      tjState.textContent = '';
    } catch (e) {
      if (dead || my !== tjSeq) return;
      tjOn = false;
      root.classList.remove('rd-tj');
      tjBar.hidden = true; tjState.textContent = '';
      repaint();
      toast('تعذّر تحميل ألوان التجويد');
    } finally {
      if (my === tjSeq) { const b = $('.mp-book', el); if (b) b.classList.remove('tj-load'); }
    }
  };
  const setTj = on => {
    tjOn = on;
    root.classList.toggle('rd-tj', on);
    tjBar.hidden = !on;
    try { localStorage.setItem(TJ_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!on) { tjSeq++; tjState.textContent = ''; if (mdOn) rerender(); else repaint(); return; }
    if (mdOn) rerender();
    applyTj();
  };
  const openLegend = () => {
    sheet(`<h3 class="gold center">دليل ألوان التجويد</h3><div class="tj-legend">` +
      TAJWEED_LEGEND.map(l => `<div class="tj-legend-item"><span class="tj-chip tj-${l.cls}">نموذج</span>` +
        `<div><b>${esc(l.name)}</b><small>${esc(l.desc)}</small></div></div>`).join('') + `</div>`);
  };

  // ---- turning
  const show = (p, dir) => {
    cur = clampP(p);
    shown = pagesFor(cur);
    rubs = new Set(shown.flatMap(x => quarterStartsOn(x).map(q => q.s + ':' + q.a)));
    const bar0 = $('.mp-progress i', el); if (bar0) bar0.style.width = (cur / PAGE_COUNT * 100).toFixed(2) + '%';
    $('.mp-book', el).outerHTML = bookHTML();
    const pv = $('.mp-prev', el), nx = $('.mp-next', el);
    if (pv) pv.disabled = shown[0] <= 1;
    if (nx) nx.disabled = shown[shown.length - 1] >= PAGE_COUNT;
    revW.clear(); revA.clear();
    updateTop();
    if (dir && !reduced()) {
      $$('.mp-page', el).forEach(pg => pg.classList.add(dir === 'prev' ? 'turn-prev' : 'turn-next'));
      clearTimeout(animTimer);
      animTimer = setTimeout(() => $$('.mp-page', el).forEach(pg => pg.classList.remove('turn-next', 'turn-prev')), 700);
    }
    applyMarks();
    fitAll(); ensureMadani();
    try { history.replaceState(null, '', '#/mushaf/p' + cur); } catch (e) { /* ignore */ }
    const f = pageFirst(cur); setLast(f.s, f.a);
    window.scrollTo(0, 0);
    if (tjOn) applyTj();
  };
  const goNext = () => { const hi = shown[shown.length - 1]; if (hi < PAGE_COUNT) show(hi + 1, 'next'); };
  const goPrev = () => { const lo = shown[0]; if (lo > 1) show(lo - 1, 'prev'); };

  // ---- audio ui
  const rateIdx = () => Math.max(0, RATES.indexOf(audio.getRate()));
  const drawBar = () => {
    const c = audio.current();
    bar.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center;gap:8px">` +
      `<div><div class="small muted">${esc(audio.reciterName())}</div><b>الآية ${N(c ? c.a : 0)}</b></div>` +
      `<div class="row" style="gap:6px;align-items:center">` +
      `<button class="icon-btn" data-pl="prev" aria-label="الآية السابقة">${icon('back')}</button>` +
      `<button class="icon-btn" data-pl="toggle" aria-label="إيقاف مؤقت">${icon(audio.isPlaying() ? 'pause' : 'play')}</button>` +
      `<button class="icon-btn" data-pl="next" aria-label="الآية التالية" style="transform:scaleX(-1)">${icon('back')}</button>` +
      `<button class="icon-btn" data-pl="stop" aria-label="إيقاف">${icon('stop')}</button>` +
      `<button class="chip" data-pl="rate">${N(audio.getRate())}×</button></div></div>`;
  };
  const unsub = audio.onAudio(ev => {
    if (dead) return;
    if (ev.type === 'play' || ev.type === 'ayah') stopWord();
    if (ev.type === 'error') {
      bar.classList.remove('show'); mark(null); setPlayIcon();
      toast('تعذّر تشغيل الصوت، تأكد من الإنترنت');
      return;
    }
    if (ev.type === 'stop') {
      const was = userStopped; userStopped = false;
      bar.classList.remove('show'); mark(null); setPlayIcon();
      const s = ev.s;
      if (!was && s >= 1 && s < SURAH_COUNT && ev.a === ayahCount(s)) {
        const np = pageOf(s + 1, 1);
        if (np >= shown[0] && np <= shown[shown.length - 1] + 1) audio.playRange(s + 1, 1, ayahCount(s + 1));
      }
      return;
    }
    bar.classList.add('show');
    if (ev.type === 'ayah' && ev.s >= 1) {
      if (playing && onShown(playing.s, playing.a) && !onShown(ev.s, ev.a)) {
        const np = pageOf(ev.s, ev.a);
        show(np, np < shown[0] ? 'prev' : 'next');
      }
      mark({ s: ev.s, a: ev.a });
    }
    setPlayIcon();
    drawBar();
  });
  const stopWord = () => { try { if (wAudio) { wAudio.pause(); wAudio = null; } } catch (e) { wAudio = null; } };
  const toggleAll = () => {
    stopWord();
    if (audio.current()) { audio.isPlaying() ? audio.pause() : audio.resume(); return; }
    const st = sel && onShown(sel.s, sel.a) ? sel : pageFirst(shown[0]);
    audio.playRange(st.s, st.a, ayahCount(st.s));
  };

  // ---- top bar + hidden mode
  const updateTop = () => {
    const box = $('#rdCardBox', el); if (box) box.innerHTML = cardHTML();
    updateMistN();
  };
  const unitsOf = () => {
    const out = [];
    for (const pg of $$('.mp-page', el)) {
      const ws = $$('.mq-w:not(.mq-end)', pg);
      if (ws.length) ws.forEach((w, i) => out.push({ el: w, key: pg.dataset.p + ':' + i, s: +w.dataset.s, a: +w.dataset.a }));
      else $$('.ayah', pg).forEach(w => out.push({ el: w, key: 'A' + w.dataset.s + ':' + w.dataset.a, s: +w.dataset.s, a: +w.dataset.a, ayah: true }));
    }
    return out;
  };
  const isRev = u => (u.ayah ? revA.has(u.s + ':' + u.a) : revW.has(u.key));
  function applyReveal() {
    if (!root) return;
    for (const u of unitsOf()) u.el.classList.toggle('rv', isRev(u));
  }
  const peekWord = () => {
    const u = unitsOf().find(x => !isRev(x));
    if (!u) { toast('كل الكلمات ظاهرة'); return; }
    if (u.ayah) revA.add(u.s + ':' + u.a); else revW.add(u.key);
    applyReveal();
  };
  const peekAyah = () => {
    const us = unitsOf(), u = us.find(x => !isRev(x));
    if (!u) { toast('كل الكلمات ظاهرة'); return; }
    for (const x of us) if (x.s === u.s && x.a === u.a) { if (x.ayah) revA.add(x.s + ':' + x.a); else revW.add(x.key); }
    applyReveal();
  };
  const revealOne = node => {
    const u = unitsOf().find(x => x.el === node || x.el.contains(node));
    if (!u) return;
    if (u.ayah) revA.add(u.s + ':' + u.a); else revW.add(u.key);
    applyReveal();
    try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* ignore */ }
  };
  const setHidden = (on, quiet) => {
    hiddenOn = on;
    revW.clear(); revA.clear();
    root.classList.toggle('rd-hidden', on);
    const eye = $('#rdEye', el);
    if (eye) { eye.classList.toggle('on', on); eye.setAttribute('aria-pressed', String(on)); eye.innerHTML = ic(on ? 'eyeoff' : 'eye', 22); }
    lsSet(HID_KEY, on ? '1' : '0');
    applyReveal();
    if (!quiet) toast(on ? 'إخفاء الآيات: مفعّل' : 'إخفاء الآيات: متوقف');
  };
  const setDial = on => {
    dialOpen = on;
    root.classList.toggle('dial-open', on);
    const f = $('#rdFab', el); if (f) f.setAttribute('aria-expanded', String(on));
    if (on) setPlayIcon();
  };
  const setAwake = async on => {
    awakeOn = on; lsSet(AWAKE_KEY, on ? '1' : '0');
    try {
      if (on && navigator.wakeLock && !wake) { const wl = await navigator.wakeLock.request('screen'); if (dead) { try { await wl.release(); } catch (e2) { /* ignore */ } wake = null; return; } wake = wl; if (wake.addEventListener) wake.addEventListener('release', () => { wake = null; }); }
      else if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  };
  const onVis = () => { if (!dead && awakeOn && document.visibilityState === 'visible' && !wake) setAwake(true); };
  const setFrame = on => { frameOn = on; root.classList.toggle('rd-framed', on); lsSet(FRAME_KEY, on ? '1' : '0'); requestAnimationFrame(fitAll); };
  const setInk = k => { ink = k; root.className = root.className.replace(/rd-ink-\w+/, 'rd-ink-' + k); lsSet(INK_KEY, k); };
  const toggleBm = () => {
    const f = pageFirst(cur);
    const on = toggleBookmark(f.s, f.a);
    updateTop();
    toast(on ? 'تمت إضافة إشارة مرجعية' : 'أُزيلت الإشارة المرجعية');
  };

  // ---- sheets (list style)
  const rdSheet = html => {
    if (openSheet) openSheet.close();
    const sh = openSheet = sheet(html, { onClose: () => { if (tafsirAbort) tafsirAbort.abort(); if (openSheet === sh) openSheet = null; } });
    sh.classList.add('rd-sheet');
    return sh;
  };
  const shHead = (title, chip) => `<div class="rd-sh-head"><div class="rd-sh-title">${title}</div>${chip ? `<span class="rd-chip"><bdi dir="ltr">${esc(chip)}</bdi></span>` : ''}<button class="rd-x" data-act="close" aria-label="إغلاق">${icon('close', 20)}</button></div>`;
  const row = (act, ico, label, trail = '', cls = '') => `<button class="rd-row${cls ? ' ' + cls : ''}" data-act="${act}"><span class="rd-row-ic">${ic(ico, 21)}</span><span class="rd-row-lb">${label}</span>${trail ? `<span class="rd-row-tr">${trail}</span>` : ''}</button>`;
  const swRow = (act, ico, label, on) => `<button class="rd-row" data-act="${act}" role="switch" aria-checked="${on}"><span class="rd-row-ic">${ic(ico, 21)}</span><span class="rd-row-lb">${label}</span><span class="rd-sw${on ? ' on' : ''}"><i></i></span></button>`;
  const setSw = (b, on) => { b.setAttribute('aria-checked', String(on)); const w = $('.rd-sw', b); if (w) w.classList.toggle('on', on); };
  const goLink = (to, ico, label) => `<button class="rd-row" data-go="${to}" data-act="close"><span class="rd-row-ic">${ic(ico, 21)}</span><span class="rd-row-lb">${label}</span><span class="rd-row-tr">${icon('back', 16)}</span></button>`;

  const openMenu = () => {
    const sh = rdSheet(shHead('القائمة') +
      `<div class="rd-list">${goLink('home', 'home', 'الرئيسية')}${goLink('mushaf?tab=s', 'list', 'فهرس السور')}${goLink('mushaf?tab=j', 'list', 'الأجزاء')}${goLink('mushaf?tab=p', 'list', 'الصفحات')}${goLink('mushaf?tab=b', 'bookmark', 'العلامات المرجعية')}` +
      row('goto', 'search', 'اذهب إلى صفحة') + row('markpage', 'check', 'تعليم الصفحة كمقروءة') + `</div>` +
      `<div class="rd-sh-sub">العرض</div><div class="rd-list">${swRow('tg-heat', 'chart', 'خريطة أخطائي', heatOn)}${swRow('tg-tj', 'spark', 'ألوان التجويد', tjOn)}${swRow('tg-md', 'book', 'خط مصحف المدينة', mdOn)}</div>` +
      `<div class="rd-sh-sub">لون الحبر</div><div class="rd-inks">${[['auto', 'تلقائي'], ['bright', 'ساطع'], ['warm', 'دافئ']].map(([k, l]) => `<button class="rd-ink${ink === k ? ' on' : ''}" data-ink="${k}">${l}</button>`).join('')}</div>`);
    sh.addEventListener('click', e => {
      const ik = e.target.closest('[data-ink]');
      if (ik) { setInk(ik.dataset.ink); $$('[data-ink]', sh).forEach(x => x.classList.toggle('on', x === ik)); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'close') { sh.close(); return; }
      if (a === 'goto') { sh.close(); openGoto(); return; }
      if (a === 'markpage') { sh.close(); markPage(); return; }
      if (a === 'tg-heat') { setHeat(!heatOn); setSw(b, heatOn); return; }
      if (a === 'tg-tj') { setTj(!tjOn); setSw(b, tjOn); return; }
      if (a === 'tg-md') { setMd(!mdOn); setSw(b, mdOn); }
    });
  };
  const openSettings = () => {
    const canWake = 'wakeLock' in navigator;
    const sh = rdSheet(shHead('إعدادات القارئ') +
      `<div class="rd-list"><div class="rd-row rd-static"><span class="rd-row-ic">${ic('sliders', 21)}</span><span class="rd-row-lb">حجم الخط (النص العادي)</span>` +
      `<span class="rd-step"><button data-act="fs-" aria-label="تصغير">${icon('minus', 18)}</button><b id="rdFs">${N(S.settings.fontSize)}</b><button data-act="fs+" aria-label="تكبير">${icon('plus', 18)}</button></span></div>` +
      swRow('tg-frame', 'book', 'إظهار إطار الصفحة', frameOn) + (canWake ? swRow('tg-awake', 'eye', 'إبقاء الشاشة مضاءة', awakeOn) : '') + `</div>`);
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const a = b.dataset.act;
      if (a === 'close') { sh.close(); return; }
      if (a === 'fs-' || a === 'fs+') {
        const v = Math.min(52, Math.max(18, (S.settings.fontSize || 30) + (a === 'fs+' ? 2 : -2)));
        store.updateSettings({ fontSize: v });
        $('#rdFs', sh).textContent = N(v);
        return;
      }
      if (a === 'tg-frame') { setFrame(!frameOn); setSw(b, frameOn); return; }
      if (a === 'tg-awake') { const on = !awakeOn; setSw(b, on); setAwake(on).then(() => setSw(b, awakeOn && !!wake)); }
    });
  };

  const openIndexSheet = () => {
    const f = pageFirst(cur);
    const surahs = Array.from({ length: SURAH_COUNT }, (_, i) => i + 1).map(n => `<button class="rd-row${n === f.s ? ' cur' : ''}" data-go="mushaf/${n}" data-act="close"><span class="rd-num">${N(n)}</span><span class="rd-row-lb">${esc(surahName(n))}</span><span class="rd-row-tr">ص ${N(pageOf(n, 1))}</span></button>`).join('');
    const juz = JUZ.map(([s, a], i) => `<button class="rd-row${juzOfPage(cur) === i + 1 ? ' cur' : ''}" data-go="mushaf/p${pageOf(s, a)}" data-act="close"><span class="rd-num">${N(i + 1)}</span><span class="rd-row-lb">الجزء ${esc(ORD[i])}</span><span class="rd-row-tr">ص ${N(pageOf(s, a))}</span></button>`).join('');
    const bms = (S.bookmarks || []).map(b => `<button class="rd-row" data-go="mushaf/p${pageOf(b.s, b.a)}" data-act="close"><span class="rd-row-ic">${icon('bookmark', 20)}</span><span class="rd-row-lb">${esc(surahName(b.s))} · الآية ${N(b.a)}</span><span class="rd-row-tr">ص ${N(pageOf(b.s, b.a))}</span></button>`).join('') || '<p class="muted center small">لا توجد إشارات مرجعية بعد.</p>';
    const sh = rdSheet(shHead('فهرس المصحف') +
      `<div class="rd-gorow"><input class="input" id="rdPg" type="number" inputmode="numeric" min="1" max="${PAGE_COUNT}" placeholder="رقم الصفحة ١ – ${N(PAGE_COUNT)}"><button class="btn" data-act="gopg">اذهب</button></div>` +
      `<div class="seg rd-seg"><button class="active" data-itab="s">السور</button><button data-itab="j">الأجزاء</button><button data-itab="b">العلامات</button></div>` +
      `<div class="rd-list rd-scroll" data-ipanel="s">${surahs}</div><div class="rd-list rd-scroll" data-ipanel="j" hidden>${juz}</div><div class="rd-list rd-scroll" data-ipanel="b" hidden>${bms}</div>`);
    const goPg = () => { const n = Number($('#rdPg', sh).value); if (Number.isInteger(n) && n >= 1 && n <= PAGE_COUNT) { sh.close(); show(n, n >= cur ? 'next' : 'prev'); } else toast('أدخل رقمًا من ١ إلى ٦٠٤'); };
    $('#rdPg', sh).addEventListener('keydown', e => { if (e.key === 'Enter') goPg(); });
    sh.addEventListener('click', e => {
      const t = e.target.closest('[data-itab]');
      if (t) { $$('[data-itab]', sh).forEach(x => x.classList.toggle('active', x === t)); $$('[data-ipanel]', sh).forEach(p => { p.hidden = p.dataset.ipanel !== t.dataset.itab; }); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'close') sh.close();
      else if (b.dataset.act === 'gopg') goPg();
    });
    setTimeout(() => { const cr = $('.rd-row.cur', sh); if (cr) cr.scrollIntoView({ block: 'center' }); }, 330);
  };

  // ---- mistakes
  const KIND = { skip: 'نسيان', wrong: 'خطأ', hint: 'تلميح', vowel: 'تشكيل', repeat: 'تكرار' };
  const mistakeList = () => {
    const out = [];
    for (const k of Object.keys(S.wm || {})) {
      const e = S.wm[k]; if (!e || e.ok >= 3) continue;
      const [s, a, w] = k.split(':').map(Number);
      if (!(s >= 1 && s <= SURAH_COUNT && a >= 1 && w >= 1)) continue;
      out.push({ s, a, w, n: e.n || 1, d: e.d || '', k: e.k || 'wrong' });
    }
    return out.sort((x, y) => y.n - x.n || y.d.localeCompare(x.d));
  };
  const pageMistakes = () => mistakeList().filter(m => shown.includes(pageOf(m.s, m.a)));
  function updateMistN() {
    const b = $('#rdMistN', el); if (!b) return;
    const n = pageMistakes().length;
    b.hidden = !n; b.textContent = n ? N(Math.min(n, 99)) : '';
  }
  const fmtD = d => { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('ar', { day: 'numeric', month: 'short' }); } catch (e) { return d; } };
  const mistakeRow = m => {
    let word = '';
    try { word = ayah(m.s, m.a).split(/\s+/).filter(Boolean)[m.w - 1] || ''; } catch (e) { /* ignore */ }
    return `<div class="rd-mrow"><div class="rd-mw">${esc(word)}</div><div class="rd-mi"><b>${esc(surahName(m.s))} ${N(m.s)}:${N(m.a)}</b>` +
      `<span class="muted small">الكلمة ${N(m.w)} · ${KIND[m.k] || 'خطأ'} · ${N(m.n)} ${m.n > 2 ? 'مرات' : m.n === 2 ? 'مرتان' : 'مرة'}${m.d ? ' · ' + esc(fmtD(m.d)) : ''}</span></div>` +
      `<button class="rd-mb" data-mp="${m.s}:${m.a}:${m.w}" aria-label="استمع للكلمة">${icon('play', 18)}</button><button class="rd-mb" data-mj="${m.s}:${m.a}" aria-label="اذهب إلى الآية">${icon('search', 18)}</button></div>`;
  };
  const openMistakes = () => {
    const all = mistakeList(), pg = all.filter(m => shown.includes(pageOf(m.s, m.a)));
    const ps = pageSurahs(cur);
    const hist = (S.rec || []).filter(r => ps.includes(r.s) && shown.some(p => pageOf(r.s, r.from) <= p && p <= pageOf(r.s, r.to))).slice(0, 4);
    const histHTML = hist.length ? `<div class="rd-sh-sub">آخر جلسات التسميع هنا</div><div class="rd-list">${hist.map(r => `<div class="rd-row rd-static"><span class="rd-row-ic">${ic('list', 20)}</span><span class="rd-row-lb">${esc(surahName(r.s))} · ${N(r.from)}–${N(r.to)}</span><span class="rd-row-tr">${N(r.acc)}٪ · ${esc(fmtD(r.d))}</span></div>`).join('')}</div>` : '';
    const list = (arr, empty) => arr.length ? arr.slice(0, 60).map(mistakeRow).join('') + (arr.length > 60 ? `<p class="muted small center">يعرض أول ٦٠ من ${N(arr.length)}</p>` : '') : `<p class="muted center rd-empty">${empty}</p>`;
    const sh = rdSheet(shHead('الأخطاء') +
      `<div class="seg rd-seg"><button class="active" data-mt="p">هذه الصفحة${pg.length ? ' · ' + N(pg.length) : ''}</button><button data-mt="a">كل الأخطاء${all.length ? ' · ' + N(all.length) : ''}</button></div>` +
      `<div class="rd-scroll" data-mpanel="p">${list(pg, 'لا أخطاء مسجّلة في هذه الصفحة. سمّع منها وستظهر هنا.')}${histHTML}</div><div class="rd-scroll" data-mpanel="a" hidden>${list(all, 'لا توجد أخطاء مسجّلة بعد.')}</div>`);
    sh.addEventListener('click', e => {
      const t = e.target.closest('[data-mt]');
      if (t) { $$('[data-mt]', sh).forEach(x => x.classList.toggle('active', x === t)); $$('[data-mpanel]', sh).forEach(p => { p.hidden = p.dataset.mpanel !== t.dataset.mt; }); return; }
      const pl = e.target.closest('[data-mp]');
      if (pl) { const [s, a, w] = pl.dataset.mp.split(':').map(Number); playWordAudio(s, a, w); return; }
      const jm = e.target.closest('[data-mj]');
      if (jm) { const [s, a] = jm.dataset.mj.split(':').map(Number); sh.close(); jumpTo(s, a); return; }
      if (e.target.closest('[data-act="close"]')) sh.close();
    });
  };
  const playWordAudio = (s, a, w) => {
    try { if (wAudio) { wAudio.pause(); wAudio = null; } } catch (e) { /* ignore */ }
    try {
      if (audio.current()) { userStopped = true; audio.stop(); }
      const au = wAudio = new Audio(wordAudioUrl(s, a, w));
      au.onerror = () => { if (wAudio === au) { wAudio = null; if (!dead) audio.playRange(s, a, a); } };
      const pr = au.play(); if (pr && pr.catch) pr.catch(() => { if (wAudio === au && !dead) { wAudio = null; audio.playRange(s, a, a); } });
    } catch (e) { audio.playRange(s, a, a); }
  };
  const jumpTo = (s, a) => {
    const p = pageOf(s, a);
    if (!shown.includes(p)) show(p, p >= cur ? 'next' : 'prev');
    select({ s, a });
    requestAnimationFrame(() => { const b = $('.rd-bandbox', el); if (b) b.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); });
  };

  // ---- ayah sheet
  const copyText = async t => {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { /* fallback */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
      ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
  };
  const showRemote = async (box, kind, s, a) => {
    const ed = kind === 'tafsir' ? 'ar.muyassar' : 'en.sahih';
    const title = kind === 'tafsir' ? 'التفسير الميسر' : 'Sahih International';
    const key = ed + ':' + s + ':' + a;
    box.hidden = false;
    if (trCache.has(key)) { box.dir = kind === 'tafsir' ? 'rtl' : 'ltr'; box.innerHTML = `<div class="small gold mb">${title}</div><div>${esc(trCache.get(key))}</div>`; return; }
    box.dir = 'rtl';
    box.innerHTML = `<span class="muted">${kind === 'tafsir' ? 'جارٍ تحميل التفسير…' : 'جارٍ تحميل الترجمة…'}</span>`;
    if (tafsirAbort) tafsirAbort.abort();
    tafsirAbort = new AbortController();
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/ayah/${s}:${a}/${ed}`, { signal: tafsirAbort.signal });
      if (!r.ok) throw new Error('http');
      const j = await r.json();
      const t = j && j.data && j.data.text;
      if (!t) throw new Error('empty');
      trCache.set(key, t);
      box.dir = kind === 'tafsir' ? 'rtl' : 'ltr';
      box.innerHTML = `<div class="small gold mb">${title}</div><div>${esc(t)}</div>`;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      box.dir = 'rtl';
      box.innerHTML = '<span class="muted">تعذّر التحميل، تأكد من الإنترنت وحاول مرة أخرى.</span>';
    }
  };
  const similarOf = (s, a) => {
    try {
      const ws = norm(ayah(s, a)).split(/\s+/).filter(Boolean).slice(0, 10);
      return findSimilar(ws, { s, a });
    } catch (e) { return []; }
  };
  const openAyahSheet = (s, a) => {
    const name = surahName(s);
    const bm = isBookmarked(s, a);
    const html = shHead(`<bdi>الآية ${N(a)}</bdi> <bdi>·</bdi> <bdi>${esc(name)}</bdi>`, `${s}:${a}`) +
      `<div class="rd-prev quran${hiddenOn ? ' rd-prev-hid' : ''}"${hiddenOn ? ' role="button" tabindex="0" data-act="unveil"' : ''}>${esc(ayah(s, a))}</div>${hiddenOn ? '<div class="rd-prev-hint small muted center">اضغط للكشف</div>' : ''}` +
      `<div class="rd-list">${row('play', 'play', 'استمع') + row('tr', 'globe', 'ترجمة') + row('tafsir', 'book', 'تفسير') +
      row('bm', 'bookmark', bm ? 'أزل الإشارة المرجعية' : 'أضف إشارة مرجعية', '', bm ? 'on' : '') +
      row('sim', 'similar', 'المتشابهات', '<span id="rdSimN" class="muted small">…</span>') + row('copy', 'copy', 'نسخ') + row('share', 'share', 'شارك')}</div>` +
      `<div class="card tight rd-box" id="rdBox" hidden></div>` +
      `<div class="rd-sh-sub">المزيد</div><div class="rd-more">` +
      `<button data-act="recite" data-go="recite/${s}?from=${a}&to=${a}">${icon('mic', 18)} سمّعها</button>` +
      `<button data-act="review">${icon('brain', 18)} أضف للمراجعة</button>` +
      `<button data-act="ai" data-go="ai?s=${s}&a=${a}">${icon('spark', 18)} اسأل الذكاء</button>` +
      `<button data-act="read">${icon('check', 18)} تمّت قراءتها</button></div>`;
    const sh = rdSheet(html);
    const box = $('#rdBox', sh);
    let sims = null;
    setTimeout(() => {
      if (dead || openSheet !== sh) return;
      sims = similarOf(s, a);
      const n = $('#rdSimN', sh);
      if (n) n.textContent = sims.length ? N(sims.length) + (sims.length > 2 ? ' آيات' : sims.length === 2 ? ' آيتان' : ' آية') : 'لا توجد آيات متشابهة';
    }, 30);
    sh.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'close' || act === 'recite' || act === 'ai') { sh.close(); return; }
      if (act === 'unveil') { const pv = b.classList.contains('rd-prev') ? b : $('.rd-prev', sh); if (pv) pv.classList.remove('rd-prev-hid'); const h = $('.rd-prev-hint', sh); if (h) h.remove(); return; }
      if (act === 'play') { sh.close(); stopWord(); audio.playRange(s, a, ayahCount(s)); return; }
      if (act === 'read') {
        const r = markRead(s, a);
        addCls(s, a, 'read');
        { const f = pageFirst(cur); setLast(f.s, f.a); }
        toast(r.counted ? '+٢ نقطة' : 'سُجّلت قراءتها اليوم مسبقًا');
        sh.close(); return;
      }
      if (act === 'bm') { const on = toggleBookmark(s, a); toast(on ? 'تمت إضافة الإشارة المرجعية' : 'أُزيلت الإشارة المرجعية'); updateTop(); sh.close(); return; }
      if (act === 'review') { toast(addReview(s, a, a) ? 'أُضيفت للمراجعة' : 'الآية موجودة في المراجعة مسبقًا'); sh.close(); return; }
      if (act === 'tafsir') { showRemote(box, 'tafsir', s, a); return; }
      if (act === 'tr') { showRemote(box, 'tr', s, a); return; }
      if (act === 'sim') {
        if (!sims) sims = similarOf(s, a);
        if (!sims.length) { toast('لا توجد آيات متشابهة'); return; }
        box.hidden = false; box.dir = 'rtl';
        box.innerHTML = '<div class="small gold mb">آيات متشابهة</div>' + sims.map(x => `<button class="rd-sim" data-go="mushaf/${x.s}?a=${x.a}" data-act="close"><b>${esc(surahName(x.s))} · ${N(x.a)}</b><span class="quran">${esc(ayah(x.s, x.a))}</span></button>`).join('');
        return;
      }
      const text = `${ayah(s, a)} ﴿${N(a)}﴾ [سورة ${name}]`;
      if (act === 'copy') { const ok = await copyText(text); toast(ok ? 'تم النسخ' : 'تعذّر النسخ'); sh.close(); return; }
      if (act === 'share') {
        try { if (navigator.share) { await navigator.share({ text }); sh.close(); return; } } catch (er) { if (er && er.name === 'AbortError') return; }
        const ok = await copyText(text); toast(ok ? 'تم النسخ للمشاركة' : 'تعذّرت المشاركة'); sh.close();
      }
    });
  };

  // ---- go to page
  const openGoto = () => {
    const html = `<h3 class="gold center mb">اذهب إلى صفحة</h3>` +
      `<div class="row mb" style="gap:8px"><input class="input" id="gpIn" type="number" inputmode="numeric" min="1" max="${PAGE_COUNT}" placeholder="١ – ${N(PAGE_COUNT)}" style="flex:1">` +
      `<button class="btn" data-gp="go">اذهب</button></div>` +
      `<div class="muted small mb">الأجزاء</div><div class="row" style="flex-wrap:wrap;gap:6px">` +
      JUZ.map(([s, a], i) => `<button class="chip" data-gp="${pageOf(s, a)}">${N(i + 1)}</button>`).join('') + `</div>`;
    if (openSheet) openSheet.close();
    const sh = openSheet = sheet(html, { onClose: () => { if (openSheet === sh) openSheet = null; } });
    const jump = p => { sh.close(); show(p, p >= cur ? 'next' : 'prev'); };
    const input = $('#gpIn', sh);
    const goInput = () => {
      const n = Number(input.value);
      if (Number.isInteger(n) && n >= 1 && n <= PAGE_COUNT) jump(n); else toast('أدخل رقمًا من ١ إلى ٦٠٤');
    };
    sh.addEventListener('click', e => {
      const b = e.target.closest('[data-gp]'); if (!b) return;
      if (b.dataset.gp === 'go') goInput(); else jump(+b.dataset.gp);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') goInput(); });
  };

  // ---- mark page read
  const markPage = () => {
    let n = 0, counted = 0;
    for (const p of shown) for (const g of pageContent(p)) for (let a = g.from; a <= g.to; a++) {
      const r = markRead(g.s, a); n++; if (r.counted) counted++;
      addCls(g.s, a, 'read');
    }
    { const f = pageFirst(cur); setLast(f.s, f.a); }
    toast(counted ? `عُلّمت ${N(n)} آية كمقروءة` : 'سُجّلت قراءتها اليوم مسبقًا');
  };

  // ---- events
  const onClick = e => {
    const pl = e.target.closest('[data-pl]');
    if (pl) {
      const k = pl.dataset.pl;
      if (k === 'toggle') audio.isPlaying() ? audio.pause() : audio.resume();
      else if (k === 'prev') audio.prev();
      else if (k === 'next') audio.next();
      else if (k === 'stop') { userStopped = true; audio.stop(); }
      else if (k === 'rate') { audio.setRate(RATES[(rateIdx() + 1) % RATES.length]); drawBar(); }
      return;
    }
    if (e.target.closest('#rdDim')) { setDial(false); return; }
    if (e.target.closest('#rdFab')) { setDial(!dialOpen); return; }
    const dl = e.target.closest('[data-dial]');
    if (dl) {
      const k = dl.dataset.dial;
      setDial(false);
      if (k === 'listen') toggleAll();
      else if (k === 'recite') window.noorGo(`recite?page=${cur}&hidden=${hiddenOn ? 1 : 0}`);
      else if (k === 'test') window.noorGo('train?page=' + cur);
      return;
    }
    if (dialOpen) { setDial(false); return; }
    if (e.target.closest('#rdMenu')) { openMenu(); return; }
    if (e.target.closest('#rdSet')) { openSettings(); return; }
    if (e.target.closest('#rdBm')) { toggleBm(); return; }
    if (e.target.closest('#rdMist')) { openMistakes(); return; }
    if (e.target.closest('#rdIdx')) { openIndexSheet(); return; }
    if (e.target.closest('#rdEye')) { setHidden(!hiddenOn); return; }
    if (e.target.closest('#pkWord')) { peekWord(); return; }
    if (e.target.closest('#pkAyah')) { peekAyah(); return; }
    if (e.target.closest('#tjLegend')) { openLegend(); return; }
    if (e.target.closest('.mp-next')) { goNext(); return; }
    if (e.target.closest('.mp-prev')) { goPrev(); return; }
    if (e.target.closest('#rdGoto')) { openGoto(); return; }
    if (lpFired) { lpFired = false; return; }
    const sp = e.target.closest('.ayah, .mq-w');
    if (sp && el.contains(sp) && heatOn && sp.dataset.heat) { openHeatSheet(+sp.dataset.s, +sp.dataset.a, +sp.dataset.w || 0); return; }
    if (sp && el.contains(sp)) { const s = +sp.dataset.s, a = +sp.dataset.a; select({ s, a }); openAyahSheet(s, a); return; }
    if (sel && e.target.closest('.mp-page')) select(null);
  };
  // long press on a word reveals just that word (hidden mode)
  const lpCancel = () => { clearTimeout(lpTimer); lpTimer = 0; };
  const onPd = e => {
    lpFired = false;
    lpCancel();
    if (!hiddenOn || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const sp = e.target.closest && e.target.closest('.ayah, .mq-w');
    if (!sp || sp.classList.contains('mq-end')) return;
    lpX = e.clientX; lpY = e.clientY;
    lpTimer = setTimeout(() => { lpTimer = 0; lpFired = true; revealOne(sp); }, 450);
  };
  const onPm = e => { if (lpTimer && Math.hypot(e.clientX - lpX, e.clientY - lpY) > 10) lpCancel(); };
  const onCtx = e => { if (hiddenOn && e.target.closest && e.target.closest('.ayah, .mq-w')) e.preventDefault(); };
  const onKey = e => {
    if (e.key === 'Escape' && dialOpen) { setDial(false); return; }
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || openSheet) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') goNext();
    else if (e.key === 'ArrowRight') goPrev();
  };
  let tx = 0, ty = 0, tracking = false;
  const onTs = e => {
    const t = e.touches && e.touches[0];
    tracking = !!(t && e.touches.length === 1 && !dialOpen && e.target.closest && e.target.closest('.mp-book'));
    if (tracking) { tx = t.clientX; ty = t.clientY; }
  };
  const onTe = e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx > 0) goNext(); else goPrev(); }
  };
  const mq = window.matchMedia ? window.matchMedia('(min-width:900px)') : null;
  const onMq = () => show(cur, null);
  let rzT = 0;
  const onRz = () => { cancelAnimationFrame(rzT); rzT = requestAnimationFrame(fitAll); };
  window.addEventListener('resize', onRz);
  el.addEventListener('click', onClick);
  el.addEventListener('pointerdown', onPd);
  el.addEventListener('pointermove', onPm);
  el.addEventListener('pointerup', lpCancel);
  el.addEventListener('pointercancel', lpCancel);
  el.addEventListener('contextmenu', onCtx);
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('keydown', onKey);
  el.addEventListener('touchstart', onTs, { passive: true });
  el.addEventListener('touchend', onTe, { passive: true });
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }

  fitAll(); ensureMadani(); updateMistN();
  if (awakeOn) setAwake(true);
  if (tjOn) applyTj();
  if (focusS) {
    select({ s: focusS, a: focusA });
    hiTimer = setTimeout(() => { if (!openSheet && sel && sel.s === focusS && sel.a === focusA) select(null); }, 3000);
    { const f = pageFirst(cur); setLast(f.s, f.a); }
  } else {
    const f = pageFirst(cur); setLast(f.s, f.a);
  }

  return () => {
    dead = true;
    userStopped = true;
    tjSeq++;
    unsub();
    audio.stop();
    clearTimeout(hiTimer); clearTimeout(animTimer); cancelAnimationFrame(rzT);
    window.removeEventListener('resize', onRz);
    if (tafsirAbort) tafsirAbort.abort();
    if (openSheet) openSheet.close();
    document.body.classList.remove('rd-mode');
    lpCancel();
    try { if (wAudio) wAudio.pause(); } catch (e) { /* ignore */ }
    try { if (wake) wake.release(); } catch (e) { /* ignore */ }
    document.removeEventListener('visibilitychange', onVis);
    el.removeEventListener('pointerdown', onPd);
    el.removeEventListener('pointermove', onPm);
    el.removeEventListener('pointerup', lpCancel);
    el.removeEventListener('pointercancel', lpCancel);
    el.removeEventListener('contextmenu', onCtx);
    el.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
    el.removeEventListener('touchstart', onTs);
    el.removeEventListener('touchend', onTe);
    if (mq) { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); }
  };
}

export default {
  async render(el, { id, q }) {
    const pm = /^p(\d+)$/.exec(id || '');
    const s = parseInt(id, 10);
    const isSurah = !pm && s >= 1 && s <= SURAH_COUNT;
    if (!pm && !isSurah) {
      try { await loadQuran(); } catch (e) {
        el.innerHTML = header('المصحف') + `<div class="card empty"><p>تعذّر تحميل نص المصحف.</p><button class="btn" data-go="mushaf">إعادة المحاولة</button></div>`;
        return;
      }
      return renderIndex(el, q && q.get('tab'));
    }
    const hash0 = location.hash;
    el.innerHTML = header('المصحف', { back: 'mushaf' }) + `<div class="card empty"><p class="muted">جارٍ تحميل المصحف…</p></div>`;
    let loadErr = false;
    try { await loadQuran(); } catch (e) { loadErr = true; }
    if (location.hash !== hash0) return;
    if (loadErr) {
      el.innerHTML = header('المصحف', { back: 'mushaf' }) + `<div class="card empty"><p>تعذّر تحميل نص المصحف.</p><button class="btn" data-go="mushaf/${esc(id)}">إعادة المحاولة</button></div>`;
      return;
    }
    if (pm) return renderPages(el, clampP(parseInt(pm[1], 10)), 0, 0);
    const raw = parseInt(q && q.get('a'), 10);
    const hasA = raw >= 1;
    const a = Math.min(ayahCount(s), hasA ? raw : 1);
    return renderPages(el, pageOf(s, a), hasA ? s : 0, hasA ? a : 0);
  }
};
