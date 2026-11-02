import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, audioUrl } from '../src/core/audio.js';

const q = { s: 2, from: 3, to: 5, repeatEach: 1, loopRange: false };
test('nextIndex advances then ends', () => {
  assert.deepEqual(nextIndex(q, { s: 2, a: 3 }, 1, true), { s: 2, a: 4 });
  assert.equal(nextIndex(q, { s: 2, a: 5 }, 1, true), null);
});
test('nextIndex loops range', () => {
  assert.deepEqual(nextIndex({ ...q, loopRange: true }, { s: 2, a: 5 }, 1, false), { s: 2, a: 3 });
});
test('nextIndex repeats each ayah', () => {
  const r = { ...q, repeatEach: 3 };
  assert.equal(nextIndex(r, { s: 2, a: 3 }, 1, true).a, 3);
  assert.equal(nextIndex(r, { s: 2, a: 3 }, 3, true).a, 4);
});
test('audioUrl format', () => {
  assert.match(audioUrl(1, 2, 'Alafasy_128kbps'), /Alafasy_128kbps\/001002\.mp3$/);
});

import { earlyDelayMs } from '../src/core/audio.js';
test('earlyDelayMs aims at the early-advance point', () => {
  assert.equal(earlyDelayMs(NaN, 0, 1), null);
  assert.equal(Math.round(earlyDelayMs(10, 2, 1, 0.08)), 7920);
  assert.equal(Math.round(earlyDelayMs(10, 2, 2, 0.08)), 3920);
  assert.equal(earlyDelayMs(10, 9.99, 1, 0.08), 0);
});

import { normRepeat, setRepeat, getRepeat, currentRange, RATES, REPEATS, setRate, getRate, RECITERS } from '../src/core/audio.js';
test('repeat counts are limited to the offered choices', () => {
  assert.deepEqual(REPEATS, [1, 3, 5, 10]);
  assert.equal(normRepeat(5), 5);
  assert.equal(normRepeat(7), 1);
  assert.equal(normRepeat('abc'), 1);
});
test('setRepeat keeps preferences without a running queue', () => {
  setRepeat({ repeatEach: 3, loopRange: true });
  assert.deepEqual(getRepeat(), { repeatEach: 3, loopRange: true });
  setRepeat({ repeatEach: 99 });
  assert.equal(getRepeat().repeatEach, 1);
  setRepeat({ loopRange: false });
  assert.equal(currentRange(), null);
});
test('speeds offered are all accepted and others are clamped', () => {
  for (const r of RATES) assert.equal(setRate(r), r);
  assert.equal(setRate(3), 1.5);
  assert.equal(setRate(0.1), 0.75);
  setRate(1); assert.equal(getRate(), 1);
});
test('Husary stays in the reciter list', () => {
  assert.ok(RECITERS.some(r => r.id === 'Husary_128kbps'));
});
