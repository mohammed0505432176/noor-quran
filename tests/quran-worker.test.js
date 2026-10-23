// quran-worker.js verdict layering against a scripted fake engine (no model): a short unjudged ayah tail is only
// settled as read when the SAME tracker carried on into the next ayah, never across a relocation (a skipped tail).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const stubs = {
  '@tilawa/core': 'data:text/javascript,export const createZipformerSession = o => globalThis.__fake(o);',
  'onnxruntime-web/wasm': 'data:text/javascript,export const env = { wasm: {} };'
};
register('data:text/javascript,' + encodeURIComponent(`const m = ${JSON.stringify(stubs)};
export async function resolve(s, c, n) { return m[s] ? { url: m[s], shortCircuit: true } : n(s, c); }`));

const N = { 1: 12, 2: 5, 7: 4 };                            // ayah 1: 12 words, ayah 2: 5 words, ayah 7: 4 words (free mode test)
const v = (ayah, word, state) => ({ surah: 2, ayah, word, state, vowelErrors: 0, distance: 0 });
let steps = [], finalMsgs = [];
const fake = {
  engine: { tracker: {}, tracer: { verdicts: () => [] }, isHeld: () => false, framesDecoded: 0, lastCharFrame: 0 },
  practiceEngine: null, decoder: { framesDecoded: 0, pendingFrame: null }, cur: [],
  wordCount: (s, a) => N[a] || 0,
  verdicts() { return this.cur; },
  async feed() {
    const st = steps.shift();
    if (st) { if (st.relocate) this.engine.tracker = {}; this.cur = st.verdicts; }
    this.decoder.framesDecoded += 12; this.engine.framesDecoded += 12; this.engine.lastCharFrame = this.engine.framesDecoded;
    return [];
  },
  async stop() { return finalMsgs; },
  reset() { this.cur = []; this.engine.tracker = {}; }, setExpected() {}, setMode: () => [], correct: () => []
};
globalThis.__fake = async () => fake;

let onMsg = () => {};
globalThis.self = globalThis;
globalThis.postMessage = m => onMsg(m);
await import('../src/core/quran-worker.js');
const send = m => self.onmessage({ data: m });
const next = type => new Promise(res => { onMsg = m => { if (m.type === type) res(m); }; });
await (async () => { const p = next('ready'); send({ type: 'init', model: new ArrayBuffer(8), corpus: {} }); await p; })();

let sid = 0;
async function run(script, fin) {
  steps = script.slice(); finalMsgs = fin;
  send({ type: 'start', sid: ++sid, s: 2, from: 1, to: 2 });
  let live = [];
  onMsg = m => { if (m.type === 'verdicts') live = m.words; };
  for (let i = 0; i < script.length; i++) { send({ type: 'pcm', sid, samples: new Float32Array(160) }); await new Promise(r => setTimeout(r, 5)); }
  const stopped = next('stopped'); send({ type: 'stop', sid });
  return { live, final: (await stopped).words };
}
const st = (words, a, w) => (words.find(x => x.a === a && x.w === w) || { st: 'none' }).st;
const range = (a, from, to, state) => Array.from({ length: to - from }, (_, k) => v(a, from + k, state));
const confirmed = [{ type: 'final_sequence', verses: [{ surah: 2, ayah: 1 }, { surah: 2, ayah: 2 }] }];

test('a skipped 3-word tail of a 12-word ayah, then a relocation to the next ayah, stays unread live and final', async () => {
  const { live, final } = await run([
    { verdicts: range(1, 0, 9, 'ok') },                              // words 1..9 read, then the reciter jumps
    { relocate: true, verdicts: range(2, 0, 3, 'ok') }               // new tracker locks onto ayah 2
  ], confirmed);
  for (const w of [9, 10, 11]) {
    assert.ok(!['ok', 'unsure'].includes(st(live, 1, w)), `live 1:${w} ${st(live, 1, w)}`);
    assert.ok(!['ok', 'unsure'].includes(st(final, 1, w)), `final 1:${w} ${st(final, 1, w)}`);
  }
  assert.equal(st(live, 2, 2), 'ok');
});

test('the same tracker carrying on into the next ayah settles the lagging last word live', async () => {
  const { live, final } = await run([
    { verdicts: [...range(1, 0, 11, 'ok'), v(1, 11, 'pending')] },
    { verdicts: [...range(1, 0, 11, 'ok'), v(1, 11, 'pending'), ...range(2, 0, 2, 'ok')] }
  ], confirmed);
  assert.equal(st(live, 1, 11), 'ok');
  assert.equal(st(final, 1, 11), 'ok');
});

test('free mode across two surahs: verdicts keep their surah keys and nothing leaks between surahs', async () => {
  const sv = (s, a, w, state) => ({ surah: s, ayah: a, word: w, state, vowelErrors: 0, distance: 0 });
  const seen = new Map();
  steps = [
    { verdicts: [0, 1, 2, 3].map(w => sv(1, 7, w, 'ok')) },                                                   // surah 1 ayah 7
    { verdicts: [0, 1, 2, 3].map(w => sv(1, 7, w, 'ok')).concat([0, 1, 2].map(w => sv(112, 1, w, 'ok'))) }    // then 112:1
  ];
  finalMsgs = [];
  onMsg = m => { if (m.type === 'verdicts') for (const x of m.words) seen.set(`${x.s}:${x.a}:${x.w}`, x.st); };
  send({ type: 'start', sid: ++sid, free: true });
  await new Promise(r => setTimeout(r, 20));
  const feeds = steps.length;                                        // the fake consumes `steps` as it feeds
  for (let i = 0; i < feeds; i++) { send({ type: 'pcm', sid, samples: new Float32Array(7680) }); await new Promise(r => setTimeout(r, 20)); }
  const stopped = next('stopped'); send({ type: 'stop', sid });
  const fin = await stopped;
  const keys = [...seen.keys()];
  assert.ok(keys.length > 0, 'verdicts were produced');
  for (const k of keys) assert.ok(k.startsWith('1:7:') || k.startsWith('112:1:'), `unexpected key ${k}`);
  assert.equal(seen.get('1:7:0'), 'ok');
  assert.equal(seen.get('112:1:0'), 'ok');
  for (const x of fin.words) assert.ok((x.s === 1 && x.a === 7) || (x.s === 112 && x.a === 1), `final leaked ${x.s}:${x.a}`);
});

test('the passage\'s last reached ayah keeps the stop-lag rule (short tail of a confirmed ayah is read)', async () => {
  const { final } = await run([{ verdicts: [...range(1, 0, 12, 'ok'), ...range(2, 0, 4, 'ok')] }], confirmed);
  assert.equal(st(final, 2, 4), 'ok');
});

test('free mode: a brief wrong lock on another surah (3 verdicts, then relocation) leaves no trace in the final words', async () => {
  const sv = (s, a, w, state) => ({ surah: s, ayah: a, word: w, state, vowelErrors: 0, distance: 0 });
  steps = [
    { verdicts: [sv(3, 7, 0, 'ok'), sv(3, 7, 1, 'skipped'), sv(3, 7, 2, 'ok')] },                                   // wrong lock, 3 verdicts
    { relocate: true, verdicts: [sv(3, 7, 0, 'ok'), sv(3, 7, 1, 'skipped'), sv(3, 7, 2, 'ok'), ...[0, 1, 2, 3, 4].map(w => sv(2, 2, w, 'ok'))] }
  ];
  finalMsgs = [{ type: 'final_sequence', verses: [{ surah: 2, ayah: 2 }] }];
  onMsg = () => {};
  send({ type: 'start', sid: ++sid, free: true });
  await new Promise(r => setTimeout(r, 20));
  for (let i = 0; i < 2; i++) { send({ type: 'pcm', sid, samples: new Float32Array(7680) }); await new Promise(r => setTimeout(r, 20)); }
  const stopped = next('stopped'); send({ type: 'stop', sid });
  const fin = await stopped;
  assert.ok(fin.words.length > 0 && fin.words.every(x => x.s === 2 && x.a === 2), 'only the confirmed surah remains');
  assert.ok(!fin.words.some(x => x.st === 'skipped'), 'no raw skip without a correction flag');
});
