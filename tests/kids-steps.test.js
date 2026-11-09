// Kids prayer guide pictures: one photographic set in public/kids/steps (scripts/import-photos.mjs, Gemini photographs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PRAYER_STEPS } from '../src/data/kids-prayer.js';
import { MAP } from '../scripts/import-photos.mjs';
import { CATEGORIES } from '../src/data/azkar.js';
import { azkarImg, AZKAR_ALT } from '../src/data/azkar-images.js';

const file = (n, ext) => new URL(`../public/kids/steps/${n}.${ext}`, import.meta.url);
const kidsJs = readFileSync(new URL('../src/views/kids.js', import.meta.url), 'utf8');
const imgs = [...new Set(PRAYER_STEPS.map(s => s.img))];
/** width/height of a webp (VP8, VP8L or VP8X) */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
}

test('every prayer step picture is a 960x720 webp photograph', () => {
  assert.ok(imgs.length >= 8);
  for (const n of imgs) {
    assert.ok(existsSync(file(n, 'webp')), `missing public/kids/steps/${n}.webp`);
    assert.deepEqual(webpSize(readFileSync(file(n, 'webp'))), [960, 720], `${n}.webp size`);
    assert.ok(!existsSync(file(n, 'svg')), `${n}.svg: the drawn set was replaced by photographs`);
    assert.ok(MAP['kids/steps'].includes(n), `import-photos.mjs does not import ${n}`);
  }
});

test('home cards and azkar categories have photographs with alt text', () => {
  const azkarJs = readFileSync(new URL('../src/views/azkar.js', import.meta.url), 'utf8');
  for (const id of Object.keys(MAP['kids/photo'])) {
    const u = new URL(`../public/kids/photo/${id}.webp`, import.meta.url);
    assert.ok(existsSync(u), `missing kids photo ${id}`);
    assert.deepEqual(webpSize(readFileSync(u)), [960, 720]);
    assert.match(kidsJs, new RegExp(`'${id}': \{[^}]*alt:`), `${id} has no alt text`);
  }
  for (const id of Object.keys(MAP.azkar)) assert.ok(existsSync(new URL(`../public/azkar/${id}.webp`, import.meta.url)), `missing azkar photo ${id}`);
  for (const c of CATEGORIES) {
    const p = azkarImg(c.id);
    assert.ok(existsSync(new URL(`../public/${p}.webp`, import.meta.url)), `category ${c.id}: missing ${p}.webp`);
    assert.ok(AZKAR_ALT[p], `${p} has no alt text`);
  }
  assert.match(azkarJs, /azkarImg\(c\.id\)/);
  assert.ok(existsSync(new URL('../public/kids/photo/mascot.webp', import.meta.url)));
});

test('kids view uses the step set (webp -> icon tile) for the steps, the end screen and the order quiz', () => {
  assert.match(kidsJs, /kids\/steps\/\$\{esc\(name\)\}\.webp/);
  assert.match(kidsJs, /const prayerArt = \(name, _fb, cls = ''\) => stepArt\(name, cls\)/);
  const icons = kidsJs.match(/const STEP_ICON = \{([^}]*)\}/)[1];
  const quiz = kidsJs.match(/const POSES = \[([^\]]*)\]/)[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1));
  for (const n of new Set([...imgs, ...quiz])) {
    assert.match(icons, new RegExp(`\\b${n}:`), `STEP_ICON lacks ${n}`);
    assert.ok(existsSync(file(n, 'webp')), `quiz pose ${n} has no picture`);
  }
  // steps no longer come from the old mixed photo / vector folders
  const photos = kidsJs.match(/const PHOTOS = \{([\s\S]*?)\n\};/)[1];
  for (const n of imgs) assert.doesNotMatch(photos, new RegExp(`^\\s*'?${n}'?:`, 'm'), `${n} still mapped to a photo`);
});

test('every step has a small spoken narration clip', () => {
  for (const s of PRAYER_STEPS) {
    assert.ok(s.narr, `${s.id}: no narr`);
    const u = new URL(`../public/${s.narr}`, import.meta.url);
    assert.ok(existsSync(u), `missing ${s.narr}`);
    assert.ok(readFileSync(u).length < 120 * 1024, `${s.narr} is too big`);
  }
});
