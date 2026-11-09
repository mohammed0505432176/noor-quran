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
const reset = (have = 0) => { S.days = {}; S.savers = { have, used: [], at: null }; };
const act = o => { S.days[dateKey(o)] = { a: 5, r: 0, z: 0 }; };

test('without a saver a missed day breaks the streak', () => {
  reset(0);
  act(0); act(2); act(3);                  // yesterday missed
  st.touchStreak();
  assert.equal(st.streak(), 1);
  assert.equal(st.saverInfo().have, 0);
});

test('a saver covers one missed day: the streak continues, the saver is spent, the missed day does not count', () => {
  reset(1);
  act(0); act(2); act(3); act(4);
  st.touchStreak();
  assert.equal(st.streak(), 4);            // today + three active days; yesterday bridged
  assert.equal(st.saverInfo().have, 0);
  assert.deepEqual(S.savers.used, [dateKey(1)]);
});

test('a saver is not spent for two missed days in a row', () => {
  reset(2);
  act(0); act(3); act(4);                  // two days missed
  st.touchStreak();
  assert.equal(st.saverInfo().have, 2);
  assert.equal(st.streak(), 1);
});

test('every 7th day of streak earns a saver, at most two are kept, once a day', () => {
  reset(0);
  for (let o = 0; o < 7; o++) act(o);
  st.touchStreak(); st.touchStreak();
  assert.equal(st.saverInfo().have, 1);
  reset(2);
  for (let o = 0; o < 7; o++) act(o);
  st.touchStreak();
  assert.equal(st.saverInfo().have, 2);
});

test('nothing happens when today is not active', () => {
  reset(1);
  act(1); act(3);
  st.touchStreak();
  assert.equal(st.saverInfo().have, 1);
});
