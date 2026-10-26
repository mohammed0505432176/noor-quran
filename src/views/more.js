// "More" menu.
import { S, save, dueReviews } from '../core/store.js';
import { esc, icon, toast, sheet, header, N } from '../ui.js';

// [route, icon, title, subtitle, tint]
const GROUPS = [
  ['التعلّم والحفظ', [
    ['ai', 'spark', 'المساعد الذكي', 'اسأل عن معاني الآيات', 'e'],
    ['train', 'trophy', 'مركز التدريب', 'تلقين، الآية التالية، أخطائي، تحدّي اليوم', 'd'],
    ['hifz', 'book', 'متابعة الحفظ', 'خريطة صفحاتك وأهدافك', 'b'],
    ['review', 'brain', 'المراجعة', 'ثبّت حفظك بالتكرار المتباعد', 'a'],
    ['search', 'search', 'البحث في المصحف', 'ابحث بكلمة أو عبارة', 'c']
  ]],
  ['العبادة', [
    ['azkar', 'hands', 'الأذكار', 'أذكار الصباح والمساء', 'b'],
    ['tasbeeh', 'beads', 'المسبحة', 'عدّاد التسبيح', 'a'],
    ['qibla', 'compass', 'القبلة', 'اتجاه الكعبة المشرفة', 'c']
  ]],
  ['تقدّمك والعائلة', [
    ['stats', 'chart', 'تقاريري وإنجازاتي', 'تابع تقدمك وأوسمتك', 'b'],
    ['family', 'home', 'دائرة العائلة', 'لوحة الأهل وتنافس لطيف', 'd']
  ]],
  ['التطبيق', [
    ['settings', 'gear', 'الإعدادات', 'الهدف والخط والبيانات', 'c']
  ]]
];

async function shareApp() {
  const text = 'حمّل تطبيق نور الحياة للقرآن الكريم 🌙';
  const url = 'https://github.com/mohammed0505432176/noor-quran/releases/latest';
  try {
    if (navigator.share) { await navigator.share({ title: 'نور الحياة', text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('تم نسخ رابط التطبيق'); }
  catch (e) { toast('تعذرت المشاركة'); }
}

export default {
  render(el) {
    const due = dueReviews().length;
    const row = ([r, ic, t, sub, c]) => `
      <button class="list-item" data-go="${r}">
        <span class="hm-ic sm" style="--t:var(--tint-${c})">${icon(ic, 20)}</span>
        <span class="li-main">${t}<span class="li-sub">${sub}</span></span>
        <span class="li-end">${r === 'review' && due ? `<span class="chip active small" style="min-height:26px;padding:0 10px">${N(due)}</span>` : ''}${icon('back', 18)}</span>
      </button>`;
    const draw = () => {
      const name = (S.profile.name || '').trim();
      el.innerHTML = `${header('المزيد')}
        <div class="card tight"><div class="row" style="align-items:center;flex-wrap:nowrap">
          <span class="num-diamond">${esc((name || 'ن').slice(0, 1))}</span>
          <div style="flex:1;min-width:0"><b>${name ? esc(name) : 'مرحباً بك'}</b><div class="muted small">${name ? 'حسابك على هذا الجهاز' : 'أضف اسمك ليظهر في الرئيسية'}</div></div>
          <button class="btn sm ghost" id="name">${name ? 'تعديل' : 'إضافة الاسم'}</button></div></div>
        <button class="k-entry mt" data-go="kids"><span class="k-entry-art"><img class="k-art" src="${import.meta.env.BASE_URL}kids/img/mascot.webp" alt=""></span>
          <span style="flex:1"><b>ركن الأطفال ✨</b><small>أذكار وحروف وسور وألعاب بأصوات حقيقية</small></span></button>
        ${GROUPS.map(([title, items]) => `<div class="more-sec">${title}</div><div class="list">${items.map(row).join('')}</div>`).join('')}
        <div class="center mt"><div class="gold" style="font-family:var(--font-display);font-size:1.2rem">نور الحياة ١٫٠</div>
          <div class="muted small mt">صدقة جارية — شاركه مع أهلك</div>
          <button class="btn sm ghost mt" id="share">${icon('send', 16)} شارك التطبيق</button></div>`;
      el.querySelector('#share').onclick = shareApp;
      el.querySelector('#name').onclick = () => {
        const sh = sheet(`<h3>اسمك</h3><div class="field"><input class="input" id="n-in" maxlength="30" placeholder="مثال: محمد" value="${esc(S.profile.name)}"></div>
          <button class="btn block mt" id="n-ok">حفظ</button>`);
        const inp = sh.querySelector('#n-in');
        setTimeout(() => inp.focus(), 280);
        const ok = () => { S.profile.name = inp.value.trim(); save(); sh.close(); toast('تم الحفظ'); draw(); };
        sh.querySelector('#n-ok').onclick = ok;
        inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
      };
    };
    draw();
  }
};
