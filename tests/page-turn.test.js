// Page turn of the free recitation (src/core/page-turn.js): the next page follows only at the end of the shown page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_SAMPLES, pageEndReached, pageAction } from '../src/core/page-turn.js';

test('the end of the page is reached when its last word is judged, not before', () => {
  assert.equal(pageEndReached({ lastJ: 8, lastWordIdx: 10 }), false, 'two words still to read');
  assert.equal(pageEndReached({ lastJ: 9, lastWordIdx: 10 }), false, 'the word before the last one');
  assert.equal(pageEndReached({ lastJ: 10, lastWordIdx: 10 }), true, 'the last word judged');
});

test('a last word still pending: the page holds it for the hold time of audio, then counts as reached', () => {
  const base = { lastJ: 9, lastWordIdx: 10, curI: 10 };
  assert.equal(pageEndReached({ ...base, samplesHeld: HOLD_SAMPLES - 1 }), false, 'just before the hold time');
  assert.equal(pageEndReached({ ...base, samplesHeld: HOLD_SAMPLES }), true, 'the reciter moved on or paused there');
  assert.equal(pageEndReached({ lastJ: 9, lastWordIdx: 10, curI: 9, samplesHeld: HOLD_SAMPLES * 5 }), false, 'the reciter is not on the last word');
});

test('a page with no words is reached at once', () => {
  assert.equal(pageEndReached({ lastWordIdx: -1 }), true);
});

test('a stray judged word of the next page does not turn the page before the shown one ends', () => {
  assert.equal(pageAction({ shown: 10, target: 11, ended: false }), 'wait');
  assert.equal(pageAction({ shown: 10, target: 11, ended: true }), 'turn');
});

test('the same page again changes nothing, jittery verdicts never flip the page back and forth', () => {
  assert.equal(pageAction({ shown: 10, target: 10, ended: true }), 'stay');
  assert.equal(pageAction({ shown: 10, target: 10, ended: false }), 'stay');
});

test('an earlier page where the reciter is follows back at once', () => {
  assert.equal(pageAction({ shown: 10, target: 9, ended: false }), 'turn');
});

test('the reader turning pages by hand keeps the page, until the reciter is back on it', () => {
  assert.equal(pageAction({ shown: 12, target: 11, ended: true, manual: true }), 'stay');
  assert.equal(pageAction({ shown: 12, target: 13, ended: true, manual: true }), 'stay');
});

test('with automatic turning off nothing follows the reciter', () => {
  assert.equal(pageAction({ shown: 10, target: 11, ended: true, auto: false }), 'stay');
  assert.equal(pageAction({ shown: 10, target: 9, ended: false, auto: false }), 'stay');
});
