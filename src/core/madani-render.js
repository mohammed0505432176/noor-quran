// Shared Madinah Mushaf page renderer (QCF v2 page fonts, 15 printed lines): the .mq-* markup of mushaf.js
// (styles in mushaf.css), usable by any view. Pure string building + one DOM fitting helper.
// CONTRACT:
//   renderPageLines(layout, { wordClass, hideText, family }) -> html of one .mq-lines block
//     layout: public/mushaf/p/NNN.json ({ p, lines: [{ n, t:'surah'|'basmala'|'text', s, w: [[glyph, s, a, k]] }] }, k 1 = ayah end)
//     every glyph span: class "mq-w" (+ " mq-end" for k=1) + wordClass(info), data-s, data-a, data-k, data-i (glyph index on
//     the page), data-wi (0-based word index within its ayah, counting k=0 glyphs only; -1 for the ayah-end glyph)
//     wordClass(info) -> extra class string; info = { s, a, k, wi, i, glyph }
//     hideText: adds class "mq-hide" on the block (the caller's CSS decides how hidden words look)
//   pageGlyphs(layout) -> { glyphs: [{ s, a, k, wi, i }], groups: [{ s, a, start, end }] (k=0 glyph indices per ayah, in order),
//     ends: Map('s:a' -> glyph index of the ayah-end mark) }
//   fitLines(box) -> fits the QCF font size of a rendered .mq-lines element to its width and sets --mq-fs / --mq-lh on it
//     (call after it is in the DOM). The page is never squeezed below FS_FLOOR: on a short screen it scrolls instead.
//   pickFont / reserveHeights / availHeight -> the pure sizing rules behind it (unit-tested)
//   syncReserve(root, onChange) / setChromeOff(root, off) -> reader chrome: measured bar heights as CSS vars, and the shared
//     `chrome-off` class (see the note at the top of styles/reader.css); recite.js can call both on its own .rd root
// Every page of the 604-page Madinah print starts with a new ayah and ends on an ayah end, so word indices are page-local.
import { esc } from '../ui.js';
import { surahName } from './quran.js';
import { familyOf } from './madani.js';

export const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';

/** Glyph index of every word, plus per-ayah groups of word glyphs (k=0) in reading order. */
export function pageGlyphs(layout) {
  const glyphs = [], groups = [], ends = new Map();
  const wi = new Map();
  let last = null;
  for (const l of (layout && layout.lines) || []) {
    if (l.t !== 'text' || !Array.isArray(l.w)) continue;
    for (const w of l.w) {
      const s = w[1], a = w[2], k = w[3] ? 1 : 0, key = s + ':' + a, i = glyphs.length;
      if (k) { glyphs.push({ s, a, k, wi: -1, i }); ends.set(key, i); continue; }
      const n = wi.get(key) || 0;
      wi.set(key, n + 1);
      glyphs.push({ s, a, k, wi: n, i });
      // an ayah's word glyphs are contiguous; its end mark follows them
      if (!last || last.s !== s || last.a !== a) { last = { s, a, start: i, end: i + 1 }; groups.push(last); }
      else last.end = i + 1;
    }
  }
  return { glyphs, groups, ends };
}

export function renderPageLines(layout, opts = {}) {
  const { wordClass = null, hideText = false } = opts;
  const p = layout.p | 0;
  const family = opts.family || familyOf(p);
  const byN = new Map(layout.lines.map(l => [l.n, l]));
  const short = p <= 2;
  const rows = short ? layout.lines.map(l => l.n) : Array.from({ length: 15 }, (_, i) => i + 1);
  const wi = new Map();
  let i = 0;
  let h = `<div class="mq-lines${short ? ' short' : ''}${hideText ? ' mq-hide' : ''}" style="font-family:'${family}',var(--font-quran)">`;
  for (const n of rows) {
    const l = byN.get(n);
    if (!l) { h += '<div class="mq-line"></div>'; continue; }
    if (l.t === 'surah') h += `<div class="mq-line mq-sline"><div class="surah-banner">سورة ${esc(surahName(l.s))}</div></div>`;
    else if (l.t === 'basmala') h += `<div class="mq-line mq-bline"><div class="basmala">${BASMALA}</div></div>`;
    else {
      h += '<div class="mq-line">';
      for (const w of l.w || []) {
        const s = w[1], a = w[2], k = w[3] ? 1 : 0, key = s + ':' + a;
        let x = -1;
        if (!k) { x = wi.get(key) || 0; wi.set(key, x + 1); }
        const extra = wordClass ? wordClass({ s, a, k, wi: x, i, glyph: w[0] }) : '';
        h += `<span class="mq-w${k ? ' mq-end' : ''}${extra ? ' ' + extra : ''}" data-s="${s}" data-a="${a}" data-k="${k}" data-i="${i}" data-wi="${x}">${esc(w[0])}</span>`;
        i++;
      }
      h += '</div>';
    }
  }
  return h + '</div>';
}

/** Smallest page font ever set, and the font the reader keeps on a short screen (the page scrolls instead of shrinking below it). */
export const FS_MIN = 12;
export const FS_FLOOR = 18;
/** On a wide page (landscape) the floor is this share of the width font, so the text is not shrunk far below what the page width allows. */
export const FLOOR_SHARE = 0.75;
/** Line pitch in em: never tighter than LH_MIN (marks above / below a line would touch its neighbours), never looser than LH_MAX. */
export const LH_MIN = 1.78;
export const LH_MAX = 1.95;

/**
 * Pure sizing rule. widthFs = the font that makes the widest printed line span the box; availH = vertical room for the n lines.
 * Returns the font (never above widthFs, never below min(widthFs, max(floor, FLOOR_SHARE * widthFs))), the line pitch in px and whether the block is taller
 * than the room (then the page scrolls; nothing is squeezed).
 */
export function pickFont({ widthFs, availH, n, floor = FS_FLOOR, lhMin = LH_MIN, lhMax = LH_MAX }) {
  const lines = Math.max(1, n | 0);
  const hasRoom = Number.isFinite(availH) && availH > 0;
  const byHeight = hasRoom ? availH / (lines * lhMin) : widthFs;
  const lo = Math.min(widthFs, Math.max(floor, widthFs * FLOOR_SHARE));
  const fs = Math.max(lo, Math.min(widthFs, byHeight));
  const lh = Math.min(fs * lhMax, Math.max(fs * lhMin, hasRoom ? availH / lines : fs * lhMax));
  return { fs, lh, scroll: hasRoom && lines * lh > availH + 1 };
}

/** Vertical room left for the glyph lines: viewport minus everything above (at scroll 0), below (foot), the bars and a small gap. */
export function availHeight({ vh, hostTop, hostPad = 0, below = 0, reserve = 0, gap = 8 }) {
  return vh - hostTop - hostPad - below - reserve - gap;
}

/** Pure: CSS pixel values of the reader chrome from measured element sizes. `off` (bars hidden) lets the CSS fallback shrink the page reserve. */
export function reserveHeights({ stage = 0, bottom = 0, player = 0, playerOn = false, off = false }) {
  const pl = playerOn ? Math.round(player) + 8 : 0;
  const b = Math.round(bottom);
  return { top: Math.round(stage), base: off ? null : b, pl, fit: b + pl };
}

const playerH = pl => { const m = pl.querySelector('.pl-mini'); return (m || pl).offsetHeight; };   // the mini bar only: its option panel is a pop-over

const roomOf = (box) => {
  const host = box.parentElement || box;
  const hr = host.getBoundingClientRect();
  const cs = getComputedStyle(host);
  const page = box.closest('.mp-page');
  const rd = box.closest('.rd');
  let reserve = 0;
  if (rd) {
    const b = rd.querySelector('.rd-bottom'); if (b) reserve += b.offsetHeight;
    const pl = rd.querySelector('.rd-player');
    if (pl && rd.classList.contains('rd-pl')) reserve += playerH(pl) + 8;
  }
  return availHeight({
    vh: document.documentElement.clientHeight || window.innerHeight,
    hostTop: hr.top + (window.scrollY || 0),
    hostPad: (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0),
    below: page ? Math.max(0, page.getBoundingClientRect().bottom - hr.bottom) : 0,
    reserve
  });
};

/**
 * Fit the page font to the box. The widest printed line spans the box width (every font has its own widths, so measuring waits for
 * the page font); then the vertical room decides the line pitch and, only when even the floor font does not fit, the page scrolls.
 * Short lines are centred, as in print. Sets --mq-fs and --mq-lh on the box; class mq-overflow = a line is wider than the box.
 */
export function fitLines(box) {
  if (!box) return;
  const fam = (getComputedStyle(box).fontFamily || '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if (fam && typeof document !== 'undefined' && document.fonts && !document.fonts.check(`40px "${fam}"`)) {
    if (!box.dataset.fitWait) {
      box.dataset.fitWait = '1';
      document.fonts.load(`40px "${fam}"`).catch(() => {}).then(() => { delete box.dataset.fitWait; if (box.isConnected) fitLines(box); });
    }
    return;
  }
  const W = box.clientWidth;
  if (W < 40) return;
  const setFs = v => box.style.setProperty('--mq-fs', v.toFixed(2) + 'px');
  const all = [...box.children];
  const lines = all.filter(ln => ln.querySelector('.mq-w'));
  // natural width of a printed line: its glyph boxes plus the column gaps (short pages centre their lines with a gap)
  const natural = ln => { let sum = 0; for (const c of ln.children) sum += c.getBoundingClientRect().width; return sum + (ln.children.length - 1) * (parseFloat(getComputedStyle(ln).columnGap) || 0); };
  for (const ln of lines) ln.classList.remove('mq-center');
  let fs = W / 15;
  setFs(fs);
  for (let k = 0; k < 3; k++) {                       // width
    let mx = 1;
    for (const ln of lines) mx = Math.max(mx, natural(ln));
    if (mx <= 1) break;
    const nf = fs * W / mx * 0.985;
    if (Math.abs(nf - fs) < 0.2) { fs = Math.min(fs, nf); break; }
    fs = nf; setFs(fs);
  }
  const pick = pickFont({ widthFs: Math.max(FS_MIN, fs), availH: roomOf(box), n: all.length || 15 });
  setFs(pick.fs);
  box.style.setProperty('--mq-lh', pick.lh.toFixed(2) + 'px');
  box.classList.toggle('mq-scroll', pick.scroll);
  box.classList.toggle('mq-overflow', !all.every(ln => ln.scrollWidth <= ln.clientWidth + 1));
  for (const ln of lines) {
    ln.classList.remove('mq-center');
    if (natural(ln) < W * 0.72) ln.classList.add('mq-center');
  }
}

/**
 * Reader chrome sizing. Measures the real top block (bar + strips above the page), the bottom bar and the mini player and writes
 * them as CSS vars on `root` (--rd-top-h --rd-base-h --rd-pl-h --rd-fit-bot) so the page reserves exactly that space: nothing a
 * bar covers is ever a verse. onChange(r) runs when the reserved sizes changed (refit the page). Returns { apply, dispose }.
 */
export function syncReserve(root, onChange) {
  if (!root) return { apply() {}, dispose() {} };
  let last = '';
  const apply = () => {
    const q = s => root.querySelector(s);
    const stage = q('.rd-stage'), bottom = q('.rd-bottom'), pl = q('.rd-player');
    const r = reserveHeights({
      stage: stage ? stage.offsetTop : 0, bottom: bottom ? bottom.offsetHeight : 0, player: pl ? playerH(pl) : 0,
      playerOn: root.classList.contains('rd-pl'), off: root.classList.contains('chrome-off')
    });
    const st = root.style;
    st.setProperty('--rd-top-h', r.top + 'px');
    if (r.base === null) st.removeProperty('--rd-base-h'); else st.setProperty('--rd-base-h', r.base + 'px');
    st.setProperty('--rd-pl-h', r.pl + 'px');
    st.setProperty('--rd-fit-bot', r.fit + 'px');
    const key = r.top + '|' + r.fit;
    if (key !== last) { const first = last === ''; last = key; if (!first && onChange) onChange(r); }
  };
  let ro = null, raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(later);
    for (const c of root.children) if (!c.classList.contains('rd-stage')) ro.observe(c);
  }
  window.addEventListener('resize', later);
  apply();
  return { apply, dispose() { if (ro) ro.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', later); } };
}

/** The shared full-screen switch: class `chrome-off` on the reader root hides the top and bottom bars (documented in styles/reader.css). */
export function setChromeOff(root, off) {
  if (!root) return;
  root.classList.toggle('chrome-off', !!off);
}
