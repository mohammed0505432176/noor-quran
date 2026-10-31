// Progress sync with the account (table noor_progress, RLS: a user reads and writes only their own row).
// Two kinds of account: a guest (an anonymous account kept on this device) and a Google account, which keeps the progress
// for good, also after a reinstall. Changes are pushed a few seconds after they happen, and the app works offline.
// The Google round trip returns to the page on the web, and through the noor://auth link in the app.
import { S, save, on } from './store.js';
import { SUPABASE_URL, ANON_KEY, ensureSession, setSession } from './cloud.js';
import { makeSnapshot, readSnapshot, parseAuthFragment, progressScore } from './sync-core.js';
import { isNative } from './platform.js';

const POS_KEY = 'noor.recite.lastpos';          // same key as the recitation view
const MODE_KEY = 'noor.sync.mode';              // 'signin' while the Google round trip is out
const ROW = SUPABASE_URL + '/rest/v1/noor_progress';
const NATIVE_RETURN = 'noor://auth';

export const sync = { state: 'idle', at: 0 };   // idle | syncing | ok | offline | error
const subs = new Set();
export function onSyncState(fn) { subs.add(fn); return () => subs.delete(fn); }
function setState(state) { sync.state = state; if (state === 'ok') sync.at = Date.now(); subs.forEach(f => f(sync)); }

let timer = null, running = null, again = false, restoring = false;
const readPos = () => { try { return localStorage.getItem(POS_KEY); } catch (e) { return null; } };
const writePos = v => { try { if (v == null) localStorage.removeItem(POS_KEY); else localStorage.setItem(POS_KEY, v); } catch (e) { /* ignore */ } };
const headers = (token, extra = {}) => ({ apikey: ANON_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...extra });
const httpError = (what, r) => Object.assign(new Error(what + ' ' + r.status), { status: r.status });

/** Save the whole state now (one row per account). Calls during a save are queued as one more save. */
export function pushNow() {
  if (restoring) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    setState('syncing');
    try {
      const token = await ensureSession();
      const r = await fetch(ROW, {
        method: 'POST',
        headers: headers(token, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ data: makeSnapshot(S, readPos()), updated_at: new Date().toISOString() })
      });
      if (!r.ok) throw httpError('save', r);
      setState('ok');
    } catch (e) {
      setState(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
    } finally {
      running = null;
      if (again) { again = false; schedule(0); }
    }
  })();
  return running;
}

/** Save shortly after the last change (a burst of changes is one save). */
export function schedule(ms = 2500) {
  clearTimeout(timer);
  timer = setTimeout(() => { timer = null; pushNow(); }, ms);
}

/** The saved row of this account, or null. */
export async function fetchRemote() {
  const token = await ensureSession();
  const r = await fetch(ROW + '?select=data,updated_at', { headers: headers(token, { Accept: 'application/json' }) });
  if (!r.ok) throw httpError('load', r);
  const rows = await r.json();
  return rows[0] || null;
}

/** Replace the local progress with a saved row. Returns false when the row is not a usable snapshot. */
export function applyRemote(row) {
  const snap = readSnapshot(row && row.data);
  if (!snap) return false;
  restoring = true;
  try {
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, snap.state);
    save();
    writePos(snap.pos);
  } finally { restoring = false; }
  return true;
}

/** The account (its email and identities). */
export async function fetchAccount() {
  const token = await ensureSession();
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: headers(token) });
  if (!r.ok) throw httpError('account', r);
  return r.json();
}
export const hasGoogle = user => !!(user && Array.isArray(user.identities) && user.identities.some(i => i.provider === 'google'));

const returnUrl = () => (isNative() ? NATIVE_RETURN : location.origin + location.pathname);

/**
 * Sign in with Google. The browser opens Google's page; the round trip comes back with the tokens of the Google account.
 * The guest progress on this device is not lost: afterSignIn keeps whichever of the two has more progress.
 */
export async function startGoogle() {
  try { sessionStorage.setItem(MODE_KEY, 'signin'); } catch (e) { /* ignore */ }
  const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(returnUrl())}`;
  if (isNative()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
    return;
  }
  location.href = url;
}

/** Sign out of the Google account: this device goes back to a guest account (the saved progress stays on the account). */
export function signOut() {
  setSession(null);
  setState('idle');
}

/** Finish a round trip from the URL fragment: stores the session. Returns true when tokens were found. */
export function completeAuth(fragment) {
  const tokens = parseAuthFragment(fragment);
  if (!tokens) return false;
  try { sessionStorage.removeItem(MODE_KEY); } catch (e) { /* ignore */ }
  setSession({ ...tokens, expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in });
  return true;
}

/** After a Google sign-in: the account's progress is restored when it has more than this device's; otherwise this device's
 *  progress is saved to the account. Both are reported to the reader. */
async function afterSignIn(toast) {
  let row;
  try { row = await fetchRemote(); } catch (e) { toast('تعذّر التحقق من حسابك، سنحفظ تقدمك عند عودة الاتصال'); pushNow(); return; }
  const remote = row ? readSnapshot(row.data) : null;
  if (remote && progressScore(remote.state) > progressScore(S)) {
    if (applyRemote(row)) { toast('تم تسجيل الدخول واستعادة تقدمك من حسابك'); location.reload(); return; }
  }
  toast('تم تسجيل الدخول — تقدمك محفوظ في حسابك الآن');
  pushNow();
}

/** Web: the tokens come back in the page's URL fragment; the fragment is cleared afterwards. */
function handleWebReturn(toast) {
  const h = location.hash || '';
  if (!h.includes('access_token=')) return;
  const ok = completeAuth(h);
  history.replaceState(null, '', location.pathname + '#/home');
  if (ok) afterSignIn(toast);
}

/**
 * Start-up hook (before the router reads the URL): saves on every change and completes a web round trip.
 * In the app, the return comes through the noor://auth link: see initNativeReturn.
 */
export function initSync(toast = () => {}) {
  on('change', () => schedule());
  if (!isNative()) handleWebReturn(toast);
}

/** In the app: a noor://auth link brings the tokens back; the system browser is closed first. */
export async function initNativeReturn(toast = () => {}) {
  if (!isNative()) return;
  const { App } = await import('@capacitor/app');
  const { Browser } = await import('@capacitor/browser');
  App.addListener('appUrlOpen', ({ url }) => {
    if (!url || !url.startsWith(NATIVE_RETURN)) return;
    Browser.close().catch(() => {});
    const i = url.indexOf('#');
    if (completeAuth(i >= 0 ? url.slice(i) : '')) afterSignIn(toast);
  });
}
