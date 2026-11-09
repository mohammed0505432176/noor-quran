import test from 'node:test';
import assert from 'node:assert/strict';
import { createMistakeBuzz, BUZZ_GAP_MS } from '../src/core/platform.js';

test('a wrong word buzzes once with the mistake kind', () => {
  const fired = []; let t = 1000;
  const buzz = createMistakeBuzz(() => t, BUZZ_GAP_MS, k => fired.push(k));
  assert.equal(buzz(), true);
  assert.deepEqual(fired, ['mistake']);
});

test('the same mistake reported twice (verdict + issue) buzzes only once', () => {
  const fired = []; let t = 5000;
  const buzz = createMistakeBuzz(() => t, BUZZ_GAP_MS, k => fired.push(k));
  buzz(); t += 120; assert.equal(buzz(), false); t += 600; assert.equal(buzz(), false);
  assert.equal(fired.length, 1);
});

test('a later mistake buzzes again after the gap', () => {
  const fired = []; let t = 0;
  const buzz = createMistakeBuzz(() => t, BUZZ_GAP_MS, k => fired.push(k));
  buzz(); t += BUZZ_GAP_MS; assert.equal(buzz(), true);
  assert.equal(fired.length, 2);
});
