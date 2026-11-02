import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFont, availHeight, reserveHeights, FS_FLOOR, FLOOR_SHARE, LH_MIN, LH_MAX } from '../src/core/madani-render.js';

test('pickFont: plenty of room keeps the width font and the print pitch', () => {
  const r = pickFont({ widthFs: 22, availH: 900, n: 15 });
  assert.equal(r.fs, 22);
  assert.ok(Math.abs(r.lh - 22 * LH_MAX) < 1e-9);
  assert.equal(r.scroll, false);
});

test('pickFont: a bit short shrinks the font (not below the floor) so every line still fits', () => {
  const r = pickFont({ widthFs: 24, availH: 15 * 22 * LH_MIN, n: 15 });
  assert.ok(Math.abs(r.fs - 22) < 1e-9);
  assert.ok(r.fs >= FS_FLOOR);
  assert.equal(r.scroll, false);
  assert.ok(r.lh * 15 <= 15 * 22 * LH_MIN + 1e-6);
});

test('pickFont: a very short screen (landscape) keeps the floor font and scrolls, never crowds lines', () => {
  const r = pickFont({ widthFs: 33, availH: 246, n: 15 });
  assert.ok(Math.abs(r.fs - 33 * FLOOR_SHARE) < 1e-9, 'wide page keeps most of its width font');
  const phone = pickFont({ widthFs: 21, availH: 200, n: 15 });
  assert.equal(phone.fs, FS_FLOOR);
  assert.equal(phone.scroll, true);
  assert.ok(r.lh >= r.fs * LH_MIN - 1e-9, 'pitch never tighter than LH_MIN');
  assert.equal(r.scroll, true);
});

test('pickFont: width font below the floor is kept as is (narrow phone)', () => {
  const r = pickFont({ widthFs: 16, availH: 300, n: 15 });
  assert.equal(r.fs, 16);
  assert.ok(r.lh >= 16 * LH_MIN - 1e-9);
});

test('pickFont: unknown room falls back to the width font', () => {
  for (const availH of [NaN, 0, -20, undefined]) {
    const r = pickFont({ widthFs: 21, availH, n: 15 });
    assert.equal(r.fs, 21);
    assert.equal(r.scroll, false);
  }
});

test('pickFont: pitch always inside [LH_MIN, LH_MAX] em and short pages (8 lines) are not stretched', () => {
  for (const [w, a, n] of [[18, 700, 8], [25, 500, 15], [30, 1200, 15], [20, 150, 15]]) {
    const r = pickFont({ widthFs: w, availH: a, n });
    assert.ok(r.lh >= r.fs * LH_MIN - 1e-9 && r.lh <= r.fs * LH_MAX + 1e-9);
  }
});

test('availHeight: viewport minus everything around the lines', () => {
  assert.equal(availHeight({ vh: 844, hostTop: 80, hostPad: 4, below: 40, reserve: 74 }), 844 - 80 - 4 - 40 - 74 - 8);
});

test('reserveHeights: bars visible', () => {
  assert.deepEqual(reserveHeights({ stage: 70.4, bottom: 82.2, player: 56, playerOn: false }), { top: 70, base: 82, pl: 0, fit: 82 });
  assert.deepEqual(reserveHeights({ stage: 70, bottom: 82, player: 56, playerOn: true }), { top: 70, base: 82, pl: 64, fit: 146 });
});

test('reserveHeights: bars hidden keep the fit reserve (text stays) but free the CSS base', () => {
  const r = reserveHeights({ stage: 70, bottom: 82, player: 56, playerOn: true, off: true });
  assert.equal(r.base, null);
  assert.equal(r.fit, 146);
});
