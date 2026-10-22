// On-device Quran recognition worker: streaming Zipformer2-CTC (Quran-Lab / Tilawa, NPL-1.2) via @tilawa/core
// + onnxruntime-web (WASM). Runs off the UI thread. Protocol (postMessage):
//   in : { type:'init', model:ArrayBuffer, corpus:ArrayBuffer(JSON bytes)|object, wasmPaths:string }
//        every other message carries `sid` (session id); every outbound one is tagged with it; stale sids are ignored
//        { type:'start', sid, s, from, to }      new recitation of surah s, ayahs from..to (correction mode); supersedes any older session
//        { type:'pcm', sid, samples:Float32Array }  16 kHz mono, any size (fed at once: the model runs as its own 480 ms window fills)
//        { type:'stop', sid }                    flush the tail, final verdicts
//        { type:'cancel', sid }                  abandon the session (drop queued audio, reset)
//   out: { type:'ready' } | { type:'error', sid?, message }
//        { type:'verdicts', sid, words:[{ a, w, st, vowel }] }   w 0-based within ayah; st: 'ok'|'unsure'|'wrong'|'skipped'|'pending'
//        { type:'issue', sid, issue:{ kind, a, w, words } }      a mistake flagged by the correction rules
//        { type:'stopped', sid, words:[...] }
//        { type:'counts', sid, counts:{ [a]: n } }               engine words per ayah (sent on start)
//        { type:'slow', sid }                                    backlog > 4 s of audio: oldest dropped down to 1 s (once per session)
import * as ort from 'onnxruntime-web/wasm';
import { createZipformerSession } from '@tilawa/core';

let session = null, passage = null, buf = [], bufLen = 0, chain = Promise.resolve(), lastSig = '';
let curSid = null, slowSent = false;     // current session id
const CHUNK = 7680;                      // 480 ms at 16 kHz: at most one model chunk per feed (verdicts post at least that often)
const SETTLE = 12;                       // one model window (0.48 s, 25 frames/s) without a new phoneme: the reciter paused
const QUIET = 8000;                      // ... and the model has been fed >= 0.5 s of low-energy audio since the voice stopped
let lvl = 0, recv = 0, voiceEnd = 0;     // speech level (slow peak of block RMS); samples received; sample index where voice last was
const MAX_BACKLOG = 64000, KEEP_BACKLOG = 16000;   // 4 s / 1 s of 16 kHz audio

const post = m => self.postMessage(m);
// never talk for an abandoned session
const postS = (sid, m) => { if (sid === curSid) post({ ...m, sid }); };

function dropQueued() { buf = []; bufLen = 0; }
// bufLen is the queued-but-unprocessed audio (incremented on receipt, decremented as chunks are consumed)
function trimBacklog() {
  if (bufLen <= MAX_BACKLOG) return;
  while (bufLen > KEEP_BACKLOG && buf.length) {
    const head = buf[0], excess = bufLen - KEEP_BACKLOG;
    if (head.length <= excess) { buf.shift(); bufLen -= head.length; }
    else { buf[0] = head.subarray(excess); bufLen -= excess; }
  }
  if (!slowSent) { slowSent = true; postS(curSid, { type: 'slow' }); }
}

// The engine starts a fresh tracker whenever it relocates (e.g. after a skipped ayah), so its verdict list only
// covers the current stretch. Accumulate every judged word of the passage across relocations.
let acc = new Map(), soft = new Map(), flagged = new Set();   // flagged: a*1000+w raised by the correction rules
let tkOf = new Map(), tkIds = new WeakMap(), tkNext = 1;     // word key -> id of the tracker that judged it
const inPassage = v => v.surah === passage.s && v.ayah >= passage.from && v.ayah <= passage.to;
const judged = x => x && x.st !== 'pending';
const read = x => x && (x.st === 'ok' || x.st === 'unsure');

/** Raw accumulator: what the live tracers judged (the input of settleFinal). */
function rawWords() {
  if (!session || !passage) return [];
  const eng = session.practiceEngine || session.engine, t = eng && eng.tracker;
  if (t && !tkIds.has(t)) tkIds.set(t, tkNext++);
  const tk = t ? tkIds.get(t) : 0;
  for (const v of session.verdicts()) {
    if (!inPassage(v)) continue;
    const k = v.ayah * 1000 + v.word, prev = acc.get(k);
    // a new tracker reports words it never heard as pending: never let that erase an earlier verdict
    if (v.state === 'pending' && prev && prev.st !== 'pending') continue;
    acc.set(k, { a: v.ayah, w: v.word, st: v.state, vowel: v.vowelErrors | 0 });
    if (v.state !== 'pending') tkOf.set(k, tk);
  }
  // the live tracer keeps a word pending until ~6 phonemes of right context follow it, so an ayah's last word waits
  // for the next ayah and the passage's last word for stop. In a pause the engine's own settled alignment (the one
  // its tallies and correction rules use) judges it now; only positive verdicts, kept apart in `soft`.
  // (CTC is peaky: a held madd emits no new phoneme either, hence the energy gate)
  const tr = eng && eng.tracer;
  if (tr && t && !t.lost && !eng.isHeld() && recv - bufLen - voiceEnd >= QUIET && session.decoder.pendingFrame === null && eng.framesDecoded - eng.lastCharFrame >= SETTLE) {
    for (const v of tr.verdicts(true)) {
      if (!inPassage(v)) continue;
      const end = v.word === session.wordCount(v.surah, v.ayah) - 1;
      // 'unsure' only for an ayah's last word heard nearly whole (a pausal ending; not a word cut off mid-way)
      if (v.state !== 'ok' && !(end && v.state === 'unsure' && v.distance <= 0.3)) continue;
      const k = v.ayah * 1000 + v.word;
      if (!judged(acc.get(k))) { soft.set(k, { a: v.ayah, w: v.word, st: v.state, vowel: v.vowelErrors | 0 }); tkOf.set(k, tk); }
    }
  }
  return [...acc.keys()].sort((x, y) => x - y).map(k => acc.get(k));
}

/** Pause-settled words fill what the raw verdicts left pending or unheard. */
function withSoft(words) {
  const m = new Map(words.map(x => [x.a * 1000 + x.w, x]));
  for (const [k, x] of soft) if (!judged(m.get(k))) m.set(k, x);
  return m;
}
const sorted = m => [...m.keys()].sort((x, y) => x - y).map(k => m.get(k));

/** Ayah a runs on into a+1 inside ONE tracker (no relocation / skip / correction restart between them), so a
 *  short unjudged tail of a is the tracer's right-context lag, not words the reciter jumped over. */
function continued(m, a) {
  let ka = -1;
  for (let w = session.wordCount(passage.s, a) - 1; w >= 0 && ka < 0; w--) if (judged(m.get(a * 1000 + w))) ka = a * 1000 + w;
  if (ka < 0 || !tkOf.get(ka)) return false;
  for (let w = 0; w < session.wordCount(passage.s, a + 1); w++) {
    const k = (a + 1) * 1000 + w;
    if (read(m.get(k))) return tkOf.get(k) === tkOf.get(ka);
  }
  return false;
}
const tailMax = n => Math.max(1, Math.floor(n * 0.25));
/** Unjudged tail of ayah a after its last judged word: [last, n] (last -1 when nothing of it was judged). */
function tailOf(m, a) {
  const n = session.wordCount(passage.s, a);
  let last = -1;
  for (let w = n - 1; w >= 0 && last < 0; w--) if (judged(m.get(a * 1000 + w))) last = w;
  return [last, n];
}

/** Live view: raw + pause-settled words + the short tail of an ayah the same tracker carried on into the next. */
function snapshot() {
  const m = withSoft(rawWords());
  for (let a = passage ? passage.from : 0; passage && a < passage.to; a++) {
    const [last, n] = tailOf(m, a);
    if (last < 0 || last === n - 1 || n - 1 - last > tailMax(n) || !continued(m, a)) continue;
    for (let w = last + 1; w < n; w++) if (!judged(m.get(a * 1000 + w))) m.set(a * 1000 + w, { a, w, st: 'ok', vowel: 0 });
  }
  return sorted(m);
}

/** End of take (on the raw verdicts): ayahs the engine confirmed in its final sequence count their unjudged words
 *  as read up to the last judged word; a short tail (<= 25%) too, but only where the CTC flush lagged behind the
 *  stop (nothing later was read) or the same tracker carried on into the next ayah. A raw 'wrong'/'skipped'
 *  verdict there without a correction-rule flag is only 'unsure'. Pause-settled words are added last. */
function settleFinal(words, msgs) {
  const fin = new Set();
  for (const m of msgs || []) if (m.type === 'final_sequence') for (const v of m.verses || []) if (v.surah === passage.s) fin.add(v.ayah);
  const out = words.map(x => ({ ...x }));
  const all = withSoft(out);
  let top = 0;
  for (const x of all.values()) if (read(x) && x.a > top) top = x.a;
  const byA = new Map();
  for (const x of out) { if (!byA.has(x.a)) byA.set(x.a, []); byA.get(x.a).push(x); }
  for (const a of fin) {
    const n = session.wordCount(passage.s, a);
    const have = new Map((byA.get(a) || []).map(x => [x.w, x]));
    let last = -1;
    for (const x of have.values()) if (x.st !== 'pending' && x.w > last) last = x.w;
    if (last >= 0 && (n - 1 - last) <= tailMax(n) && (a >= top || continued(all, a))) last = n - 1;
    for (let w = 0; w < n; w++) {
      const x = have.get(w);
      if (!x) { if (w <= last) out.push({ a, w, st: 'ok', vowel: 0 }); continue; }
      if (x.st === 'pending') { if (w <= last) x.st = 'ok'; continue; }
      // in a confirmed ayah only the correction rules (tuned against false flags) may call a word wrong;
      // a raw 'wrong'/'skipped' tracker verdict without a flag is only 'unsure'
      if ((x.st === 'wrong' || x.st === 'skipped') && !flagged.has(a * 1000 + w)) x.st = 'unsure';
    }
  }
  return sorted(withSoft(out));
}

function handle(msgs, sid) {
  for (const m of msgs || []) {
    if (m.type === 'correction' && m.state && m.state.phase === 'error' && m.state.issue) {
      const i = m.state.issue;
      postS(sid, { type: 'issue', issue: { kind: i.kind, a: i.ayah, w: i.word, words: i.words || 1 } });
      for (let k = 0; k < (i.words || 1); k++) flagged.add(i.ayah * 1000 + i.word + k);
      // never block the reciter: note the mistake and carry on (it is reported on the result screen)
      try { handle(session.correct('review_later'), sid); } catch (e) { /* ignore */ }
    } else if (m.type === 'correction_note' && m.issue) {
      const i = m.issue;
      postS(sid, { type: 'issue', issue: { kind: i.kind, a: i.ayah, w: i.word, words: i.words || 1 } });
    }
  }
  const words = snapshot();
  const sig = words.map(x => x.st[0] + x.vowel).join('');
  if (sig !== lastSig) { lastSig = sig; postS(sid, { type: 'verdicts', words }); }
}

const decoded = () => (session.decoder ? session.decoder.framesDecoded : 0);
// feed whatever is queued at once (no 480 ms pre-buffer on top of the model's own window, which added up to a
// chunk of delay); verdicts are only recomputed when the model actually ran or the engine said something
async function feedBuffered(sid) {
  while (sid === curSid && bufLen > 0) {
    const n = Math.min(CHUNK, bufLen);
    const out = new Float32Array(n);
    let k = 0;
    while (k < n) {
      const head = buf[0], take = Math.min(head.length, n - k);
      out.set(head.subarray(0, take), k); k += take;
      if (take === head.length) buf.shift(); else buf[0] = head.subarray(take);
    }
    bufLen -= n;
    const f0 = decoded();
    const r = await session.feed(out);
    if (r.length || decoded() !== f0) handle(r, sid);
  }
}

self.onmessage = ev => {
  const m = ev.data || {};
  // session bookkeeping is synchronous on receipt, so audio of an abandoned session never lingers in the queue
  if (m.type === 'start') { curSid = m.sid; slowSent = false; dropQueued(); lvl = recv = voiceEnd = 0; }
  else if (m.type === 'cancel') { if (m.sid === curSid) { curSid = null; dropQueued(); } }
  else if (m.type === 'pcm') {
    if (m.sid !== curSid) return;
    const x = m.samples;
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    e = x.length ? Math.sqrt(e / x.length) : 0;
    lvl = Math.max(e, lvl * 0.995);
    recv += x.length;
    if (e >= lvl * 0.2) voiceEnd = recv;
    buf.push(x); bufLen += x.length;
    trimBacklog();
  } else if (m.type === 'stop') { if (m.sid !== curSid) return; }
  chain = chain.then(async () => {
    try {
      if (m.type === 'init') {
        ort.env.wasm.numThreads = 1;                 // no COOP/COEP in the WebView: single thread
        if (m.wasmPaths) ort.env.wasm.wasmPaths = m.wasmPaths;
        const corpus = m.corpus instanceof ArrayBuffer ? JSON.parse(new TextDecoder().decode(m.corpus)) : m.corpus;
        session = await createZipformerSession({ ort, model: m.model, corpus, enableFallback: false, stayOnSurah: true });
        post({ type: 'ready' });
      } else if (m.type === 'cancel') {
        // a newer start already took over otherwise (and resets the session itself)
        if (session && curSid === null) { try { session.reset(); } catch (e) { /* ignore */ } passage = null; }
      } else if (m.type === 'start') {
        if (m.sid !== curSid) return;                // superseded before it ran
        if (!session) throw new Error('not ready');
        passage = { s: m.s | 0, from: m.from | 0, to: m.to | 0 };
        lastSig = ''; acc = new Map(); soft = new Map(); flagged = new Set(); tkOf = new Map();
        session.reset();
        session.setExpected({ surah: passage.s, ayah: passage.from, ayahEnd: passage.to });
        // engine word counts per ayah (6 ayahs split a joined Uthmani word differently from the app)
        const counts = {};
        for (let a = passage.from; a <= passage.to; a++) counts[a] = session.wordCount(passage.s, a);
        postS(m.sid, { type: 'counts', counts });
        handle(session.setMode('correction'), m.sid);
      } else if (m.type === 'pcm') {
        if (!session || !passage || m.sid !== curSid) return;
        await feedBuffered(m.sid);
      } else if (m.type === 'stop') {
        if (m.sid !== curSid) return;
        if (!session || !passage) { postS(m.sid, { type: 'stopped', words: [] }); return; }
        await feedBuffered(m.sid);
        if (m.sid !== curSid) return;
        const msgs = await session.stop();
        handle(msgs, m.sid);
        postS(m.sid, { type: 'stopped', words: settleFinal(rawWords(), msgs) });
        passage = null;
      }
    } catch (e) {
      if (m.type === 'init') post({ type: 'error', message: String((e && e.message) || e) });
      else if (m.sid !== undefined) postS(m.sid, { type: 'error', message: String((e && e.message) || e) });
    }
  });
};
