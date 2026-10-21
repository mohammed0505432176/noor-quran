import test from 'node:test';
import assert from 'node:assert/strict';

// minimal localStorage/sessionStorage shims so store.js can load in node
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.sessionStorage = { getItem: () => null, setItem() {} };
const { timesFor, nextPrayer, qiblaDirection } = await import('../src/core/prayer.js');

const riyadh = { lat: 24.7136, lng: 46.6753, method: 'UmmAlQura', madhab: 'shafi' };
const hourAST = d => ((d.getUTCHours() + 3) % 24) + d.getUTCMinutes() / 60;

test('Riyadh times are ordered and plausible', () => {
  const t = timesFor(new Date('2026-03-20T09:00:00Z'), riyadh);
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  for (let i = 1; i < order.length; i++) assert.ok(t[order[i]] > t[order[i - 1]], order[i]);
  const f = hourAST(t.fajr), m = hourAST(t.maghrib);
  assert.ok(f >= 4 && f <= 5.5, 'fajr ' + f);
  assert.ok(m >= 17.75 && m <= 18.75, 'maghrib ' + m);
});

test('nextPrayer after isha is tomorrow fajr', () => {
  const now = new Date('2026-03-20T20:30:00Z'); // 23:30 Riyadh
  const n = nextPrayer(now, riyadh);
  assert.equal(n.key, 'fajr');
  assert.ok(n.time > now && n.time - now < 12 * 3600e3);
});

test('nextPrayer skips sunrise', () => {
  const n = nextPrayer(new Date('2026-03-20T02:30:00Z'), riyadh); // 05:30 Riyadh, between fajr and sunrise
  assert.notEqual(n.key, 'sunrise');
});

test('qibla bearings', () => {
  const r = qiblaDirection(24.7136, 46.6753);
  assert.ok(r >= 243 && r <= 247, String(r));
  const c = qiblaDirection(30.0444, 31.2357);
  assert.ok(c >= 135 && c <= 138, String(c));
});

test('Umm al-Qura isha interval is 120 min in Ramadan, 90 otherwise', () => {
  const gap = d => { const t = timesFor(d, riyadh); return (t.isha - t.maghrib) / 60000; };
  const ram = gap(new Date('2027-02-15T09:00:00Z')); // Ramadan 1448
  const out = gap(new Date('2026-10-15T09:00:00Z'));
  assert.ok(Math.abs(ram - 120) <= 2, 'ramadan ' + ram);
  assert.ok(Math.abs(out - 90) <= 2, 'outside ' + out);
});
