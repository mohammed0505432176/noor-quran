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

test('no plan: nothing is logged and status is null', () => {
  S.wird = { plan: null, log: {} };
  assert.equal(st.wirdStatus(), null);
  assert.equal(st.markWirdPage(5), false);
  assert.deepEqual(S.wird.log, {});
});

test('a plan starts today; marking a page counts it, repeats do not', () => {
  S.wird = { plan: null, log: {} };
  const plan = st.setWird({ kind: 'pages', perDay: 3 });
  assert.equal(plan.start, dateKey(0));
  assert.deepEqual(st.wirdStatus().today, [1, 2, 3]);
  st.markWirdPage(1); st.markWirdPage(1); st.markWirdPage(2);
  assert.deepEqual(S.wird.log[dateKey(0)], [1, 2]);
  assert.deepEqual(st.wirdStatus().todayLeft, [3]);
  st.markWirdPage(3);
  assert.equal(st.wirdStatus().todayDone, true);
});

test('pages recited with enough accuracy count for the wird, weak attempts do not', () => {
  S.wird = { plan: null, log: {} }; S.hifz = { pages: {} };
  st.setWird({ kind: 'pages', perDay: 5 });
  st.notePagesRecited([2], 0.4);
  assert.deepEqual(S.wird.log, {});
  st.notePagesRecited([2, 3], 0.8);
  assert.deepEqual(S.wird.log[dateKey(0)], [2, 3]);
});

test('changing the plan keeps the pages already read', () => {
  S.wird = { plan: null, log: {} };
  st.setWird({ kind: 'khatma', days: 30 }); st.markWirdPage(9);
  st.setWird({ kind: 'pages', perDay: 10 });
  assert.deepEqual(S.wird.log[dateKey(0)], [9]);
  st.clearWird();
  assert.equal(st.wirdStatus(), null);
});
