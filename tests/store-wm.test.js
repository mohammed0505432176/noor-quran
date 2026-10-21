import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: k => { mem.delete(k); }
};
const st = await import('../src/core/store.js');

const reset = () => { st.S.wm = {}; st.S.rec = []; };

test('recordWords: mistakes create/increment, ok ignored without entry', () => {
  reset();
  st.recordWords(2, [{ a: 5, w: 3, kind: 'ok' }]);
  assert.deepEqual(st.S.wm, {});
  st.recordWords(2, [{ a: 5, w: 3, kind: 'skip' }, { a: 5, w: 1, kind: 'wrong' }]);
  st.recordWords(2, [{ a: 5, w: 3, kind: 'hint' }]);
  assert.equal(st.S.wm['2:5:3'].n, 2);
  assert.equal(st.S.wm['2:5:3'].k, 'hint');
  assert.equal(st.S.wm['2:5:3'].d, st.today());
  assert.equal(st.S.wm['2:5:1'].n, 1);
});

test('weakWords sorted by n desc and limited', () => {
  reset();
  st.recordWords(1, [{ a: 1, w: 1, kind: 'wrong' }]);
  st.recordWords(1, [{ a: 2, w: 2, kind: 'wrong' }]);
  st.recordWords(1, [{ a: 2, w: 2, kind: 'skip' }]);
  const w = st.weakWords();
  assert.equal(w.length, 2);
  assert.deepEqual(w[0], { s: 1, a: 2, w: 2, n: 2, k: 'skip' });
  assert.equal(st.weakWords(1).length, 1);
});

test('weakAyahs groups and sorts', () => {
  reset();
  st.recordWords(3, [{ a: 7, w: 4, kind: 'wrong' }, { a: 7, w: 2, kind: 'wrong' }, { a: 8, w: 1, kind: 'wrong' }]);
  st.recordWords(3, [{ a: 8, w: 1, kind: 'wrong' }, { a: 8, w: 1, kind: 'wrong' }]);
  const g = st.weakAyahs();
  assert.deepEqual(g[0], { s: 3, a: 8, n: 3, words: [1] });
  assert.deepEqual(g[1], { s: 3, a: 7, n: 2, words: [2, 4] });
});

test('ayahMistakeMap and ok-recovery', () => {
  reset();
  st.recordWords(4, [{ a: 1, w: 2, kind: 'wrong' }, { a: 1, w: 5, kind: 'skip' }, { a: 2, w: 1, kind: 'wrong' }]);
  assert.deepEqual(st.ayahMistakeMap(4, 1), { 2: 1, 5: 1 });
  for (let i = 0; i < 3; i++) st.recordWords(4, [{ a: 1, w: 2, kind: 'ok' }]);
  assert.deepEqual(st.ayahMistakeMap(4, 1), { 5: 1 });
  assert.ok(!st.weakWords().some(x => x.a === 1 && x.w === 2));
  st.recordWords(4, [{ a: 1, w: 2, kind: 'wrong' }]);
  assert.equal(st.S.wm['4:1:2'].ok, 0);
  assert.equal(st.S.wm['4:1:2'].n, 2);
});

test('lastAttempt', () => {
  reset();
  st.S.rec.push({ d: 'c', s: 1, from: 1, to: 3, acc: 90 }, { d: 'b', s: 2, from: 1, to: 3, acc: 50 }, { d: 'a', s: 1, from: 1, to: 3, acc: 40 });
  assert.equal(st.lastAttempt(1, 1, 3).d, 'c');
  assert.equal(st.lastAttempt(1, 1, 3, 1).d, 'a');
  assert.equal(st.lastAttempt(1, 1, 3, 2), null);
  assert.equal(st.lastAttempt(9, 1, 3), null);
});

test('importData sanitises wm', () => {
  reset();
  const d = JSON.parse(st.exportData());
  d.wm = {
    '2:5:3': { n: 99999, ok: -4, k: 'bogus', d: '2026-01-01XXXXXXXX' },
    '2:5:4': { n: 2, ok: 1, k: 'skip', d: '2026-02-02' },
    'bad': { n: 1 }, '1:2': { n: 1 }, '1:2:3:4': { n: 1 }, '1000:1:1': { n: 1 }
  };
  st.importData(JSON.stringify(d));
  assert.deepEqual(Object.keys(st.S.wm).sort(), ['2:5:3', '2:5:4']);
  assert.deepEqual(st.S.wm['2:5:3'], { n: 9999, k: 'wrong', d: '2026-01-01', ok: 0 });
  assert.deepEqual(st.S.wm['2:5:4'], { n: 2, k: 'skip', d: '2026-02-02', ok: 1 });
  d.wm = { '0:0:0': { n: 1 }, '200:1:1': { n: 1 }, '2:255:3': { n: 1, k: 'wrong', d: '2026-03-03', ok: 0 } };
  st.importData(JSON.stringify(d));
  assert.ok(!('0:0:0' in st.S.wm));
  assert.ok(!('200:1:1' in st.S.wm));
  assert.ok('2:255:3' in st.S.wm);
  d.wm = 'nope';
  st.importData(JSON.stringify(d));
  assert.deepEqual(st.S.wm, {});
});
