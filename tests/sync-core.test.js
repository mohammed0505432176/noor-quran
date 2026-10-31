// Progress sync helpers (src/core/sync-core.js): the snapshot that is saved and what is read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, readSnapshot, isEmptyProgress, parseAuthFragment, progressScore, SNAPSHOT_VERSION, isAuthReturnUrl, authFragmentOf, authReturnId, isAnonymousToken, shouldShowWelcome } from '../src/core/sync-core.js';

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
test('the progress score counts points and ayahs read; the higher account wins', () => {
  assert.equal(progressScore(null), 0);
  assert.equal(progressScore({ pts: 40, read: { '1:1': 1, '1:2': 1 } }), 42);
  assert.ok(progressScore({ pts: 0, read: {} }) < progressScore({ pts: 5 }));
});
const jwt = p => 'h.' + Buffer.from(JSON.stringify(p)).toString('base64url') + '.s';

test('isAuthReturnUrl accepts only the noor://auth link', () => {
  for (const u of ['noor://auth#access_token=x', 'noor://auth?x=1', 'noor://auth']) assert.equal(isAuthReturnUrl(u), true, u);
  for (const u of ['noor://authx', 'https://noor/auth', null, '']) assert.equal(isAuthReturnUrl(u), false, String(u));
});

test('authFragmentOf returns the part from the first #', () => {
  assert.equal(authFragmentOf('noor://auth#a=1'), '#a=1');
  assert.equal(authFragmentOf('noor://auth'), '');
});

test('authReturnId is stable per token and null without one', () => {
  const a = '#access_token=' + 'a'.repeat(30) + '1&expires_in=60';
  const b = '#access_token=' + 'a'.repeat(30) + '2&expires_in=60';
  assert.equal(authReturnId(a), authReturnId(a));
  assert.notEqual(authReturnId(a), authReturnId(b));
  assert.equal(authReturnId('#error=access_denied'), null);
});

test('isAnonymousToken reads is_anonymous from the JWT payload', () => {
  assert.equal(isAnonymousToken(jwt({ is_anonymous: true })), true);
  assert.equal(isAnonymousToken(jwt({ is_anonymous: false })), false);
  assert.equal(isAnonymousToken('not-a-jwt'), true);
  assert.equal(isAnonymousToken(undefined), true);
});

test('shouldShowWelcome is true only when nothing was chosen and no Google session exists', () => {
  assert.equal(shouldShowWelcome(false, false), true);
  assert.equal(shouldShowWelcome(true, false), false);
  assert.equal(shouldShowWelcome(false, true), false);
  assert.equal(shouldShowWelcome(true, true), false);
});

test('parseAuthFragment round trip and error fragment', () => {
  assert.deepEqual(parseAuthFragment('#access_token=A&refresh_token=R&expires_in=60'), { access_token: 'A', refresh_token: 'R', expires_in: 60 });
  assert.equal(parseAuthFragment('#error=access_denied&error_description=x'), null);
});
