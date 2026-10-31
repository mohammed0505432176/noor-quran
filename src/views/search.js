// Search the Quran text, or jump straight to an ayah ("2:255" / "البقرة 255").
import { esc, $, icon, header, N } from '../ui.js';
import { loadQuran, searchMode, surahName, ayahCount, SURAH_COUNT } from '../core/quran.js';
import { norm, skel } from '../core/arabic.js';

const toLatinDigits = s => String(s).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776));

/** Wrap the first normalized match of q inside the original (diacritized) text with <mark>. */
function highlight(text, q) {
  const nq = skel(q);
  let flat = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) { if (!flat.endsWith(' ')) { flat += ' '; map.push(i); } continue; }
    for (const c of skel(ch)) { flat += c; map.push(i); }
  }
  const at = nq ? flat.indexOf(nq) : -1;
  if (at < 0) return esc(text);
  let start = map[at];
  let end = map[at + nq.length - 1] + 1;
  while (end < text.length && norm(text[end]) === '' && !/\s/.test(text[end])) end++;
  return esc(text.slice(0, start)) + '<mark>' + esc(text.slice(start, end)) + '</mark>' + esc(text.slice(end));
}

/** Try to read the query as a reference. Returns {s,a} or null. */
function parseRef(raw) {
  const t = toLatinDigits(raw).trim();
  let m = t.match(/^(\d{1,3})\s*[:：\/\-\s]\s*(\d{1,3})$/);
  if (m) return valid(+m[1], +m[2]);
  m = t.match(/^(.*?)\s*[:：\/\-\s]?\s*(\d{1,3})$/);
  if (m && m[1]) {
    const nm = norm(m[1].replace(/^سورة\s*/, '')).replace(/\s/g, '');
    if (nm.length < 2) return null;
    const strip = x => x.replace(/^ال/, '');
    for (let s = 1; s <= SURAH_COUNT; s++) {
      const sn = norm(surahName(s)).replace(/\s/g, '');
      if (sn === nm || strip(sn) === strip(nm)) return valid(s, +m[2]);
    }
  }
  return null;
}
function valid(s, a) { return s >= 1 && s <= SURAH_COUNT && a >= 1 && a <= ayahCount(s) ? { s, a } : null; }

const TIPS = `<div class="card"><div class="section-title">نصائح للبحث</div>` +
  `<ul class="muted small" style="line-height:2;padding-inline-start:18px;margin:0">` +
  `<li>اكتب كلمتين أو أكثر من الآية، ولا تحتاج إلى التشكيل.</li>` +
  `<li>للانتقال المباشر اكتب رقم السورة والآية مثل <b>٢:٢٥٥</b>.</li>` +
  `<li>أو اكتب اسم السورة ورقم الآية مثل <b>البقرة ٢٥٥</b>.</li></ul></div>`;

export default {
  async render(el) {
    el.innerHTML = header('البحث', { back: 'mushaf' }) +
      `<div class="field mb"><input class="input" id="q" type="search" inputmode="search" placeholder="ابحث في القرآن أو اكتب ٢:٢٥٥" autocomplete="off" aria-label="بحث"></div>` +
      `<div id="res">${TIPS}</div>`;
    const input = $('#q', el), res = $('#res', el);
    let timer = null, dead = false;
    setTimeout(() => { try { input.focus(); } catch (e) { /* ignore */ } }, 50);

    let ready = false;
    try { await loadQuran(); ready = true; } catch (e) {
      res.innerHTML = `<div class="card empty"><p>تعذّر تحميل نص المصحف، تأكد من الاتصال ثم أعد المحاولة.</p><button class="btn" data-go="search">إعادة المحاولة</button></div>`;
    }

    const run = () => {
      if (dead || !ready) return;
      const raw = input.value.trim();
      const nq = norm(raw);
      const ref = raw ? parseRef(raw) : null;
      if (!ref && nq.length < 2) { res.innerHTML = TIPS; return; }
      let html = '';
      if (ref) {
        html += `<div class="list mb"><div class="list-item" data-go="mushaf/${ref.s}?a=${ref.a}"><div class="li-start"><span class="num-diamond">${N(ref.s)}</span></div>` +
          `<div class="li-main"><div>انتقل إلى سورة ${esc(surahName(ref.s))} · الآية ${N(ref.a)}</div></div><div class="li-end">${icon('back', 18)}</div></div></div>`;
      }
      const found = nq.length >= 2 ? searchMode(raw, 60) : { results: [], mode: 'none' };
      const out = found.results;
      if (out.length) {
        html += `<div class="section-title">${N(out.length)}${out.length >= 60 ? '+' : ''} نتيجة</div>` +
          (found.mode === 'words' ? '<p class="muted small">لم ترد هذه العبارة بنصها في آية، وهذه آيات تحوي كل كلماتك:</p>' : '') +
          `<div class="list">` +
          out.map(r => `<div class="list-item" data-go="mushaf/${r.s}?a=${r.a}"><div class="li-start"><span class="num-diamond">${N(r.a)}</span></div>` +
            `<div class="li-main"><div class="gold small">${esc(surahName(r.s))} · الآية ${N(r.a)}</div>` +
            `<div class="quran">${highlight(r.text, raw)}</div></div></div>`).join('') + `</div>`;
      } else if (!ref) {
        html = `<div class="card empty"><p>لا توجد نتائج لـ «${esc(raw)}».</p><p class="muted small">جرّب كلمات أخرى أو بدون تشكيل.</p></div>`;
      }
      res.innerHTML = html;
    };

    const onInput = () => { clearTimeout(timer); timer = setTimeout(run, 250); };
    input.addEventListener('input', onInput);
    return () => { dead = true; clearTimeout(timer); input.removeEventListener('input', onInput); };
  }
};
