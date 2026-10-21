// دائرة العائلة — family circle board.
import '../styles/family.css';
import { S } from '../core/store.js';
import { errText } from '../core/cloud.js';
import { getFamily, createFamily, joinFamily, leaveFamily, board, syncNow, startFamilySync } from '../core/family.js';
import { esc, icon, toast, sheet, header, N } from '../ui.js';

const APP_URL = 'https://github.com/mohammed0505432176/noor-quran/releases/latest';
const GOAL_KEY = 'noor.family.goal';
const TABS = [
  ['week', 'هذا الأسبوع', 'آية', m => m.week],
  ['streak', 'السلسلة', 'يوم', m => m.streak],
  ['acc', 'الإتقان', '٪', m => m.acc],
  ['pts', 'النقاط', 'نقطة', m => m.pts]
];
const MEDALS = ['🥇', '🥈', '🥉'];

const num = x => Math.max(0, +x || 0);
function stats(m) { const s = (m && m.stats) || {}; return { week: num(s.week), today: num(s.today), streak: num(s.streak), acc: num(s.acc), rec: num(s.rec), pts: num(s.pts), level: String(s.level || ''), total: num(s.total) }; }

export function rankMembers(members, tab) {
  const get = (TABS.find(t => t[0] === tab) || TABS[0])[3];
  return members.map(m => ({ m, s: stats(m) }))
    .filter(x => tab !== 'acc' || x.s.rec > 0)
    .sort((a, b) => get(b.s) - get(a.s) || b.s.week - a.s.week || String(a.m.name).localeCompare(String(b.m.name), 'ar'));
}

function ago(iso) {
  const t = Date.parse(iso); if (!t) return 'لم يسجّل نشاطاً بعد';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'آخر نشاط: الآن';
  const m = Math.floor(s / 60); if (m < 60) return `آخر نشاط: قبل ${N(m)} د`;
  const h = Math.floor(m / 60); if (h < 24) return `آخر نشاط: قبل ${N(h)} س`;
  const d = Math.floor(h / 24); return d === 1 ? 'آخر نشاط: أمس' : `آخر نشاط: قبل ${N(d)} أيام`;
}

function getGoalPer() { try { const v = parseInt(localStorage.getItem(GOAL_KEY), 10); return v > 0 ? v : 70; } catch (e) { return 70; } }
function setGoalPer(v) { try { localStorage.setItem(GOAL_KEY, String(v)); } catch (e) {} }

async function shareCode(f) {
  const text = `انضم لدائرة عائلتنا في تطبيق نور 🌙 الرمز: ${f.code}`;
  try { if (navigator.share) { await navigator.share({ title: 'دائرة العائلة', text, url: APP_URL }); return; } }
  catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${APP_URL}`); toast('تم نسخ الدعوة'); } catch (e) { toast('تعذرت المشاركة'); }
}
async function copyCode(f) {
  try { await navigator.clipboard.writeText(f.code); toast('تم نسخ الرمز'); } catch (e) { toast('تعذّر النسخ'); }
}

function joinedHtml(f) {
  return `${header('دائرة العائلة', { back: 'more', actions: `<button class="icon-btn" id="fam-ref" aria-label="تحديث">${icon('repeat', 20)}</button>` })}
    <div class="card hero">
      <div class="fam-name">${esc(f.name || 'عائلتي')}</div>
      <div class="muted small center mb">رمز الدائرة — شاركه مع أهلك</div>
      <div class="fam-code-box"><div class="fam-code" dir="ltr">${esc(f.code)}</div></div>
      <div class="row mt" style="justify-content:center">
        <button class="btn sm ghost" id="fam-copy">نسخ الرمز</button>
        <button class="btn sm" id="fam-share">${icon('send', 16)} مشاركة</button>
      </div>
    </div>
    <div id="fam-body" class="mt"><div class="card empty"><div class="muted">جارٍ تحميل اللوحة…</div></div></div>
    <div class="center mt"><button class="btn sm ghost danger" id="fam-leave">مغادرة الدائرة</button></div>`;
}

function boardHtml(members, tab) {
  const t = TABS.find(x => x[0] === tab);
  const ranked = rankMembers(members, tab);
  const totalWeek = members.reduce((a, m) => a + stats(m).week, 0);
  const per = getGoalPer(), goal = per * Math.max(1, members.length);
  const pct = Math.min(100, Math.round(totalWeek / goal * 100));
  const line = pct >= 100 ? 'ما شاء الله! حققتم هدف العائلة هذا الأسبوع 🌟'
    : pct >= 70 ? 'اقتربتم من الهدف، بارك الله في جهدكم' : pct >= 30 ? 'بداية طيبة، واصلوا معاً' : 'ابدأوا الأسبوع بوردٍ يسير، فالقليل الدائم خير';
  const rows = ranked.length ? ranked.map(({ m, s }, i) => {
    const sub = tab === 'week'
      ? [`اليوم ${N(s.today)}`, `سلسلة ${N(s.streak)}`]
      : tab === 'streak' ? [`هذا الأسبوع ${N(s.week)}`] : tab === 'acc' ? [`${N(s.rec)} تسميع`] : [`هذا الأسبوع ${N(s.week)}`];
    const rank = i < 3 ? `<div class="fam-rank">${MEDALS[i]}</div>` : `<div class="fam-rank n">${N(i + 1)}</div>`;
    return `<div class="fam-row ${i < 3 ? 'r' + (i + 1) : ''} ${m.me ? 'me' : ''}">${rank}
      <div class="fam-main"><div class="fam-who"><b>${esc(m.name)}</b>${m.me ? '<span class="fam-me">أنت</span>' : ''}</div>
        <div class="fam-sub"><span>${esc(s.level || '—')}</span>${sub.map(x => `<span>${x}</span>`).join('')}</div>
        <div class="fam-sub"><span>${ago(m.updated_at)}</span></div></div>
      <div class="fam-metric"><b>${N(t[3](s))}</b><span>${t[2]}</span></div></div>`;
  }).join('') : `<div class="card empty"><div class="muted">لا توجد بيانات بعد لهذا الترتيب</div></div>`;
  return `<div class="card">
      <div class="fam-goal-line"><b>هدف العائلة الأسبوعي</b><button class="chip small" id="fam-goal" aria-label="تعديل الهدف">${N(per)} للفرد ✎</button></div>
      <div class="progress mt"><i style="width:${pct}%"></i></div>
      <div class="fam-goal-line mt"><span class="muted small">${N(totalWeek)} من ${N(goal)} آية</span><b class="gold">${N(pct)}٪</b></div>
      <div class="small mt">${line}</div></div>
    <div class="seg mt" role="tablist">${TABS.map(x => `<button role="tab" class="${x[0] === tab ? 'active' : ''}" data-tab="${x[0]}">${x[1]}</button>`).join('')}</div>
    <div class="fam-board">${rows}</div>`;
}

export default {
  render(el) {
    let alive = true, tab = 'week', members = [];
    const draw = () => { alive && (getFamily() ? drawJoined() : drawJoin()); };

    function drawJoin() {
      const nm = esc((S.profile.name || '').trim());
      el.innerHTML = `${header('دائرة العائلة', { back: 'more' })}
        <div class="card hero center"><div class="gold">${icon('home', 34)}</div>
          <p style="margin:.5rem 0 0">اقرأوا معاً وتنافسوا بلطف: لوحة عائلية تُظهر وردكم الأسبوعي وسلاسلكم وإتقانكم.</p></div>
        <div class="card mt"><div class="section-title">إنشاء دائرة</div>
          <div class="field"><label for="c-fam">اسم العائلة</label><input class="input" id="c-fam" maxlength="30" placeholder="مثال: عائلة الأحمد"></div>
          <div class="field mt"><label for="c-me">اسمك</label><input class="input" id="c-me" maxlength="30" value="${nm}" placeholder="اسمك أمام العائلة"></div>
          <div class="muted small mt" id="c-err" role="alert"></div>
          <button class="btn block mt" id="c-ok">إنشاء الدائرة</button></div>
        <div class="card mt"><div class="section-title">الانضمام بالرمز</div>
          <div class="field"><label for="j-code">رمز الدائرة (٦ خانات)</label><input class="input fam-input-code" id="j-code" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="XXXXXX" dir="ltr"></div>
          <div class="field mt"><label for="j-me">اسمك</label><input class="input" id="j-me" maxlength="30" value="${nm}" placeholder="اسمك أمام العائلة"></div>
          <div class="muted small mt" id="j-err" role="alert"></div>
          <button class="btn block ghost mt" id="j-ok">انضمام</button></div>`;
      const code = el.querySelector('#j-code');
      code.oninput = () => { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
      const run = async (btn, errEl, fn, label) => {
        errEl.textContent = ''; btn.disabled = true; btn.textContent = 'جارٍ الاتصال…';
        try { await fn(); if (!alive) return; startFamilySync(); toast('أهلاً بك في الدائرة'); draw(); }
        catch (e) { if (!alive) return; errEl.textContent = (e && e.code) ? errText(e) : 'تعذّر إتمام الطلب، تحقق من الرمز وحاول مجدداً'; errEl.style.color = 'var(--bad)'; btn.disabled = false; btn.textContent = label; }
      };
      el.querySelector('#c-ok').onclick = e => {
        const n = el.querySelector('#c-fam').value.trim(), me = el.querySelector('#c-me').value.trim();
        const err = el.querySelector('#c-err');
        if (!n || !me) { err.textContent = 'أدخل اسم العائلة واسمك'; err.style.color = 'var(--bad)'; return; }
        run(e.currentTarget, err, () => createFamily(n, me), 'إنشاء الدائرة');
      };
      el.querySelector('#j-ok').onclick = e => {
        const c = code.value.trim(), me = el.querySelector('#j-me').value.trim();
        const err = el.querySelector('#j-err');
        if (c.length !== 6 || !me) { err.textContent = 'أدخل الرمز المكوّن من ٦ خانات واسمك'; err.style.color = 'var(--bad)'; return; }
        run(e.currentTarget, err, () => joinFamily(c, me), 'انضمام');
      };
    }

    function drawBody() {
      const body = el.querySelector('#fam-body'); if (!body) return;
      body.innerHTML = boardHtml(members, tab);
      body.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; drawBody(); });
      body.querySelector('#fam-goal').onclick = () => {
        const sh = sheet(`<h3>هدف الفرد الأسبوعي</h3><div class="muted small mb">عدد الآيات التي يطمح كل فرد لقراءتها في الأسبوع (محفوظ على جهازك).</div>
          <div class="field"><input class="input" id="g-in" type="number" inputmode="numeric" min="1" max="2000" value="${getGoalPer()}"></div>
          <button class="btn block mt" id="g-ok">حفظ</button>`);
        sh.querySelector('#g-ok').onclick = () => {
          const v = parseInt(sh.querySelector('#g-in').value, 10);
          if (!(v > 0)) { toast('أدخل رقماً صحيحاً'); return; }
          setGoalPer(Math.min(2000, v)); sh.close(); drawBody();
        };
      };
    }

    async function load() {
      const body = el.querySelector('#fam-body'); const ref = el.querySelector('#fam-ref');
      if (ref) ref.classList.add('fam-spin');
      try {
        await syncNow().catch(() => {});
        const r = await board();
        if (!alive) return;
        if (!r.family) { toast('لم تعد عضواً في هذه الدائرة'); draw(); return; }
        members = r.members; drawBody();
      } catch (e) {
        if (!alive || !body) return;
        body.innerHTML = `<div class="card fam-msg"><div class="muted">${esc(errText(e))}</div><button class="btn sm mt" id="fam-retry">إعادة المحاولة</button></div>`;
        body.querySelector('#fam-retry').onclick = () => { body.innerHTML = '<div class="card empty"><div class="muted">جارٍ التحميل…</div></div>'; load(); };
      } finally { const rr = el.querySelector('#fam-ref'); rr && rr.classList.remove('fam-spin'); }
    }

    function drawJoined() {
      const f = getFamily();
      el.innerHTML = joinedHtml(f);
      el.querySelector('#fam-copy').onclick = () => copyCode(f);
      el.querySelector('#fam-share').onclick = () => shareCode(f);
      el.querySelector('#fam-ref').onclick = load;
      el.querySelector('#fam-leave').onclick = () => {
        const sh = sheet(`<h3>مغادرة الدائرة؟</h3><p class="muted">ستختفي من لوحة «${esc(f.name || 'العائلة')}» ويمكنك العودة لاحقاً بالرمز.</p>
          <div id="lv-err" class="small" style="color:var(--bad)" role="alert"></div>
          <div class="row mt"><button class="btn danger" id="lv-ok" style="flex:1">مغادرة</button><button class="btn ghost" id="lv-no" style="flex:1">إلغاء</button></div>`);
        sh.querySelector('#lv-no').onclick = () => sh.close();
        sh.querySelector('#lv-ok').onclick = async e => {
          const b = e.currentTarget; b.disabled = true;
          try { await leaveFamily(); sh.close(); toast('غادرت الدائرة'); draw(); }
          catch (err) { b.disabled = false; sh.querySelector('#lv-err').textContent = errText(err); }
        };
      };
      load();
    }

    startFamilySync();
    draw();
    return () => { alive = false; };
  }
};
