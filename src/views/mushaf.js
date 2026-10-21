// Mushaf: index (surahs / juz / bookmarks) and the ayah reader with audio.
import { esc, $, $$, toast, sheet, icon, ayahMark, header, N } from '../ui.js';
import { S, markRead, setLast, isBookmarked, toggleBookmark, addReview } from '../core/store.js';
import { loadQuran, surahName, ayahCount, typeName, ayah, JUZ, SURAH_COUNT } from '../core/quran.js';
import * as audio from '../core/audio.js';

const BASMALA = 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ';
const ORD = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر', 'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر', 'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون', 'الحادي والعشرون', 'الثاني والعشرون', 'الثالث والعشرون', 'الرابع والعشرون', 'الخامس والعشرون', 'السادس والعشرون', 'السابع والعشرون', 'الثامن والعشرون', 'التاسع والعشرون', 'الثلاثون'];
const RATES = [0.75, 1, 1.25, 1.5];
const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUTO_KEY = 'noor.autoread';

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
    h += `<div class="list-item" data-go="mushaf/${s}"><div class="li-start"><span class="num-diamond">${N(s)}</span></div>` +
      `<div class="li-main"><div>${esc(surahName(s))}</div><div class="li-sub">${typeName(s)} · ${N(total)} آية${r ? ` · مقروءة ${N(r)}` : ''}</div></div>` +
      `<div class="li-end">${done ? `<span class="gold">${icon('check', 20)}</span>` : ''}</div></div>`;
  }
  return h;
}

function juzListHTML() {
  return JUZ.map(([s, a], i) =>
    `<div class="list-item" data-go="mushaf/${s}?a=${a}"><div class="li-start"><span class="num-diamond">${N(i + 1)}</span></div>` +
    `<div class="li-main"><div>الجزء ${ORD[i]}</div><div class="li-sub">يبدأ من سورة ${esc(surahName(s))} · الآية ${N(a)}</div></div></div>`).join('');
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

function renderIndex(el) {
  const last = S.last && S.last.s >= 1 && S.last.s <= SURAH_COUNT ? S.last : null;
  const hero = last ? `<div class="card hero mb"><div class="muted small">متابعة القراءة</div>` +
    `<h3 class="gold">سورة ${esc(surahName(last.s))} · الآية ${N(last.a)}</h3>` +
    `<button class="btn" data-go="mushaf/${last.s}?a=${last.a}">${icon('book', 18)} تابع القراءة</button></div>` : '';
  el.innerHTML = header('المصحف', { actions: `<button class="icon-btn" data-go="search" aria-label="بحث">${icon('search')}</button>` }) +
    hero +
    `<div class="seg mb"><button class="active" data-tab="s">السور</button><button data-tab="j">الأجزاء</button><button data-tab="b">العلامات</button></div>` +
    `<div class="list" data-panel="s">${surahListHTML()}</div>` +
    `<div class="list" data-panel="j" hidden>${juzListHTML()}</div>` +
    `<div data-panel="b" hidden>${bookmarksHTML()}</div>`;

  const onClick = e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      $$('[data-tab]', el).forEach(b => b.classList.toggle('active', b === tab));
      $$('[data-panel]', el).forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.tab; });
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
  el.addEventListener('click', onClick);
  return () => el.removeEventListener('click', onClick);
}

// ---------------------------------------------------------------- reader
async function renderReader(el, s, startAyah) {
  const total = ayahCount(s);
  const name = surahName(s);
  const spans = [];
  let text = '';
  for (let n = 1; n <= total; n++) {
    text += `<span class="ayah${S.read[s + ':' + n] ? ' read' : ''}" data-a="${n}">${esc(ayah(s, n))} ${ayahMark(n)}</span> `;
  }
  const navBtns = `<div class="row mt" style="justify-content:space-between">` +
    (s > 1 ? `<button class="btn ghost" data-go="mushaf/${s - 1}">السورة السابقة</button>` : '<span></span>') +
    (s < SURAH_COUNT ? `<button class="btn ghost" data-go="mushaf/${s + 1}">السورة التالية</button>` : '<span></span>') + `</div>`;

  let autoRead = false;
  try { autoRead = localStorage.getItem(AUTO_KEY) === '1'; } catch (e) { /* ignore */ }

  el.innerHTML = header(name, { back: 'mushaf', actions: `<button class="icon-btn" id="playAll" aria-label="استماع للسورة">${icon('play')}</button>` }) +
    `<div class="row small muted mb" style="justify-content:space-between"><span>تعليم الآيات كمقروءة أثناء التمرير</span>` +
    `<label class="switch"><input type="checkbox" id="autoRead"${autoRead ? ' checked' : ''}><span></span></label></div>` +
    `<div class="mushaf-page"><div class="surah-banner">سورة ${esc(name)} · ${typeName(s)} · آياتها ${N(total)}</div>` +
    (s !== 1 && s !== 9 ? `<div class="basmala">${BASMALA}</div>` : '') +
    `<div class="mushaf-text">${text}</div></div>` + navBtns +
    `<div class="player-bar" id="playerBar"></div>`;

  const textEl = $('.mushaf-text', el);
  $$('.ayah', textEl).forEach(sp => { spans[+sp.dataset.a] = sp; });
  const bar = $('#playerBar', el);
  const playBtn = $('#playAll', el);

  let sel = 0, dead = false, tafsirAbort = null, openSheet = null, hiTimer = null, lastTimer = null;
  const timers = new Map();
  const visible = new Set();

  const select = n => {
    if (sel && spans[sel]) spans[sel].classList.remove('selected');
    sel = n; if (n && spans[n]) spans[n].classList.add('selected');
  };
  const scrollTo = (n, smooth = true) => {
    const sp = spans[n]; if (!sp) return;
    sp.scrollIntoView({ block: 'center', behavior: smooth && !reduced() ? 'smooth' : 'auto' });
  };

  // ---- audio ui
  let playing = null;
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
  const mark = a => {
    if (playing && spans[playing]) spans[playing].classList.remove('playing');
    playing = a;
    if (a && spans[a]) spans[a].classList.add('playing');
  };
  const unsub = audio.onAudio(ev => {
    if (dead) return;
    if (ev.type === 'error') {
      bar.classList.remove('show'); mark(0); playBtn.innerHTML = icon('play');
      toast('تعذّر تشغيل الصوت، تأكد من الإنترنت');
      return;
    }
    if (ev.type === 'stop') { bar.classList.remove('show'); mark(0); playBtn.innerHTML = icon('play'); return; }
    if (ev.s !== s) return;
    bar.classList.add('show');
    if (ev.type === 'ayah') { mark(ev.a); scrollTo(ev.a); }
    playBtn.innerHTML = icon(audio.isPlaying() ? 'pause' : 'play');
    drawBar();
  });

  const startPlay = from => audio.playRange(s, from, total);
  const toggleAll = () => {
    if (audio.current() && audio.current().s === s) { audio.isPlaying() ? audio.pause() : audio.resume(); return; }
    startPlay(sel || 1);
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
  const showTafsir = async (box, a) => {
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
  const openAyahSheet = a => {
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
    const sh = openSheet = sheet(html, { onClose: () => { if (tafsirAbort) tafsirAbort.abort(); if (openSheet === sh) openSheet = null; } });
    sh.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'close') { sh.close(); return; }
      if (act === 'play') { sh.close(); audio.playRange(s, a, total); return; }
      if (act === 'read') {
        const r = markRead(s, a);
        spans[a].classList.add('read');
        toast(r.counted ? '+٢ نقطة' : 'سُجّلت قراءتها اليوم مسبقًا');
        sh.close(); return;
      }
      if (act === 'bm') { const on = toggleBookmark(s, a); toast(on ? 'تمت إضافة العلامة' : 'أُزيلت العلامة'); sh.close(); return; }
      if (act === 'review') { toast(addReview(s, a, a) ? 'أُضيفت للمراجعة' : 'الآية موجودة في المراجعة مسبقًا'); sh.close(); return; }
      if (act === 'tafsir') { showTafsir($('#tafsirBox', sh), a); return; }
      if (act === 'copy') {
        const ok = await copyText(`${ayah(s, a)} ﴿${N(a)}﴾ [سورة ${name}]`);
        toast(ok ? 'تم النسخ' : 'تعذّر النسخ'); sh.close();
      }
    });
  };

  // ---- events (delegated)
  const onClick = e => {
    const pl = e.target.closest('[data-pl]');
    if (pl) {
      const k = pl.dataset.pl;
      if (k === 'toggle') audio.isPlaying() ? audio.pause() : audio.resume();
      else if (k === 'prev') audio.prev();
      else if (k === 'next') audio.next();
      else if (k === 'stop') audio.stop();
      else if (k === 'rate') { audio.setRate(RATES[(rateIdx() + 1) % RATES.length]); drawBar(); }
      return;
    }
    if (e.target.closest('#playAll')) { toggleAll(); return; }
    const sp = e.target.closest('.ayah');
    if (sp && textEl.contains(sp)) { const a = +sp.dataset.a; select(a); openAyahSheet(a); }
  };
  el.addEventListener('click', onClick);
  const onAuto = e => {
    autoRead = e.target.checked;
    try { localStorage.setItem(AUTO_KEY, autoRead ? '1' : '0'); } catch (err) { /* ignore */ }
    if (!autoRead) { timers.forEach(clearTimeout); timers.clear(); }
    else if (!('IntersectionObserver' in window)) toast('الميزة غير مدعومة على هذا الجهاز');
  };
  $('#autoRead', el).addEventListener('change', onAuto);

  // ---- scroll tracking (last position + optional auto mark)
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => {
      for (const en of entries) {
        const a = +en.target.dataset.a;
        if (en.isIntersecting && en.intersectionRatio >= 0.6) {
          visible.add(a);
          if (autoRead && !timers.has(a) && !en.target.classList.contains('read')) {
            timers.set(a, setTimeout(() => {
              timers.delete(a);
              if (dead || !visible.has(a)) return;
              markRead(s, a);
              spans[a].classList.add('read');
            }, 2500));
          }
        } else {
          visible.delete(a);
          if (timers.has(a)) { clearTimeout(timers.get(a)); timers.delete(a); }
        }
      }
      clearTimeout(lastTimer);
      lastTimer = setTimeout(() => {
        if (dead || !visible.size) return;
        setLast(s, Math.min(...visible));
      }, 1500);
    }, { threshold: [0, 0.6, 1] });
    for (let n = 1; n <= total; n++) io.observe(spans[n]);
  }

  // ---- initial scroll
  if (startAyah >= 1 && startAyah <= total) {
    select(startAyah);
    requestAnimationFrame(() => scrollTo(startAyah, true));
    hiTimer = setTimeout(() => { if (!openSheet && sel === startAyah) select(0); }, 3000);
  }

  return () => {
    dead = true;
    unsub();
    audio.stop();
    if (io) io.disconnect();
    timers.forEach(clearTimeout); timers.clear();
    clearTimeout(hiTimer); clearTimeout(lastTimer);
    if (tafsirAbort) tafsirAbort.abort();
    if (openSheet) openSheet.close();
    el.removeEventListener('click', onClick);
  };
}

export default {
  async render(el, { id, q }) {
    const s = parseInt(id, 10);
    if (!(s >= 1 && s <= SURAH_COUNT)) {
      try { await loadQuran(); } catch (e) {
        el.innerHTML = header('المصحف') + `<div class="card empty"><p>تعذّر تحميل نص المصحف.</p><button class="btn" data-go="mushaf">إعادة المحاولة</button></div>`;
        return;
      }
      return renderIndex(el);
    }
    el.innerHTML = header('المصحف', { back: 'mushaf' }) + `<div class="card empty"><p class="muted">جارٍ تحميل المصحف…</p></div>`;
    try { await loadQuran(); } catch (e) {
      el.innerHTML = header('المصحف', { back: 'mushaf' }) + `<div class="card empty"><p>تعذّر تحميل نص المصحف.</p><button class="btn" data-go="mushaf/${s}">إعادة المحاولة</button></div>`;
      return;
    }
    const a = parseInt(q && q.get('a'), 10) || 0;
    return renderReader(el, s, a);
  }
};
