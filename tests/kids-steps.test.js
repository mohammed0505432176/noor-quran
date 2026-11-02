// Kids prayer guide pictures: one illustrated set in public/kids/steps (scripts/gen-prayer-art.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { PRAYER_STEPS } from '../src/data/kids-prayer.js';
import { NAMES } from '../scripts/gen-prayer-art.mjs';

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

test('every prayer step picture has a 960x720 webp and its svg source', () => {
  assert.ok(imgs.length >= 8);
  for (const n of imgs) {
    assert.ok(existsSync(file(n, 'webp')), `missing public/kids/steps/${n}.webp`);
    assert.ok(existsSync(file(n, 'svg')), `missing public/kids/steps/${n}.svg`);
    assert.deepEqual(webpSize(readFileSync(file(n, 'webp'))), [960, 720], `${n}.webp size`);
    const svg = readFileSync(file(n, 'svg'), 'utf8');
    assert.match(svg, /viewBox="0 0 960 720"/, `${n}.svg viewBox`);
    assert.doesNotMatch(svg, /<text|<image|https?:\/\/(?!www\.w3\.org)/, `${n}.svg must be self-contained, no text`);
  }
});

test('the generator draws every step picture', () => {
  for (const n of imgs) assert.ok(NAMES.includes(n), `gen-prayer-art.mjs does not draw ${n}`);
});

test('kids view uses the step set (webp -> svg -> icon) for the steps, the end screen and the order quiz', () => {
  assert.match(kidsJs, /kids\/steps\/\$\{esc\(name\)\}\.webp/);
  assert.match(kidsJs, /data-fb="\$\{BASE\}kids\/steps\/\$\{esc\(name\)\}\.svg"/);
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
