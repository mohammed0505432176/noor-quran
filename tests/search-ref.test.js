// Quran search (core/search.js + arabic skel) and the ayah of the day (core/ayah-of-day.js), on the real Quran text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, searchQuran } from '../src/core/search.js';
import { ayahOfDay } from '../src/core/ayah-of-day.js';
import { skel } from '../src/core/arabic.js';

const Q = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
const INDEX = buildIndex(Q);
const find = (q, limit = 60) => searchQuran(INDEX, q, Q, limit);
const has = (res, s, a) => res.results.some(r => r.s === s && r.a === a);

test('the phrase of 24:35 finds the ayah with the usual spelling (السماوات, الأرض)', () => {
  const r = find('الله نور السماوات والأرض');
  assert.equal(r.mode, 'phrase');
  assert.ok(has(r, 24, 35));
});

test('tashkeel, Quranic marks and the alif of the Uthmani text do not matter', () => {
  assert.ok(has(find('ٱللَّهُ نُورُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضِ'), 24, 35));
  assert.ok(has(find('الله نور السموت والارض'), 24, 35));
});

test('alef, ya and ta-marbuta variants are the same letters', () => {
  assert.equal(skel('إِنَّ'), skel('ان'));
  assert.equal(skel('مَدْرَسَة'), skel('مدرسه'));
  assert.equal(skel('هَٰذَا'), skel('هذا'));
});

test('a multi-word query with the phrase in no ayah returns the ayahs with all its words, and says so', () => {
  // مالك الدين is not a phrase of the Quran (1:4 reads مالك يوم الدين): its words are found together in 1:4
  const r = find('مالك الدين');
  assert.equal(r.mode, 'words');
  assert.ok(has(r, 1, 4), '1:4 has both words');
  for (const x of r.results) {
    const words = skel(x.text).split(' ');
    assert.ok(words.includes(skel('مالك')) && words.includes(skel('الدين')), `${x.s}:${x.a} has both words`);
  }
});

test('a single word is a plain substring search, no words mode', () => {
  const r = find('الله');
  assert.equal(r.mode, 'phrase');
  assert.ok(r.results.length >= 60, 'many results, capped by the limit');
  assert.equal(find('الله', 5).results.length, 5);
});

test('a query with fewer than two letters finds nothing', () => {
  assert.equal(find('ا').mode, 'none');
  assert.equal(find('').results.length, 0);
});

test('a word that is in no ayah finds nothing (no misleading results)', () => {
  const r = find('زززخخخ');
  assert.equal(r.mode, 'none');
  assert.equal(r.results.length, 0);
  const r2 = find('زززخخخ الله');
  assert.equal(r2.results.length, 0, 'one of the words is in no ayah: no words-mode results either');
});

test('ayah of the day: always a real ayah for every day of several years (never negative)', () => {
  const count = s => Q[s - 1].v.length;
  const start = new Date(2024, 0, 1);
  for (let d = 0; d < 366 * 3; d++) {
    const day = new Date(start.getTime() + d * 864e5);
    const { s, a } = ayahOfDay(day, count);
    assert.ok(Number.isInteger(s) && s >= 1 && s <= 114, `surah ${s} on day ${d}`);
    assert.ok(Number.isInteger(a) && a >= 1 && a <= count(s), `ayah ${a} of ${s} on day ${d}`);
  }
});

test('ayah of the day is the same all day and differs between days', () => {
  const count = s => Q[s - 1].v.length;
  const morning = ayahOfDay(new Date(2026, 5, 10, 6, 0), count);
  const night = ayahOfDay(new Date(2026, 5, 10, 23, 0), count);
  assert.deepEqual(morning, night);
  const seen = new Set();
  for (let d = 0; d < 60; d++) { const x = ayahOfDay(new Date(2026, 0, 1 + d), count); seen.add(x.s + ':' + x.a); }
  assert.ok(seen.size > 50, 'different ayahs on different days');
});
