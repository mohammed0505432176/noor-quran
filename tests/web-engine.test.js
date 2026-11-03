import test from 'node:test';
import assert from 'node:assert/strict';
import { unsupportedReason, classifyEngineError, resumePlan, continuesAt, engineSupported } from '../src/core/quran-engine.js';
import { speechUnsupportedText } from '../src/core/speech.js';

test('unsupportedReason reports the first missing capability', () => {
  assert.equal(unsupportedReason({ WebAssembly: {}, Worker() {}, caches: {} }), null);
  assert.equal(unsupportedReason({ Worker() {}, caches: {} }), 'wasm');
  assert.equal(unsupportedReason({ WebAssembly: {}, caches: {} }), 'worker');
  assert.equal(unsupportedReason({ WebAssembly: {}, Worker() {} }), 'cache');
  assert.equal(typeof engineSupported(), 'boolean');
});

test('classifyEngineError gives readable Arabic reasons', () => {
  const q = new Error('x'); q.name = 'QuotaExceededError';
  assert.equal(classifyEngineError(q).code, 'quota');
  assert.equal(classifyEngineError(new RangeError('Array buffer allocation failed')).code, 'memory');
  assert.equal(classifyEngineError(new TypeError('Failed to fetch')).code, 'network');
  assert.equal(classifyEngineError(new Error('incomplete')).code, 'incomplete');
  assert.equal(classifyEngineError(new Error('engine init timeout')).code, 'timeout');
  assert.equal(classifyEngineError(null).code, 'unknown');
  for (const e of [q, new Error('zzz'), undefined]) assert.match(classifyEngineError(e).text, /[؀-ۿ]/);
  assert.equal(classifyEngineError(new TypeError('Failed to fetch')).retry, true);
  assert.equal(classifyEngineError(q).retry, false);
});

test('resume planning', () => {
  assert.deepEqual(resumePlan(0, 100), { start: 0, range: null });
  assert.deepEqual(resumePlan(40, 100), { start: 40, range: 'bytes=40-' });
  assert.equal(resumePlan(100, 100).range, null);
  assert.equal(continuesAt(206, 'bytes 40-99/100', 40), true);
  assert.equal(continuesAt(206, 'bytes 0-99/100', 40), false);
  assert.equal(continuesAt(200, null, 40), false);
});

test('speech unsupported text', () => {
  assert.match(speechUnsupportedText('Mozilla/5.0 Firefox/120'), /فايرفوكس/);
  assert.match(speechUnsupportedText('iPhone Safari'), /الآيفون/);
  assert.match(speechUnsupportedText(''), /كروم/);
});
