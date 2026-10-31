// Kids azkar data (src/data/kids-azkar.js + kids-azkar-more.js): shape, unique ids, emoji files,
// audio URLs, valid Quran references.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { KIDS_AZKAR } from '../src/data/kids-azkar.js';

const Q = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
const ARABIC = /[؀-ۿ]/;
const HISN_AUDIO = /^https:\/\/hisnmuslim\.com\/audio\/ar\/\d+\.mp3$/;
const hisnItems = c => c.items.filter(i => !i.quran);

test('there are at least 60 categories, each with 1-4 items', () => {
  assert.ok(KIDS_AZKAR.length >= 60, `categories: ${KIDS_AZKAR.length}`);
  for (const c of KIDS_AZKAR) assert.ok(c.items.length >= 1 && c.items.length <= 4, `${c.id} has ${c.items.length} items`);
});

test('category ids are unique and every category has the required fields', () => {
  const ids = KIDS_AZKAR.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const c of KIDS_AZKAR) {
    assert.ok(c.title && ARABIC.test(c.title), `${c.id} title`);
    assert.ok(c.when && ARABIC.test(c.when), `${c.id} when`);
    assert.ok(['hisn', 'quran'].includes(c.kind), `${c.id} kind`);
  }
});

test('every category emoji has an svg file', () => {
  for (const c of KIDS_AZKAR) {
    const f = new URL(`../public/kids/emoji/${c.emoji}.svg`, import.meta.url);
    assert.ok(existsSync(f), `${c.id}: missing public/kids/emoji/${c.emoji}.svg`);
  }
});

test('hisn items have Arabic text, a hisnmuslim audio URL (or none) and a whole repeat count', () => {
  for (const c of KIDS_AZKAR.filter(x => x.kind === 'hisn')) {
    for (const i of c.items) {
      const w = `${c.id}`;
      assert.ok(!i.quran, `${w}: hisn category must not carry quran items`);
      assert.ok(typeof i.text === 'string' && ARABIC.test(i.text), `${w}: Arabic text`);
      assert.ok(i.audio === undefined || i.audio === null || HISN_AUDIO.test(i.audio), `${w}: audio url ${i.audio}`);
      assert.ok(Number.isInteger(i.repeat) && i.repeat >= 1, `${w}: repeat`);
    }
  }
});

test('quran categories hold only valid, ordered references', () => {
  const qcats = KIDS_AZKAR.filter(c => c.kind === 'quran');
  assert.ok(qcats.length >= 10, 'enough quran categories');
  for (const c of qcats) {
    for (const i of c.items) {
      assert.ok(i.quran && !i.text && !i.audio, `${c.id}: quran item stores a reference only`);
      assert.ok(Number.isInteger(i.repeat) && i.repeat >= 1, `${c.id}: repeat`);
      const { s, from, to } = i.quran;
      assert.ok(Number.isInteger(s) && s >= 1 && s <= 114, `${c.id}: surah ${s}`);
      const n = Q[s - 1].v.length;
      assert.ok(Number.isInteger(from) && Number.isInteger(to), `${c.id}: integers`);
      assert.ok(from >= 1 && from <= to && to <= n, `${c.id}: ${s}:${from}-${to} (surah has ${n})`);
      for (let a = from; a <= to; a++) assert.ok(Q[s - 1].v[a - 1], `${c.id}: ${s}:${a} exists`);
    }
  }
});

test('the required Quran adhkar are present', () => {
  const has = (s, from, to) => KIDS_AZKAR.some(c => c.kind === 'quran' && c.items.some(i => i.quran.s === s && i.quran.from <= from && i.quran.to >= to));
  assert.ok(has(2, 255, 255), 'Ayat al-Kursi');
  assert.ok(has(2, 285, 286), 'end of Al-Baqarah');
  for (const s of [112, 113, 114]) assert.ok(has(s, 1, Q[s - 1].v.length), `surah ${s}`);
  assert.ok(has(1, 1, 7), 'Al-Fatiha');
  for (const [s, a] of [[2, 201], [3, 8], [20, 114], [25, 74], [14, 40], [14, 41], [17, 24], [23, 118]]) assert.ok(has(s, a, a), `${s}:${a}`);
});

test('no duplicate text inside a category', () => {
  for (const c of KIDS_AZKAR) {
    const texts = hisnItems(c).map(i => i.text.replace(/\s+/g, ' ').trim());
    assert.equal(new Set(texts).size, texts.length, `${c.id} repeats a text`);
    const refs = c.items.filter(i => i.quran).map(i => `${i.quran.s}:${i.quran.from}-${i.quran.to}`);
    assert.equal(new Set(refs).size, refs.length, `${c.id} repeats a reference`);
  }
});
