// Recitation hardening: no wrong jumps (other surah / far inside the surah), page turn only at the page end,
// verdicts for correct / omitted / replaced / repeated words on real Quran text. These are function-level checks only:
// they are NOT evidence of recognition accuracy on real audio (see docs/RECITE-TESTING.md for the audio checklist).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPositionGuard, acceptPosition, pageAction, pageEndReached, planHint, errorAction, issueCertainty } from '../src/core/page-turn.js';
import { createMatcher, createLockedTracker } from '../src/core/matcher.js';
import { norm } from '../src/core/arabic.js';

const Q = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
const ayahText = (s, a) => Q[s - 1].v[a - 1];
const words = (s, a) => ayahText(s, a).split(' ');
const lastAyahOf = s => Q[s - 1].v.length;

test('a similar ayah in another surah never moves the session', () => {
  const g = createPositionGuard();
  const cur = { s: 2, a: 40 };
  for (const s of [3, 4, 55, 114]) assert.equal(g.check({ cur, next: { s, a: 1 }, lastAyahOf }).ok, false);
  assert.equal(g.check({ cur, next: { s: 3, a: 1 }, lastAyahOf }).ok, false, 'not the end of surah 2');
});

test('the next surah is accepted only at the end of the current one, or after an explicit re-lock', () => {
  const g = createPositionGuard();
  assert.equal(g.check({ cur: { s: 1, a: 7 }, next: { s: 2, a: 1 }, lastAyahOf }).ok, true);
  assert.equal(g.check({ cur: { s: 1, a: 3 }, next: { s: 2, a: 1 }, lastAyahOf }).ok, false);
  assert.equal(g.check({ cur: { s: 1, a: 3 }, next: { s: 112, a: 2 }, relock: true, lastAyahOf }).ok, true);
});

test('a far jump inside the surah (a common word / refrain) needs consecutive confirmation', () => {
  const g = createPositionGuard();
  const cur = { s: 55, a: 4 };
  const far = { s: 55, a: 13 };                       // «فبأي آلاء ربكما تكذبان» repeats all through Ar-Rahman
  assert.deepEqual(g.check({ cur, next: far, lastAyahOf }), { ok: false, pending: true });
  assert.deepEqual(g.check({ cur, next: far, lastAyahOf }), { ok: false, pending: true });
  assert.equal(g.check({ cur, next: far, lastAyahOf }).ok, true, 'third consecutive word in that ayah');
});

test('a stray far word between normal ones resets the pending jump', () => {
  const g = createPositionGuard();
  const cur = { s: 2, a: 10 };
  assert.equal(g.check({ cur, next: { s: 2, a: 60 }, lastAyahOf }).pending, true);
  assert.equal(g.check({ cur, next: { s: 2, a: 11 }, lastAyahOf }).ok, true);
  assert.equal(g.check({ cur, next: { s: 2, a: 60 }, lastAyahOf }).pending, true, 'counting restarted');
  assert.equal(g.check({ cur, next: { s: 2, a: 60 }, lastAyahOf }).ok, false);
});

test('normal reading, a short skip, a one-ayah step back and the first lock are never delayed', () => {
  const g = createPositionGuard();
  assert.equal(g.check({ cur: null, next: { s: 36, a: 20 }, lastAyahOf }).ok, true);
  for (const a of [10, 11, 12, 13]) assert.equal(g.check({ cur: { s: 18, a: 10 }, next: { s: 18, a: a }, lastAyahOf }).ok, true);
  assert.equal(g.check({ cur: { s: 18, a: 10 }, next: { s: 18, a: 9 }, lastAyahOf }).ok, true);
  assert.equal(g.check({ cur: { s: 18, a: 10 }, next: { s: 18, a: 3 }, lastAyahOf }).ok, false);
});

test('a fixed range never leaves its range', () => {
  const lockRange = { s: 67, from: 1, to: 5 };
  assert.equal(acceptPosition({ cur: { s: 67, a: 2 }, next: { s: 67, a: 6 }, lockRange }), false);
  assert.equal(acceptPosition({ cur: { s: 67, a: 2 }, next: { s: 68, a: 1 }, lockRange }), false);
  assert.equal(acceptPosition({ cur: { s: 67, a: 2 }, next: { s: 67, a: 4 }, lockRange }), true);
});

test('the page turns only after the last word of the shown page', () => {
  assert.equal(pageAction({ shown: 5, target: 6, ended: false }), 'wait', 'a word of the next page in the middle of the page');
  assert.equal(pageAction({ shown: 5, target: 6, ended: true }), 'turn');
  assert.equal(pageAction({ shown: 5, target: 6, ended: true, manual: true }), 'stay');
  assert.equal(pageEndReached({ lastJ: 40, lastWordIdx: 60, curI: 41, samplesHeld: 0 }), false, 'mid-line');
  assert.equal(pageEndReached({ lastJ: 60, lastWordIdx: 60 }), true);
  assert.equal(pageEndReached({ lastJ: 59, lastWordIdx: 60, curI: 60, samplesHeld: 16000 * 3 }), true, 'held on the last word');
});

// ---- verdicts on real text ----
const recite = (s, a, mutate) => {
  const exp = words(s, a);
  const m = createMatcher(exp);
  const said = mutate(exp.map(w => norm(w)));
  return m.update(said.join(' '));
};

test('correct recitation: every word ok', () => {
  const r = recite(112, 1, w => w);
  assert.ok(r.states.every(x => x === 'ok'), r.states.join());
});
test('a deleted word is marked, the others stay ok', () => {
  const r = recite(2, 255, w => w.filter((_, i) => i !== 3));
  assert.equal(r.states[3], 'bad');
  assert.ok(r.states.filter(x => x === 'ok').length >= r.states.length - 2);
});
test('a replaced word is marked', () => {
  const r = recite(112, 1, w => w.map((x, i) => (i === 2 ? 'كلمه' : x)));
  assert.notEqual(r.states[2], 'ok');
});
test('a word repeated by the reciter (self-correction) is not an error', () => {
  const r = recite(2, 255, w => [...w.slice(0, 5), ...w.slice(3, 8), ...w.slice(5)]);
  assert.ok(r.states.every(x => x === 'ok' || x === 'pending'), r.states.join());
  assert.ok(!r.states.includes('bad'));
});
test('pause and resume: the same text sent again later keeps the earlier words', () => {
  const exp = words(2, 255), m = createMatcher(exp), t = exp.map(w => norm(w));
  m.update(t.slice(0, 6).join(' '));
  const r = m.update(t.slice(0, 6).concat(t.slice(6, 12)).join(' '));
  assert.ok(r.states.slice(0, 12).every(x => x === 'ok'));
});

test('a doubtful (interim) result is not shown as an error until it repeats; a hint never counts as recited', () => {
  const tr = createLockedTracker(3, { confirm: 2 });
  const a = tr.apply(['ok', 'bad', 'pending']);
  assert.equal(a.states[1], 'pending', 'one weak result changes nothing');
  assert.equal(tr.apply(['ok', 'bad', 'pending']).states[1], 'bad', 'stable twice');
  assert.deepEqual(errorAction({ mode: 'stop', certainty: issueCertainty('possible_omission') }), { stop: false, record: false, note: true });
  assert.equal(errorAction({ mode: 'stop', certainty: issueCertainty('omission') }).stop, true);
  const pend = new Set([2, 3]);
  const p = planHint({ isPending: i => pend.has(i), groups: [{ start: 0, end: 4, s: 1, a: 1 }, { start: 4, end: 8, s: 2, a: 1 }], kind: 'ayah', lock: 1 });
  assert.deepEqual(p.indices, [2, 3], 'only unread words of the locked surah');
});
