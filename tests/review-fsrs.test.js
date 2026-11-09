import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); }
};
const st = await import('../src/core/store.js');
const { S, dateKey } = st;
const reset = () => { S.reviews = []; S.pts = 0; };

test('a new review is due today and has no FSRS state yet', () => {
  reset();
  const r = st.addReview(112, 1, 4);
  assert.equal(r.due, dateKey(0)); assert.equal(r.st, 0);
  assert.equal(st.recallNow(r), null);
  assert.equal(st.dueReviews().length, 1);
});

test('grading schedules by stability: forgot -> tomorrow, easy waits longest', () => {
  reset();
  const a = st.addReview(112, 1, 4), b = st.addReview(113, 1, 5), c = st.addReview(114, 1, 6);
  st.gradeReview(a.id, 0); st.gradeReview(b.id, 2); st.gradeReview(c.id, 3);
  assert.equal(a.due, dateKey(-1));
  assert.ok(b.due > a.due && c.due > b.due);
  assert.ok(a.st > 0 && b.st > a.st && c.st > b.st);
  assert.equal(a.lp, 1); assert.equal(b.rp, 1);
  assert.equal(b.last, dateKey(0));
  assert.equal(st.dueReviews().length, 0);
});

test('a review made before FSRS (Leitner box) keeps its history: stability starts from the box days', () => {
  reset();
  const r = st.addReview(2, 1, 5);
  r.box = 3; r.last = dateKey(7); r.due = dateKey(0);       // old data: box 3 = 7 days, reviewed a week ago
  assert.equal(r.st, 0);
  st.gradeReview(r.id, 2);
  assert.ok(r.st > 7);                                    // a good review after the planned gap grows past the old 7 days
  assert.ok(r.df > 0);
  assert.ok(r.box >= 3);
});

test('recallNow falls as days pass without a review', () => {
  reset();
  const r = st.addReview(1, 1, 7);
  st.gradeReview(r.id, 2);
  const now = st.recallNow(r);
  r.last = dateKey(10);
  assert.ok(st.recallNow(r) < now);
  assert.ok(st.recallNow(r) > 0);
});

test('points: a good review earns more than a forgotten one', () => {
  reset();
  const a = st.addReview(112, 1, 4), b = st.addReview(113, 1, 5);
  S.pts = 0; st.gradeReview(a.id, 0); const forgot = S.pts;
  S.pts = 0; st.gradeReview(b.id, 2); const good = S.pts;
  assert.ok(good > forgot);
});
