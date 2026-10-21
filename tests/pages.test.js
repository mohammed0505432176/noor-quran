import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pageOf, pageContent, side, quarterOf, juzOfPage, surahStartsOn, hizbLabel,
} from '../src/core/pages.js';
import { AYAH_COUNTS } from '../src/core/mushaf-data.js';

test('pageOf boundaries', () => {
  assert.equal(pageOf(1, 1), 1);
  assert.equal(pageOf(2, 1), 2);
  assert.equal(pageOf(2, 5), 2);
  assert.equal(pageOf(2, 6), 3);
  assert.equal(pageOf(114, 6), 604);
  assert.equal(pageOf(112, 1), 604);
});

test('pageContent first and last pages', () => {
  assert.deepEqual(pageContent(1), [{ s: 1, from: 1, to: 7 }]);
  assert.deepEqual(pageContent(604), [
    { s: 112, from: 1, to: 4 },
    { s: 113, from: 1, to: 5 },
    { s: 114, from: 1, to: 6 },
  ]);
});

test('pageContent covers every ayah exactly once, in order', () => {
  let prev = null, total = 0;
  for (let p = 1; p <= 604; p++) {
    for (const seg of pageContent(p)) {
      assert.ok(seg.from >= 1 && seg.to >= seg.from, `bad segment on page ${p}`);
      if (prev === null) {
        assert.equal(seg.s, 1);
        assert.equal(seg.from, 1);
      } else if (seg.s === prev.s) {
        assert.equal(seg.from, prev.to + 1, `gap/overlap on page ${p}`);
      } else {
        assert.equal(seg.s, prev.s + 1, `surah jump on page ${p}`);
        assert.equal(seg.from, 1, `surah start on page ${p}`);
        assert.equal(prev.to, AYAH_COUNTS[prev.s - 1], `unfinished surah before page ${p}`);
      }
      total += seg.to - seg.from + 1;
      prev = seg;
    }
  }
  assert.equal(total, 6236);
  assert.equal(prev.s, 114);
  assert.equal(prev.to, 6);
});

test('side alternates right/left', () => {
  assert.equal(side(1), 'right');
  assert.equal(side(2), 'left');
});

test('quarterOf', () => {
  assert.equal(quarterOf(1, 1), 1);
  assert.equal(quarterOf(2, 26), 2);
  assert.equal(quarterOf(114, 6), 240);
});

test('juzOfPage', () => {
  assert.equal(juzOfPage(1), 1);
  assert.equal(juzOfPage(604), 30);
});

test('surahStartsOn', () => {
  assert.deepEqual(surahStartsOn(604), [112, 113, 114]);
});

test('hizbLabel', () => {
  assert.ok(hizbLabel(1).includes('الحزب'));
  assert.ok(hizbLabel(2).includes('ربع'));
});

test('out-of-range pages are clamped', () => {
  assert.doesNotThrow(() => pageContent(0));
  assert.doesNotThrow(() => pageContent(999));
  assert.deepEqual(pageContent(0), pageContent(1));
  assert.deepEqual(pageContent(999), pageContent(604));
});
