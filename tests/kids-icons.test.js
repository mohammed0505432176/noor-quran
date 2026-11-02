// Kids azkar icon set: 16 svg files in one palette, every category maps to an existing icon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { KIDS_AZKAR } from '../src/data/kids-azkar.js';
import { ICONS, ICON_BY_ID, iconFor } from '../src/data/kids-icons.js';

const file = n => new URL(`../public/kids/icons/${n}.svg`, import.meta.url);

test('the icon set has the 16 required svg files with a 96x96 viewBox', () => {
  assert.equal(ICONS.length, 16);
  for (const n of ICONS) {
    assert.ok(existsSync(file(n)), `missing public/kids/icons/${n}.svg`);
    const s = readFileSync(file(n), 'utf8');
    assert.match(s, /viewBox="0 0 96 96"/, `${n} viewBox`);
  }
});

test('icons only use the teal / cream / gold palette (plus white highlights)', () => {
  const ok = new Set(['#1f7a6d', '#fff4d6', '#e0a93b', '#fff', '#000']);
  for (const n of ICONS) {
    const cols = readFileSync(file(n), 'utf8').match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    for (const c of cols) assert.ok(ok.has(c.toLowerCase()), `${n} uses off-palette ${c}`);
  }
});

test('every category resolves to an existing icon and the id map has no stale ids', () => {
  const ids = new Set(KIDS_AZKAR.map(c => c.id));
  for (const c of KIDS_AZKAR) {
    const n = iconFor(c);
    assert.ok(ICONS.includes(n), `${c.id} -> ${n}`);
    assert.ok(existsSync(file(n)), `${c.id}: icon file ${n}`);
  }
  for (const id of Object.keys(ICON_BY_ID)) assert.ok(ids.has(id), `ICON_BY_ID has unknown id ${id}`);
  for (const [id, n] of Object.entries(ICON_BY_ID)) assert.ok(ICONS.includes(n), `${id} -> ${n}`);
  assert.ok(new Set(KIDS_AZKAR.map(iconFor)).size >= 12, 'icons are varied');
});

test('unknown categories fall back to a keyword match, then to general', () => {
  assert.equal(iconFor({ id: 'zzz', title: 'دعاء الصباح' }), 'sun');
  assert.equal(iconFor({ id: 'zzz', title: 'شيء مختلف' }), 'general');
  assert.equal(iconFor(null), 'general');
});
