import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMistakes } from '../src/core/feedback.js';

const E = 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ'.split(' ');
const kinds = r => r.words.map(w => w.kind);

test('all ok', () => {
  const r = analyzeMistakes(E, 'الحمد لله رب العالمين الرحمن الرحيم', E.map(() => 'ok'));
  assert.deepEqual(kinds(r), E.map(() => 'ok'));
  assert.deepEqual(r.extras, []);
  assert.equal(r.words.length, E.length);
});

test('skipped word', () => {
  const st = ['ok', 'ok', 'bad', 'ok', 'ok', 'ok'];
  const r = analyzeMistakes(E, 'الحمد لله العالمين الرحمن الرحيم', st);
  assert.equal(r.words[2].kind, 'skip');
  assert.equal(r.words[2].heard, '');
  assert.deepEqual(r.extras, []);
});

test('substituted word reports heard', () => {
  const st = ['ok', 'ok', 'ok', 'ok', 'bad', 'ok'];
  const r = analyzeMistakes(E, 'الحمد لله رب العالمين كتاب الرحيم', st);
  assert.equal(r.words[4].kind, 'wrong');
  assert.equal(r.words[4].heard, 'كتاب');
});

test('inserted extra word', () => {
  const st = E.map(() => 'ok');
  const r = analyzeMistakes(E, 'الحمد لله كتاب رب العالمين الرحمن الرحيم', st);
  assert.deepEqual(r.extras, [{ after: 1, heard: 'كتاب' }]);
});

test('repetition is not an extra', () => {
  const st = E.map(() => 'ok');
  const r = analyzeMistakes(E, 'الحمد لله لله رب العالمين الرحمن الرحيم', st);
  assert.deepEqual(r.extras, []);
});

test('hinted word has kind hint', () => {
  const st = ['ok', 'ok', 'bad', 'ok', 'ok', 'ok'];
  const r = analyzeMistakes(E, 'الحمد لله العالمين الرحمن الرحيم', st, new Set([2]));
  assert.equal(r.words[2].kind, 'hint');
});

test('states are authoritative', () => {
  const st = ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'];
  const r = analyzeMistakes(E, 'الحمد كتاب', st);
  assert.deepEqual(kinds(r), E.map(() => 'ok'));
});

test('empty heard makes bad words skip', () => {
  const st = E.map(() => 'bad');
  const r = analyzeMistakes(E, '', st);
  assert.deepEqual(kinds(r), E.map(() => 'skip'));
  assert.deepEqual(r.extras, []);
});

test('bad word aligned to a close match reports wrong with empty heard', () => {
  const st = ['ok', 'ok', 'ok', 'bad', 'ok', 'ok'];
  const r = analyzeMistakes(E, 'الحمد لله رب العالمين الرحمن الرحيم', st);
  assert.equal(r.words[3].kind, 'wrong');
  assert.equal(r.words[3].heard, '');
});

test('800x800 input completes quickly', () => {
  const letters = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
  let seed = 12345;
  const rnd = k => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
  const vocab = Array.from({ length: 300 }, () => {
    let w = '';
    const len = 3 + rnd(5);
    for (let i = 0; i < len; i++) w += letters[rnd(letters.length)];
    return w;
  });
  const exp = Array.from({ length: 800 }, () => vocab[rnd(vocab.length)]);
  const heard = Array.from({ length: 800 }, (_, i) => (rnd(3) ? exp[i] : vocab[rnd(vocab.length)]));
  const st = exp.map(() => (rnd(2) ? 'ok' : 'bad'));
  const t0 = performance.now();
  const r = analyzeMistakes(exp, heard.join(' '), st);
  const ms = performance.now() - t0;
  console.log('800x800 ms:', Math.round(ms));
  assert.equal(r.words.length, 800);
  assert.ok(ms < 1500, `took ${ms}ms`);
});

test('over the cap skips alignment', () => {
  const exp = Array.from({ length: 801 }, () => 'كتاب');
  const r = analyzeMistakes(exp, 'كتاب كتاب', exp.map(() => 'bad'));
  assert.ok(r.words.every(w => w.kind === 'skip'));
  assert.deepEqual(r.extras, []);
});
