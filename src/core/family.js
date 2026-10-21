// Family circle: local membership cache + stats sync with the noor-ai backend.
import { S, on, dayStat, streak, bestStreak, totalRead, level } from './store.js';
import { familyOp } from './cloud.js';

const KEY = 'noor.family';
const SYNC_KEY = 'noor.family.sync';
const MIN_GAP = 2 * 60_000;

/** Stats object sent to the backend (exact keys per contract). */
export function buildStats() {
  let week = 0;
  for (let i = 0; i < 7; i++) week += dayStat(i).a || 0;
  const last = (S.rec || []).slice(0, 20);
  const acc = last.length ? Math.round(last.reduce((t, r) => t + (+r.acc || 0), 0) / last.length) : 0;
  const total = totalRead();
  return {
    week, today: dayStat(0).a || 0, streak: streak(), best: bestStreak(), total,
    rec: (S.rec || []).length, acc, pts: S.pts || 0, level: level().name,
    khatma: Math.round(total / 6236 * 100)
  };
}

export function getFamily() {
  try {
    const f = JSON.parse(localStorage.getItem(KEY));
    return f && f.code ? f : null;
  } catch (e) { return null; }
}
function setFamily(f) {
  try { f ? localStorage.setItem(KEY, JSON.stringify(f)) : localStorage.removeItem(KEY); } catch (e) {}
}
/** Accepts both flat ({code,name,owner}) and nested ({family:{...}}) responses. */
export function cacheFrom(res, member) {
  const f = res && (res.family || (res.code ? res : null));
  if (!f || !f.code) return null;
  const c = { code: f.code, name: f.name || '', member, owner: !!f.owner };
  setFamily(c); markSynced(); return c;
}

let lastHash = ''; let lastAt = 0;
function markSynced() { lastHash = JSON.stringify(buildStats()); lastAt = Date.now(); }

export async function createFamily(name, member) {
  const res = await familyOp('create', { name: String(name).trim(), member: String(member).trim(), stats: buildStats() });
  const c = cacheFrom(res, String(member).trim());
  if (!c) throw new Error('bad response');
  boardCache = null;
  return c;
}
export async function joinFamily(code, member) {
  const res = await familyOp('join', { code: String(code).trim().toUpperCase(), member: String(member).trim(), stats: buildStats() });
  const c = cacheFrom(res, String(member).trim());
  if (!c) throw new Error('bad response');
  boardCache = null;
  return c;
}
export async function leaveFamily() {
  await familyOp('leave');
  setFamily(null); lastHash = ''; lastAt = 0; boardCache = null;
}
/** Returns { family, members } (members sorted as received). Refreshes the local cache. */
let boardCache = null; // { at, code, data }
const BOARD_TTL = 60_000;
export async function board({ force = false } = {}) {
  const startCode = (getFamily() || {}).code || null;
  if (!force && boardCache && boardCache.code === startCode && Date.now() - boardCache.at < BOARD_TTL) return boardCache.data;
  const res = await familyOp('board'); // throws on error: local cache untouched
  const cur = getFamily();
  if (!res || !res.family) {
    // only wipe when the membership did not change while the call was in flight
    if ((cur ? cur.code : null) === startCode) { setFamily(null); boardCache = null; }
    return { family: null, members: [] };
  }
  if (cur && cur.code === startCode) setFamily({ ...cur, name: res.family.name || cur.name, owner: !!res.family.owner });
  const data = { family: res.family, members: Array.isArray(res.members) ? res.members : [] };
  boardCache = { at: Date.now(), code: startCode, data };
  return data;
}
/** Push current stats now. Throws CloudError on failure. */
export async function syncNow() {
  const f = getFamily(); if (!f) return false;
  await familyOp('sync', { stats: buildStats(), member: f.member });
  markSynced(); return true;
}

let started = false; let timer = null; let syncing = false;
async function maybeSync() {
  timer = null;
  if (!getFamily()) return;
  if (JSON.stringify(buildStats()) === lastHash) return;
  if (Date.now() - lastAt < MIN_GAP) { schedule(MIN_GAP - (Date.now() - lastAt)); return; }
  if (syncing) return;
  syncing = true;
  try { await syncNow(); }
  catch (e) { lastAt = 0; schedule(MIN_GAP); /* offline: retry after the minimum gap */ }
  finally { syncing = false; }
}
function schedule(ms) { if (!timer) timer = setTimeout(maybeSync, ms); }

/** Idempotent. Syncs on start and after store changes (debounced, max once / 2 min, only if stats changed). */
export function startFamilySync() {
  if (started) return; started = true;
  on('change', () => { if (getFamily()) schedule(5000); });
  if (getFamily()) schedule(1500);
}
