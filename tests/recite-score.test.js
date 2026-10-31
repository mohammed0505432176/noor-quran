// Range recitation scoring (src/core/recite-score.js, used by finalize() in views/recite.js): words after the last one
// reached are not scored; words before it are, including the ones the reciter jumped over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreSession } from '../src/core/recite-score.js';

// a passage of 2 ayahs: ayah 1 = words 0..3, ayah 2 = words 4..6
const groups = [{ a: 1, start: 0, end: 4 }, { a: 2, start: 4, end: 7 }];

test('session ended before anything was recited: nothing is scored, accuracy is 0', () => {
  const r = scoreSession(['pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending'], { groups });
  assert.equal(r.reached, -1);
  assert.equal(r.scoped, 0);
  assert.equal(r.acc, 0);
  assert.ok(r.st.every(x => x === 'na'), 'no word is a mistake');
  assert.deepEqual(r.ayahStats, [], 'no ayah is reported as recited');
});

test('session ended at the beginning of the passage: only the words read count, the rest is not scored', () => {
  const r = scoreSession(['ok', 'ok', 'pending', 'pending', 'pending', 'pending', 'pending'], { groups });
  assert.equal(r.reached, 1);
  assert.equal(r.scoped, 2);
  assert.equal(r.ok, 2);
  assert.equal(r.acc, 100, 'the unrecited 5 words are not in the denominator');
  assert.deepEqual(r.st.slice(2), ['na', 'na', 'na', 'na', 'na']);
  assert.deepEqual(r.ayahStats, [{ a: 1, ok: 2, n: 2, acc: 100 }]);
});

test('session ended in the middle of the passage: mistakes before the stop count, words after it do not', () => {
  // words: ok, substituted (bad), ok, ok | ok, pending, pending  -> reached word 4
  const r = scoreSession(['ok', 'bad', 'ok', 'ok', 'ok', 'pending', 'pending'], { groups });
  assert.equal(r.reached, 4);
  assert.equal(r.scoped, 5);
  assert.equal(r.ok, 4);
  assert.equal(r.acc, 80, '4 of 5 scored words, not 4 of 7');
  assert.deepEqual(r.ayahStats, [{ a: 1, ok: 3, n: 4, acc: 75 }, { a: 2, ok: 1, n: 1, acc: 100 }]);
});

test('session ended at the end of the passage: the whole passage is scored', () => {
  const r = scoreSession(['ok', 'ok', 'bad', 'ok', 'ok', 'ok', 'uns'], { groups });
  assert.equal(r.reached, 6);
  assert.equal(r.scoped, 7);
  assert.equal(r.ok, 6);
  assert.equal(r.acc, 86);
  assert.deepEqual(r.ayahStats, [{ a: 1, ok: 3, n: 4, acc: 75 }, { a: 2, ok: 3, n: 3, acc: 100 }]);
});

test('a word jumped over before the stop is a mistake and is counted in the denominator', () => {
  // the reciter read words 0, 2, 3 and then 4; word 1 was jumped over (still pending) before the stop point
  const r = scoreSession(['ok', 'pending', 'ok', 'ok', 'ok', 'pending', 'pending'], { groups });
  assert.equal(r.reached, 4);
  assert.equal(r.st[1], 'bad', 'the jumped-over word is a mistake');
  assert.equal(r.scoped, 5);
  assert.equal(r.acc, 80, '4 of 5 (the jumped-over word counts against), not 4 of 7');
});

test('revealed (peeked) words and words flagged by a correction rule are mistakes inside the scope', () => {
  const r = scoreSession(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'pending'], {
    groups,
    forced: new Set([1]),
    hard: i => i === 3
  });
  assert.equal(r.reached, 5);
  assert.equal(r.scoped, 6);
  assert.equal(r.ok, 4);
  assert.equal(r.acc, 67);
});

test('an empty passage scores nothing and does not divide by zero', () => {
  const r = scoreSession([], { groups: [] });
  assert.equal(r.scoped, 0);
  assert.equal(r.acc, 0);
  assert.deepEqual(r.st, []);
});
