import test from 'node:test';
import assert from 'node:assert/strict';

function fakeLS(opts = {}) {
  const m = new Map();
  return {
    getItem: k => { if (opts.get) throw opts.get; return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (opts.set) throw opts.set; m.set(k, String(v)); },
    removeItem: k => m.delete(k),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; }
  };
}
const err = name => { const e = new Error(name); e.name = name; return e; };

test('storageFailReason', async () => {
  globalThis.localStorage = fakeLS();
  const st = await import('../src/core/store.js?r');
  assert.equal(st.storageFailReason(err('QuotaExceededError')), 'full');
  assert.equal(st.storageFailReason(err('SecurityError')), 'blocked');
  assert.equal(st.storageFailReason(err('Other')), 'error');
});

test('full storage: no crash, state kept in memory, event fires once', async () => {
  globalThis.localStorage = fakeLS({ set: err('QuotaExceededError') });
  const st = await import('../src/core/store.js?full');
  let n = 0; st.on('storage', () => n++);
  st.S.pts = 7; st.save(); st.save(); st.save();
  assert.equal(st.S.pts, 7);
  assert.equal(n, 1);
  assert.equal(st.storageHealth.ok, false);
  assert.equal(st.storageHealth.reason, 'full');
  assert.match(st.storageNotice(), /ممتلئة/);
});

test('storage blocked on read (private mode): defaults, flag set, event on first save', async () => {
  globalThis.localStorage = fakeLS({ get: err('SecurityError'), set: err('SecurityError') });
  const st = await import('../src/core/store.js?blocked');
  assert.equal(st.S.v, 1);
  assert.equal(st.storageHealth.ok, false);
  let reason = ''; st.on('storage', d => { reason = d.reason; });
  st.save();
  assert.equal(reason, 'blocked');
});

test('no localStorage at all does not crash', async () => {
  delete globalThis.localStorage;
  const st = await import('../src/core/store.js?none');
  st.save();
  assert.equal(st.storageHealth.ok, false);
});

test('healthy storage stays quiet', async () => {
  globalThis.localStorage = fakeLS();
  const st = await import('../src/core/store.js?ok');
  st.save();
  assert.equal(st.storageHealth.ok, true);
  assert.equal(st.storageNotice(), null);
});
