// Checks the built web app (dist/) under the GitHub Pages base: every referenced file exists, no root-absolute URLs,
// manifest/service worker are valid. Skipped when dist/ has not been built (npm run build first).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const built = existsSync(join(dist, 'index.html'));
const opts = { skip: built ? false : 'dist/ not built' };
// icon PNGs are generated from assets/*.svg by scripts/svg-to-png.mjs in CI
const GENERATED = /^icon-(192|512)\.png$/;
const read = f => readFileSync(join(dist, f), 'utf8');
const exists = rel => existsSync(join(dist, rel)) || GENERATED.test(rel);

test('index.html: all asset URLs are relative and exist', opts, () => {
  const html = read('index.html');
  const urls = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|#)/.test(u));
  assert.ok(urls.length >= 4);
  for (const u of urls) {
    assert.ok(!u.startsWith('/'), 'root-absolute URL breaks under /noor-quran/: ' + u);
    assert.ok(exists(normalize(u)), 'missing ' + u);
  }
});

test('manifest is valid and its URLs resolve', opts, () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'background_color', 'theme_color']) assert.ok(m[k], k);
  assert.equal(m.display, 'standalone'); assert.equal(m.lang, 'ar'); assert.equal(m.dir, 'rtl');
  assert.ok(!m.start_url.startsWith('/') && !m.scope.startsWith('/'));
  const sizes = m.icons.map(i => i.sizes + ':' + i.purpose);
  for (const s of ['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']) assert.ok(sizes.includes(s), s);
  for (const i of m.icons) { assert.ok(!i.src.startsWith('/')); assert.ok(exists(i.src), i.src); }
});

test('built CSS and JS reference no root-absolute asset paths', opts, () => {
  const dir = join(dist, 'assets');
  for (const f of readdirSync(dir)) {
    if (/\.css$/.test(f)) {
      for (const m of read('assets/' + f).matchAll(/url\(\s*["']?([^"')]+)/g)) {
        const u = m[1]; if (/^(data:|https?:|#)/.test(u)) continue;
        assert.ok(!u.startsWith('/'), f + ' has absolute ' + u);
        assert.ok(existsSync(join(dist, 'assets', u)), f + ' missing ' + u);
      }
    }
    if (/\.js$/.test(f)) {
      const js = read('assets/' + f);
      assert.ok(!/["'`]\/(kids|mushaf|adhan|ort|models|quran\.json|icon|sw\.js)/.test(js), f + ' has root-absolute app asset path');
    }
  }
});

test('service worker: versioned, precache list exists, never caches the model', opts, () => {
  const sw = read('sw.js');
  assert.ok(!sw.includes('__BUILD_VERSION__'), 'build version not injected');
  const list = JSON.parse(/PRECACHE_BUILT = (\[.*?\]);/s.exec(sw)[1]);
  assert.ok(list.length > 10);
  for (const u of list) assert.ok(existsSync(join(dist, u)), 'precache missing ' + u);
  const m = /const BUILD = '([^']+)'/.exec(sw);
  assert.ok(m && /^\d+\.\d+/.test(m[1]), 'build version ' + (m && m[1]));
  assert.ok(sw.includes('/models/') && sw.includes('onnx'), 'model must be excluded');
  assert.ok(!list.some(u => /models|\.onnx|ort-wasm/.test(u)));
});

test('kids, mushaf, ort and quran data ship in dist', opts, () => {
  for (const p of ['quran.json', 'kids', 'mushaf', 'ort/ort-wasm-simd-threaded.wasm', 'ort/ort-wasm-simd-threaded.mjs', 'adhan/adhan.mp3', 'icon.svg']) assert.ok(existsSync(join(dist, p)), p);
});
