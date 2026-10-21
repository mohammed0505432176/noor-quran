import { test } from 'node:test';
import assert from 'node:assert';
import { createMatcher, similarity, levenshtein } from '../src/core/matcher.js';

const A2 = 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ'.split(' ');
const A3 = 'ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ مَـٰلِكِ يَوْمِ ٱلدِّينِ'.split(' ');

test('levenshtein and similarity', () => {
  assert.equal(levenshtein('كتاب', 'كتاب'), 0);
  assert.equal(levenshtein('كتاب', 'كتب'), 1);
  assert.ok(similarity('رب', 'رب') === 1);
});

test('perfect recitation without tashkeel', () => {
  const m = createMatcher(A2);
  const r = m.update('الحمد لله رب العالمين');
  assert.deepEqual(r.states, ['ok', 'ok', 'ok', 'ok']);
  assert.equal(r.pointer, 4);
  assert.equal(r.acc, 100);
});

test('one skipped word is marked bad', () => {
  const m = createMatcher(A2);
  const r = m.update('الحمد لله العالمين');
  assert.deepEqual(r.states, ['ok', 'ok', 'bad', 'ok']);
  assert.equal(m.finish().missed.length, 1);
});

test('one wrong word is marked bad', () => {
  const m = createMatcher(A2);
  const r = m.update('الحمد لله جبل العالمين');
  assert.deepEqual(r.states, ['ok', 'ok', 'bad', 'ok']);
  assert.equal(r.acc, 75);
});

test('filler words are ignored', () => {
  const m = createMatcher(A2);
  const r = m.update('امم الحمد امم لله رب اه العالمين');
  assert.deepEqual(r.states, ['ok', 'ok', 'ok', 'ok']);
});

test('repeated phrase does not break alignment', () => {
  const m = createMatcher(A2);
  const r = m.update('الحمد لله الحمد لله رب العالمين');
  assert.deepEqual(r.states, ['ok', 'ok', 'ok', 'ok']);
});

test('waw/fa prefix and al- differences', () => {
  const m = createMatcher(['وَٱلْعَصْرِ', 'إِنَّ', 'ٱلْإِنسَـٰنَ']);
  const r = m.update('العصر ان انسان');
  assert.deepEqual(r.states, ['ok', 'ok', 'ok']);
  const m2 = createMatcher(['رَبِّ', 'ٱلْعَـٰلَمِينَ']);
  assert.equal(m2.update('رب والعالمين').acc, 100);
});

test('hamza, alef, ta marbuta and ya variants', () => {
  const m = createMatcher(['ٱلْجَنَّةُ', 'أُو۟لَـٰٓئِكَ', 'ٱلْهُدَىٰ']);
  const r = m.update('الجنه اولائك الهدي');
  assert.deepEqual(r.states, ['ok', 'ok', 'ok']);
});

test('incremental updates give monotonic pointer', () => {
  const words = 'الحمد لله رب العالمين'.split(' ');
  const m = createMatcher(A2);
  let last = 0;
  for (let i = 1; i <= words.length; i++) {
    const r = m.update(words.slice(0, i).join(' '));
    assert.ok(r.pointer >= last);
    assert.equal(r.pointer, i);
    last = r.pointer;
  }
});

test('finish marks the rest bad', () => {
  const m = createMatcher(A3);
  const r1 = m.update('الرحمن الرحيم');
  assert.equal(r1.states[2], 'pending');
  const f = m.finish();
  assert.deepEqual(f.states, ['ok', 'ok', 'bad', 'bad', 'bad']);
  assert.equal(f.acc, 40);
  assert.equal(f.missed.length, 3);
});
