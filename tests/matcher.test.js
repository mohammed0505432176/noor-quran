import { test } from 'node:test';
import assert from 'node:assert';
import { createMatcher, stripOpeners, similarity, levenshtein } from '../src/core/matcher.js';

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

const A112 = 'قُلْ هُوَ ٱللَّهُ أَحَدٌ ٱللَّهُ ٱلصَّمَدُ لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ'.split(' ');

test('stripOpeners removes isti\'adha and basmala', () => {
  assert.equal(stripOpeners('أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم قل هو الله احد', false), 'قل هو الله احد');
  assert.equal(stripOpeners('بسم الله اعوذ بالله من الشيطان قل هو', false), 'قل هو');
  assert.equal(stripOpeners('اعوذ بالله من الشيطان بسم الله الرحيم الحمد لله', false), 'الحمد لله');
  assert.equal(stripOpeners('قل هو الله احد', false), 'قل هو الله احد');
});

test('stripOpeners keeps basmala when keepBasmala', () => {
  assert.equal(stripOpeners('اعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم الحمد لله', true), 'بسم الله الرحمن الرحيم الحمد لله');
});

test('112:1-4 after basmala scores 100% through stripOpeners', () => {
  const m = createMatcher(A112);
  const r = m.update(stripOpeners('بسم الله الرحمن الرحيم قل هو الله احد الله الصمد لم يلد ولم يولد ولم يكن له كفوا احد', false));
  assert.equal(r.acc, 100);
});

test('skipping a 3-word chunk marks them bad and continues', () => {
  const m = createMatcher(['لَمْ', 'يَلِدْ', 'وَلَمْ', 'يُولَدْ', 'وَلَمْ', 'يَكُن', 'لَّهُۥ', 'كُفُوًا', 'أَحَدٌ']);
  const r = m.update('لم يلد ولم يولد كفوا احد');
  assert.deepEqual(r.states, ['ok', 'ok', 'ok', 'ok', 'bad', 'bad', 'bad', 'ok', 'ok']);
  assert.equal(r.pointer, 9);
});

test('locked tracker: a word confirmed twice stays ok when a later interim drops it', async () => {
  const { createLockedTracker } = await import('../src/core/matcher.js');
  const m = createMatcher(A2);
  const tr = createLockedTracker(A2.length, { confirm: 2 });
  tr.apply(m.update('الحمد لله').states);
  let r = tr.apply(m.update('الحمد لله رب').states);
  assert.deepEqual(r.states.slice(0, 3), ['ok', 'ok', 'ok']);
  // interim revision drops «لله» (confirmed twice → locked) and «رب» (seen once → not locked)
  r = tr.apply(m.update('الحمد').states);
  assert.deepEqual(r.states, ['ok', 'ok', 'pending', 'pending']);
  assert.equal(r.pointer, 2);
});

test('locked tracker: transient interim bad does not show until stable or final', async () => {
  const { createLockedTracker } = await import('../src/core/matcher.js');
  const m = createMatcher(A2);
  const tr = createLockedTracker(A2.length);
  let r = tr.apply(m.update('الحمد لله العالمين').states);
  assert.equal(r.states[2], 'pending');
  r = tr.apply(m.update('الحمد لله رب العالمين').states);
  assert.deepEqual(r.states, ['ok', 'ok', 'ok', 'ok']);
  const m2 = createMatcher(A2), tr2 = createLockedTracker(A2.length);
  r = tr2.apply(m2.update('الحمد لله العالمين').states, { final: true });
  assert.deepEqual(r.states, ['ok', 'ok', 'bad', 'ok']);
});

test('peek scores alternatives without changing state', () => {
  const m = createMatcher(A2);
  m.update('الحمد');
  assert.ok(m.peek('الحمد لله رب').score > m.peek('الحمد جبل سهل').score);
  assert.ok(m.peek('الحمد لله رب').ok >= 3);
  assert.equal(m.update('الحمد').pointer, 1);
});
