import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSimilar, wrongRuns, _setIndexForTest } from '../src/core/mutashabih.js';

const T = 'اولئك علي هدي من ربهم واولئك هم المفلحون';
const IDX = [
  [2, 5, T],
  [2, 6, 'ان الذين كفروا سواء عليهم'],
  [7, 157, 'الذين يتبعون الرسول واولئك هم المفلحون'],
  [3, 104, 'ولتكن منكم امه واولئك هم المفلحون'],
  [31, 5, T],
  [9, 9, 'اولئك علي هدي من ربهم'],
];
const W = (i, kind, heard) => ({ i, kind, heard });

test('wrongRuns groups consecutive wrong words, tolerates one skip', () => {
  const r = wrongRuns([W(0, 'ok'), W(1, 'wrong', 'a'), W(2, 'wrong', 'b'), W(3, 'skip'), W(4, 'wrong', 'c'), W(5, 'ok')]);
  assert.deepEqual(r, [{ from: 1, to: 4, heard: ['a', 'b', 'c'] }]);
});

test('wrongRuns drops short runs and splits on ok / double skip', () => {
  assert.deepEqual(wrongRuns([W(0, 'wrong', 'a'), W(1, 'wrong', 'b'), W(2, 'ok')]), []);
  const r = wrongRuns([W(0, 'wrong', 'a'), W(1, 'wrong', 'b'), W(2, 'wrong', 'c'), W(3, 'skip'), W(4, 'skip'), W(5, 'wrong', 'd'), W(6, 'wrong', 'e')]);
  assert.deepEqual(r, [{ from: 0, to: 2, heard: ['a', 'b', 'c'] }]);
});

test('findSimilar excludes current ayah and orders same surah first by distance, then surah number', () => {
  _setIndexForTest(IDX);
  const r = findSimilar(['واولئك', 'هم', 'المفلحون'], { s: 7, a: 157 });
  assert.deepEqual(r, [{ s: 2, a: 5 }, { s: 3, a: 104 }, { s: 31, a: 5 }]);
  const r2 = findSimilar(['اولئك', 'علي', 'هدي', 'من', 'ربهم'], { s: 2, a: 5 });
  assert.deepEqual(r2, [{ s: 9, a: 9 }, { s: 31, a: 5 }]);
});

test('findSimilar prefers same surah by distance', () => {
  _setIndexForTest([[2, 5, T], [2, 50, T], [2, 8, T], [1, 1, T]]);
  const r = findSimilar(['علي', 'هدي', 'من'], { s: 2, a: 7 });
  assert.deepEqual(r, [{ s: 2, a: 8 }, { s: 2, a: 5 }, { s: 2, a: 50 }]);
});

test('findSimilar falls back to longest window and respects word boundaries', () => {
  _setIndexForTest(IDX);
  const r = findSimilar(['xx', 'علي', 'هدي', 'من'], { s: 2, a: 5 });
  assert.deepEqual(r, [{ s: 9, a: 9 }, { s: 31, a: 5 }]);
  assert.deepEqual(findSimilar(['لئك', 'علي', 'هدي'], { s: 1, a: 1 }), []);
});

test('findSimilar returns [] for fewer than 3 words or no index', () => {
  _setIndexForTest(IDX);
  assert.deepEqual(findSimilar(['علي', 'هدي'], { s: 1, a: 1 }), []);
  _setIndexForTest(null);
  assert.deepEqual(findSimilar(['علي', 'هدي', 'من'], { s: 1, a: 1 }), []);
});
