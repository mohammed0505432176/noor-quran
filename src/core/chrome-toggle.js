// Tap an empty part of the page to hide / show the tool bars (full-screen reading). Taps on buttons, menus, ayahs and
// words never count, a text selection never counts, and the choice is remembered. Pure decision in shouldToggle().
const KEY = 'noor.chrome.off';
const HINT_KEY = 'noor.chrome.hint';
const INTERACTIVE = 'button,a,input,select,textarea,label,summary,[role="menu"],[role="dialog"],.sheet,.rd-dial,.player-bar,.rd-bottom,.rd-top,.rc-dock,.ayah,.mq-w,[data-s],[data-go],[data-pl],[data-act]';

/** @param {{hasSelection?:boolean, onInteractive?:boolean, moved?:boolean, long?:boolean}} s */
export function shouldToggle(s) { return !(s.hasSelection || s.onInteractive || s.moved || s.long); }

const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
export const savedOff = () => get(KEY) === '1';

/**
 * Binds the behaviour to `root` (the reader element). `apply(off)` hides / shows the bars (the caller toggles a class).
 * Returns { unbind, set(off), isOff() }. onHint(text) is called once, the first time the bars are hidden.
 */
export function bindChromeToggle(root, { apply, onHint, ignore = INTERACTIVE, persist = true } = {}) {
  let off = persist && savedOff();
  let down = null;
  const setOff = (v) => { off = !!v; if (persist) set(KEY, off ? '1' : '0'); apply && apply(off); };
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; };
  const onUp = (e) => {
    const d = down; down = null; if (!d) return;
    const sel = typeof getSelection === 'function' ? String(getSelection()) : '';
    const target = e.target && e.target.closest ? e.target : null;
    const ok = shouldToggle({
      hasSelection: !!sel, onInteractive: !!(target && target.closest(ignore)),
      moved: Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10, long: Date.now() - d.t > 450
    });
    if (!ok) return;
    setOff(!off);
    if (off && onHint && !get(HINT_KEY)) { set(HINT_KEY, '1'); onHint('المس مساحة فارغة من الصفحة لإظهار الأدوات من جديد'); }
  };
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointerup', onUp);
  if (off && apply) apply(true);
  return { unbind() { root.removeEventListener('pointerdown', onDown); root.removeEventListener('pointerup', onUp); }, set: setOff, isOff: () => off };
}
