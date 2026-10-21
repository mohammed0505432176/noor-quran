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
//   Engine.stop() -> Promise<words> (current session; [] on 20 s timeout) ; Engine.cancel() abandons the session
//   words: [{ a, w, st, vowel }]  (w is 0-based within ayah, as the engine numbers words; st 'ok'|'unsure'|'wrong'|'skipped'|'pending')
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
    const [model, corpus] = await Promise.all([m.arrayBuffer(), j.json()]);
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
      w.postMessage({ type: 'init', model, corpus, wasmPaths }, [model]);
    }).finally(() => clearTimeout(timer));
    w.onmessage = ev => route(ev.data || {});
    w.onerror = e => { if (cur && cur.handlers.onError) cur.handlers.onError((e && e.message) || 'worker'); };
    return { start, pcm, stop, cancel };
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
  if (d.type === 'counts') counts = d.counts || {};
  else if (d.type === 'verdicts') c.handlers.onVerdicts(d.words);
  else if (d.type === 'issue') c.handlers.onIssue(d.issue);
  else if (d.type === 'slow') c.handlers.onSlow();
  else if (d.type === 'stopped') finishStop(c, d.words || []);
  else if (d.type === 'error') { if (c.handlers.onError) c.handlers.onError(d.message); finishStop(c, []); }
}

function start(s, from, to, h = {}) {
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
  worker.postMessage({ type: 'start', sid, s, from, to });
  return sid;
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

/** Map engine verdicts (a, w 0-based) onto flat word indices of the passage. groups: [{a, start, end}].
 *  engineCounts: { [a]: n } engine words per ayah; when it differs from the app's split an engine word w
 *  covers app indices [floor(w*n/en), floor((w+1)*n/en)) (at least one). */
export function mapVerdicts(words, groups, engineCounts = counts) {
  const out = new Map();
  const byA = new Map(groups.map(g => [g.a, g]));
  for (const v of words) {
    const g = byA.get(v.a); if (!g) continue;
    const n = g.end - g.start, en = engineCounts[v.a] | 0;
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
