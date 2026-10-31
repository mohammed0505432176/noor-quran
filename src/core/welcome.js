// First launch: sign in with Google (progress kept for good) or continue as a guest (progress kept on this device).
// The choice is remembered; Settings can change it later.
import { sheet, toast } from '../ui.js';
import { startGoogle } from './sync.js';
import { isAnonymousToken, shouldShowWelcome } from './sync-core.js';

const KEY = 'noor.account.chosen';
export function accountChosen() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return true; } }
function remember() { try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ } }

function hasGoogleSession() {
  try {
    const s = JSON.parse(localStorage.getItem('noor.auth'));
    return !!s && !!s.access_token && !isAnonymousToken(s.access_token);
  } catch (e) { return false; }
}

let current = null;
/** Close the welcome sheet (a Google sign-in finished while it was open). */
export function closeWelcome() {
  if (current && current.close) { try { current.close(); } catch (e) { /* ignore */ } }
  current = null;
  document.querySelectorAll('.sheet-wrap').forEach(el => { if (el.querySelector('#w-google')) el.remove(); });
}
if (typeof window !== 'undefined') window.addEventListener('noor:auth-done', closeWelcome);

export function showWelcome() {
  if (!shouldShowWelcome(accountChosen(), hasGoogleSession())) return;
  const sh = current = sheet(`<div class="welcome" style="padding:8px 4px">
      <h2 class="section-title" style="margin-top:0">أهلاً بك في نور</h2>
      <p class="muted small">اختر طريقة الدخول. تقدمك وتلاوتك وأذكارك تُحفظ حسب اختيارك:</p>
      <button class="btn block mt" id="w-google">سجّل الدخول بحساب Google</button>
      <p class="muted small mt">يُحفظ تقدمك في حسابك دائماً، ويرجع إليك بعد حذف التطبيق وإعادة تثبيته.</p>
      <button class="btn ghost block mt" id="w-guest">المتابعة كضيف</button>
      <p class="muted small mt">الضيف يحفظ تقدمه على هذا الجهاز فقط، ويضيع إن حذفت التطبيق.</p>
    </div>`);
  sh.querySelector('#w-google').onclick = () => {
    sh.close();
    toast('جارٍ فتح صفحة Google…');
    startGoogle().catch(() => toast('تعذّر فتح تسجيل جوجل، تحقق من الإنترنت'));
  };
  sh.querySelector('#w-guest').onclick = () => { remember(); sh.close(); };
}