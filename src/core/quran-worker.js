// On-device Quran recognition worker: streaming Zipformer2-CTC (Quran-Lab / Tilawa, NPL-1.2) via @tilawa/core
// + onnxruntime-web (WASM). Runs off the UI thread. Protocol (postMessage):
//   in : { type:'init', model:ArrayBuffer, corpus:object, wasmPaths:string }
//        every other message carries `sid` (session id); every outbound one is tagged with it; stale sids are ignored
//        { type:'start', sid, s, from, to }      new recitation of surah s, ayahs from..to (correction mode); supersedes any older session
//        { type:'pcm', sid, samples:Float32Array }  16 kHz mono, any size (buffered to ~480 ms)
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
const CHUNK = 7680;                      // 480 ms at 16 kHz: one model chunk
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
let acc = new Map(), flagged = new Set();   // flagged: a*1000+w raised by the correction rules
function snapshot() {
  if (!session || !passage) return [];
  for (const v of session.verdicts()) {
    if (v.surah !== passage.s || v.ayah < passage.from || v.ayah > passage.to) continue;
    const k = v.ayah * 1000 + v.word, prev = acc.get(k);
    // a new tracker reports words it never heard as pending: never let that erase an earlier verdict
    if (v.state === 'pending' && prev && prev.st !== 'pending') continue;
    acc.set(k, { a: v.ayah, w: v.word, st: v.state, vowel: v.vowelErrors | 0 });
  }
  return [...acc.keys()].sort((x, y) => x - y).map(k => acc.get(k));
}

/** End of take: ayahs the engine confirmed in its final sequence count their unjudged words as read (up to the
 *  last judged word only; the unread tail is never marked ok), and a raw 'wrong'/'skipped' verdict there without
 *  a correction-rule flag is only 'unsure'. */
function settleFinal(words, msgs) {
  const fin = new Set();
  for (const m of msgs || []) if (m.type === 'final_sequence') for (const v of m.verses || []) if (v.surah === passage.s) fin.add(v.ayah);
  const out = words.map(x => ({ ...x }));
  const byA = new Map();
  for (const x of out) { if (!byA.has(x.a)) byA.set(x.a, []); byA.get(x.a).push(x); }
  for (const a of fin) {
    const n = session.wordCount(passage.s, a);
    const have = new Map((byA.get(a) || []).map(x => [x.w, x]));
    let last = -1;
    for (const x of have.values()) if (x.st !== 'pending' && x.w > last) last = x.w;
    // the engine confirmed the ayah: a short unjudged tail (<= 25% of it, the CTC flush lagging behind a
    // stop) was read; a longer one is an ayah left half-way and stays unread
    if (last >= 0 && (n - 1 - last) <= Math.max(1, Math.floor(n * 0.25))) last = n - 1;
    for (let w = 0; w < n; w++) {
      const x = have.get(w);
      if (!x) { if (w <= last) out.push({ a, w, st: 'ok', vowel: 0 }); continue; }
      if (x.st === 'pending') { if (w <= last) x.st = 'ok'; continue; }
      // in a confirmed ayah only the correction rules (tuned against false flags) may call a word wrong;
      // a raw 'wrong'/'skipped' tracker verdict without a flag is only 'unsure'
      if ((x.st === 'wrong' || x.st === 'skipped') && !flagged.has(a * 1000 + w)) x.st = 'unsure';
    }
  }
  return out.sort((x, y) => x.a - y.a || x.w - y.w);
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

async function feedBuffered(force, sid) {
  while (sid === curSid && (bufLen >= CHUNK || (force && bufLen > 0))) {
    const n = Math.min(CHUNK, bufLen);
    const out = new Float32Array(n);
    let k = 0;
    while (k < n) {
      const head = buf[0], take = Math.min(head.length, n - k);
      out.set(head.subarray(0, take), k); k += take;
      if (take === head.length) buf.shift(); else buf[0] = head.subarray(take);
    }
    bufLen -= n;
    const r = await session.feed(out);
    handle(r, sid);
  }
}

self.onmessage = ev => {
  const m = ev.data || {};
  // session bookkeeping is synchronous on receipt, so audio of an abandoned session never lingers in the queue
  if (m.type === 'start') { curSid = m.sid; slowSent = false; dropQueued(); }
  else if (m.type === 'cancel') { if (m.sid === curSid) { curSid = null; dropQueued(); } }
  else if (m.type === 'pcm') {
    if (m.sid !== curSid) return;
    buf.push(m.samples); bufLen += m.samples.length;
    trimBacklog();
  } else if (m.type === 'stop') { if (m.sid !== curSid) return; }
  chain = chain.then(async () => {
    try {
      if (m.type === 'init') {
        ort.env.wasm.numThreads = 1;                 // no COOP/COEP in the WebView: single thread
        if (m.wasmPaths) ort.env.wasm.wasmPaths = m.wasmPaths;
        session = await createZipformerSession({ ort, model: m.model, corpus: m.corpus, enableFallback: false, stayOnSurah: true });
        post({ type: 'ready' });
      } else if (m.type === 'cancel') {
        // a newer start already took over otherwise (and resets the session itself)
        if (session && curSid === null) { try { session.reset(); } catch (e) { /* ignore */ } passage = null; }
      } else if (m.type === 'start') {
        if (m.sid !== curSid) return;                // superseded before it ran
        if (!session) throw new Error('not ready');
        passage = { s: m.s | 0, from: m.from | 0, to: m.to | 0 };
        lastSig = ''; acc = new Map(); flagged = new Set();
        session.reset();
        session.setExpected({ surah: passage.s, ayah: passage.from, ayahEnd: passage.to });
        // engine word counts per ayah (6 ayahs split a joined Uthmani word differently from the app)
        const counts = {};
        for (let a = passage.from; a <= passage.to; a++) counts[a] = session.wordCount(passage.s, a);
        postS(m.sid, { type: 'counts', counts });
        handle(session.setMode('correction'), m.sid);
      } else if (m.type === 'pcm') {
        if (!session || !passage || m.sid !== curSid) return;
        await feedBuffered(false, m.sid);
      } else if (m.type === 'stop') {
        if (m.sid !== curSid) return;
        if (!session || !passage) { postS(m.sid, { type: 'stopped', words: [] }); return; }
        await feedBuffered(true, m.sid);
        if (m.sid !== curSid) return;
        const msgs = await session.stop();
        handle(msgs, m.sid);
        postS(m.sid, { type: 'stopped', words: settleFinal(snapshot(), msgs) });
        passage = null;
      }
    } catch (e) {
      if (m.type === 'init') post({ type: 'error', message: String((e && e.message) || e) });
      else if (m.sid !== undefined) postS(m.sid, { type: 'error', message: String((e && e.message) || e) });
    }
  });
};
