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
//   fitLines(box) -> fits the QCF font size of a rendered .mq-lines element to its width (call after it is in the DOM)
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

/** Fit the page font to the box width (the widest printed line spans it), centre short lines (as in print). */
export function fitLines(box) {
  if (!box) return;
  const W = box.clientWidth;
  if (W < 40) return;
  let fs = W / 15;
  for (let k = 0; k < 3; k++) {
    box.style.setProperty('--mq-fs', fs.toFixed(2) + 'px');
    let mx = 1;
    for (const ln of box.children) {
      if (!ln.querySelector('.mq-w')) continue;
      let sum = 0; for (const c of ln.children) sum += c.getBoundingClientRect().width;
      if (sum > mx) mx = sum;
    }
    if (mx <= 1) break;
    const nf = fs * W / mx * 0.985;
    if (Math.abs(nf - fs) < 0.2) { fs = Math.min(fs, nf); break; }
    fs = nf;
  }
  box.style.setProperty('--mq-fs', Math.max(10, fs).toFixed(2) + 'px');
  for (const ln of box.children) {
    if (!ln.querySelector('.mq-w')) continue;
    ln.classList.remove('mq-center');
    let sum = 0; for (const c of ln.children) sum += c.getBoundingClientRect().width;
    if (sum < W * 0.72) ln.classList.add('mq-center');
  }
}
