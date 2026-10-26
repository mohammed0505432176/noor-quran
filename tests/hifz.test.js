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
const reset = () => { S.hifz = { pages: {} }; S.goals = []; S.rec = []; S.reviews = []; S.wm = {}; };

test('hifzLevel decays one level per 14 days', () => {
  reset();
  S.hifz.pages[5] = { lvl: 3, at: dateKey(0), n: 1 };
  assert.equal(st.hifzLevel(5), 3);
  S.hifz.pages[5].at = dateKey(13); assert.equal(st.hifzLevel(5), 3);
  S.hifz.pages[5].at = dateKey(14); assert.equal(st.hifzLevel(5), 2);
  S.hifz.pages[5].at = dateKey(30); assert.equal(st.hifzLevel(5), 1);
  S.hifz.pages[5].at = dateKey(100); assert.equal(st.hifzLevel(5), 0);
  assert.equal(st.hifzLevel(6), 0);
});

test('notePagesRecited thresholds', () => {
  reset();
  st.notePagesRecited([1, 2], 0.5);
  assert.equal(st.hifzLevel(1), 0);
  st.notePagesRecited([1], 0.75);
  assert.equal(st.hifzLevel(1), 1);
  S.hifz.pages[1].at = dateKey(1); // pretend the last raise was yesterday
  st.notePagesRecited([1], 0.95);
  assert.equal(st.hifzLevel(1), 2);
  S.hifz.pages[1].at = dateKey(1);
  st.notePagesRecited([1, 1, 999, 0], 0.99); // duplicate page in one call raises only once
  assert.equal(st.hifzLevel(1), 3);
  assert.equal(S.hifz.pages[1].n, 2);
  assert.deepEqual(Object.keys(S.hifz.pages), ['1']);
});

test('second quality-1.0 session on the same day does not raise level', () => {
  reset();
  st.notePagesRecited([5], 1.0);
  assert.equal(st.hifzLevel(5), 1);
  st.notePagesRecited([5], 1.0);
  assert.equal(st.hifzLevel(5), 1);
  assert.equal(S.hifz.pages[5].at, dateKey(0));
});

test('invalid imported date is dropped: level 0, no NaN', () => {
  reset();
  st.importData(JSON.stringify({ v: 1, hifz: { pages: { 7: { lvl: 3, at: 'garbage', n: 1 }, 8: { lvl: 3, at: '', n: 1 }, 9: { lvl: 2, at: dateKey(0), n: 1, m: 'bad' } } } }));
  assert.equal(S.hifz.pages[7], undefined);
  assert.equal(S.hifz.pages[8], undefined);
  assert.equal(S.hifz.pages[9].m, undefined);
  assert.equal(st.hifzLevel(7), 0);
  assert.equal(st.hifzLevel(8), 0);
  assert.equal(Number.isNaN(st.hifzLevel(9)), false);
  S.hifz.pages[10] = { lvl: 3, at: 'not-a-date', n: 0 };
  assert.equal(st.hifzLevel(10), 0);
});

test('duplicate goal ids are deduped and missing ids get a fallback', () => {
  reset();
  const goal = (id) => ({ id, type: 'recite', unit: 'page', target: 2, period: 'day', created: '2026-01-01' });
  st.importData(JSON.stringify({ v: 1, hifz: { pages: {} }, goals: [goal('dup'), goal('dup'), goal(''), goal('ok')] }));
  assert.equal(S.goals.length, 3);
  const ids = S.goals.map(g => g.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.includes('dup') && ids.includes('ok'));
  assert.ok(ids.every(id => id.length > 0));
});

test('setPageMemorized on/off', () => {
  reset();
  st.setPageMemorized(10, true);
  assert.equal(st.hifzLevel(10), 3);
  assert.equal(st.hifzTotals().pages, 1);
  st.setPageMemorized(10, false);
  assert.equal(st.hifzLevel(10), 0);
});

test('addGoal validates and caps at 30; removeGoal', () => {
  reset();
  assert.equal(st.addGoal({ type: 'x', unit: 'page', target: 1, period: 'day' }), null);
  assert.equal(st.addGoal({ type: 'recite', unit: 'page', target: 0, period: 'day' }), null);
  const g = st.addGoal({ type: 'recite', unit: 'ayah', target: 5, period: 'day' });
  assert.ok(g.id && g.created);
  st.removeGoal(g.id); assert.equal(S.goals.length, 0);
  for (let i = 0; i < 40; i++) st.addGoal({ type: 'review', unit: 'page', target: 1, period: 'week' });
  assert.equal(S.goals.length, 30);
});

test('goalProgress: recite ayah/page, day vs week', () => {
  reset();
  S.rec = [{ d: dateKey(0), s: 1, from: 1, to: 7, acc: 90, miss: [] }, { d: dateKey(3), s: 2, from: 1, to: 10, acc: 90, miss: [] }];
  assert.deepEqual(st.goalProgress({ type: 'recite', unit: 'ayah', target: 5, period: 'day' }), { done: 7, target: 5 });
  assert.equal(st.goalProgress({ type: 'recite', unit: 'ayah', target: 5, period: 'week' }).done, 17);
  assert.equal(st.goalProgress({ type: 'recite', unit: 'page', target: 1, period: 'day' }).done, 1);
  assert.equal(st.goalProgress({ type: 'recite', unit: 'minute', target: 1, period: 'day' }).done, 2); // 7 ayahs * 15s
  assert.equal(st.goalProgress({ type: 'recite', unit: 'ayah', target: 5, period: 'day' }, 1).done, 0);
});

test('goalProgress: review and memorize', () => {
  reset();
  S.reviews = [{ id: 'a', s: 2, from: 1, to: 5, box: 1, due: '', added: '', last: dateKey(0) }, { id: 'b', s: 2, from: 6, to: 8, box: 1, due: '', added: '', last: dateKey(2) }];
  assert.equal(st.goalProgress({ type: 'review', unit: 'ayah', target: 1, period: 'day' }).done, 5);
  assert.equal(st.goalProgress({ type: 'review', unit: 'ayah', target: 1, period: 'week' }).done, 8);
  S.hifz.pages[50] = { lvl: 3, at: dateKey(0), n: 0, m: dateKey(0) };
  S.hifz.pages[51] = { lvl: 3, at: dateKey(0), n: 0, m: dateKey(20) };
  assert.equal(st.goalProgress({ type: 'memorize', unit: 'page', target: 1, period: 'week' }).done, 1);
  assert.ok(st.goalProgress({ type: 'memorize', unit: 'ayah', target: 1, period: 'day' }).done > 0);
  const g = { type: 'memorize', unit: 'page', target: 1, period: 'day' };
  assert.equal(st.goalStreak(g), 1);
});

test('wordErrorHeat decays with time and later correct reads', () => {
  reset();
  assert.equal(st.wordErrorHeat(2, 5, 3), 0);
  S.wm['2:5:3'] = { n: 4, k: 'wrong', d: dateKey(0), ok: 0 };
  assert.equal(st.wordErrorHeat(2, 5, 3), 1);
  S.wm['2:5:3'].d = dateKey(21);
  assert.ok(Math.abs(st.wordErrorHeat(2, 5, 3) - 0.5) < 0.01);
  S.wm['2:5:3'] = { n: 4, k: 'wrong', d: dateKey(0), ok: 1 };
  assert.ok(st.wordErrorHeat(2, 5, 3) < 1);
  S.wm['2:5:3'].ok = 3; assert.equal(st.wordErrorHeat(2, 5, 3), 0);
});

test('importData sanitises hifz and goals', () => {
  reset();
  const pages = { 1: { lvl: 9, at: '2026-01-01', n: 2 }, 0: { lvl: 1 }, 605: { lvl: 1 }, x: { lvl: 1 } };
  const goals = Array.from({ length: 40 }, (_, i) => ({ id: 'g' + i, type: 'recite', unit: 'page', target: 2, period: 'day', created: '2026-01-01' })).concat([{ type: 'bad', unit: 'page', period: 'day', target: 1 }]);
  st.importData(JSON.stringify({ v: 1, hifz: { pages }, goals }));
  assert.deepEqual(Object.keys(S.hifz.pages), ['1']);
  assert.equal(S.hifz.pages[1].lvl, 3);
  assert.equal(S.goals.length, 30);
});
