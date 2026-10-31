// Pure helpers of the progress sync (no DOM, no network): the snapshot that goes to the account and what is read back.
// The network part is in sync.js; tests/sync-core.test.js covers this file.

export const SNAPSHOT_VERSION = 1;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** What is saved: the whole app state plus the recitation's last position (a string, as stored locally). */
export function makeSnapshot(state, pos) {
  return { v: SNAPSHOT_VERSION, state, pos: typeof pos === 'string' ? pos : null };
}

/** What comes back from the account: null when it is not a snapshot of this version; unsafe keys are dropped. */
export function readSnapshot(snap) {
  if (!snap || snap.v !== SNAPSHOT_VERSION) return null;
  if (!snap.state || typeof snap.state !== 'object' || Array.isArray(snap.state)) return null;
  const state = {};
  for (const [k, v] of Object.entries(snap.state)) if (!UNSAFE_KEYS.has(k)) state[k] = v;
  const pos = typeof snap.pos === 'string' && snap.pos.length < 200 ? snap.pos : null;
  return { state, pos };
}

/** A fresh or unused app: nothing read, no points, no recitation days. */
export function isEmptyProgress(S) {
  if (!S) return true;
  const read = S.read ? Object.keys(S.read).length : 0;
  const days = S.days ? Object.keys(S.days).length : 0;
  const recs = Array.isArray(S.rec) ? S.rec.length : 0;
  return read === 0 && days === 0 && !(S.pts > 0) && recs === 0;
}

/**
 * The tokens of a finished Google round trip, from the URL fragment (`#access_token=…&refresh_token=…`).
 * null when the fragment carries no access token.
 */
export function parseAuthFragment(fragment) {
  const p = new URLSearchParams(String(fragment || '').replace(/^#/, ''));
  const access_token = p.get('access_token');
  if (!access_token) return null;
  return { access_token, refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600 };
}
/** How much progress a state holds (points and ayahs read): the higher one is kept when a guest signs in with Google. */
export function progressScore(state) {
  if (!state) return 0;
  const read = state.read ? Object.keys(state.read).length : 0;
  return (Number(state.pts) || 0) + read;
}