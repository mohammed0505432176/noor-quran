import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldToggle } from '../src/core/chrome-toggle.js';

test('empty tap toggles', () => assert.equal(shouldToggle({}), true));
test('buttons, ayahs, selections, drags and long presses never toggle', () => {
  for (const k of ['hasSelection', 'onInteractive', 'moved', 'long']) assert.equal(shouldToggle({ [k]: true }), false);
});
