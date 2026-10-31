import test from 'node:test';
import assert from 'node:assert/strict';
import { micState } from '../src/core/speech.js';

test('ready by default', () => assert.equal(micState().key, 'ready'));
test('listening / paused / processing', () => {
  assert.equal(micState({ listening: true }).key, 'listening');
  assert.equal(micState({ paused: true }).key, 'paused');
  assert.equal(micState({ busy: true, listening: true }).key, 'processing');
});
test('permission wins and offers the allow button', () => {
  const s = micState({ perm: 'denied', online: false, listening: true });
  assert.equal(s.key, 'permission'); assert.equal(s.allow, true); assert.match(s.detail, /إعدادات/);
});
test('offline: network engines are blocked, never claiming offline recognition', () => {
  const web = micState({ online: false, engine: 'device' });
  assert.equal(web.key, 'offline'); assert.match(web.detail, /يحتاج إنترنت/); assert.doesNotMatch(web.detail, /يعمل دون إنترنت التعرف/);
  assert.match(micState({ netError: true, engine: 'device', native: true }).detail, /قد لا يعمل/);
  assert.match(micState({ online: false, engine: 'ai' }).detail, /الدقيق/);
});
test('offline: the cached on-device Quran engine keeps working', () => {
  assert.equal(micState({ online: false, engine: 'quran', listening: true }).key, 'listening');
  assert.match(micState({ online: false, engine: 'device', quranReady: true }).detail, /المحرك القرآني/);
  assert.match(micState({ online: false, engine: 'device', quranReady: false }).detail, /حمّل/);
});
test('every state has an icon and a label', () => {
  for (const c of [{}, { listening: true }, { paused: true }, { busy: true }, { perm: 'denied' }, { online: false }]) {
    const s = micState(c); assert.ok(s.icon && s.label);
  }
});
