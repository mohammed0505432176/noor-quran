// Mushaf: index (surahs / juz / bookmarks / pages) and the page-based reader with audio.
import { esc, $, $$, toast, sheet, icon, ayahMark, header, N } from '../ui.js';
import { S, markRead, setLast, isBookmarked, toggleBookmark, addReview } from '../core/store.js';
import { loadQuran, surahName, ayahCount, typeName, ayah, JUZ, SURAH_COUNT } from '../core/quran.js';
import { PAGE_COUNT, pageOf, pageContent, pageFirst, side, quarterOf, quarterStartsOn, hizbLabel, juzOfPage } from '../core/pages.js';
import * as audio from '../core/audio.js';
import { loadTajweed, TAJWEED_LEGEND } from '../core/tajweed.js';
import * as madani from '../core/madani.js';
import * as store from '../core/store.js';

const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
const ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون', 'الحادي والعشرون', 'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون', 'الخامس والعشرون', 'السادس والعشرون', 'السابع والعشرون', 'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون'];
const RATES = [0.75, 1, 1.25, 1.5];
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TJ_KEY = 'noor.tajweed';
const MD_KEY = 'noor.madani';
const HEAT_KEY = 'noor.heat';
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

function renderIndex(el) {
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
  const fitAll = () => $$('.mp-page', el).forEach(fitPage);
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
  const navHTML = () => {
    const lo = shown[0], hi = shown[shown.length - 1];
    return `<div class="mp-nav"><button class="icon-btn mp-prev" aria-label="الصفحة السابقة"${lo <= 1 ? ' disabled' : ''}>${icon('back')}</button>` +
      `<button class="chip mp-goto">صفحة ${N(cur)} من ${N(PAGE_COUNT)}</button>` +
      `<button class="icon-btn mp-next" aria-label="الصفحة التالية" style="transform:scaleX(-1)"${hi >= PAGE_COUNT ? ' disabled' : ''}>${icon('back')}</button></div>`;
  };

  shown = pagesFor(cur);
  rubs = new Set(shown.flatMap(p => quarterStartsOn(p).map(x => x.s + ':' + x.a)));

  el.innerHTML = header(pageTitle(cur), { back: 'mushaf', actions: `<button class="chip${mdOn ? ' active' : ''}" id="mdToggle" aria-pressed="${mdOn}" title="خط مصحف المدينة">المدينة</button><button class="chip${heatOn ? ' active' : ''}" id="heatToggle" aria-pressed="${heatOn}">خريطة أخطائي</button><button class="chip${tjOn ? ' active' : ''}" id="tjToggle" aria-pressed="${tjOn}">تجويد</button><button class="icon-btn mp-goto-ic" id="gotoIc" aria-label="اذهب إلى صفحة">${icon('search')}</button><button class="icon-btn" id="playAll" aria-label="استماع للصفحة">${icon('play')}</button>` }) +
    `<div class="tj-bar mb" id="tjBar"${tjOn ? '' : ' hidden'}><button class="chip" id="tjLegend">دليل الألوان</button><span class="small muted" id="tjState"></span></div>` +
    progressHTML() + bookHTML() + navHTML() +
    `<div class="center mt"><button class="btn ghost" id="markPage">${icon('check', 18)} تعليم الصفحة كمقروءة</button></div>` +
    `<div class="player-bar" id="playerBar"></div>`;

  $('.page-head', el).classList.add('sticky-head');
  const bar = $('#playerBar', el);
  const playBtn = $('#playAll', el);
  const tjBtn = $('#tjToggle', el), tjBar = $('#tjBar', el), tjState = $('#tjState', el);
  const spansOf = (s, a) => $$(`[data-s="${s}"][data-a="${a}"]`, el).filter(x => x.classList.contains('ayah') || x.classList.contains('mq-w'));
  const addCls = (s, a, c) => spansOf(s, a).forEach(x => x.classList.add(c));
  const mdBtn = $('#mdToggle', el);
  const onShown = (s, a) => shown.includes(pageOf(s, a));

  const select = o => {
    $$('.selected', el).forEach(x => x.classList.remove('selected'));
    sel = o;
    if (o) addCls(o.s, o.a, 'selected');
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
    const b = $('#heatToggle', el);
    if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }
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
  const applyMarks = () => { if (sel) select(sel); if (playing) mark(playing); applyHeat(); };
  const rerender = () => {
    $('.mp-book', el).outerHTML = bookHTML();
    applyMarks(); fitAll(); ensureMadani();
  };
  const setMd = on => {
    mdOn = on;
    mdBtn.classList.toggle('active', on);
    mdBtn.setAttribute('aria-pressed', String(on));
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
      tjBtn.classList.remove('active'); tjBtn.setAttribute('aria-pressed', 'false');
      tjBar.hidden = true; tjState.textContent = '';
      repaint();
      toast('تعذّر تحميل ألوان التجويد');
    } finally {
      if (my === tjSeq) { const b = $('.mp-book', el); if (b) b.classList.remove('tj-load'); }
    }
  };
  const setTj = on => {
    tjOn = on;
    tjBtn.classList.toggle('active', on);
    tjBtn.setAttribute('aria-pressed', String(on));
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
    const pv = $('.mp-prev', el), nx = $('.mp-next', el), go = $('.mp-goto', el);
    if (pv) pv.disabled = shown[0] <= 1;
    if (nx) nx.disabled = shown[shown.length - 1] >= PAGE_COUNT;
    if (go) go.textContent = `صفحة ${N(cur)} من ${N(PAGE_COUNT)}`;
    $('.page-title', el).textContent = pageTitle(cur);
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
    if (ev.type === 'error') {
      bar.classList.remove('show'); mark(null); playBtn.innerHTML = icon('play');
      toast('تعذّر تشغيل الصوت، تأكد من الإنترنت');
      return;
    }
    if (ev.type === 'stop') {
      const was = userStopped; userStopped = false;
      bar.classList.remove('show'); mark(null); playBtn.innerHTML = icon('play');
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
    playBtn.innerHTML = icon(audio.isPlaying() ? 'pause' : 'play');
    drawBar();
  });
  const toggleAll = () => {
    if (audio.current()) { audio.isPlaying() ? audio.pause() : audio.resume(); return; }
    const st = sel && onShown(sel.s, sel.a) ? sel : pageFirst(shown[0]);
    audio.playRange(st.s, st.a, ayahCount(st.s));
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
  const showTafsir = async (box, s, a) => {
    box.style.display = 'block';
    box.innerHTML = '<span class="muted">جارٍ تحميل التفسير…</span>';
    if (tafsirAbort) tafsirAbort.abort();
    tafsirAbort = new AbortController();
    try {
      const r = await fetch(`https://api.alquran.cloud/v1/ayah/${s}:${a}/ar.muyassar`, { signal: tafsirAbort.signal });
      if (!r.ok) throw new Error('http');
      const j = await r.json();
      const t = j && j.data && j.data.text;
      if (!t) throw new Error('empty');
      box.innerHTML = `<div class="small gold mb">التفسير الميسر</div><div>${esc(t)}</div>`;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      box.innerHTML = '<span class="muted">تعذّر تحميل التفسير، تأكد من الإنترنت وحاول مرة أخرى.</span>';
    }
  };
  const openAyahSheet = (s, a) => {
    const name = surahName(s);
    const bm = isBookmarked(s, a);
    const html = `<div class="center mb"><div class="small muted mb">سورة ${esc(name)} · الآية ${N(a)}</div>` +
      `<div class="quran" style="max-height:20vh;overflow:auto">${esc(ayah(s, a))}</div></div>` +
      `<div class="grid-2">` +
      `<button class="btn" data-act="play">${icon('play', 18)} استماع</button>` +
      `<button class="btn ghost" data-act="read">${icon('check', 18)} تم قراءتها</button>` +
      `<button class="btn ghost" data-act="bm">${icon('bookmark', 18)} ${bm ? 'إزالة العلامة' : 'علامة'}</button>` +
      `<button class="btn ghost" data-act="review">${icon('brain', 18)} أضف للمراجعة</button>` +
      `<button class="btn ghost" data-go="recite/${s}?from=${a}&to=${a}" data-act="close">${icon('mic', 18)} سمّعها</button>` +
      `<button class="btn ghost" data-go="ai?s=${s}&a=${a}" data-act="close">${icon('spark', 18)} اسأل الذكاء</button>` +
      `<button class="btn ghost" data-act="tafsir">${icon('book', 18)} التفسير</button>` +
      `<button class="btn ghost" data-act="copy">نسخ</button></div>` +
      `<div class="card tight mt" id="tafsirBox" style="display:none"></div>`;
    if (openSheet) openSheet.close();
    const sh = openSheet = sheet(html, { onClose: () => { if (tafsirAbort) tafsirAbort.abort(); if (openSheet === sh) openSheet = null; } });
    sh.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') { sh.close(); return; }
      if (act === 'play') { sh.close(); audio.playRange(s, a, ayahCount(s)); return; }
      if (act === 'read') {
        const r = markRead(s, a);
        addCls(s, a, 'read');
        { const f = pageFirst(cur); setLast(f.s, f.a); }
        toast(r.counted ? '+٢ نقطة' : 'سُجّلت قراءتها اليوم مسبقًا');
        sh.close(); return;
      }
      if (act === 'bm') { const on = toggleBookmark(s, a); toast(on ? 'تمت إضافة العلامة' : 'أُزيلت العلامة'); sh.close(); return; }
      if (act === 'review') { toast(addReview(s, a, a) ? 'أُضيفت للمراجعة' : 'الآية موجودة في المراجعة مسبقًا'); sh.close(); return; }
      if (act === 'tafsir') { showTafsir($('#tafsirBox', sh), s, a); return; }
      if (act === 'copy') {
        const ok = await copyText(`${ayah(s, a)} ﴿${N(a)}﴾ [سورة ${name}]`);
        toast(ok ? 'تم النسخ' : 'تعذّر النسخ'); sh.close();
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
    if (e.target.closest('#playAll')) { toggleAll(); return; }
    if (e.target.closest('#mdToggle')) { setMd(!mdOn); return; }
    if (e.target.closest('#heatToggle')) { setHeat(!heatOn); return; }
    if (e.target.closest('#tjToggle')) { setTj(!tjOn); return; }
    if (e.target.closest('#tjLegend')) { openLegend(); return; }
    if (e.target.closest('#markPage')) { markPage(); return; }
    if (e.target.closest('.mp-next')) { goNext(); return; }
    if (e.target.closest('.mp-prev')) { goPrev(); return; }
    if (e.target.closest('.mp-goto') || e.target.closest('#gotoIc')) { openGoto(); return; }
    const sp = e.target.closest('.ayah, .mq-w');
    if (sp && el.contains(sp) && heatOn && sp.dataset.heat) { openHeatSheet(+sp.dataset.s, +sp.dataset.a, +sp.dataset.w || 0); return; }
    if (sp && el.contains(sp)) { const s = +sp.dataset.s, a = +sp.dataset.a; select({ s, a }); openAyahSheet(s, a); }
  };
  const onKey = e => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented || openSheet) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'ArrowLeft') goNext();
    else if (e.key === 'ArrowRight') goPrev();
  };
  let tx = 0, ty = 0, tracking = false;
  const onTs = e => {
    const t = e.touches && e.touches[0];
    tracking = !!(t && e.touches.length === 1 && e.target.closest && e.target.closest('.mp-book'));
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
  document.addEventListener('keydown', onKey);
  el.addEventListener('touchstart', onTs, { passive: true });
  el.addEventListener('touchend', onTe, { passive: true });
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }

  fitAll(); ensureMadani();
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
      return renderIndex(el);
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
