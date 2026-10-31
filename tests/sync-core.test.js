// Progress sync helpers (src/core/sync-core.js): the snapshot that is saved and what is read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, readSnapshot, isEmptyProgress, parseAuthFragment, SNAPSHOT_VERSION } from '../src/core/sync-core.js';

test('a snapshot keeps the whole state and the recitation position', () => {
  const snap = makeSnapshot({ pts: 40, read: { '1:1': 1 } }, '{"s":2,"a":255}');
  assert.equal(snap.v, SNAPSHOT_VERSION);
  assert.deepEqual(readSnapshot(JSON.parse(JSON.stringify(snap))), { state: { pts: 40, read: { '1:1': 1 } }, pos: '{"s":2,"a":255}' });
});

test('a position that is not a string is not kept', () => {
  assert.equal(makeSnapshot({}, undefined).pos, null);
  assert.equal(readSnapshot({ v: 1, state: {}, pos: 5 }).pos, null);
});

test('data of another version or a broken shape is refused', () => {
  assert.equal(readSnapshot(null), null);
  assert.equal(readSnapshot({ v: 2, state: {} }), null);
  assert.equal(readSnapshot({ v: 1, state: [1, 2] }), null);
  assert.equal(readSnapshot({ v: 1, state: 'x' }), null);
});

test('unsafe keys in saved data never reach the state', () => {
  const r = readSnapshot({ v: 1, state: JSON.parse('{"pts": 3, "__proto__": {"x": 1}, "constructor": 2}') });
  assert.deepEqual(Object.keys(r.state), ['pts']);
});

test('a fresh install is empty; any reading, day or points makes it non-empty', () => {
  assert.equal(isEmptyProgress(null), true);
  assert.equal(isEmptyProgress({ pts: 0, read: {}, days: {}, rec: [] }), true);
  assert.equal(isEmptyProgress({ pts: 0, read: { '1:1': 1 } }), false);
  assert.equal(isEmptyProgress({ pts: 5 }), false);
  assert.equal(isEmptyProgress({ days: { '2026-01-01': {} } }), false);
});

test('the tokens of a Google round trip are read from the fragment', () => {
  const r = parseAuthFragment('#access_token=abc.def&refresh_token=r1&expires_in=3600&token_type=bearer');
  assert.deepEqual(r, { access_token: 'abc.def', refresh_token: 'r1', expires_in: 3600 });
  assert.equal(parseAuthFragment('#error=access_denied'), null, 'no token means null');
});