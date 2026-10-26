// On-device Quran recitation engine (offline after a one-time ~72 MB download). Main-thread side:
// downloads + caches the model and phoneme corpus (Cache Storage), runs quran-worker.js, maps the
// engine's per-word verdicts to the app's word list.
// CONTRACT:
//   engineSupported() -> bool                    WebAssembly + Worker + Cache Storage available
//   engineCached() -> Promise<bool>             both assets already downloaded
//   downloadEngine(onProgress(0..1)) -> Promise  fetch + cache the assets (resumable by re-calling)
//   removeEngine() -> Promise                    free the space
//   openEngine() -> Promise<Engine>             load the worker (once per app run, reused)
//   Engine.start(s, from, to, { onVerdicts(words), onIssue(issue), onError(msg), onSlow() }) -> sid ; Engine.pcm(Float32Array) ;
//   Engine.startFree(handlers, { hint:{surah,ayah} }?) -> sid   free recitation: no passage, the engine discovers where the
//     reciter is (whole Quran) and follows across ayahs and surahs; engine word counts arrive per ayah as they are reached
//   Engine.relock() free mode only: clears the surah lock (the engine otherwise sticks to the surah it locked on until a
//     sustained match elsewhere) and re-runs discovery
//   Engine.stop() -> Promise<words> (current session; [] on 20 s timeout) ; Engine.cancel() abandons the session
//   words: [{ s, a, w, st, vowel }]  (w is 0-based within ayah, as the engine numbers words; st 'ok'|'unsure'|'wrong'|'skipped'|'pending')
//   Engine.counts() -> { [a] | ['s:a']: n }  engine words per ayah of the current session
// The model is a Derivative of Quran-Lab's Work under the Quran-Lab No-Profit License 1.2: the app is free,
// and its automatic feedback may be wrong and does not replace a qualified teacher.
import { isNative } from './platform.js';

const CACHE = 'noor-models-v1';
const PAGES = 'https://mohammed0505432176.github.io/noor-quran/';
const FILES = { model: 'models/zipformer_a0w_ep1_a05.int8.onnx', corpus: 'models/zipformer_quran.json' };
export const ENGINE_MB = 72;

// on the web app (served from GitHub Pages) the files are same-origin; the APK fetches them from Pages (CORS *)
const base = () => (!isNative() && typeof location !== 'undefined' && location.origin + '/' === new URL(PAGES).origin + '/' ? import.meta.env.BASE_URL : PAGES);
const url = k => new URL(FILES[k], new URL(base(), typeof location !== 'undefined' ? location.href : PAGES)).href;

export function engineSupported() {
  return typeof WebAssembly === 'object' && typeof Worker === 'function' && typeof caches === 'object';
}

export async function engineCached() {
  if (!engineSupported()) return false;
  try {
    const c = await caches.open(CACHE);
    for (const k of Object.keys(FILES)) if (!(await c.match(FILES[k]))) return false;
    return true;
  } catch (e) { return false; }
}

let dlPromise = null;
const dlListeners = new Set();
export function downloadEngine(onProgress = () => {}) {
  dlListeners.add(onProgress);
  if (!dlPromise) {
    const notify = p => { for (const f of [...dlListeners]) { try { f(p); } catch (e) { /* ignore */ } } };
    dlPromise = doDownload(notify).finally(() => { dlPromise = null; dlListeners.clear(); });
  }
  return dlPromise;
}

async function doDownload(onProgress) {
  const c = await caches.open(CACHE);
  const sizes = { model: 69246033, corpus: 5453439 };
  const total = sizes.model + sizes.corpus;
  let done = 0;
  for (const k of Object.keys(FILES)) {
    if (await c.match(FILES[k])) { done += sizes[k]; onProgress(done / total); continue; }
    const res = await fetch(url(k), { cache: 'no-store' });
    if (!res.ok || !res.body) throw new Error('download ' + res.status);
    const reader = res.body.getReader(), parts = [];
    let got = 0;
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      parts.push(value); got += value.length;
      onProgress(Math.min(0.999, (done + got) / total));
    }
    // a truncated download must never be cached as the model
    if (got < sizes[k] * 0.98) throw new Error('incomplete');
    await c.put(FILES[k], new Response(new Blob(parts), { headers: { 'Content-Type': k === 'corpus' ? 'application/json' : 'application/octet-stream' } }));
    done += sizes[k];
  }
  onProgress(1);
}

export async function removeEngine() {
  try { await caches.delete(CACHE); } catch (e) { /* ignore */ }
  if (worker) { try { worker.terminate(); } catch (e) {} worker = null; ready = null; }
}

let worker = null, ready = null, cur = null, nextSid = 1, counts = {};
const INIT_TIMEOUT = 45000, STOP_TIMEOUT = 20000;

function resetWorkerState() {
  if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } }
  worker = null; ready = null; cur = null;
}

export function openEngine() {
  if (ready) return ready;
  const p = (async () => {
    const c = await caches.open(CACHE);
    const [m, j] = await Promise.all([c.match(FILES.model), c.match(FILES.corpus)]);
    if (!m || !j) throw new Error('not downloaded');
    // the 5 MB corpus goes over as raw bytes and is parsed in the worker (no JSON parse + structured clone on the UI thread)
    const [model, corpus] = await Promise.all([m.arrayBuffer(), j.arrayBuffer()]);
    const w = new Worker(new URL('./quran-worker.js', import.meta.url), { type: 'module' });
    worker = w;
    let timer;
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('engine init timeout')), INIT_TIMEOUT);
      w.onmessage = ev => {
        const d = ev.data || {};
        if (d.type === 'ready') resolve();
        else if (d.type === 'error' && !cur) reject(new Error(d.message));
        else route(d);
      };
      w.onerror = e => reject(new Error((e && e.message) || 'worker'));
      const wasmPaths = new URL(import.meta.env.BASE_URL + 'ort/', location.href).href;
      w.postMessage({ type: 'init', model, corpus, wasmPaths }, [model, corpus]);
    }).finally(() => clearTimeout(timer));
    w.onmessage = ev => route(ev.data || {});
    w.onerror = e => { if (cur && cur.handlers.onError) cur.handlers.onError((e && e.message) || 'worker'); };
    return { start, startFree, relock, pcm, stop, cancel, counts: () => counts };
  })();
  ready = p;
  p.catch(() => { if (ready === p) resetWorkerState(); });
  return p;
}

function finishStop(c, words) {
  if (c.timer) { clearTimeout(c.timer); c.timer = null; }
  c.done = true; c.result = words;
  const rs = c.stopResolvers; c.stopResolvers = [];
  for (const r of rs) r(words);
}

function route(d) {
  if (!cur || d.sid !== cur.sid) return;          // stale message from an abandoned session
  const c = cur;
  if (d.type === 'counts') counts = { ...counts, ...(d.counts || {}) };
  else if (d.type === 'verdicts') c.handlers.onVerdicts(d.words);
  else if (d.type === 'issue') c.handlers.onIssue(d.issue);
  else if (d.type === 'slow') c.handlers.onSlow();
  else if (d.type === 'stopped') finishStop(c, d.words || []);
  else if (d.type === 'error') { if (c.handlers.onError) c.handlers.onError(d.message); finishStop(c, []); }
}

function start(s, from, to, h = {}) { return begin({ s, from, to }, h); }
function startFree(h = {}, opts = {}) {
  const hint = opts && opts.hint && opts.hint.surah > 0 && opts.hint.ayah > 0 ? { surah: opts.hint.surah | 0, ayah: opts.hint.ayah | 0 } : null;
  return begin({ free: true, hint }, h);
}
function begin(msg, h) {
  if (!worker) throw new Error('engine not open');
  if (cur && !cur.done) worker.postMessage({ type: 'cancel', sid: cur.sid });
  if (cur) finishStop(cur, []);
  counts = {};
  const sid = nextSid++;
  cur = {
    sid, stopResolvers: [], done: false, result: null, timer: null,
    handlers: {
      onVerdicts: h.onVerdicts || (() => {}), onIssue: h.onIssue || (() => {}),
      onError: h.onError || null, onSlow: h.onSlow || (() => {}),
    },
  };
  worker.postMessage({ type: 'start', sid, ...msg });
  return sid;
}
/** Free recitation: forget the surah lock and run discovery again (the reciter moved on / the view is on the wrong surah). */
function relock() {
  if (worker && cur && !cur.done) worker.postMessage({ type: 'relock', sid: cur.sid });
}
function pcm(samples) {
  if (!worker || !cur || cur.done) return;
  const copy = new Float32Array(samples);       // the recorder may reuse its buffer
  worker.postMessage({ type: 'pcm', sid: cur.sid, samples: copy }, [copy.buffer]);
}
function stop() {
  const c = cur;
  if (!worker || !c) return Promise.resolve([]);
  if (c.done) return Promise.resolve(c.result || []);
  return new Promise(resolve => {
    c.stopResolvers.push(resolve);
    if (c.timer) return;                          // a stop is already in flight: share its result
    worker.postMessage({ type: 'stop', sid: c.sid });
    c.timer = setTimeout(() => {
      c.timer = null;
      if (cur === c) { try { worker.postMessage({ type: 'cancel', sid: c.sid }); } catch (e) { /* ignore */ } }
      finishStop(c, []);
    }, STOP_TIMEOUT);
  });
}
function cancel() {
  const c = cur;
  if (!c) return;
  cur = null;
  if (worker) { try { worker.postMessage({ type: 'cancel', sid: c.sid }); } catch (e) { /* ignore */ } }
  finishStop(c, []);
}

const RANK = { pending: 0, ok: 1, unsure: 2, skipped: 3, wrong: 4 };

/** Map engine verdicts (a, w 0-based) onto flat word indices of the passage. groups: [{a, start, end}] (one surah), or
 *  [{s, a, start, end}] for a free recitation spanning surahs (then verdicts are matched on s too and counts keyed 's:a').
 *  engineCounts: { [a]: n } engine words per ayah; when it differs from the app's split an engine word w
 *  covers app indices [floor(w*n/en), floor((w+1)*n/en)) (at least one). */
export function mapVerdicts(words, groups, engineCounts = counts) {
  const out = new Map();
  const withS = groups.length > 0 && groups[0].s != null;
  const key = withS ? x => x.s + ':' + x.a : x => x.a;
  const byA = new Map(groups.map(g => [key(g), g]));
  for (const v of words) {
    const k0 = key(v), g = byA.get(k0); if (!g) continue;
    const n = g.end - g.start, en = engineCounts[k0] | 0;
    let lo = v.w, hi = v.w + 1;
    if (en && en !== n) {
      lo = Math.floor(v.w * n / en);
      hi = Math.floor((v.w + 1) * n / en);
      if (hi <= lo) hi = lo + 1;
    }
    for (let k = lo; k < hi; k++) {
      if (k < 0 || k >= n) continue;
      const i = g.start + k, prev = out.get(i);
      // two engine words on one app word: the worse verdict wins
      if (!prev || RANK[v.st] > RANK[prev.st]) out.set(i, v);
    }
  }
  return out;
}

/** Free recitation: the ayahs actually covered, as contiguous ranges per surah in Quran order: [{ s, from, to }].
 *  An ayah counts when any of its words was judged (not pending) or an issue named it (extraKeys 's:a', e.g. a
 *  skipped ayah). A hole of up to maxGap ayahs inside a surah stays in the range (those words were skipped);
 *  a longer jump starts a new range. minRead > 0 drops ranges with fewer than minRead words judged 'ok'. */
export function freeSegments(words, extraKeys = [], maxGap = 2, minRead = 0) {
  const set = new Set();
  for (const v of words || []) if (v && v.st !== 'pending' && v.s > 0 && v.a > 0) set.add(v.s * 1000 + v.a);
  for (const k of extraKeys || []) { const [s, a] = String(k).split(':').map(Number); if (s > 0 && a > 0) set.add(s * 1000 + a); }
  const out = [];
  for (const sa of [...set].sort((x, y) => x - y)) {
    const s = Math.floor(sa / 1000), a = sa % 1000, last = out[out.length - 1];
    if (last && last.s === s && a - last.to <= maxGap + 1) last.to = a;
    else out.push({ s, from: a, to: a });
  }
  if (minRead > 0) {                             // a stretch with fewer than minRead words read ok is a false lock, not a recitation
    const okN = (g) => (words || []).filter(v => v && v.st === 'ok' && v.s === g.s && v.a >= g.from && v.a <= g.to).length;
    return out.filter(g => okN(g) >= minRead);
  }
  return out;
}
