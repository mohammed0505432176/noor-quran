import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sharedMask } from '../src/core/similar-words.js';

test('marks only the contiguous run found in another ayah', () => {
  const w = 'اولئك علي هدي من ربهم واولئك هم المفلحون'.split(' ');
  const m = sharedMask(w, ['ولتكن منكم امه واولئك هم المفلحون']);
  assert.deepEqual(m, [false, false, false, false, false, true, true, true]);
});

test('runs shorter than 3 words are ignored', () => {
  assert.deepEqual(sharedMask(['a', 'b', 'c'], ['x a b y']), [false, false, false]);
});

test('no sources or empty words give an all-false mask', () => {
  assert.deepEqual(sharedMask(['a', 'b', 'c'], []), [false, false, false]);
  assert.deepEqual(sharedMask([], ['a b c']), []);
});

test('whole-word matching only', () => {
  assert.deepEqual(sharedMask(['ab', 'cd', 'ef'], ['xab cd ef']), [false, false, false]);
});
