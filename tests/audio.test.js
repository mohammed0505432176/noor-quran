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
