import test from 'node:test';
import assert from 'node:assert/strict';
import { mapVerdicts } from '../src/core/quran-engine.js';

const g = [{ a: 1, start: 0, end: 4 }];
const v = (w, st) => ({ a: 1, w, st, vowel: 0 });

test('equal counts map 1:1', () => {
  const m = mapVerdicts([v(0, 'ok'), v(3, 'wrong')], g, { 1: 4 });
  assert.equal(m.get(0).st, 'ok');
  assert.equal(m.get(3).st, 'wrong');
  assert.equal(m.size, 2);
});

test('engine fewer words spreads over app indices', () => {
  const m = mapVerdicts([v(0, 'ok'), v(1, 'wrong')], g, { 1: 2 });
  assert.deepEqual([0, 1, 2, 3].map(i => m.get(i).st), ['ok', 'ok', 'wrong', 'wrong']);
});

test('engine more words: worse verdict wins', () => {
  const ws = ['ok', 'wrong', 'ok', 'ok', 'ok', 'unsure', 'ok', 'ok'].map((st, w) => v(w, st));
  const m = mapVerdicts(ws, g, { 1: 8 });
  assert.deepEqual([0, 1, 2, 3].map(i => m.get(i).st), ['wrong', 'ok', 'unsure', 'ok']);
});
