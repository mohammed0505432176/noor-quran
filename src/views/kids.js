// «ركن الأطفال»: kids corner. Routes: kids, kids/azkar[/<id>], kids/letters, kids/quran[/<s>], kids/quiz[/dua|letters]
import { esc, header, toast, sheet, celebrate, N } from '../ui.js';
import { dateKey } from '../core/store.js';
import { loadQuran, surahName, ayah, ayahCount } from '../core/quran.js';
import { KIDS_AZKAR, AZKAR_CREDIT } from '../data/kids-azkar.js';
import { LETTERS } from '../data/kids-letters.js';
import { PRAYER_STEPS, FATIHA_AYAT, ayahUrl } from '../data/kids-prayer.js';
import { KIDS_SURAHS, TEACHER, teacherUrl } from '../data/kids-surahs.js';

const BASE = import.meta.env.BASE_URL;
const KEY = 'noor.kids';
const BADGES = [[5, 'نجمة صغيرة', '1f31f'], [15, 'بطل الأذكار', '1f3c6'], [30, 'حافظ صغير', '1f4d6'], [60, 'نور الأطفال', '2b50']];
const PASTEL = ['#ffb4a2', '#ffd27d', '#b8e0a0', '#9fd8e8', '#c9b6f2', '#f5a9d0', '#a8d5ba'];
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// ---------- storage / rewards ----------
function load() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY));
    if (o && typeof o === 'object') {
      const done = o.done && typeof o.done === 'object' ? o.done : {};
      const today = dateKey();
      for (const k of Object.keys(done)) { const m = /^az:.*:(\d{4}-\d{2}-\d{2})$/.exec(k); if (m && m[1] !== today) delete done[k]; }
      return { stars: +o.stars || 0, done, learned: o.learned || {}, badges: Array.isArray(o.badges) ? o.badges : [] };
    }
  } catch (e) { /* ignore */ }
  return { stars: 0, done: {}, learned: {}, badges: [] };
}
let K = load();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(K)); } catch (e) { /* ignore */ } }
function refreshPills() { document.querySelectorAll('.k-pill b').forEach(b => { b.textContent = N(K.stars); }); }
/** Add stars; with a key it is granted once only. Returns true when granted. */
function addStars(n, key) {
  if (key) { if (K.done[key]) return false; K.done[key] = true; }
  K.stars += n;
  for (const [need, name, em] of BADGES) {
    if (K.stars >= need && !K.badges.includes(need)) {
      K.badges.push(need);
      setTimeout(() => { celebrate(emo(em, 'k-emo-lg'), 'وسام جديد: ' + name, 'أحسنت يا بطل!'); }, 600);
      toast('وسام جديد: ' + name);
    }
  }
  persist(); refreshPills();
  return true;
}

// ---------- html helpers ----------
const emo = (code, cls = '') => `<img class="k-emo ${cls}" src="${BASE}kids/emoji/${esc(code)}.svg" alt="" draggable="false">`;
const art = (name, fb, cls = '') => `<img class="k-art ${cls}" src="${BASE}kids/img/${name}.webp" alt="" draggable="false" data-fb="${BASE}kids/emoji/${fb}.svg">`;
// CSP forbids inline handlers: swap a missing 3D image for its emoji once, then hide it
const onImgErr = e => { const i = e.target; if (!i || i.tagName !== 'IMG' || !(i.classList.contains('k-art') || i.classList.contains('k-emo'))) return; if (i.dataset.fb) { const f = i.dataset.fb; delete i.dataset.fb; i.src = f; } else i.style.visibility = 'hidden'; };
const prayerArt = (name, fb, cls = '') => `<img class="k-art ${cls}" src="${BASE}kids/prayer/${name}.webp" alt="" draggable="false" data-fb="${BASE}kids/emoji/${fb}.svg">`;
const pill = () => `<span class="k-pill">${emo('2b50')}<b>${N(K.stars)}</b></span>`;
const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const short = (t, n = 6) => { const w = String(t).split(/\s+/); return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' '); };
const todayKey = () => dateKey();
const catDone = c => c.items.every((_, j) => K.done[`az:${c.id}:${j}:${todayKey()}`]);

function confetti() {
  if (reduced()) return;
  const box = document.createElement('div');
  box.className = 'k-confetti';
  const cols = ['#ff7a8a', '#ffd166', '#6fd08c', '#59b8e6', '#b58cf0'];
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('i');
    s.style.cssText = `left:${35 + Math.random() * 30}%;background:${cols[i % 5]};--dx:${Math.round((Math.random() - .5) * 320)}px;--dy:${Math.round(-120 - Math.random() * 200)}px;--r:${Math.round(Math.random() * 720)}deg;animation-delay:${(Math.random() * 0.12).toFixed(2)}s`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1800);
}

function subRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  return { sub: parts[1] || '', arg: parts[2] ? decodeURIComponent(parts[2]) : '' };
}

// ---------- per-render context (audio + timers) ----------
function makeCtx() {
  const timers = [];
  const au = new Audio();
  au.preload = 'auto';
  const ctx = {
    au,
    t(fn, ms) { const id = setTimeout(fn, ms); timers.push(id); return id; },
    clearT() { timers.splice(0).forEach(clearTimeout); },
    stop() { ctx.clearT(); au.onended = au.onerror = null; try { au.pause(); } catch (e) { /* ignore */ } },
    destroy() {
      ctx.stop(); au.removeAttribute('src'); try { au.load(); } catch (e) { /* ignore */ }
      document.querySelectorAll('.k-confetti').forEach(n => n.remove());
    }
  };
  return ctx;
}

const bars = '<span class="k-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';

// ---------- home ----------
function home(el) {
  const tiles = [
    ['prayer', 'صلاتي', prayerArt('takbir', '1f54c'), 'k-t5 k-wide'],
    ['azkar', 'أذكاري', art('hands', '1f932'), 'k-t1'],
    ['letters', 'حروفي', art('book', '1f4d6'), 'k-t2'],
    ['quran', 'سوري القصيرة', art('mosque', '1f54c'), 'k-t3'],
    ['quiz', 'لعبة الأسئلة', art('star', '2b50'), 'k-t4']
  ];
  el.innerHTML = `<div class="kids">${header('ركن الأطفال', { back: 'more', actions: pill() })}
    <section class="k-hero">
      <div class="k-mascot">${art('mascot', '1f319', 'k-bounce')}</div>
      <div class="k-hello"><h2>أهلًا يا بطل!</h2><p>تعلّم، استمع، واجمع النجوم</p></div>
    </section>
    <div class="k-grid">${tiles.map(([r, t, im, c]) => `<button class="k-tile ${c}" data-go="kids/${r}"><span class="k-tile-art">${im}</span><b>${t}</b></button>`).join('')}</div>
    <h3 class="k-h">أوسمتي</h3>
    <div class="k-badges">${BADGES.map(([need, name, em]) => {
    const got = K.badges.includes(need);
    return `<div class="k-badge ${got ? 'on' : ''}">${emo(em, 'k-emo-lg')}<b>${esc(name)}</b><small>${got ? 'حصلت عليه' : N(need) + ' نجمة'}</small></div>`;
  }).join('')}</div></div>`;
}

// ---------- azkar ----------
function azkarIndex(el) {
  el.innerHTML = `<div class="kids">${header('أذكاري', { back: 'kids', actions: pill() })}
    <div class="k-grid k-grid-sm">${KIDS_AZKAR.map((c, i) => `
      <button class="k-card" style="--k:${PASTEL[i % PASTEL.length]}" data-go="kids/azkar/${esc(c.id)}">
        ${catDone(c) ? `<span class="k-ribbon">✓</span>` : ''}
        <span class="k-card-art">${emo(c.emoji, 'k-emo-xl')}</span>
        <b>${esc(c.title)}</b><small>${esc(c.when)}</small></button>`).join('')}</div>
    <p class="k-credit">${esc(AZKAR_CREDIT)}</p></div>`;
}

function azkarDetail(el, ctx, id) {
  const cat = KIDS_AZKAR.find(c => c.id === id);
  if (!cat) { azkarIndex(el); return; }
  let i = 0, loops = false, token = 0;
  const au = ctx.au;
  const key = () => `az:${cat.id}:${i}:${todayKey()}`;

  function setUi(on) {
    const b = el.querySelector('#k-play'); if (!b) return;
    b.classList.toggle('playing', on);
    b.setAttribute('aria-label', on ? 'إيقاف' : 'استمع');
    b.querySelector('.k-ico').textContent = on ? '❚❚' : '▶';
    if (!on) { const c = el.querySelector('#k-count'); if (c) c.textContent = ''; }
  }
  function stop() { token++; ctx.stop(); setUi(false); }
  function fail() { stop(); toast('تأكد من الإنترنت'); }
  function finish() {
    setUi(false);
    const got = addStars(1, key());
    confetti();
    if (got) toast('نجمة جديدة! أحسنت');
    const st = el.querySelector('#k-done'); if (st) st.hidden = false;
    const a = cat.items.length > 1 && i < cat.items.length - 1;
    if (a) { const nx = el.querySelector('#k-next'); if (nx) nx.classList.add('pulse'); }
  }
  function play() {
    stop();
    const it = cat.items[i];
    const total = loops ? (it.repeat > 1 ? it.repeat : 3) : 1;
    let n = 0; const my = ++token;
    const run = () => {
      const c = el.querySelector('#k-count'); if (c && total > 1) c.textContent = `المرة ${N(n + 1)} من ${N(total)}`;
      au.onended = () => {
        if (my !== token) return;
        n++;
        if (n < total) { setUi(true); ctx.t(() => { if (my === token) run(); }, 2000); } else finish();
      };
      au.onerror = () => { if (my === token) fail(); };
      au.src = it.audio;
      const p = au.play(); if (p && p.catch) p.catch(() => { if (my === token) fail(); });
    };
    setUi(true); run();
  }
  function draw() {
    stop();
    const it = cat.items[i];
    const dots = cat.items.map((_, j) => `<i class="${j === i ? 'on' : ''} ${K.done[`az:${cat.id}:${j}:${todayKey()}`] ? 'ok' : ''}"></i>`).join('');
    el.innerHTML = `<div class="kids">${header(cat.title, { back: 'kids/azkar', actions: pill() })}
      <div class="k-dua" style="--k:${PASTEL[KIDS_AZKAR.indexOf(cat) % PASTEL.length]}">
        <div class="k-dua-top">${emo(cat.emoji, 'k-emo-xl')}<span>${esc(cat.when)}</span></div>
        <p class="k-text">${esc(it.text)}</p>
        ${it.ref ? `<small class="k-ref">${esc(it.ref)}</small>` : ''}
        <div class="k-player">
          <button id="k-play" class="k-play" aria-label="استمع"><span class="k-ico">▶</span>${bars}</button>
        </div>
        <div id="k-count" class="k-count" aria-live="polite"></div>
        <label class="k-toggle"><input type="checkbox" id="k-loop" ${loops ? 'checked' : ''}><span>كرّرها معي</span></label>
        <div id="k-done" class="k-done" ${K.done[key()] ? '' : 'hidden'}>${emo('2b50')} أحسنت! أخذت نجمة اليوم</div>
      </div>
      <div class="k-nav">
        <button class="k-nbtn" id="k-prev" ${i === 0 ? 'disabled' : ''}>السابق</button>
        <div class="k-dots">${dots}</div>
        <button class="k-nbtn" id="k-next" ${i === cat.items.length - 1 ? 'disabled' : ''}>التالي</button>
      </div>
      <p class="k-credit">${esc(AZKAR_CREDIT)}</p></div>`;
    el.querySelector('#k-play').onclick = () => { if (el.querySelector('#k-play').classList.contains('playing')) stop(); else play(); };
    el.querySelector('#k-loop').onchange = e => { loops = e.target.checked; };
    el.querySelector('#k-prev').onclick = () => { if (i > 0) { i--; draw(); } };
    el.querySelector('#k-next').onclick = () => { if (i < cat.items.length - 1) { i++; draw(); } };
  }
  draw();
}

// ---------- letters ----------
function letters(el, ctx) {
  const au = ctx.au;
  let sh = null;
  const count = () => Object.keys(K.learned).length;
  const tile = (l, i) => `<button class="k-letter ${K.learned[l.ch] ? 'on' : ''}" style="--k:${PASTEL[i % PASTEL.length]}" data-i="${i}"><span>${esc(l.ch)}</span>${K.learned[l.ch] ? '<em>✓</em>' : ''}</button>`;
  el.innerHTML = `<div class="kids">${header('حروفي', { back: 'kids', actions: pill() })}
    <p class="k-sub"><span id="k-lc">${N(count())}</span> من ${N(LETTERS.length)} حرفًا تعلّمتها</p>
    <div class="k-letters">${LETTERS.map(tile).join('')}</div></div>`;

  function playL(l, btn) {
    ctx.stop();
    if (btn) btn.classList.add('playing');
    const off = () => { if (btn) btn.classList.remove('playing'); };
    au.onended = off;
    au.onerror = () => { off(); toast('تعذّر تشغيل الصوت'); };
    au.src = BASE + l.audio;
    const p = au.play(); if (p && p.catch) p.catch(() => { off(); });
  }
  function open(i) {
    const l = LETTERS[i];
    const labels = ['منفصل', 'أول', 'وسط', 'آخر'];
    sh = sheet(`<div class="k-sheet" style="--k:${PASTEL[i % PASTEL.length]}">
      <div class="k-big">${esc(l.ch)}</div><div class="k-lname">${esc(l.name)}</div>
      <div class="k-forms">${(l.forms || []).map((f, j) => `<div><span>${esc(f)}</span><small>${labels[j] || ''}</small></div>`).join('')}</div>
      <div class="k-word">${emo(l.emoji, 'k-emo-xl')}<b>${esc(l.word)}</b></div>
      <button class="k-play wide" id="k-lplay"><span class="k-ico">▶</span>${bars}<em>استمع</em></button></div>`, { onClose: () => { ctx.stop(); sh = null; } });
    const b = sh.querySelector('#k-lplay');
    b.onclick = () => playL(l, b);
    playL(l, b);
    if (!K.learned[l.ch]) {
      K.learned[l.ch] = true; persist();
      const n = count();
      const t = el.querySelector(`.k-letter[data-i="${i}"]`);
      if (t) { t.classList.add('on'); t.insertAdjacentHTML('beforeend', '<em>✓</em>'); }
      const lc = el.querySelector('#k-lc'); if (lc) lc.textContent = N(n);
      if (n === LETTERS.length) { if (addStars(3, 'letters:all')) confetti(); }
      else if (n % 7 === 0) { if (addStars(1, 'letters:' + n)) confetti(); }
    }
  }
  el.querySelectorAll('.k-letter').forEach(b => { b.onclick = () => open(+b.dataset.i); });
  return () => { if (sh) { sh.remove(); sh = null; } };
}

// ---------- quran ----------
async function quranList(el, alive) {
  try { await loadQuran(); } catch (e) { /* offline */ }
  if (!alive()) return;
  el.innerHTML = `<div class="kids">${header('سوري القصيرة', { back: 'kids', actions: pill() })}
    <div class="k-list">${KIDS_SURAHS.map((s, i) => {
    let nm = '', n = 0; try { nm = surahName(s); n = ayahCount(s); } catch (e) { /* ignore */ }
    return `<button class="k-row" style="--k:${PASTEL[i % PASTEL.length]}" data-go="kids/quran/${s}"><span class="k-num">${N(s)}</span><b>${esc(nm ? 'سورة ' + nm : 'سورة ' + N(s))}</b><small>${n ? N(n) + ' آيات' : ''}</small>${K.done['surah:' + s] ? '<em class="k-ok">✓</em>' : ''}</button>`;
  }).join('')}</div></div>`;
}

async function quranDetail(el, ctx, sid, alive) {
  const s = +sid;
  try { await loadQuran(); } catch (e) { toast('تأكد من الإنترنت'); }
  if (!alive()) return;
  let total = 0, name = '';
  try { total = ayahCount(s); name = surahName(s); } catch (e) { /* ignore */ }
  if (!total) { el.innerHTML = `<div class="kids">${header('السورة', { back: 'kids/quran' })}<p class="k-sub">تعذّر تحميل السورة</p></div>`; return; }
  const au = ctx.au;
  let cur = 1, mode = 'listen', running = false, token = 0, fi = 0;
  const heard = new Set();
  el.innerHTML = `<div class="kids">${header('سورة ' + name, { back: 'kids/quran', actions: pill() })}
    <div class="k-dua" style="--k:${PASTEL[2]}"><p class="k-text k-ayah" id="k-ay"></p><div id="k-turn" class="k-turn" hidden></div>
      <div class="k-player"><button id="k-play" class="k-play"><span class="k-ico">▶</span>${bars}</button></div></div>
    <div class="k-modes"><button class="k-chip on" data-m="listen">استمع</button><button class="k-chip" data-m="repeat">ردّد معي</button></div>
    <div class="k-nav"><button class="k-nbtn" id="k-prev">السابق</button><div class="k-dots" id="k-dots"></div><button class="k-nbtn" id="k-next">التالي</button></div>
    <button class="btn block mt" data-go="recite/${s}">سمّع السورة</button></div>`;
  const $ay = el.querySelector('#k-ay'), $turn = el.querySelector('#k-turn'), $play = el.querySelector('#k-play');
  function paint() {
    $ay.textContent = ayah(s, cur);
    el.querySelector('#k-dots').innerHTML = Array.from({ length: total }, (_, j) => `<i class="${j + 1 === cur ? 'on' : ''} ${j + 1 < cur ? 'ok' : ''}"></i>`).join('');
    el.querySelector('#k-prev').disabled = cur <= 1;
    el.querySelector('#k-next').disabled = cur >= total;
  }
  function ui(on) { running = on; $play.classList.toggle('playing', on); $play.querySelector('.k-ico').textContent = on ? '❚❚' : '▶'; if (!on) $turn.hidden = true; }
  function stop() { token++; ctx.stop(); ui(false); }
  function done() {
    ui(false);
    if (heard.size === total && addStars(2, 'surah:' + s)) { confetti(); toast('أحسنت! أتممت السورة'); } else confetti();
  }
  function playAyah() {
    const my = ++token; ctx.stop();
    ui(true); paint();
    au.onended = () => {
      if (my !== token) return;
      heard.add(cur);
      const next = () => { if (my !== token) return; if (cur >= total) { done(); return; } cur++; fi = 0; playAyah(); };
      if (mode === 'repeat') {
        const ms = Math.round(((isFinite(au.duration) && au.duration > 0 ? au.duration : 4) * 1.2) * 1000);
        const end = Date.now() + ms;
        $turn.hidden = false;
        const tick = () => {
          if (my !== token) return;
          const left = Math.ceil((end - Date.now()) / 1000);
          if (left <= 0) { $turn.hidden = true; next(); return; }
          $turn.textContent = `دورك الآن 🎤 ${N(left)}`;
          ctx.t(tick, 250);
        };
        tick();
      } else next();
    };
    au.onerror = () => {
      if (my !== token) return;
      if (fi < TEACHER.length - 1) { fi++; au.src = teacherUrl(TEACHER[fi], s, cur); const p = au.play(); if (p && p.catch) p.catch(() => {}); } else { stop(); toast('تأكد من الإنترنت'); }
    };
    au.src = teacherUrl(TEACHER[fi], s, cur);
    const p = au.play(); if (p && p.catch) p.catch(() => { if (my === token) { stop(); toast('تأكد من الإنترنت'); } });
  }
  $play.onclick = () => { if (running) stop(); else { fi = 0; playAyah(); } };
  el.querySelector('#k-prev').onclick = () => { stop(); if (cur > 1) cur--; paint(); };
  el.querySelector('#k-next').onclick = () => { stop(); if (cur < total) cur++; paint(); };
  el.querySelectorAll('.k-chip').forEach(b => { b.onclick = () => { mode = b.dataset.m; el.querySelectorAll('.k-chip').forEach(x => x.classList.toggle('on', x === b)); $turn.hidden = true; }; });
  paint();
}

// ---------- prayer guide ----------
const mediaUrl = a => (/^https?:/.test(a) ? a : BASE + a);
const sayClips = it => it.surah ? Array.from({ length: FATIHA_AYAT }, (_, k) => ayahUrl(it.surah, k + 1)) : (it.audio ? [mediaUrl(it.audio)] : []);

function prayer(el, ctx) {
  const au = ctx.au, S = PRAYER_STEPS, n = S.length;
  let i = 0, auto = false, token = 0, playing = -1; // playing = index of say item being played
  const doneKey = () => `az:prayer:all:${todayKey()}`;

  function setPlaying(k) {
    playing = k;
    el.querySelectorAll('.k-say').forEach((c, j) => {
      c.classList.toggle('playing', j === k);
      const b = c.querySelector('.k-sayplay'); if (b) { b.classList.toggle('playing', j === k); b.querySelector('.k-ico').textContent = j === k ? '❚❚' : '▶'; }
    });
  }
  function stop() { token++; ctx.stop(); setPlaying(-1); }
  /** Play one say item (all its clips in sequence), then call cb. */
  function playItem(k, cb) {
    const it = S[i].say[k], clips = sayClips(it);
    if (!clips.length) { if (cb) ctx.t(cb, 2500); return; }
    const my = ++token; ctx.stop(); setPlaying(k);
    let c = 0;
    const fail = () => { if (my !== token) return; stop(); auto = false; paintAuto(); toast('تأكد من الإنترنت'); };
    const next = () => {
      if (my !== token) return;
      c++;
      if (c < clips.length) { au.src = clips[c]; const p = au.play(); if (p && p.catch) p.catch(fail); } else { setPlaying(-1); if (cb) cb(); }
    };
    au.onended = next; au.onerror = fail;
    au.src = clips[0];
    const p = au.play(); if (p && p.catch) p.catch(fail);
  }
  function paintAuto() {
    const b = el.querySelector('#k-auto'); if (!b) return;
    b.classList.toggle('on', auto);
    b.querySelector('span').textContent = auto ? 'إيقاف التدريب' : 'تدرّب معي';
  }
  function finishAll() {
    auto = false; stop();
    const got = addStars(1, doneKey());
    confetti();
    el.innerHTML = `<div class="kids">${header('صلاتي', { back: 'kids', actions: pill() })}
      <div class="k-dua center k-pr-end"><div class="k-end-art">${prayerArt('salam', '1f31f', 'k-pr-img')}</div>
        <h2 class="k-end-t">أحسنت! ${emo('1f31f')}</h2>
        <p class="k-sub">أنهيت خطوات الصلاة كلها</p>
        <div class="k-earn">${emo('2b50')} ${got ? '+' + N(1) + ' نجمة' : 'أخذت نجمة اليوم'}</div>
        <button class="btn block mt" id="k-again">ابدأ من جديد</button>
        <button class="btn block mt" data-go="kids/quiz/prayer">العب: رتّب الصلاة</button></div></div>`;
    el.querySelector('#k-again').onclick = () => { i = 0; draw(); };
  }
  function advance() {
    if (i < n - 1) { i++; draw(); if (auto) runAuto(); } else finishAll();
  }
  function runAuto() {
    const st = S[i];
    const seq = k => {
      if (!auto) return;
      if (k >= st.say.length) { ctx.t(() => { if (auto) advance(); }, 1800); return; }
      playItem(k, () => ctx.t(() => seq(k + 1), 900));
    };
    if (!st.say.some(x => x.audio || x.surah)) { ctx.t(() => { if (auto) advance(); }, st.list ? 7000 : 5000); return; }
    ctx.t(() => seq(0), 700);
  }
  function draw() {
    stop();
    const st = S[i];
    const dots = S.map((_, j) => `<i class="${j === i ? 'on' : ''} ${j < i ? 'ok' : ''}"></i>`).join('');
    const say = st.say.map((it, k) => {
      const can = it.audio || it.surah;
      return `<div class="k-say" data-k="${k}">
        <p class="k-text k-say-t">${esc(it.text)}</p>
        ${it.repeat > 1 ? `<small class="k-ref">تُقال ${N(it.repeat)} مرات</small>` : ''}
        ${can ? `<div class="k-player"><button class="k-play k-sayplay" data-k="${k}" aria-label="استمع"><span class="k-ico">▶</span>${bars}</button></div>` : ''}</div>`;
    }).join('');
    el.innerHTML = `<div class="kids">${header('صلاتي', { back: 'kids', actions: pill() })}
      <div class="k-pr-stage" id="k-stage">
        <div class="k-pr-badge">الخطوة ${N(i + 1)} من ${N(n)}</div>
        <div class="k-pr-art">${prayerArt(st.img, '1f54c', 'k-pr-img')}</div>
      </div>
      <h2 class="k-pr-title">${esc(st.title)}</h2>
      <p class="k-pr-desc">${esc(st.desc)}</p>
      ${st.list ? `<ol class="k-pr-list">${st.list.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${st.say.length ? `<div class="k-dua k-pr-say" style="--k:${PASTEL[i % PASTEL.length]}"><div class="k-pr-q">ماذا أقول؟</div>${say}${st.note ? `<small class="k-ref">${esc(st.note)}</small>` : ''}</div>` : ''}
      <button class="k-auto" id="k-auto"><span>تدرّب معي</span></button>
      <div class="k-nav">
        <button class="k-nbtn" id="k-prev" ${i === 0 ? 'disabled' : ''}>السابق</button>
        <div class="k-dots">${dots}</div>
        <button class="k-nbtn" id="k-next">${i === n - 1 ? 'إنهاء' : 'التالي'}</button>
      </div></div>`;
    el.querySelectorAll('.k-sayplay').forEach(b => { b.onclick = () => { const k = +b.dataset.k; if (playing === k) stop(); else { auto = false; paintAuto(); playItem(k); } }; });
    el.querySelector('#k-auto').onclick = () => { if (auto) { auto = false; stop(); paintAuto(); } else { auto = true; paintAuto(); runAuto(); } };
    el.querySelector('#k-prev').onclick = () => { auto = false; if (i > 0) { i--; draw(); } };
    el.querySelector('#k-next').onclick = () => { auto = false; if (i < n - 1) { i++; draw(); } else finishAll(); };
    paintAuto();
    const stage = el.querySelector('#k-stage');
    let x0 = null, y0 = 0;
    stage.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      auto = false;
      if (dx < 0) { if (i < n - 1) { i++; draw(); } } else if (i > 0) { i--; draw(); } // RTL: swipe left = next
    }, { passive: true });
  }
  draw();
}

function prayerQuiz(el, ctx) {
  const POSES = ['takbir', 'qiyam', 'ruku', 'sujud', 'julus', 'salam'];
  const LBL = { takbir: 'التكبير', qiyam: 'القيام', ruku: 'الركوع', itidal: 'الرفع من الركوع', sujud: 'السجود', julus: 'الجلوس', salam: 'التسليم' };
  let order = [], next = 0, locked = false;
  function build() {
    const pick = shuffle(POSES).slice(0, 4);
    order = POSES.filter(p => pick.includes(p));
    next = 0; locked = false;
    const opts = shuffle(order);
    el.innerHTML = `<div class="kids">${header('رتّب الصلاة', { back: 'kids/quiz', actions: pill() })}
      <div class="k-q-prog">${order.map((_, j) => `<i data-p="${j}"></i>`).join('')}</div>
      <p class="k-sub">اضغط الصور بترتيب الصلاة، من الأولى إلى الأخيرة</p>
      <div class="k-pr-quiz">${opts.map((p, j) => `<button class="k-pq" data-p="${p}" style="--k:${PASTEL[j]}"><span class="k-pq-n"></span>${prayerArt(p, '1f54c')}<small>${LBL[p]}</small></button>`).join('')}</div></div>`;
    el.querySelectorAll('.k-pq').forEach(b => { b.onclick = () => pick1(b); });
  }
  function pick1(b) {
    if (locked || b.classList.contains('right')) return;
    if (b.dataset.p === order[next]) {
      b.classList.add('right'); b.querySelector('.k-pq-n').textContent = N(next + 1);
      const d = el.querySelector(`.k-q-prog i[data-p="${next}"]`); if (d) d.classList.add('ok');
      next++;
      if (next === order.length) { locked = true; end(); }
    } else { b.classList.add('wrong'); ctx.t(() => b.classList.remove('wrong'), 600); }
  }
  function end() {
    const got = addStars(2, `quiz:prayer:${todayKey()}`);
    confetti();
    ctx.t(() => {
      el.innerHTML = `<div class="kids">${header('النتيجة', { back: 'kids/quiz', actions: pill() })}
        <div class="k-dua center"><div class="k-end-art">${emo('1f3c6', 'k-emo-xxl k-bounce')}</div>
          <h2 class="k-end-t">أحسنت! ${emo('1f31f')}</h2>
          <p class="k-sub">رتّبت الصلاة صح</p>
          <div class="k-earn">${emo('2b50')} ${got ? '+' + N(2) + ' نجمة' : 'أخذت نجومك اليوم'}</div>
          <button class="btn block mt" id="k-again">العب مرة أخرى</button></div></div>`;
      el.querySelector('#k-again').onclick = build;
    }, 900);
  }
  build();
}

// ---------- quiz ----------
function quizMenu(el) {
  el.innerHTML = `<div class="kids">${header('لعبة الأسئلة', { back: 'kids', actions: pill() })}
    <div class="k-grid">
      <button class="k-tile k-t1" data-go="kids/quiz/dua"><span class="k-tile-art">${emo('1f932', 'k-emo-xl')}</span><b>ماذا نقول عند…؟</b></button>
      <button class="k-tile k-t3" data-go="kids/quiz/prayer"><span class="k-tile-art">${prayerArt('sujud', '1f54c')}</span><b>رتّب الصلاة</b></button>
      <button class="k-tile k-t2" data-go="kids/quiz/letters"><span class="k-tile-art">${emo('1f4d6', 'k-emo-xl')}</span><b>اسمع واختر الحرف</b></button>
    </div></div>`;
}

function quiz(el, ctx, kind) {
  const ROUNDS = 5;
  const au = ctx.au;
  let qs = [], qi = 0, score = 0, locked = false;

  function build() {
    if (kind === 'letters') {
      qs = shuffle(LETTERS).slice(0, ROUNDS).map(l => ({ l, opts: shuffle([l, ...shuffle(LETTERS.filter(x => x !== l)).slice(0, 3)]) }));
    } else {
      const pool = KIDS_AZKAR.filter(c => c.items && c.items.length);
      const txt = c => short(c.items[0].text);
      qs = shuffle(pool).slice(0, ROUNDS).map(c => {
        const seen = new Set([txt(c)]), d = [];
        for (const x of shuffle(pool)) { if (x === c || seen.has(txt(x))) continue; seen.add(txt(x)); d.push(x); if (d.length === 2) break; }
        return { c, opts: shuffle([c, ...d]) };
      });
    }
    qi = 0; score = 0;
  }
  function speak(l, btn) {
    ctx.stop();
    if (btn) btn.classList.add('playing');
    const off = () => { if (btn) btn.classList.remove('playing'); };
    au.onended = off; au.onerror = () => { off(); };
    au.src = BASE + l.audio;
    const p = au.play(); if (p && p.catch) p.catch(off);
  }
  function question() {
    const q = qs[qi]; locked = false;
    const head = `${header(kind === 'letters' ? 'اسمع واختر الحرف' : 'ماذا نقول عند…؟', { back: 'kids/quiz', actions: pill() })}
      <div class="k-q-prog">${qs.map((_, j) => `<i class="${j < qi ? 'ok' : j === qi ? 'on' : ''}"></i>`).join('')}</div>`;
    if (kind === 'letters') {
      el.innerHTML = `<div class="kids">${head}
        <div class="k-dua"><div class="k-q-say">أيّ حرف تسمع؟</div><div class="k-player"><button id="k-ls" class="k-play"><span class="k-ico">▶</span>${bars}</button></div></div>
        <div class="k-ans k-ans-l">${q.opts.map((o, j) => `<button class="k-a" data-j="${j}" style="--k:${PASTEL[j]}"><span class="k-big sm">${esc(o.ch)}</span></button>`).join('')}</div></div>`;
      const b = el.querySelector('#k-ls'); b.onclick = () => speak(q.l, b);
      ctx.t(() => speak(q.l, b), 250);
    } else {
      el.innerHTML = `<div class="kids">${head}
        <div class="k-dua" style="--k:${PASTEL[qi % PASTEL.length]}"><div class="k-dua-top col">${emo(q.c.emoji, 'k-emo-xxl')}<span>${esc(q.c.when)}</span></div><div class="k-q-say">ماذا نقول؟</div></div>
        <div class="k-ans">${q.opts.map((o, j) => `<button class="k-a txt" data-j="${j}"><span>${esc(short(o.items[0].text))}</span></button>`).join('')}</div></div>`;
    }
    el.querySelectorAll('.k-a').forEach(b => { b.onclick = () => answer(b); });
  }
  function answer(b) {
    if (locked) return; locked = true;
    const q = qs[qi]; const ok = q.opts[+b.dataset.j] === (q.l || q.c);
    el.querySelectorAll('.k-a').forEach(x => { x.disabled = true; if (q.opts[+x.dataset.j] === (q.l || q.c)) x.classList.add('right'); });
    if (ok) { score++; b.classList.add('bounce'); confetti(); } else b.classList.add('wrong');
    ctx.t(() => { qi++; if (qi < ROUNDS) question(); else end(); }, ok ? 1100 : 1700);
  }
  function end() {
    const earn = score + (score === ROUNDS ? 2 : 0);
    if (earn) {
      const day = todayKey();
      for (let n = 1; n <= 3; n++) { if (addStars(earn, `quiz:${kind}:${day}:${n}`)) break; }
    }
    if (score === ROUNDS) confetti();
    el.innerHTML = `<div class="kids">${header('النتيجة', { back: 'kids/quiz', actions: pill() })}
      <div class="k-dua center"><div class="k-end-art">${emo(score === ROUNDS ? '1f3c6' : '1f31f', 'k-emo-xxl k-bounce')}</div>
        <h2 class="k-end-t">${score === ROUNDS ? 'ممتاز يا بطل!' : score >= 3 ? 'أحسنت!' : 'حاول مرة أخرى'}</h2>
        <p class="k-sub">أجبت ${N(score)} من ${N(ROUNDS)} بشكل صحيح</p>
        <div class="k-earn">${emo('2b50')} +${N(earn)} نجمة</div>
        <button class="btn block mt" id="k-again">العب مرة أخرى</button></div></div>`;
    el.querySelector('#k-again').onclick = () => { build(); question(); };
  }
  build(); question();
}

export default {
  async render(el) {
    K = load();
    const ctx = makeCtx();
    let alive = true;
    const h = location.hash;
    const isAlive = () => alive && location.hash === h;
    let extra = null;
    el.addEventListener('error', onImgErr, true);
    const onAdhan = e => { if (e.detail && e.detail.on) ctx.stop(); };
    window.addEventListener('noor:adhan', onAdhan);
    const { sub, arg } = subRoute();
    if (sub === 'azkar') { if (arg) azkarDetail(el, ctx, arg); else azkarIndex(el); }
    else if (sub === 'letters') extra = letters(el, ctx);
    else if (sub === 'quran') { if (arg) await quranDetail(el, ctx, arg, isAlive); else await quranList(el, isAlive); }
    else if (sub === 'prayer') prayer(el, ctx);
    else if (sub === 'quiz') { if (arg === 'prayer') prayerQuiz(el, ctx); else if (arg === 'dua' || arg === 'letters') quiz(el, ctx, arg); else quizMenu(el); }
    else home(el);
    return () => { alive = false; el.removeEventListener('error', onImgErr, true); window.removeEventListener('noor:adhan', onAdhan); if (typeof extra === 'function') extra(); ctx.destroy(); };
  }
};
