import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
const { S, dateKey } = await import('../src/core/store.js');
const { buildStats } = await import('../src/core/family.js');

test('buildStats aggregates store state', () => {
  S.days[dateKey(0)] = { a: 5, r: 1, z: 0 };
  S.days[dateKey(3)] = { a: 10, r: 0, z: 0 };
  S.days[dateKey(10)] = { a: 99, r: 0, z: 0 };
  S.read = { '1:1': 'x', '1:2': 'x', '1:3': 'x' };
  S.rec = [{ acc: 90 }, { acc: 81 }];
  S.pts = 350;
  const s = buildStats();
  assert.deepEqual(Object.keys(s).sort(), ['acc', 'best', 'khatma', 'level', 'pts', 'rec', 'streak', 'today', 'total', 'week']);
  assert.equal(s.week, 15);
  assert.equal(s.today, 5);
  assert.equal(s.total, 3);
  assert.equal(s.rec, 2);
  assert.equal(s.acc, 86);
  assert.equal(s.pts, 350);
  assert.equal(s.level, 'مداوم');
  assert.equal(s.khatma, 0);
  assert.equal(s.streak, 1);
});
