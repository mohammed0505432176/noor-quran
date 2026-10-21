import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
let calls = [];
let handler = () => ({ status: 500, body: {} });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url, body: init.body ? JSON.parse(init.body) : null, auth: init.headers && init.headers.Authorization });
  const r = await handler(url, init);
  if (r === 'network') throw new TypeError('fetch failed');
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
};
const { cloudChat, familyOp, ensureSession, CloudError } = await import('../src/core/cloud.js');
const now = () => Math.floor(Date.now() / 1000);
const session = (tok, exp = now() + 3600) => ({ access_token: tok, refresh_token: 'r-' + tok, expires_at: exp });

beforeEach(() => { mem.clear(); calls = []; });

test('first call signs up anonymously and sends the user JWT', async () => {
  handler = url => url.includes('/auth/v1/signup') ? { status: 200, body: session('A') } : { status: 200, body: { text: 'ok', provider: 'gemini' } };
  const r = await cloudChat([{ role: 'user', content: 'سلام' }]);
  assert.equal(r.provider, 'gemini');
  assert.ok(calls[0].url.endsWith('/auth/v1/signup'));
  assert.equal(calls[1].auth, 'Bearer A');
});

test('transient refresh failure keeps the identity (no new signup)', async () => {
  mem.set('noor.auth', JSON.stringify(session('OLD', now() - 10)));
  handler = url => url.includes('grant_type=refresh_token') ? { status: 503, body: {} } : { status: 200, body: session('NEW') };
  await assert.rejects(ensureSession(), e => e instanceof CloudError);
  assert.ok(!calls.some(c => c.url.includes('/signup')), 'must not create a new account on 503');
  assert.equal(JSON.parse(mem.get('noor.auth')).access_token, 'OLD');
});

test('revoked refresh token → new anonymous account', async () => {
  mem.set('noor.auth', JSON.stringify(session('OLD', now() - 10)));
  handler = url => url.includes('grant_type=refresh_token') ? { status: 400, body: {} } : { status: 200, body: session('NEW') };
  assert.equal(await ensureSession(), 'NEW');
});

test('backend error codes map to friendly Arabic errors', async () => {
  mem.set('noor.auth', JSON.stringify(session('T')));
  handler = () => ({ status: 404, body: { error: 'not_found' } });
  await assert.rejects(familyOp('join', { code: 'ABCDEF', member: 'x' }), e => e.code === 'not_found' && /رمز/.test(e.message));
  handler = () => ({ status: 429, body: { error: 'daily_limit' } });
  await assert.rejects(cloudChat([{ role: 'user', content: 'x' }]), e => e.code === 'daily_limit');
});

test('401 retries once with a fresh session, then gives up', async () => {
  mem.set('noor.auth', JSON.stringify(session('T')));
  let fn = 0;
  handler = url => {
    if (url.includes('/functions/')) { fn++; return { status: 401, body: {} }; }
    if (url.includes('refresh_token')) return { status: 200, body: session('T2') };
    return { status: 200, body: session('T3') };
  };
  await assert.rejects(cloudChat([{ role: 'user', content: 'x' }]), e => e.code === 'auth');
  assert.equal(fn, 2);
});

test('offline network → offline error', async () => {
  mem.set('noor.auth', JSON.stringify(session('T')));
  handler = () => 'network';
  await assert.rejects(cloudChat([{ role: 'user', content: 'x' }]), e => e.code === 'offline');
});
