// Azkar view: #/azkar (categories) and #/azkar/<cat> (list with tap counters).
import { esc, header, icon, ayahMark, celebrate, toast, N } from '../ui.js';
import { azkarDone, dateKey } from '../core/store.js';
import { haptic } from '../core/platform.js';
import { loadQuran, ayah } from '../core/quran.js';
import { AZKAR, CATEGORIES } from '../data/azkar.js';

const doneKey = cat => `noor.azkar.${dateKey()}.${cat}`;
const progKey = cat => `noor.azkar.${dateKey()}.${cat}.p`;
const paidKey = cat => `noor.azkar.${dateKey()}.${cat}.paid`;

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }

const isDone = cat => lsGet(doneKey(cat)) === '1';

function loadProgress(cat) {
  const n = AZKAR[cat].length;
  try {
    const p = JSON.parse(lsGet(progKey(cat)));
    if (Array.isArray(p) && p.length === n) return p.map((v, i) => Math.max(0, Math.min(AZKAR[cat][i].count, +v || 0)));
  } catch (e) { /* ignore */ }
  return AZKAR[cat].map(z => z.count);
}

function suggested() {
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  if (m < 12 * 60) return 'morning';
  if (m >= 15 * 60 + 30) return 'evening';
  return null;
}

function quranHtml(q) {
  let h = '';
  for (let a = q.from; a <= q.to; a++) {
    const t = ayah(q.s, a);
    h += `${esc(t)} ${ayahMark(a)} `;
  }
  return h;
}

// ---------- index ----------
function renderIndex(el) {
  const sug = suggested();
  el.innerHTML = `<main class="view">${header('الأذكار', { back: 'home' })}
    <p class="muted small mb">حصن المسلم، أذكار اليوم بنقرة واحدة.</p>
    <div class="grid-2">${CATEGORIES.map(c => {
      const done = isDone(c.id);
      return `<button class="card ${c.id === sug && !done ? 'hero' : ''} center" data-go="azkar/${c.id}" style="cursor:pointer;text-align:center;font:inherit;color:inherit">
        <div style="font-size:34px;line-height:1.2">${c.icon}</div>
        <b style="display:block;margin-top:6px">${esc(c.title)}</b>
        <span class="muted small">${N(AZKAR[c.id].length)} ذكراً</span>
        <div class="mt small ${done ? 'gold' : 'muted'}">${done ? icon('check', 16) + ' تم اليوم' : c.id === sug ? 'الأنسب الآن' : 'لم يكتمل بعد'}</div>
      </button>`;
    }).join('')}</div></main>`;
}

// ---------- list ----------
function renderList(el, cat) {
  const meta = CATEGORIES.find(c => c.id === cat);
  const list = AZKAR[cat];
  let rem = loadProgress(cat);
  let alive = true;

  el.innerHTML = `<main class="view">${header(meta.title, {
    back: 'azkar',
    actions: `<button class="icon-btn" id="zk-reset" aria-label="إعادة" title="إعادة">${icon('repeat')}</button>`
  })}
    <div class="progress mb" aria-hidden="true"><i id="zk-bar" style="width:0%"></i></div>
    <div class="muted small mb" id="zk-sum"></div>
    <div id="zk-list"><div class="card empty muted">جارٍ التحميل…</div></div></main>`;

  const listEl = el.querySelector('#zk-list');
  const bar = el.querySelector('#zk-bar');
  const sum = el.querySelector('#zk-sum');

  const doneCount = () => rem.filter(r => r === 0).length;
  const cardHtml = (z, i) => {
    const body = z.quran ? `<div class="quran" style="line-height:2.1;font-size:1.25em">${quranHtml(z.quran)}</div>` : `<div style="line-height:1.9;font-size:1.05em">${esc(z.text)}</div>`;
    const foot = `<div class="muted small mt">${esc(z.source || '')}${z.virtue ? ' · ' + esc(z.virtue) : ''}</div>`;
    if (rem[i] === 0) {
      return `<div class="card tight zk-card done" data-i="${i}" style="opacity:.7;display:flex;align-items:center;gap:10px">
        <span class="gold" style="display:inline-flex">${icon('check', 22)}</span>
        <span class="muted small" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(z.quran ? 'قرآن، ' + (z.source || '') : z.text)}</span></div>`;
    }
    return `<div class="card zk-card" data-i="${i}" role="button" tabindex="0" style="cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent">
      ${body}${foot}
      <div class="row mt" style="justify-content:space-between;align-items:center">
        <span class="muted small">${z.count > 1 ? 'اضغط للعد' : 'اضغط عند الانتهاء'}</span>
        <button class="btn sm" tabindex="-1" aria-label="المتبقي">${N(rem[i])}${z.count > 1 ? ' / ' + N(z.count) : ''}</button>
      </div></div>`;
  };

  const paintMeta = () => {
    const d = doneCount();
    bar.style.width = Math.round(d / list.length * 100) + '%';
    sum.textContent = `أتممت ${N(d)} من ${N(list.length)}`;
  };
  const paintAll = () => { listEl.innerHTML = list.map(cardHtml).join(''); paintMeta(); };
  const save = () => lsSet(progKey(cat), JSON.stringify(rem));

  function finish() {
    lsSet(doneKey(cat), '1');
    if (lsGet(paidKey(cat)) !== '1') {
      lsSet(paidKey(cat), '1');
      azkarDone();
    }
    celebrate('🤲', 'تقبّل الله', 'أتممت ' + meta.title);
  }

  function tap(i) {
    if (rem[i] <= 0) return;
    rem[i]--;
    haptic(rem[i] === 0 ? 'medium' : 'light');
    save();
    const card = listEl.querySelector(`.zk-card[data-i="${i}"]`);
    if (rem[i] === 0) {
      card.outerHTML = cardHtml(list[i], i);
    } else {
      const b = card.querySelector('.btn');
      b.textContent = N(rem[i]) + (list[i].count > 1 ? ' / ' + N(list[i].count) : '');
    }
    paintMeta();
    if (doneCount() === list.length && !isDone(cat)) finish();
  }

  listEl.addEventListener('click', e => {
    const c = e.target.closest('.zk-card');
    if (c && !c.classList.contains('done')) tap(+c.dataset.i);
  });
  listEl.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = e.target.closest('.zk-card');
    if (c && !c.classList.contains('done')) { e.preventDefault(); tap(+c.dataset.i); }
  });

  el.querySelector('#zk-reset').addEventListener('click', () => {
    rem = list.map(z => z.count);
    lsDel(doneKey(cat)); lsDel(progKey(cat));
    paintAll();
    toast('تمت إعادة ' + meta.title);
  });

  // Quran items need the mushaf loaded first
  const needsQuran = list.some(z => z.quran);
  (needsQuran ? loadQuran() : Promise.resolve()).then(() => { if (alive) paintAll(); }).catch(() => {
    if (!alive) return;
    // fall back: show non-Quran items only
    rem = rem.map((r, i) => (list[i].quran ? 0 : r));
    listEl.innerHTML = '<div class="card empty muted">تعذر تحميل نص القرآن، تظهر بقية الأذكار فقط.</div>' + list.map((z, i) => (z.quran ? '' : cardHtml(z, i))).join('');
    paintMeta();
  });

  return () => { alive = false; };
}

export default {
  render(el, params = {}) {
    const cat = params.id;
    if (cat && AZKAR[cat]) return renderList(el, cat);
    renderIndex(el);
  }
};
