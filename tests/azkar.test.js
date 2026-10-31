// Adhkar data (src/data/azkar.js + azkar-more.js): shape, unique categories and entries, valid Quran references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, AZKAR } from '../src/data/azkar.js';
import { MORE_CATEGORIES, MORE_AZKAR } from '../src/data/azkar-more.js';
import { MORE2_CATEGORIES, MORE2_AZKAR } from '../src/data/azkar-more2.js';

const Q = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
const ayahCount = s => Q[s - 1].v.length;
const ARABIC = /[؀-ۿ]/;

test('category ids are unique and every category has entries', () => {
  const ids = CATEGORIES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const c of CATEGORIES) {
    assert.ok(Array.isArray(AZKAR[c.id]) && AZKAR[c.id].length > 0, `${c.id} has entries`);
    assert.ok(c.title && c.icon, `${c.id} has title and icon`);
  }
});

test('the occasion categories are all listed, and nothing is listed twice', () => {
  for (const c of MORE_CATEGORIES) assert.ok(CATEGORIES.some(x => x.id === c.id), c.id);
  for (const id of Object.keys(MORE_AZKAR)) assert.ok(MORE_CATEGORIES.some(c => c.id === id), `${id} has a category`);
  assert.equal(CATEGORIES.length, 4 + MORE_CATEGORIES.length + MORE2_CATEGORIES.length);
});

test('every entry has a text (or a Quran reference), a whole count, and a source', () => {
  for (const [cat, list] of Object.entries(AZKAR)) {
    list.forEach((z, i) => {
      const where = `${cat}[${i}]`;
      assert.ok(z.quran || (typeof z.text === 'string' && z.text.trim()), `${where} has text or quran`);
      if (z.text) assert.ok(ARABIC.test(z.text), `${where} is Arabic`);
      assert.ok(Number.isInteger(z.count) && z.count >= 1, `${where} count`);
      assert.ok(typeof z.source === 'string' && z.source.trim(), `${where} source`);
      if (z.virtue !== undefined) assert.ok(typeof z.virtue === 'string' && z.virtue.trim(), `${where} virtue`);
    });
  }
});

test('no entry repeats inside its category', () => {
  for (const [cat, list] of Object.entries(AZKAR)) {
    const texts = list.filter(z => z.text).map(z => z.text.trim());
    assert.equal(new Set(texts).size, texts.length, `${cat} has a repeated text`);
  }
});

test('every Quran reference points at existing ayahs, in order', () => {
  for (const [cat, list] of Object.entries(AZKAR)) {
    for (const z of list) {
      if (!z.quran) continue;
      const { s, from, to } = z.quran;
      const where = `${cat} ${s}:${from}-${to}`;
      assert.ok(s >= 1 && s <= 114, `${where} surah`);
      assert.ok(from >= 1 && from <= to && to <= ayahCount(s), `${where} ayahs`);
    }
  }
});

test('the Quran text in the core sections is not retyped (references only, same as before)', () => {
  const kursi = AZKAR.morning[0];
  assert.deepEqual(kursi.quran, { s: 2, from: 255, to: 255 });
});
