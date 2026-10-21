// "More" menu.
import { S, save, dueReviews } from '../core/store.js';
import { esc, icon, toast, sheet, header, N } from '../ui.js';

const TILES = [
  ['ai', 'spark', 'المساعد الذكي', 'اسأل عن معاني الآيات'],
  ['train', 'trophy', 'مركز التدريب', 'تلقين، الآية التالية، أخطائي، تحدّي اليوم'],
  ['family', 'home', 'دائرة العائلة', 'لوحة الأهل وتنافس لطيف'],
  ['review', 'brain', 'المراجعة', 'ثبّت حفظك بالتكرار المتباعد'],
  ['stats', 'chart', 'تقاريري وإنجازاتي', 'تابع تقدمك وأوسمتك'],
  ['azkar', 'hands', 'الأذكار', 'أذكار الصباح والمساء'],
  ['tasbeeh', 'beads', 'المسبحة', 'عدّاد التسبيح'],
  ['qibla', 'compass', 'القبلة', 'اتجاه الكعبة المشرفة'],
  ['search', 'search', 'البحث في المصحف', 'ابحث بكلمة أو عبارة'],
  ['settings', 'gear', 'الإعدادات', 'الهدف والخط والبيانات']
];

async function shareApp() {
  const text = 'حمّل تطبيق نور للقرآن الكريم 🌙';
  const url = 'https://github.com/mohammed0505432176/noor-quran/releases/latest';
  try {
    if (navigator.share) { await navigator.share({ title: 'نور', text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('تم نسخ رابط التطبيق'); }
  catch (e) { toast('تعذرت المشاركة'); }
}

export default {
  render(el) {
    const due = dueReviews().length;
    const draw = () => {
      const name = (S.profile.name || '').trim();
      el.innerHTML = `${header('المزيد')}
        <div class="card tight"><div class="row" style="align-items:center">
          <span class="num-diamond">${esc((name || 'ن').slice(0, 1))}</span>
          <div style="flex:1"><b>${name ? esc(name) : 'مرحباً بك'}</b><div class="muted small">${name ? 'حسابك على هذا الجهاز' : 'أضف اسمك ليظهر في الرئيسية'}</div></div>
          <button class="btn sm ghost" id="name">${name ? 'تعديل' : 'إضافة الاسم'}</button></div></div>
        <div class="grid-2 mt">${TILES.map(([r, ic, t, sub]) => `
          <button class="card" data-go="${r}" style="cursor:pointer;text-align:start;position:relative">
            <span class="gold">${icon(ic, 30)}</span>
            ${r === 'review' && due ? `<span class="chip active small" style="position:absolute;top:10px;inset-inline-end:10px">${N(due)}</span>` : ''}
            <div style="font-weight:700;margin-top:.5rem">${t}</div><div class="muted small">${sub}</div></button>`).join('')}</div>
        <div class="center mt"><div class="gold" style="font-family:var(--font-display);font-size:1.2rem">نور ١٫٠</div>
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
