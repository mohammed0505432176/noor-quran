// Free recitation (تسميع حر / السرد): covered ranges, cross-surah verdict mapping, Madinah page glyph groups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freeSegments, mapVerdicts } from '../src/core/quran-engine.js';
import { pageGlyphs, renderPageLines } from '../src/core/madani-render.js';

const v = (s, a, w, st = 'ok') => ({ s, a, w, st, vowel: 0 });

test('freeSegments: ranges per surah, short holes kept, long jumps split, pending ignored', () => {
  const words = [v(2, 5, 0), v(2, 6, 1), v(2, 9, 0), v(2, 30, 0), v(2, 31, 0, 'pending'), v(112, 1, 0), v(1, 7, 2)];
  assert.deepEqual(freeSegments(words), [
    { s: 1, from: 7, to: 7 }, { s: 2, from: 5, to: 9 }, { s: 2, from: 30, to: 30 }, { s: 112, from: 1, to: 1 }
  ]);
  assert.deepEqual(freeSegments([v(2, 5, 0)], ['2:7']), [{ s: 2, from: 5, to: 7 }]);
});

test('mapVerdicts with surah-keyed groups never mixes the same ayah number of two surahs', () => {
  const groups = [{ s: 1, a: 2, start: 0, end: 4 }, { s: 112, a: 2, start: 4, end: 6 }];
  const m = mapVerdicts([v(112, 2, 1, 'wrong'), v(1, 2, 0)], groups, { '1:2': 4, '112:2': 2 });
  assert.equal(m.get(5).st, 'wrong');
  assert.equal(m.get(0).st, 'ok');
  assert.equal(m.size, 2);
});

test('pageGlyphs: word glyph groups per ayah (k=0 only) and the ayah-end marks', () => {
  const L = JSON.parse(readFileSync(new URL('../public/mushaf/p/002.json', import.meta.url), 'utf8'));
  const { glyphs, groups, ends } = pageGlyphs(L);
  assert.deepEqual(groups.map(g => g.s + ':' + g.a), ['2:1', '2:2', '2:3', '2:4', '2:5']);
  for (const g of groups) {
    for (let i = g.start; i < g.end; i++) { assert.equal(glyphs[i].k, 0); assert.equal(glyphs[i].wi, i - g.start); }
    assert.equal(ends.get(g.s + ':' + g.a), g.end);          // the end mark follows the ayah's words
  }
  const html = renderPageLines(L, { hideText: true, family: 'x', wordClass: x => (x.k ? '' : 'f-pend') });
  assert.equal((html.match(/data-i=/g) || []).length, glyphs.length);
  assert.ok(html.includes('mq-hide') && html.includes('mq-w f-pend'));
});

test('freeSegments minRead: a stretch with fewer than 3 words read ok is not a segment', () => {
  const w = (s, a, n, st = 'ok') => Array.from({ length: n }, (_, i) => ({ s, a, w: i, st }));
  const segs = freeSegments([...w(3, 7, 2), ...w(2, 2, 5)], [], 2, 3);
  assert.deepEqual(segs, [{ s: 2, from: 2, to: 2 }]);
  assert.deepEqual(freeSegments(w(3, 7, 2), [], 2, 3), []);
});
