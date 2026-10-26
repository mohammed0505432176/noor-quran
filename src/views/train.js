// Training center: next-ayah quiz, talqin (listen & repeat), my mistakes, daily challenge, first-words.
import { S, today, addReview, weakAyahs, dueReviews, gradeReview, recordWords } from '../core/store.js';
import { loadQuran, surahName, ayahCount, ayah, SURAH_COUNT } from '../core/quran.js';
import { words } from '../core/arabic.js';
import * as audio from '../core/audio.js';
import { haptic } from '../core/platform.js';
import { esc, icon, toast, header, N } from '../ui.js';
import { startRecorder } from '../core/recorder.js';
import { engineSupported, engineCached, openEngine, mapVerdicts } from '../core/quran-engine.js';
import '../styles/train.css';

const ROUNDS = 10;
// Skip weak-ayah entries whose surah/ayah do not exist (ayah() throws or returns undefined).
const validWeakAyah = x => { try { return !!ayah(x.s, x.a); } catch { return false; } };
const rnd = n => Math.floor(Math.random() * n);
const rangeTxt = (f, t) => (f === t ? `الآية ${N(f)}` : `الآيات ${N(f)}–${N(t)}`);
const goUrl = (s, f, t, extra) => `recite/${s}?from=${f}&to=${t}${extra ? '&' + extra : ''}`;

// ---- shared surah/range picker ----
function picker(id, { defTo } = {}) {
  const opts = Array.from({ length: SURAH_COUNT }, (_, i) => `<option value="${i + 1}">${N(i + 1)}. ${esc(surahName(i + 1))}</option>`).join('');
  return `<div class="field"><label>السورة</label><select class="select" id="${id}-s">${opts}</select></div>
    <div class="grid-2"><div class="field"><label>من آية</label><input class="input" id="${id}-f" type="number" min="1" value="1" inputmode="numeric"></div>
    <div class="field"><label>إلى آية</label><input class="input" id="${id}-t" type="number" min="1" inputmode="numeric" ${defTo ? `data-def="${defTo}"` : ''}></div></div>`;
}
function wirePicker(root, id, preset) {
  const sel = root.querySelector(`#${id}-s`), f = root.querySelector(`#${id}-f`), t = root.querySelector(`#${id}-t`);
  const sync = () => { const n = ayahCount(+sel.value); f.max = t.max = n; f.value = 1; t.value = Math.min(n, +(t.dataset.def || n)); };
  sel.onchange = sync;
  if (preset) sel.value = preset.s;
  sync();
  if (preset) { f.value = preset.from; t.value = preset.to; }
}
function readPicker(root, id) {
  const s = +root.querySelector(`#${id}-s`).value, n = ayahCount(s);
  const from = Math.round(+root.querySelector(`#${id}-f`).value), to = Math.round(+root.querySelector(`#${id}-t`).value);
  if (!(from >= 1 && to >= from && to <= n)) { toast(`أدخل مدى صحيحاً بين ١ و ${N(n)}`); return null; }
  return { s, from, to };
}

// ---- data helpers ----
function dailyTarget() {
  let h = 0; for (const c of today()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const s = 2 + (h % 113), n = ayahCount(s), count = Math.min(n, 3 + ((h >> 5) % 3));
  const from = 1 + (((h >> 8) >>> 0) % Math.max(1, n - count + 1));
  return { s, from, to: Math.min(n, from + count - 1) };
}
function dailyDone(t) { return S.rec.some(r => r.d === today() && r.s === t.s && r.from === t.from && r.to === t.to && r.acc >= 80); }
function mistakeGroups() {
  const seen = new Set(), out = [];
  for (const r of S.rec) {
    if (r.acc >= 90) continue;
    const k = `${r.s}:${r.from}-${r.to}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}
function topMissed() {
  const m = new Map();
  for (const r of S.rec) for (const w of (r.miss || [])) m.set(w, (m.get(w) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
}

export default {
  async render(el) {
    try { await loadQuran(); } catch (e) { el.innerHTML = '<div class="card empty"><p>تعذر تحميل نص المصحف.</p></div>'; return; }

    let alive = true, timer = null, unsub = null;
    const clearTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
    const killAudio = () => { clearTimer(); if (unsub) { unsub(); unsub = null; } try { audio.stop(); } catch (e) { /* ignore */ } };
    const wire = (map) => el.querySelectorAll('[data-act]').forEach(b => { const f = map[b.dataset.act]; if (f) b.onclick = () => f(b); });

    // ================= HOME =================
    function home() {
      killAudio();
      const weak = weakAyahs(6).filter(validWeakAyah), groups = mistakeGroups().slice(0, 8), cloud = topMissed(), dt = dailyTarget(), done = dailyDone(dt);
      el.innerHTML = `${header('مركز التدريب', { back: 'more' })}
        <p class="muted small">تمارين متنوعة لتثبيت الحفظ وتقوية الربط بين الآيات.</p>

        <div class="card hero">
          <div class="row" style="justify-content:space-between;align-items:center"><b>سباق الحفظ اليوم</b>${done ? '<span class="gold" aria-label="أُنجز">' + icon('check', 22) + '</span>' : '<span class="chip">' + icon('trophy', 14) + ' تحدي اليوم</span>'}</div>
          <p class="mt"><b>${esc(surahName(dt.s))}</b> <span class="muted small">${rangeTxt(dt.from, dt.to)}</span></p>
          <p class="muted small">${done ? 'أحسنت، أنجزت تحدي اليوم بدقة ٨٠٪ فأكثر.' : 'سمّع المقطع دون النظر بدقة ٨٠٪ فأكثر لتُنجز التحدي.'}</p>
          <button class="btn block" data-go="${goUrl(dt.s, dt.from, dt.to, 'mode=ai&display=hidden')}">${icon('mic', 16)} ${done ? 'سمّعه مرة أخرى' : 'ابدأ التحدي'}</button>
        </div>

        <div class="card" data-go="recordings" style="cursor:pointer">
          <b>${icon('mic', 16)} تلاواتي</b>
          <p class="muted small">استمع لتسجيلاتك السابقة وقارنها بالقارئ.</p>
        </div>

        <div class="card">
          <b>اختبر حفظك</b>
          <p class="muted small">بطاقات: تظهر أول كلمات الآية وتكملها بصوتك، من مواضع ضعفك ومراجعاتك المستحقة.</p>
          <button class="btn block" data-act="flash">${icon('mic', 16)} ابدأ الاختبار</button>
        </div>

        <div class="card">
          <b>الآية التالية</b>
          <p class="muted small">تُعرض آية ويُطلب منك تذكّر ما بعدها. ${N(ROUNDS)} أسئلة في كل جولة.</p>
          <button class="btn block" data-act="next">${icon('play', 16)} ابدأ التمرين</button>
        </div>

        <div class="card">
          <b>التلقين</b>
          <p class="muted small">استمع للآية عدة مرات ثم كرّرها بصوتك في وقت الصمت.</p>
          <button class="btn block" data-act="talqin">${icon('repeat', 16)} ابدأ التلقين</button>
        </div>

        <div class="card">
          <b>أوائل الكلمات</b>
          <p class="muted small">يظهر أول حرف من كل كلمة فقط، وعليك إكمال الباقي من حفظك.</p>
          ${picker('fw', { defTo: 5 })}
          <button class="btn block" data-act="first">${icon('eye', 16)} ابدأ</button>
        </div>

        ${weak.length ? `<div class="section-title">مواضع ضعفي</div><div class="list">${weak.map(x => { const ws = words(ayah(x.s, x.a)); return `<div class="list-item" data-go="${goUrl(x.s, x.a, x.a, 'display=first')}">
            <div class="li-main"><b>سورة ${esc(surahName(x.s))}</b> <span class="muted small">· آية ${esc(N(x.a))}</span>
              <div class="li-sub">${(x.words || []).map(w => ws[w - 1]).filter(Boolean).map(w => `<span class="chip quran">${esc(w)}</span>`).join(' ')}</div></div>
            <div class="li-end"><b class="gold">${N(x.n)}</b></div></div>`; }).join('')}</div>
        <p class="muted small">تختفي الكلمة من القائمة بعد تسميعها صحيحة ٣ مرات متتالية</p>` : ''}
        <div class="section-title">أخطائي</div>
        ${groups.length ? `<div class="list">${groups.map((r, i) => `<div class="list-item" data-go="${goUrl(r.s, r.from, r.to, 'mode=ai')}">
            <div class="li-main"><b>${esc(surahName(r.s))}</b> <span class="muted small">${rangeTxt(r.from, r.to)}</span>
              <div class="li-sub">${(r.miss || []).slice(0, 6).map(w => `<span class="chip quran">${esc(w)}</span>`).join(' ') || 'بلا كلمات مسجلة'}</div></div>
            <div class="li-end"><span class="${r.acc < 70 ? '' : 'gold'}">${N(r.acc)}٪</span></div></div>`).join('')}</div>`
          : '<div class="card empty"><div class="gold">' + icon('check', 36) + '</div><p>لا أخطاء تستحق التركيز حالياً. استمر في التسميع.</p></div>'}
        ${cloud.length ? `<div class="section-title mt">أكثر الكلمات التي أخطأت فيها</div><div class="row">${cloud.map(([w, c]) => `<span class="chip quran">${esc(w)} <small class="muted">${N(c)}</small></span>`).join('')}</div>` : ''}`;
      wirePicker(el, 'fw');
      wire({
        flash: () => flashSetup(), next: () => nextSetup(), talqin: () => talqinSetup(),
        first: () => { const p = readPicker(el, 'fw'); if (p) window.noorGo(goUrl(p.s, p.from, p.to, 'display=first')); }
      });
    }

    // ================= NEXT AYAH QUIZ =================
    function nextSetup() {
      killAudio();
      el.innerHTML = `${header('الآية التالية', { back: 'train' })}
        <div class="card">${picker('nq')}<p class="muted small">يلزم أن يشمل المدى آيتين على الأقل.</p>
        <button class="btn block mt" data-act="go">ابدأ الجولة</button></div>`;
      wirePicker(el, 'nq');
      wire({ go: () => {
        const p = readPicker(el, 'nq'); if (!p) return;
        if (p.to - p.from < 1) return toast('اختر مدى من آيتين فأكثر');
        quiz(p);
      } });
    }
    function quiz(p) {
      const st = { n: 0, ok: 0, missed: [], revealed: false, a: 0 };
      const ask = () => {
        st.a = p.from + rnd(p.to - p.from); st.revealed = false; st.n++;
        draw();
      };
      const answer = (ok) => {
        haptic(ok ? 'light' : 'medium');
        if (ok) st.ok++; else st.missed.push(st.a + 1);
        if (st.n >= ROUNDS) return result();
        ask();
      };
      const draw = () => {
        const nx = st.a + 1;
        el.innerHTML = `${header('الآية التالية', { back: 'train' })}
          <div class="row" style="justify-content:space-between"><span class="muted small">السؤال ${N(st.n)} من ${N(ROUNDS)}</span><span class="gold small">${N(st.ok)} صحيحة</span></div>
          <div class="progress mt"><i style="width:${(st.n - 1) / ROUNDS * 100}%"></i></div>
          <div class="card mt"><div class="muted small">${esc(surahName(p.s))} · الآية ${N(st.a)}</div>
            <p class="quran mt" style="font-size:var(--mushaf-size);line-height:2.2">${esc(ayah(p.s, st.a))}</p>
            <div class="center gold mt"><b>ما الآية التالية؟</b></div>
            ${st.revealed ? `<div class="card tight mt"><div class="muted small">الآية ${N(nx)}</div><p class="quran" style="font-size:var(--mushaf-size);line-height:2.2">${esc(ayah(p.s, nx))}</p></div>` : ''}
          </div>
          <div class="row mt">
            <button class="btn ghost" data-go="${goUrl(p.s, nx, nx, 'display=hidden')}">${icon('mic', 16)} سمّعها</button>
            ${st.revealed ? '' : '<button class="btn ghost" data-act="show">اكشف</button>'}
          </div>
          <div class="grid-2 mt"><button class="btn" data-act="yes">عرفتها ✓</button><button class="btn danger" data-act="no">لم أعرفها ✗</button></div>`;
        wire({ show: () => { st.revealed = true; draw(); }, yes: () => answer(true), no: () => answer(false) });
      };
      const result = () => {
        const pct = Math.round(st.ok / ROUNDS * 100);
        el.innerHTML = `${header('نتيجة التمرين', { back: 'train' })}
          <div class="card hero center"><div class="gold">${icon('trophy', 44)}</div>
            <h2>${N(st.ok)} من ${N(ROUNDS)}</h2><p class="muted">${pct >= 80 ? 'ممتاز، حفظ متين.' : pct >= 50 ? 'جيد، يلزمك مزيد من التثبيت.' : 'لا بأس، كرّر المراجعة وستتحسن.'}</p>
            <div class="progress"><i style="width:${pct}%"></i></div></div>
          ${st.missed.length ? `<div class="card"><b>آيات لم تعرفها</b><div class="row mt">${[...new Set(st.missed)].map(a => `<span class="chip">${esc(surahName(p.s))} ${N(a)}</span>`).join('')}</div>
            <button class="btn block mt" data-act="rev">أضف الآيات التي أخطأت فيها للمراجعة</button></div>` : ''}
          <div class="row mt"><button class="btn" data-act="again">جولة جديدة</button><button class="btn ghost" data-act="home">العودة</button></div>`;
        wire({
          again: () => { st.n = 0; st.ok = 0; st.missed = []; ask(); },
          home: () => home(),
          rev: (b) => { let c = 0; for (const a of new Set(st.missed)) if (addReview(p.s, a, a)) c++; toast(c ? `أُضيفت ${N(c)} آية للمراجعة` : 'الآيات مضافة مسبقاً'); b.disabled = true; }
        });
      };
      ask();
    }

    // ================= TALQIN =================
    function talqinSetup() {
      killAudio();
      el.innerHTML = `${header('التلقين', { back: 'train' })}
        <div class="card">${picker('tq', { defTo: 5 })}
          <div class="field"><label>عدد مرات التكرار</label><div class="seg" id="tq-rep">${[1, 3, 5, 7].map((n, i) => `<button data-v="${n}" class="${i === 1 ? 'active' : ''}">${N(n)}</button>`).join('')}</div></div>
          <div class="field"><label>مدة الصمت</label><div class="seg" id="tq-pause">${[['قصيرة', 1], ['متوسطة', 1.6], ['طويلة', 2.4]].map(([l, v], i) => `<button data-v="${v}" class="${i === 1 ? 'active' : ''}">${l}</button>`).join('')}</div></div>
          <p class="muted small">القارئ: ${esc(audio.reciterName())}. يمكن تغييره من الإعدادات.</p>
          <button class="btn block mt" data-act="go">${icon('play', 16)} ابدأ</button></div>`;
      wirePicker(el, 'tq', { s: 1, from: 1, to: Math.min(5, ayahCount(1)) });
      el.querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => { b.onclick = () => { g.querySelectorAll('button').forEach(x => x.classList.remove('active')); b.classList.add('active'); }; }));
      wire({ go: () => {
        const p = readPicker(el, 'tq'); if (!p) return;
        const rep = +el.querySelector('#tq-rep .active').dataset.v, mult = +el.querySelector('#tq-pause .active').dataset.v;
        talqin(p, rep, mult);
      } });
    }
    function talqin(p, rep, mult) {
      const st = { a: p.from, phase: 'idle', paused: false, left: 0, total: 0, rep: 0 };
      const total = p.to - p.from + 1;
      const shell = () => {
        el.innerHTML = `${header('التلقين', { back: 'train' })}
          <div class="row" style="justify-content:space-between"><span class="muted small">${esc(surahName(p.s))}</span><span class="muted small" id="tq-pos"></span></div>
          <div class="progress mt"><i id="tq-bar" style="width:0%"></i></div>
          <div class="card mt center"><div class="muted small" id="tq-state"></div>
            <p class="quran mt" id="tq-text" style="font-size:var(--mushaf-size);line-height:2.2"></p>
            <div class="gold" id="tq-count" style="font-size:1.6em;min-height:1.6em"></div></div>
          <div class="row mt" style="justify-content:center">
            <button class="btn ghost" data-act="pause" id="tq-pb">${icon('pause', 16)} إيقاف مؤقت</button>
            <button class="btn ghost" data-act="skip">التالية</button>
            <button class="btn danger" data-act="stop">${icon('stop', 16)} إنهاء</button></div>`;
        wire({ pause: () => togglePause(), skip: () => advance(), stop: () => talqinSetup() });
      };
      const $ = id => el.querySelector('#tq-' + id);
      const paint = () => {
        if (!$('state')) return;
        $('pos').textContent = `الآية ${N(st.a)} (${N(st.a - p.from + 1)}/${N(total)})`;
        $('bar').style.width = ((st.a - p.from) / total * 100) + '%';
        $('text').textContent = ayah(p.s, st.a);
        if (st.phase === 'listen') { $('state').textContent = `استمع · التكرار ${N(Math.max(1, st.rep))} من ${N(rep)}`; $('count').textContent = ''; }
        else if (st.phase === 'turn') { $('state').textContent = 'دورك الآن 🎙️'; $('count').textContent = N(Math.ceil(st.left)); }
        $('pb').innerHTML = st.paused ? `${icon('play', 16)} متابعة` : `${icon('pause', 16)} إيقاف مؤقت`;
      };
      const advance = () => {
        clearTimer(); st.phase = 'idle'; try { audio.stop(); } catch (e) { /* ignore */ }
        st.paused = false;
        if (st.a >= p.to) return finish();
        st.a++; listen();
      };
      const listen = () => {
        st.phase = 'listen'; st.rep = 0; clearTimer();
        paint();
        audio.playRange(p.s, st.a, st.a, { repeatEach: rep });
      };
      const turn = () => {
        st.phase = 'turn';
        const wc = words(ayah(p.s, st.a)).length || 4;
        st.total = st.left = Math.max(3, Math.ceil(wc * 0.8 * mult));
        paint(); clearTimer();
        timer = setInterval(() => {
          if (!alive || st.paused) return;
          st.left -= 0.25;
          if (st.left <= 0) { clearTimer(); advance(); } else paint();
        }, 250);
      };
      const togglePause = () => {
        st.paused = !st.paused;
        if (st.phase === 'listen') { if (st.paused) audio.pause(); else audio.resume(); }
        paint();
      };
      const finish = () => {
        killAudio();
        el.innerHTML = `${header('انتهى التلقين', { back: 'train' })}
          <div class="card hero center"><div class="gold">${icon('check', 44)}</div><h3>أتممت ${esc(surahName(p.s))} ${rangeTxt(p.from, p.to)}</h3>
          <p class="muted">الآن جرّب أن تسمّعها دون النظر.</p>
          <button class="btn block" data-go="${goUrl(p.s, p.from, p.to, 'mode=ai&display=hidden')}">${icon('mic', 16)} سمّعها الآن</button>
          <button class="btn ghost block mt" data-act="again">إعادة التلقين</button></div>`;
        wire({ again: () => talqinSetup() });
      };
      shell();
      unsub = audio.onAudio(ev => {
        if (!alive || st.phase !== 'listen') return;
        if (ev.type === 'ayah') { st.rep++; paint(); }
        else if (ev.type === 'stop') turn();
        else if (ev.type === 'error') { st.phase = 'idle'; toast('تعذر تشغيل الصوت، تحقق من الاتصال'); talqinSetup(); }
      });
      listen();
    }

    // ================= FLASH-CARD TEST «اختبر حفظك» =================
    let flashCleanup = () => {};
    function flashSetup() {
      killAudio(); flashCleanup();
      const weak = weakAyahs(20).filter(validWeakAyah), due = dueReviews();
      el.innerHTML = `${header('اختبر حفظك', { back: 'train' })}
        <div class="card">
          <label class="row"><input type="checkbox" id="fc-weak" ${weak.length ? 'checked' : 'disabled'}> مواضع ضعفي (${N(weak.length)} آية)</label>
          <label class="row mt"><input type="checkbox" id="fc-due" ${due.length ? 'checked' : 'disabled'}> مراجعات مستحقة (${N(due.length)})</label>
          <label class="row mt"><input type="checkbox" id="fc-sur"> سورة محددة</label>
          <div id="fc-pk" hidden>${picker('fc')}</div>
          <label class="row mt"><input type="checkbox" id="fc-chain"> وضع السلسلة: الانتقال تلقائياً بعد كل إجابة صحيحة</label>
          <p class="muted small">تظهر أول كلمات الآية وتكمل الباقي بصوتك. كل تلميح يخفض درجة البطاقة. يتوقف الاستماع بعد ٣٠ ثانية صمت.</p>
          <button class="btn block mt" data-act="go">${icon('play', 16)} ابدأ</button></div>`;
      wirePicker(el, 'fc');
      const chk = id => el.querySelector('#' + id);
      chk('fc-sur').onchange = () => { el.querySelector('#fc-pk').hidden = !chk('fc-sur').checked; };
      wire({ go: () => {
        const deck = [], push = (s, a, rv) => {
          const ex = deck.find(c => c.s === s && c.a === a);
          if (ex) { if (rv) ex.rv = rv; return; }
          try { if (!ayah(s, a)) return; } catch (e) { return; }
          deck.push({ s, a, rv: rv || null });
        };
        if (chk('fc-weak').checked) for (const x of weak) push(x.s, x.a);
        if (chk('fc-due').checked) for (const r of due) {
          const n = r.to - r.from + 1, pick = n <= 3 ? Array.from({ length: n }, (_, i) => r.from + i) : [r.from, r.from + Math.floor(n / 2), r.to];
          pick.forEach(a => push(r.s, a, r.id));
        }
        if (chk('fc-sur').checked) {
          const p = readPicker(el, 'fc'); if (!p) return;
          const all = []; for (let a = p.from; a <= p.to; a++) all.push(a);
          while (all.length > 15) all.splice(rnd(all.length), 1);
          all.forEach(a => push(p.s, a));
        }
        if (!deck.length) return toast('لا توجد آيات للاختبار، اختر مصدراً');
        for (let i = deck.length - 1; i > 0; i--) { const j = rnd(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        flashRun(deck.slice(0, 20), chk('fc-chain').checked);
      } });
    }

    async function flashRun(deck, chain) {
      let useEngine = engineSupported() && await engineCached();
      if (!alive) return;
      let rec = null, qe = null, mic = false, paused = false, silentSince = Date.now(), lastSig = '';
      let i = 0, card = null, active = false, vw = [], autoTimer = null, gen = 0, timer = null;
      const results = [];
      const lvl = v => { const m = el.querySelector('#fc-mic'); if (m) m.style.setProperty('--lvl', Math.max(0, Math.min(1, v)).toFixed(2)); if (v > 0.06) silentSince = Date.now(); };
      const stopAll = () => {
        clearTimeout(autoTimer); gen++; active = false;
        if (qe) { try { qe.cancel(); } catch (e) { /* ignore */ } }
        if (rec) { rec.stop().catch(() => {}); rec = null; }
        clearInterval(timer); timer = null;
      };
      flashCleanup = stopAll;
      const setStatus = t => { const s = el.querySelector('#fc-st'); if (s) s.textContent = t; };
      const scoreOf = c => c.res === 'wrong' ? 0 : Math.max(0.25, 1 - 0.25 * c.peeks);

      function view() {
        const full = Math.floor(card.peeks / 2), part = card.peeks % 2;
        return card.ws.map((w, k) => k < card.hint ? { w, k: 'hint' }
          : k < card.hint + full ? { w, k: 'peek' }
          : k === card.hint + full && part ? { w: w[0] + '…', k: 'peek' } : { w: '＿＿', k: 'hid' });
      }
      function draw(done) {
        const body = done
          ? card.ws.map((w, k) => `<span class="${k < card.hint ? '' : card.mark[k] === 'bad' ? 'w-bad' : 'w-ok'}">${esc(w)}</span>`).join(' ')
          : view().map(x => `<span class="${x.k === 'hid' ? 'fc-hid' : x.k === 'peek' ? 'fc-peek' : ''}">${esc(x.w)}</span>`).join(' ');
        el.innerHTML = `${header('اختبر حفظك', { back: 'train' })}
          <div class="row" style="justify-content:space-between"><span class="muted small">بطاقة ${N(i + 1)} من ${N(deck.length)}</span><span class="gold small">${N(results.filter(r => r.res === 'ok').length)} صحيحة</span></div>
          <div class="progress mt"><i style="width:${i / deck.length * 100}%"></i></div>
          <div class="card mt"><div class="muted small">${esc(surahName(card.s))} · الآية ${N(card.a)}</div>
            <p class="fc-hint">${body}</p>
            <div class="fc-status muted small" id="fc-st"></div>
            ${done ? `<div class="center"><span class="fc-res ${card.res === 'ok' ? 'ok' : card.res === 'peek' ? 'peek' : 'bad'}">${card.res === 'ok' ? 'صحيح' : card.res === 'peek' ? 'صحيح بتلميح' : 'خطأ'}</span></div>` : useEngine ? `<div class="fc-mic ${mic && !paused ? 'live' : ''}" id="fc-mic" data-act="mic">${icon('mic', 28)}</div>` : ''}
          </div>
          ${done ? `<div class="row mt"><button class="btn" data-act="next">${i + 1 >= deck.length ? 'إنهاء' : 'التالية'}</button></div>`
            : `<div class="row mt" id="fc-act"><button class="btn ghost" data-act="peek">تلميح</button>
              ${useEngine ? '<button class="btn" data-act="fin">انتهيت</button>' : '<button class="btn ghost" data-act="show">أظهر الإجابة</button>'}
              <button class="btn ghost" data-act="skip">تخطَّ</button></div>`}`;
        wire({
          peek: () => { if (card.peeks < (card.ws.length - card.hint) * 2) { card.peeks++; draw(false); if (useEngine) { mic = !paused; const m = el.querySelector('#fc-mic'); if (m && mic) m.classList.add('live'); } } else toast('لا مزيد من الكلمات'); },
          mic: () => toggleMic(), fin: () => finishCard(), skip: () => finishCard('wrong', true),
          show: () => selfGrade(), next: () => advance()
        });
      }
      function selfGrade() {
        el.querySelector('.fc-hint').innerHTML = card.ws.map(w => `<span>${esc(w)}</span>`).join(' ');
        el.querySelector('#fc-act').innerHTML = '<button class="btn" data-act="yes">صحيح ✓</button><button class="btn danger" data-act="no">خطأ ✗</button>';
        wire({ yes: () => finishCard('ok', true), no: () => finishCard('wrong', true) });
      }
      function nextCard() {
        const c = deck[i], ws = words(ayah(c.s, c.a));
        card = { ...c, ws, hint: Math.min(ws.length <= 3 ? 1 : ws.length <= 6 ? 2 : 3, Math.max(1, ws.length - 1)), peeks: 0, res: '', mark: [] };
        draw(false);
        if (useEngine) armMic();
      }
      // one engine session per card; the recorder stays open between cards
      async function armMic() {
        const my = ++gen; vw = []; paused = false; active = false; silentSince = Date.now(); lastSig = '';
        try {
          if (!rec) {
            setStatus('جارٍ تجهيز المحرك القرآني…');
            const r = await startRecorder({
              onPcm: p => { if (active && !paused && qe) qe.pcm(p); },
              onLevel: lvl,
              onError: e => { toast(e === 'permission' ? 'اسمح للتطبيق باستخدام الميكروفون' : 'تعذر تسجيل الصوت'); fallbackManual(); }
            });
            if (!r) return fallbackManual();
            if (!alive || my !== gen) { r.stop().catch(() => {}); return; }
            rec = r;
          }
          qe = qe || await openEngine();
          if (!alive || my !== gen) return;
          qe.start(card.s, card.a, card.a, {
            onVerdicts: w => { if (my === gen && active) { vw = w; check(false); } },
            onError: () => { if (my === gen) { toast('توقف المحرك — استخدم التقييم الذاتي'); fallbackManual(); } }
          });
          active = true; mic = true;
          const m = el.querySelector('#fc-mic'); if (m) m.classList.add('live');
          setStatus('أسمعك… أكمل الآية');
          clearInterval(timer);
          timer = setInterval(() => {
            if (!active || paused) return;
            if (Date.now() - silentSince > 30000) { paused = true; mic = false; const m2 = el.querySelector('#fc-mic'); if (m2) m2.classList.remove('live'); setStatus('توقف الاستماع لعدم سماع صوت — اضغط الميكروفون للمتابعة'); }
          }, 1000);
        } catch (e) { if (alive && my === gen) { toast('تعذّر تشغيل المحرك القرآني — استخدم التقييم الذاتي'); fallbackManual(); } }
      }
      function fallbackManual() {
        useEngine = false; stopAll(); flashCleanup = stopAll;
        if (card && !card.res) draw(false);
      }
      function toggleMic() {
        if (!paused) return;
        paused = false; mic = true; silentSince = Date.now();
        const m = el.querySelector('#fc-mic'); if (m) m.classList.add('live');
        setStatus('أسمعك… أكمل الآية');
      }
      // judge the words after the hint (and the fully revealed ones): 'ok' | 'bad' | null while still pending
      function judge(final) {
        const n = card.ws.length, from = card.hint + Math.floor(card.peeks / 2);
        const m = mapVerdicts(vw, [{ a: card.a, start: 0, end: n }], qe ? qe.counts() : {});
        let ok = 0, bad = 0, pend = 0; card.mark = [];
        for (let k = from; k < n; k++) {
          const v = m.get(k);
          if (!v || v.st === 'pending') { pend++; card.mark[k] = 'bad'; }
          else if (v.st === 'wrong' || v.st === 'skipped') { bad++; card.mark[k] = 'bad'; }
          else { ok++; card.mark[k] = 'ok'; }
        }
        const total = n - from;
        if (total <= 0) return 'ok';
        if (!final && pend) { const sig = ok + '/' + bad; if (sig !== lastSig) { lastSig = sig; silentSince = Date.now(); } return null; }
        return (bad + pend) / total <= 0.15 ? 'ok' : 'bad';
      }
      function check(final) { const j = judge(final); if (j) finishCard(j === 'ok' ? 'ok' : 'wrong'); }
      async function finishCard(res, manual) {
        if (!card || card.res || card.busy) return;
        if (useEngine && !manual) {
          if (!res) {                                  // «انتهيت»: take the engine's final verdicts
            card.busy = true; active = false;
            try { vw = await qe.stop(); } catch (e) { /* ignore */ }
            card.busy = false;
            if (!alive) return;
            res = judge(true) === 'ok' ? 'ok' : 'wrong';
          } else if (res === 'ok') { try { qe.cancel(); } catch (e) { /* ignore */ } }
        }
        if (useEngine && manual && qe) { try { qe.cancel(); } catch (e) { /* ignore */ } }
        gen++; active = false; clearInterval(timer); timer = null;
        if (res === 'ok' && card.peeks) res = 'peek';
        card.res = res;
        if (manual) card.mark = card.ws.map(() => (res === 'wrong' ? 'bad' : 'ok'));
        results.push(card);
        haptic(res === 'wrong' ? 'medium' : 'light');
        // word history: revealed words count as hints, the rest ok/wrong; wrong ayah joins the review list
        const items = [];
        card.ws.forEach((_, k) => {
          if (k < card.hint) return;
          if (k - card.hint < Math.ceil(card.peeks / 2)) items.push({ a: card.a, w: k + 1, kind: 'hint' });
          else items.push({ a: card.a, w: k + 1, kind: card.mark[k] === 'bad' ? 'wrong' : 'ok' });
        });
        try { recordWords(card.s, items); } catch (e) { /* ignore */ }
        if (res === 'wrong') addReview(card.s, card.a, card.a);
        draw(true);
        if (chain && res === 'ok') { setStatus('أحسنت — التالية…'); autoTimer = setTimeout(() => { if (alive && card && card.res === 'ok') advance(); }, 1200); }
      }
      function advance() {
        clearTimeout(autoTimer);
        if (++i >= deck.length) return summary();
        nextCard();
      }
      function summary() {
        stopAll(); flashCleanup = () => {};
        // grade each review in the deck once: all perfect -> 2, any wrong -> 0, else 1
        const byRv = new Map();
        for (const c of results) if (c.rv) { if (!byRv.has(c.rv)) byRv.set(c.rv, []); byRv.get(c.rv).push(c); }
        for (const [id, cs] of byRv) gradeReview(id, cs.some(c => c.res === 'wrong') ? 0 : cs.every(c => c.res === 'ok') ? 2 : 1);
        const pts = results.reduce((a, c) => a + scoreOf(c), 0), pct = Math.round(pts / deck.length * 100);
        const weakest = results.filter(c => c.res !== 'ok').sort((x, y) => scoreOf(x) - scoreOf(y)).slice(0, 6);
        el.innerHTML = `${header('نتيجة الاختبار', { back: 'train' })}
          <div class="card hero center"><div class="gold">${icon('trophy', 44)}</div>
            <h2>${N(pct)}٪</h2>
            <p class="muted">${N(results.filter(r => r.res === 'ok').length)} صحيحة · ${N(results.filter(r => r.res === 'peek').length)} بتلميح · ${N(results.filter(r => r.res === 'wrong').length)} خاطئة من ${N(deck.length)}</p>
            <div class="progress"><i style="width:${pct}%"></i></div></div>
          ${weakest.length ? `<div class="card"><b>أضعف الآيات</b><div class="list mt">${weakest.map(c => `<div class="list-item" data-go="${goUrl(c.s, c.a, c.a, 'display=first')}"><div class="li-main"><b>${esc(surahName(c.s))}</b> <span class="muted small">آية ${N(c.a)}</span></div><div class="li-end"><span class="fc-res ${c.res === 'peek' ? 'peek' : 'bad'}">${c.res === 'peek' ? 'تلميح' : 'خطأ'}</span></div></div>`).join('')}</div></div>` : ''}
          <div class="row mt"><button class="btn" data-act="again">اختبار جديد</button><button class="btn ghost" data-act="home">العودة</button></div>`;
        wire({ again: () => flashSetup(), home: () => home() });
      }
      nextCard();
    }

    home();
    return () => { alive = false; killAudio(); flashCleanup(); };
  }
};
