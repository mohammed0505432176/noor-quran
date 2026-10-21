// «تلاواتي»: saved recitations in IndexedDB. Every call resolves gracefully (null / []) and never throws.
const DB = 'noor-recordings', STORE = 'recs', MAX_COUNT = 30, MAX_BYTES = 60 * 1024 * 1024;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === 'undefined') { reject(new Error('no idb')); return; }
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('at', 'at');
      };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error('blocked'));
    } catch (e) { reject(e); }
  }).catch(e => { dbp = null; throw e; });
  return dbp;
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
const safe = async (fn, fallback) => { try { return await fn(await open()); } catch (e) { return fallback; } };
const meta = ({ blob, ...m }) => ({ ...m, size: m.size ?? (blob ? blob.size : 0) });
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function all(db) {
  const tx = db.transaction(STORE, 'readonly');
  const rows = await req(tx.objectStore(STORE).getAll());
  return rows.sort((a, b) => b.at - a.at);
}

async function evict(db) {
  const rows = await all(db);              // newest first
  let total = 0, keep = 0; const drop = [];
  rows.forEach((r, i) => {
    total += (r.blob ? r.blob.size : r.size || 0);
    if (i >= MAX_COUNT || (total > MAX_BYTES && i > 0)) drop.push(r.id); else keep++;
  });
  if (!drop.length) return;
  const tx = db.transaction(STORE, 'readwrite');
  drop.forEach(id => tx.objectStore(STORE).delete(id));
  await done(tx);
}

/** Save a recording → id (or null). */
export const save = ({ blob, s, from, to, acc, tajweedScore = null, durationMs = 0 } = {}) => safe(async db => {
  if (!blob || !blob.size) return null;
  const id = newId();
  const rec = { id, at: Date.now(), s, from, to, acc, tajweedScore, durationMs, size: blob.size, type: blob.type || '', blob };
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(rec);
  await done(tx);
  await evict(db).catch(() => {});
  return id;
}, null);

/** Metadata only, newest first. */
export const list = () => safe(async db => (await all(db)).map(meta), []);

/** Full record including blob, or null. */
export const get = id => safe(async db => (await req(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) || null, null);

export const remove = id => safe(async db => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); await done(tx); return true; }, false);

/** Merge fields (e.g. tajweedScore) into an existing record. */
export const update = (id, patch) => safe(async db => {
  const tx = db.transaction(STORE, 'readwrite');
  const st = tx.objectStore(STORE);
  const cur = await req(st.get(id));
  if (!cur) return false;
  st.put({ ...cur, ...patch, id: cur.id, blob: cur.blob });
  await done(tx);
  return true;
}, false);

/** Total stored bytes and count. */
export const usage = async () => { const rows = await list(); return { count: rows.length, bytes: rows.reduce((a, r) => a + (r.size || 0), 0), maxBytes: MAX_BYTES, maxCount: MAX_COUNT }; };
