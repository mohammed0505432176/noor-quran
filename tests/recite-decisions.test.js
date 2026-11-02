// Pure decisions of the recitation screen (src/core/page-turn.js): hints, position marker, error mode, position guard, turn gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHint, markerPlan, errorAction, issueCertainty, normErrorMode, acceptPosition, turnCooldownOk, TURN_GAP_MS, pageAction } from '../src/core/page-turn.js';

const groups = [{ start: 0, end: 3, s: 2, a: 1 }, { start: 3, end: 6, s: 2, a: 2 }, { start: 6, end: 9, s: 3, a: 1 }];
const pend = set => i => set.has(i);

test('hint «الكلمة التالية» reveals only the next pending word', () => {
  const r = planHint({ isPending: pend(new Set([1, 2, 3, 4, 5, 6, 7, 8])), groups, kind: 'word' });
  assert.deepEqual(r.indices, [1]);
  assert.equal(r.group.a, 1);
});
test('hint «الآية الحالية» reveals the rest of that ayah only', () => {
  const r = planHint({ isPending: pend(new Set([1, 2, 3, 4, 5])), groups, kind: 'ayah' });
  assert.deepEqual(r.indices, [1, 2]);
});
test('hints stay inside the locked surah and never reveal a recited word', () => {
  const only3 = planHint({ isPending: pend(new Set([6, 7, 8])), groups, kind: 'word', lock: 2 });
  assert.deepEqual(only3.indices, [], 'the only pending words belong to another surah');
  assert.deepEqual(planHint({ isPending: pend(new Set([6, 7])), groups, kind: 'ayah', lock: 3 }).indices, [6, 7]);
  assert.deepEqual(planHint({ isPending: pend(new Set()), groups, kind: 'word' }).indices, []);
});
test('hint starts after the frontier (from)', () => {
  assert.deepEqual(planHint({ isPending: pend(new Set([0, 1, 2, 4])), groups, kind: 'word', from: 3 }).indices, [4]);
});

test('marker: a certain place marks the word, an unsure one the whole ayah and says it is locating', () => {
  const range = { start: 3, end: 6 };
  assert.deepEqual(markerPlan({ curI: 4, lastState: 'ok', ayahRange: range }), { level: 'word', index: 4, range: null, locating: false });
  const u = markerPlan({ curI: 4, lastState: 'unsure', ayahRange: range });
  assert.equal(u.level, 'ayah'); assert.equal(u.locating, true); assert.deepEqual(u.range, range);
  assert.equal(markerPlan({ curI: -1, ayahRange: range }).level, 'ayah');
  assert.equal(markerPlan({ curI: -1 }).level, 'none');
});
test('marker: the setting turns it off', () => {
  assert.equal(markerPlan({ curI: 4, lastState: 'ok', enabled: false }).level, 'none');
});

test('error mode: only a confirmed error can stop; unclear recognition never blocks', () => {
  assert.deepEqual(errorAction({ mode: 'stop', certainty: 'confirmed' }), { stop: true, record: true, note: false });
  assert.deepEqual(errorAction({ mode: 'continue', certainty: 'confirmed' }), { stop: false, record: true, note: false });
  assert.equal(errorAction({ mode: 'stop', certainty: 'unclear' }).stop, false);
  assert.equal(errorAction({ mode: 'continue', certainty: 'unclear' }).stop, false);
  assert.equal(errorAction({}).stop, false);
});
test('engine doubts are unclear, other issues confirmed; unknown mode falls back to continue', () => {
  assert.equal(issueCertainty('possible_omission'), 'unclear');
  assert.equal(issueCertainty('unclear_ayah'), 'unclear');
  assert.equal(issueCertainty('wrong'), 'confirmed');
  assert.equal(normErrorMode('stop'), 'stop');
  assert.equal(normErrorMode('x'), 'continue'); assert.equal(normErrorMode(undefined), 'continue');
});

const last = n => ({ 2: 286, 3: 200, 1: 7 })[n] || 0;
test('position: same surah is fine, a similar ayah in another surah is refused', () => {
  const cur = { s: 2, a: 10 };
  assert.equal(acceptPosition({ cur, next: { s: 2, a: 11 }, lastAyahOf: last }), true);
  assert.equal(acceptPosition({ cur, next: { s: 2, a: 5 }, lastAyahOf: last }), true, 'going back inside the surah');
  assert.equal(acceptPosition({ cur, next: { s: 36, a: 3 }, lastAyahOf: last }), false);
  assert.equal(acceptPosition({ cur, next: { s: 3, a: 1 }, lastAyahOf: last }), false, 'not at the end of the surah');
});
test('position: the end of a surah continues into the next one; an explicit re-lock may jump', () => {
  assert.equal(acceptPosition({ cur: { s: 2, a: 286 }, next: { s: 3, a: 1 }, lastAyahOf: last }), true);
  assert.equal(acceptPosition({ cur: { s: 2, a: 286 }, next: { s: 4, a: 1 }, lastAyahOf: last }), false);
  assert.equal(acceptPosition({ cur: { s: 2, a: 10 }, next: { s: 36, a: 3 }, relock: true, lastAyahOf: last }), true);
  assert.equal(acceptPosition({ cur: null, next: { s: 36, a: 3 } }), true, 'the first lock is free');
  assert.equal(acceptPosition({ cur: null, next: { s: 0, a: 1 } }), false);
});
test('position: a fixed range never leaves its range', () => {
  const lockRange = { s: 2, from: 3, to: 6 };
  assert.equal(acceptPosition({ next: { s: 2, a: 4 }, lockRange }), true);
  assert.equal(acceptPosition({ next: { s: 2, a: 7 }, lockRange }), false);
  assert.equal(acceptPosition({ next: { s: 3, a: 4 }, lockRange }), false);
});

test('page turn: repeated results inside the gap never turn the page twice', () => {
  assert.equal(turnCooldownOk(10000, 0), true, 'no turn yet');
  assert.equal(turnCooldownOk(10000, 10000 - TURN_GAP_MS + 1), false);
  assert.equal(turnCooldownOk(10000, 10000 - TURN_GAP_MS), true);
});
test('page turn: nothing turns for a target of the same page, so a repeated result is idle', () => {
  assert.equal(pageAction({ shown: 11, target: 11, ended: true }), 'stay');
});
