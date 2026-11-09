import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadMushaf, storedPages, clearOfflineMushaf, fontUrl, layoutUrl, OFFLINE_CACHE, PAGES } from '../src/core/mushaf-offline.js';

// a tiny in-memory Cache Storage + fetch, so the real downloader logic runs without a browser
function fakeEnv({ failFont = () => false, failLayout = () => false } = {}) {
  const buckets = new Map();
  const mk = () => { const m = new Map(); return { match: async u => m.get(typeof u === 'string' ? u : u.url) || undefined, put: async (u, r) => { m.set(typeof u === 'string' ? u : u.url, r); }, keys: async () => [...m.keys()].map(url => ({ url })), _m: m }; };
  globalThis.caches = { open: async n => { if (!buckets.has(n)) buckets.set(n, mk()); return buckets.get(n); }, delete: async n => buckets.delete(n) };
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    const isFont = url.includes('/fonts/');
    const p = +(url.match(/p(\d+)\.woff2/) || url.match(/\/(\d+)\.json/) || [])[1];
    if (isFont ? failFont(p, url) : failLayout(p)) return { ok: false, status: 500, type: 'basic' };
    return { ok: true, status: 200, type: 'basic', clone() { return this; } };
  };
  return { buckets, calls };
}

test('urls point at the official page font host and the versioned layout', () => {
  assert.equal(fontUrl(7), 'https://static.qurancdn.com/fonts/quran/hafs/v2/woff2/p7.woff2');
  assert.match(layoutUrl(7, 'https://x.test/noor-quran/'), /mushaf\/p\/007\.json\?v=2$/);
});

test('downloads all 604 pages into its own bucket', async () => {
  const env = fakeEnv();
  const seen = [];
  const r = await downloadMushaf({ onProgress: x => seen.push(x.done) });
  assert.equal(r.done, PAGES); assert.deepEqual(r.failed, []);
  assert.equal((await storedPages()).size, PAGES);
  assert.ok(env.buckets.has(OFFLINE_CACHE));
  assert.equal(seen[seen.length - 1], PAGES);
});

test('resumes: stored pages are not fetched again', async () => {
  const env = fakeEnv();
  await downloadMushaf({});
  const n = env.calls.length;
  const r = await downloadMushaf({});
  assert.equal(env.calls.length, n);
  assert.equal(r.done, PAGES);
});

test('falls back to the second font host and reports pages that fail everywhere', async () => {
  const env = fakeEnv({ failFont: (p, url) => (p === 5 && url.includes('qurancdn')) || p === 9 });
  const r = await downloadMushaf({ tries: 1 });
  assert.deepEqual(r.failed, [9]);
  assert.equal(r.done, PAGES - 1);
  assert.ok(env.calls.some(u => u.includes('verses.quran.foundation') && u.includes('p5.woff2')));
});

test('abort stops the download and keeps what was stored', async () => {
  fakeEnv();
  const ac = new AbortController();
  const r = await downloadMushaf({ signal: ac.signal, concurrency: 1, onProgress: x => { if (x.done === 10) ac.abort(); } });
  assert.equal(r.aborted, true);
  assert.ok(r.done >= 10 && r.done < PAGES);
  assert.ok((await storedPages()).size >= 10);
});

test('clear removes the bucket', async () => {
  fakeEnv();
  await downloadMushaf({});
  assert.equal(await clearOfflineMushaf(), true);
  assert.equal((await storedPages()).size, 0);
});
