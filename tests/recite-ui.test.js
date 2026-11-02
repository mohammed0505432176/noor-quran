// Recitation screen contracts (src/views/recite.js): the automatic page turn never fires mid-line, and the tap-to-hide wiring
// never lets a tap on a word / ayah / button hide the tools. The view itself needs a DOM, so the wiring is checked on its source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HOLD_SAMPLES, pageEndReached, pageAction } from '../src/core/page-turn.js';
import { shouldToggle } from '../src/core/chrome-toggle.js';

test('auto turn: a forward turn needs the end of the shown page, whatever else is true', () => {
  for (const manual of [false, true]) for (const auto of [false, true]) {
    for (let target = 11; target <= 13; target++) {
      const a = pageAction({ shown: 10, target, ended: false, manual, auto });
      assert.notEqual(a, 'turn', `target ${target} manual=${manual} auto=${auto}: mid-page must never turn`);
    }
  }
});

test('auto turn: switched off or after a manual turn, the page never turns, even at the end of the page', () => {
  assert.equal(pageAction({ shown: 10, target: 11, ended: true, auto: false }), 'stay');
  assert.equal(pageAction({ shown: 10, target: 11, ended: true, manual: true }), 'stay');
  assert.equal(pageAction({ shown: 10, target: 9, ended: true, auto: false }), 'stay');
});

test('end of page: being in the middle of a line (not on the last word) is never the end, however long the audio', () => {
  for (const curI of [-1, 0, 5, 8]) {
    assert.equal(pageEndReached({ lastJ: curI - 1, lastWordIdx: 10, curI, samplesHeld: HOLD_SAMPLES * 20 }), false, `curI ${curI}`);
  }
  assert.equal(pageEndReached({ lastJ: 10, lastWordIdx: 10, curI: -1, samplesHeld: 0 }), true, 'the last word is judged');
});

test('tap-to-hide: a tap on a word, an ayah or a button never toggles; an empty tap does', () => {
  assert.equal(shouldToggle({ onInteractive: true }), false);
  assert.equal(shouldToggle({}), true);
});

test('recite.js wiring: tools toggle through chrome-toggle, not shared with the reader, words and bars are ignored', () => {
  const src = readFileSync(new URL('../src/views/recite.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/core\/chrome-toggle\.js'/);
  assert.equal((src.match(/bindChromeToggle\(rootEl/g) || []).length, 2, 'fixed range + free view');
  assert.equal((src.match(/persist: false/g) || []).length, 2, 'the reader\'s saved choice must not hide the mic of a session');
  const ig = /const RC_IGNORE = '([^']+)'/.exec(src);
  assert.ok(ig, 'RC_IGNORE');
  for (const sel of ['button', '.word', '.mq-w', '.ayah', '.rc-dock', '.rc-bottom', '.rd-top']) assert.ok(ig[1].split(',').includes(sel), sel);
  assert.match(src, /classList\.toggle\('chrome-off', off\)/);
});

test('recite.css: the recording row and its stop button are not hidden by chrome-off while recording', () => {
  const css = readFileSync(new URL('../src/styles/recite.css', import.meta.url), 'utf8');
  assert.match(css, /\.rc-rd\.chrome-off \.rd-bottom\.rc-bottom \{[^}]*visibility: visible/);
  assert.match(css, /\.rc-rd\.chrome-off:not\(\.rc-active\) \.rc-live/);
  assert.doesNotMatch(css, /\.rc-live[^{]*\{[^}]*display: none/, 'the live row is never display:none');
});
