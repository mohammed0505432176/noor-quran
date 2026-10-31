// Progress sync with the signed-in account (table noor_progress, RLS: a user reads and writes only their own row).
// The app keeps working offline: changes are pushed a few seconds after they happen. Google links the account, so a
// reinstall can sign back in and restore the progress (web for now; the Android return URL still needs its own handler).
import { S, save, on } from './store.js';
import { SUPABASE_URL, ANON_KEY, ensureSession, setSession } from './cloud.js';
import { makeSnapshot, readSnapshot } from './sync-core.js';

const POS_KEY = 'noor.recite.lastpos';          // same key as the recitation view
const MODE_KEY = 'noor.sync.mode';              // 'link' | 'restore' while the Google round trip is out
const ROW = SUPABASE_URL + '/rest/v1/noor_progress';

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

/** The account's identities (Google linked or not). */
export async function fetchAccount() {
  const token = await ensureSession();
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: headers(token) });
  if (!r.ok) throw httpError('account', r);
  return r.json();
}
export const hasGoogle = user => !!(user && Array.isArray(user.identities) && user.identities.some(i => i.provider === 'google'));

/**
 * Start the Google round trip. 'link': attach Google to this account (its progress stays). 'restore': sign in to the
 * account that was saved with Google earlier (use it on a reinstall). Both come back to this page with the tokens.
 */
export async function startGoogle(mode) {
  try { sessionStorage.setItem(MODE_KEY, mode); } catch (e) { /* ignore */ }
  const redirect = encodeURIComponent(location.origin + location.pathname);
  if (mode === 'link') {
    const token = await ensureSession();
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user/identities/authorize?provider=google&redirect_to=${redirect}&skip_http_redirect=true`, { headers: headers(token) });
    if (!r.ok) throw httpError('link', r);
    const { url } = await r.json();
    location.href = url;
    return;
  }
  location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`;
}

/** Back from Google: the tokens are in the URL fragment. Clears the fragment and returns 'link' | 'restore' | null. */
export function handleAuthReturn() {
  const h = location.hash || '';
  if (!h.includes('access_token=')) return null;
  const p = new URLSearchParams(h.slice(1));
  let mode = null;
  try { mode = sessionStorage.getItem(MODE_KEY); sessionStorage.removeItem(MODE_KEY); } catch (e) { /* ignore */ }
  history.replaceState(null, '', location.pathname + '#/home');
  const access = p.get('access_token');
  if (!access) return null;
  setSession({ access_token: access, refresh_token: p.get('refresh_token'), expires_at: Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600) });
  return mode === 'restore' ? 'restore' : 'link';
}

/**
 * Start-up hook (before the router reads the URL): saves on every change, and completes a Google round trip.
 * toast(message) shows the result.
 */
export function initSync(toast = () => {}) {
  on('change', () => schedule());
  const mode = handleAuthReturn();
  if (mode === 'link') {
    toast('تم ربط حسابك بجوجل — تقدّمك محفوظ الآن');
    pushNow();
  } else if (mode === 'restore') {
    fetchRemote().then(row => {
      if (row && applyRemote(row)) { location.reload(); return; }
      toast('لا يوجد تقدّم محفوظ لهذا الحساب بعد');
    }).catch(() => toast('تعذّر استعادة التقدم، تحقق من الإنترنت وحاول مجدداً'));
  }
}
