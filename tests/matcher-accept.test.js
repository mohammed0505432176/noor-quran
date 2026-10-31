// Acceptance of a recognised word as the expected one (src/core/matcher.js). A lexically similar but different Quran word
// must not be recorded as a correct verdict; the usual recogniser slips (dropped letter, assimilated lam) still are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatcher } from '../src/core/matcher.js';

const verdict = (expected, heard) => createMatcher([expected]).update(heard).states[0];

test('a different word with a similar shape is not accepted: الرحمن is not الرحيم', () => {
  assert.notEqual(verdict('الرحمن', 'الرحيم'), 'ok');
  assert.notEqual(verdict('هو', 'هم'), 'ok');
  assert.notEqual(verdict('قل', 'فل'), 'ok');
});

test('recogniser slips on the same word are accepted', () => {
  assert.equal(verdict('العالمين', 'العالمن'), 'ok', 'a dropped letter in a long word');
  assert.equal(verdict('الله', 'لله'), 'ok', 'the lam of ال assimilated');
  assert.equal(verdict('بسم', 'بسمِ'), 'ok', 'diacritics do not count');
  assert.equal(verdict('الذين', 'الذي'), 'ok', 'one letter off in a long word');
});

test('a wrong word inside a correct ayah is not counted as read: 1:3 with الرحيم where الرحمن is expected', () => {
  const ayah = ['الرحمن', 'الرحيم'];
  const r = createMatcher(ayah).update('الرحيم الرحيم');
  assert.notEqual(r.states[0], 'ok', 'the first word is not the Quran word');
});

test('an ayah recited correctly is all ok (no false mistake from the tighter threshold)', () => {
  const ayah = ['الحمد', 'لله', 'رب', 'العالمين'];
  assert.deepEqual(createMatcher(ayah).update('الحمد لله رب العالمين').states, ['ok', 'ok', 'ok', 'ok']);
});
