import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav, downsample, rms, createVad, createChunker } from '../src/core/audio-dsp.js';

const sine = (freq, rate, secs, amp = 0.5) => Float32Array.from({ length: Math.round(rate * secs) }, (_, i) => amp * Math.sin(2 * Math.PI * freq * i / rate));
const crossings = a => { let c = 0; for (let i = 1; i < a.length; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) c++; return c; };

test('encodeWav writes a correct 16 kHz mono 16-bit header', () => {
  const w = encodeWav(new Float32Array(1600), 16000);
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  const tag = o => String.fromCharCode(...w.slice(o, o + 4));
  assert.equal(w.length, 44 + 3200);
  assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
  assert.equal(v.getUint32(4, true), 36 + 3200);
  assert.equal(v.getUint32(16, true), 16);
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16000);
  assert.equal(v.getUint32(28, true), 32000);
  assert.equal(v.getUint16(32, true), 2);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 3200);
});

test('encodeWav clips samples outside [-1, 1]', () => {
  const w = encodeWav(Float32Array.from([2, -2, 1, -1, 0, 0.5]), 16000);
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  const s = i => v.getInt16(44 + i * 2, true);
  assert.equal(s(0), 32767); assert.equal(s(1), -32768);
  assert.equal(s(2), 32767); assert.equal(s(3), -32768);
  assert.equal(s(4), 0);
  assert.ok(Math.abs(s(5) - 16384) <= 1);
});

test('downsample 48k -> 16k keeps length and a 1 kHz tone', () => {
  const out = downsample(sine(1000, 48000, 1), 48000, 16000);
  assert.equal(out.length, 16000);
  const c = crossings(out);
  assert.ok(c >= 1996 && c <= 2004, 'zero crossings ' + c);
  assert.ok(rms(out) > 0.3);
});

test('downsample 44.1k -> 16k has the right length', () => {
  const out = downsample(sine(1000, 44100, 1), 44100, 16000);
  assert.ok(Math.abs(out.length - 16000) <= 1);
  assert.ok(Math.abs(crossings(out) - 2000) <= 6);
});

const feed = (vad, level, ms, cuts) => {
  for (let t = 0; t < ms; t += 20) { if (vad.push(level, 20) === 'cut') cuts.push(vad.lastCut); }
};

test('VAD: silence only never cuts', () => {
  const vad = createVad(); const cuts = [];
  feed(vad, 0.002, 30000, cuts);
  assert.equal(cuts.length, 0);
  assert.equal(vad.active, false);
});

test('VAD: 2 s speech + 0.8 s silence gives exactly one cut', () => {
  const vad = createVad(); const cuts = [];
  feed(vad, 0.001, 600, cuts);
  feed(vad, 0.1, 2000, cuts);
  feed(vad, 0.001, 800, cuts);
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].reason, 'silence');
  assert.ok(cuts[0].trimTailMs > 200 && cuts[0].trimTailMs < 300);
});

test('VAD: short speech (< 1 s) is not cut at a normal pause', () => {
  const vad = createVad(); const cuts = [];
  feed(vad, 0.1, 600, cuts);
  feed(vad, 0.001, 800, cuts);
  assert.equal(cuts.length, 0);
});

test('VAD: continuous speech 15 s is force-cut at ~12 s', () => {
  const vad = createVad(); const cuts = [];
  let cutAt = null;
  for (let t = 20; t <= 15000; t += 20) {
    if (vad.push(0.1, 20) === 'cut') { cuts.push(vad.lastCut); if (cutAt === null) cutAt = t; }
  }
  assert.equal(cuts[0].reason, 'max');
  assert.ok(cutAt >= 11900 && cutAt <= 12100, 'cut at ' + cutAt);
});

test('chunker: speech between silences yields one WAV-ready chunk with pre-roll', () => {
  const ch = createChunker(); const chunks = [];
  const noise = n => Float32Array.from({ length: n }, () => (Math.random() - 0.5) * 0.004);
  chunks.push(...ch.push(noise(8000)));
  chunks.push(...ch.push(sine(300, 16000, 2)));
  chunks.push(...ch.push(noise(16000)));
  chunks.push(...ch.flush());
  assert.equal(chunks.length, 1);
  const secs = chunks[0].length / 16000;
  assert.ok(secs > 2.1 && secs < 2.8, 'chunk seconds ' + secs);
});

test('chunker: silence only emits nothing', () => {
  const ch = createChunker();
  const out = [...ch.push(new Float32Array(16000 * 20)), ...ch.flush()];
  assert.equal(out.length, 0);
});

test('chunker: 15 s continuous speech is split, none above ~12 s, no audio lost', () => {
  const ch = createChunker();
  const out = [...ch.push(sine(300, 16000, 15)), ...ch.flush()];
  assert.ok(out.length >= 2);
  out.forEach(c => assert.ok(c.length / 16000 <= 12.1));
  const total = out.reduce((n, c) => n + c.length, 0) / 16000;
  assert.ok(total > 14.9 && total <= 15.01, 'total ' + total);
});
