// Settings.
import { S, save, updateSettings, exportData, importData, resetAll } from '../core/store.js';
import { esc, icon, toast, sheet, header, N } from '../ui.js';
import { cloudStatus } from '../core/cloud.js';

const FALLBACK_RECITERS = [{ id: 'Alafasy_128kbps', name: 'مشاري العفاسي' }];
const PREVIEW = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([v, t]) => `<button data-v="${v}" class="${v === cur ? 'active' : ''}">${t}</button>`).join('')}</div>`;

// Providers served by the noor-ai backend: [status key, label, role].
const PROVIDERS = [
  ['gemini', 'Gemini', 'فهم الصوت وتقييم التجويد والمحادثة'],
  ['groq', 'Groq', 'Whisper لتسميع دقيق + محادثة سريعة'],
  ['nvidia', 'NVIDIA NIM', 'DeepSeek وQwen وLlama وKimi مجاناً'],
  ['cerebras', 'Cerebras', 'محادثة فائقة السرعة'],
  ['openrouter', 'OpenRouter', 'نماذج مجانية متعددة'],
  ['mistral', 'Mistral', 'محادثة'],
  ['cloudflare', 'Cloudflare AI', 'محادثة + Whisper احتياطي للتسميع'],
  ['cohere', 'Cohere', 'احتياطي أخير (١٠٠٠ طلب شهرياً)'],
  ['pollinations', 'Pollinations', 'احتياطي بلا مفتاح']
];
const STT_NAMES = { 'whisper-large-v3': 'Whisper large-v3', 'whisper-large-v3-turbo': 'Whisper turbo (Cloudflare)', gemini: 'Gemini', 'quran-whisper': 'Whisper المتخصص بالقرآن' };

/** Status card body for a cloudStatus() result (never throws; r may be { ok:false }). */
function statusHtml(r) {
  const ok = !!(r && r.ok);
  const p = (r && r.providers) || {};
  const lim = (r && r.limits) || {};
  const stt = STT_NAMES[r && r.sttEngine] || (r && r.sttEngine) || 'غير متاح';
  const dot = `<span style="display:inline-block;width:.7rem;height:.7rem;border-radius:50%;background:${ok ? 'var(--ok)' : 'var(--bad)'}"></span>`;
  return `<div class="row" style="align-items:center;gap:.5rem">${dot}<b>${ok ? 'متصل' : 'غير متصل'}</b></div>
    ${ok ? '' : '<p class="muted small">الخادم غير متاح الآن، سيُستخدم البديل المجاني</p>'}
    <ul class="list mt">${PROVIDERS.map(([k, n, d]) => `<li class="list-item">
      <span class="li-start" style="color:${p[k] ? 'var(--ok)' : 'var(--muted)'}">${p[k] ? icon('check', 18) : '—'}</span>
      <div class="li-main">${esc(n)}</div><div class="li-sub">${esc(d)}</div></li>`).join('')}</ul>
    <p class="small mt">محرك التسميع: ${esc(stt)}</p>
    ${lim.chat != null ? `<p class="small muted">الحد اليومي: ${N(lim.chat)} محادثة / ${N(lim.tajweed ?? 0)} تجويد</p>` : ''}`;
}

const ADD_PROVIDER_HTML = `<h3>إضافة مزود جديد</h3>
  <p class="muted small">كل مزود يتفعّل بإضافة مفتاحه المجاني في خادم نور فقط — لا يُخزَّن داخل التطبيق ولا يلزم تحديثه.</p>
  <ol style="padding-inline-start:1.3rem;line-height:1.9;margin:.6rem 0">
    <li>احصل على المفتاح (كلها بلا بطاقة):<br>
      <b>NVIDIA</b>: <span dir="ltr">build.nvidia.com</span> → Get API Key → السر <b dir="ltr">NVIDIA_API_KEY</b><br>
      <b>Cloudflare</b>: <span dir="ltr">dash.cloudflare.com</span> → AI → Workers AI → Use REST API → أنشئ Token وانسخ Account ID → السران <b dir="ltr">CLOUDFLARE_API_TOKEN</b> و<b dir="ltr">CLOUDFLARE_ACCOUNT_ID</b><br>
      <b>Mistral</b>: <span dir="ltr">console.mistral.ai</span> (خطة Experiment) → السر <b dir="ltr">MISTRAL_API_KEY</b><br>
      <b>Cohere</b>: <span dir="ltr">dashboard.cohere.com</span> → API Keys (Trial) → السر <b dir="ltr">COHERE_API_KEY</b></li>
    <li>افتح <span dir="ltr">supabase.com/dashboard</span> ثم المشروع <b dir="ltr">ibrahim-assistant</b> ← Edge Functions ← Secrets ← Add new secret</li>
    <li>اكتب اسم السر كما هو بالأحرف الكبيرة والصق المفتاح، ثم Save</li>
    <li>يتفعّل خلال دقيقة؛ اضغط «تحديث الحالة» هنا للتأكد</li>
  </ol>
  <button class="btn ghost block mt" id="ai-add-ok">حسناً</button>`;

export default {
  async render(el) {
    let reciters = FALLBACK_RECITERS;
    try { const a = await import('../core/audio.js'); if (Array.isArray(a.RECITERS) && a.RECITERS.length) reciters = a.RECITERS; } catch (e) { /* fallback */ }

    const loadStatus = (force = false) => {
      const box = el.querySelector('#ai-card'); if (!box) return;
      if (force) box.innerHTML = '<p class="muted small">جارٍ تحديث الحالة…</p>';
      cloudStatus({ force }).then(r => { if (box.isConnected) box.innerHTML = statusHtml(r); });
    };

    const draw = () => {
      const s = S.settings, ai = s.ai;
      el.innerHTML = `${header('الإعدادات', { back: 'more' })}
        <div class="card"><div class="section-title">الحساب</div>
          <div class="field"><label for="s-name">الاسم</label><input class="input" id="s-name" maxlength="30" value="${esc(S.profile.name)}" placeholder="اسمك"></div></div>

        <div class="card mt"><div class="section-title">القراءة</div>
          <div class="field"><label>الهدف اليومي (آيات)</label>
            <div class="row" style="align-items:center;justify-content:center;gap:1rem">
              <button class="icon-btn" id="g-minus" aria-label="إنقاص">${icon('minus')}</button>
              <b id="g-val" style="font-size:1.6rem;min-width:3ch;text-align:center">${N(s.goal)}</b>
              <button class="icon-btn" id="g-plus" aria-label="زيادة">${icon('plus')}</button></div></div>
          <div class="field"><label for="s-font">حجم خط المصحف: <span id="f-val">${N(s.fontSize)}</span></label>
            <input type="range" id="s-font" min="22" max="44" step="1" value="${s.fontSize}" style="width:100%">
            <p class="quran center" id="f-prev" style="font-size:${s.fontSize}px;line-height:2">${PREVIEW}</p></div>
          <div class="field"><label for="s-rec">القارئ</label>
            <select class="select" id="s-rec">${reciters.map(r => `<option value="${esc(r.id)}"${r.id === s.reciter ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
          <div class="field"><label>المظهر</label>${seg('s-theme', [['auto', 'تلقائي'], ['dark', 'داكن'], ['light', 'فاتح']], s.theme)}</div></div>

        <div class="card mt"><div class="section-title">الذكاء الاصطناعي</div>
          <div id="ai-card" style="margin-bottom:.8rem"><p class="muted small">جارٍ فحص الخدمات…</p></div>
          <div class="row"><button class="btn sm ghost" id="ai-refresh">تحديث الحالة</button></div>
          <div class="field mt"><label>المزوّد</label>${seg('s-prov', [['auto', 'تلقائي (خادم نور)'], ['free', 'مجاني بديل'], ['custom', 'مخصص']], ai.provider)}</div>
          ${ai.provider === 'custom' ? `
            <div class="field"><label for="ai-url">Base URL</label><input class="input" id="ai-url" dir="ltr" placeholder="https://example.com/v1" value="${esc(ai.baseUrl)}"></div>
            <div class="field"><label for="ai-key">API Key</label><input class="input" id="ai-key" type="password" dir="ltr" autocomplete="off" value="${esc(ai.apiKey)}"></div>
            <div class="field"><label for="ai-model">النموذج</label><input class="input" id="ai-model" dir="ltr" placeholder="gpt-4o-mini" value="${esc(ai.model)}"></div>
            <p class="muted small">يدعم أي خدمة متوافقة مع OpenAI مثل OmniRoute و FreeLLMAPI و OpenRouter</p>` : ''}
          <button class="btn ghost block mt" id="ai-test">اختبار الاتصال</button>
          <details class="mt"><summary class="muted small" style="cursor:pointer">للمطوّر</summary>
            <button class="btn sm ghost mt" id="ai-add">إضافة مزود جديد</button></details></div>

        <div class="card mt"><div class="section-title">البيانات</div>
          <div class="row"><button class="btn sm" id="d-exp">تصدير نسخة احتياطية</button>
          <button class="btn sm ghost" id="d-imp">استيراد نسخة</button>
          <button class="btn sm danger" id="d-reset">مسح كل البيانات</button></div>
          <input type="file" id="d-file" accept="application/json,.json" hidden></div>

        <div class="card mt"><div class="section-title">عن التطبيق</div>
          <p><b>نور ١٫٠</b></p>
          <p class="muted small">نص المصحف: موسوعة القرآن الكريم quranenc.com عبر quran-json (CC BY 4.0).<br>التلاوات: everyayah.com.<br>التفسير: alquran.cloud.<br>المواقيت: مكتبة adhan.</p></div>`;
      bind();
    };

    const bind = () => {
      const q = id => el.querySelector(id);
      q('#s-name').oninput = e => { S.profile.name = e.target.value.trim(); save(); };
      const setGoal = v => { const g = Math.max(1, Math.min(200, v)); updateSettings({ goal: g }); q('#g-val').textContent = N(g); };
      q('#g-minus').onclick = () => setGoal(S.settings.goal - 1);
      q('#g-plus').onclick = () => setGoal(S.settings.goal + 1);
      q('#s-font').oninput = e => {
        const v = +e.target.value; q('#f-val').textContent = N(v); q('#f-prev').style.fontSize = v + 'px';
        updateSettings({ fontSize: v });
      };
      q('#s-rec').onchange = e => updateSettings({ reciter: e.target.value });
      q('#s-theme').onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b) return;
        updateSettings({ theme: b.dataset.v });
        q('#s-theme').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      };
      q('#s-prov').onclick = e => {
        const b = e.target.closest('[data-v]'); if (!b || b.dataset.v === S.settings.ai.provider) return;
        updateSettings({ ai: { provider: b.dataset.v, chosen: true } }); draw();
      };
      const bindAi = (id, key) => { const i = q(id); if (i) i.oninput = () => updateSettings({ ai: { [key]: i.value.trim() } }); };
      bindAi('#ai-url', 'baseUrl'); bindAi('#ai-key', 'apiKey'); bindAi('#ai-model', 'model');
      loadStatus();
      q('#ai-refresh').onclick = () => loadStatus(true);
      q('#ai-add').onclick = () => { const sh = sheet(ADD_PROVIDER_HTML); sh.querySelector('#ai-add-ok').onclick = sh.close; };
      q('#ai-test').onclick = async e => {
        const btn = e.currentTarget; btn.disabled = true; toast('جارٍ اختبار الاتصال...');
        try {
          const { chat, lastProvider } = await import('../core/ai.js');
          const r = await chat([{ role: 'user', content: 'قل: السلام عليكم' }]);
          const txt = typeof r === 'string' ? r : (r && (r.text || r.content)) || '';
          toast('نجح الاتصال عبر ' + lastProvider() + ': ' + String(txt).slice(0, 50));
        } catch (err) {
          toast('تعذر الاتصال: ' + String((err && err.message) || 'خطأ غير معروف').slice(0, 80), 4000);
        } finally { btn.disabled = false; }
      };
      q('#d-exp').onclick = async () => {
        const json = exportData();
        try {
          const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url; a.download = `noor-backup-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('تم تصدير النسخة الاحتياطية');
        } catch (err) { toast('تعذر التصدير'); }
        try {
          const { isNative } = await import('../core/platform.js');
          if (isNative()) {
            const sh = sheet(`<h3>نسخة احتياطية</h3><p class="muted small">على الهاتف قد لا يُحفظ الملف تلقائياً، انسخ النص واحفظه في مكان آمن.</p>
              <button class="btn block mt" id="cp">نسخ النسخة الاحتياطية</button>`);
            sh.querySelector('#cp').onclick = async () => {
              try { await navigator.clipboard.writeText(json); toast('تم النسخ'); sh.close(); } catch (err) { toast('تعذر النسخ'); }
            };
          }
        } catch (err) { /* web only */ }
      };
      q('#d-imp').onclick = () => q('#d-file').click();
      q('#d-file').onchange = async e => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        try { importData(await f.text()); toast('تم استيراد البيانات'); draw(); }
        catch (err) { toast('الملف غير صالح'); }
        e.target.value = '';
      };
      q('#d-reset').onclick = () => {
        const sh = sheet(`<h3>مسح كل البيانات؟</h3><p class="muted">سيُحذف تقدمك ونقاطك وإعداداتك نهائياً. يُنصح بتصدير نسخة احتياطية أولاً.</p>
          <div class="row mt"><button class="btn danger" id="r-ok">نعم، امسح</button><button class="btn ghost" id="r-no">إلغاء</button></div>`);
        sh.querySelector('#r-no').onclick = sh.close;
        sh.querySelector('#r-ok').onclick = () => { resetAll(); sh.close(); toast('تم مسح البيانات'); draw(); };
      };
    };
    draw();
  }
};
