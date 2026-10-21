import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMatcher } from '../src/core/matcher.js';
import { norm, words } from '../src/core/arabic.js';

const Q = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
const surahText = s => {
  const x = Array.isArray(Q) ? Q[s - 1] : Q[s] || Q.surahs?.[s - 1];
  const ayat = x.v;
  return ayat.map(v => (typeof v === 'string' ? v : v.text || v.t)).join(' ');
};

test('incremental alignment equals a fresh alignment on every prefix', () => {
  const W = words(surahText(67)).slice(0, 120);
  const spoken = W.map(norm);
  // introduce mistakes: skip, wrong word, repetition, filler
  spoken.splice(10, 1); spoken[20] = 'كتاب'; spoken.splice(30, 0, spoken[28], spoken[29]); spoken.splice(50, 0, 'امم');
  const inc = createMatcher(W);
  for (let k = 1; k <= spoken.length; k++) {
    const txt = spoken.slice(0, k).join(' ');
    const a = inc.update(txt).states, b = createMatcher(W).update(txt).states;
    assert.deepEqual(a, b, 'prefix ' + k);
    // revised interim hypothesis for the last word must also equal a fresh run
    const alt = spoken.slice(0, k - 1).concat(['زززز']).join(' ');
    assert.deepEqual(inc.update(alt).states, createMatcher(W).update(alt).states, 'alt ' + k);
  }
});

test('peek does not disturb the incremental cache', () => {
  const W = words(surahText(1));
  const m = createMatcher(W);
  m.update('الحمد لله رب');
  m.peek('الحمد لله رب العالمين الرحمن'); m.peek('شيء اخر تماما');
  const r = m.update('الحمد لله رب العالمين');
  assert.deepEqual(r.states, createMatcher(W).update('الحمد لله رب العالمين').states);
});

test('split and merged recognizer words are accepted', () => {
  const m = createMatcher(['يَـٰٓأَيُّهَا', 'ٱلنَّاسُ', 'ٱعْبُدُوا۟']);
  assert.deepEqual(m.update('يا ايها الناس اعبدوا').states, ['ok', 'ok', 'ok']);
  const m2 = createMatcher(['بِسْمِ', 'ٱللَّهِ', 'ٱلرَّحْمَـٰنِ']);
  assert.deepEqual(m2.update('بسمالله الرحمن').states, ['ok', 'ok', 'ok']);
});

test('a forgotten ayah is skipped once the reciter is confirmed further on', () => {
  const W = words(surahText(112));     // 15 words
  const m = createMatcher(W);
  // recites ayah 1, forgets ayahs 2-3, continues with ayah 4
  const r = m.update('قل هو الله احد ولم يكن له كفوا احد');
  assert.equal(r.states[0], 'ok');
  assert.equal(r.states[W.length - 1], 'ok');
  assert.ok(r.states.slice(4, 10).every(x => x === 'bad'));
  assert.ok(r.states.slice(10).every(x => x === 'ok'));
});

test('going back to correct a word turns it green', () => {
  const W = words(surahText(1)).slice(4, 10);
  const m = createMatcher(W);
  const r1 = m.update('الحمد لله جبل العالمين');
  assert.equal(r1.states[2], 'bad');
  const r2 = m.update('الحمد لله جبل العالمين رب العالمين الرحمن');
  assert.equal(r2.states[2], 'ok');
});

test('long passage stays fast (Al-Baqarah word by word with interim revisions)', () => {
  const W = words(surahText(2)).slice(0, 2500);
  const m = createMatcher(W);
  const spoken = W.map(norm);
  const t0 = Date.now();
  let txt = '';
  for (let k = 0; k < spoken.length; k++) {
    m.update(txt + ' ' + spoken[k].slice(0, 2));     // interim half-word
    txt = txt ? txt + ' ' + spoken[k] : spoken[k];
    m.update(txt);
  }
  const ms = Date.now() - t0;
  const r = m.update(txt);
  assert.ok(r.states.every(x => x === 'ok'));
  assert.ok(ms < 3000, 'took ' + ms + 'ms for ' + spoken.length * 2 + ' updates');
  console.log('# baqarah 2500 words, 5000 updates:', ms, 'ms →', (ms / 5000).toFixed(3), 'ms/update');
});
