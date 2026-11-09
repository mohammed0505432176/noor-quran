import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSpot, pageWeight } from '../src/core/spot-test.js';

const content = { 10: [{ s: 2, from: 1, to: 5 }], 11: [{ s: 2, from: 6, to: 10 }, { s: 3, from: 1, to: 3 }] };
const contentOf = p => content[p] || [];
const ayahsIn = s => (s === 2 ? 286 : 200);
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('nothing memorised: no spot', () => {
  assert.equal(pickSpot({ pages: [], contentOf, ayahsIn }), null);
  assert.equal(pickSpot({ pages: [99], contentOf, ayahsIn }), null);
});

test('a spot is always inside a memorised page, with the ayah before it as the cue', () => {
  const rnd = seeded(7);
  for (let i = 0; i < 300; i++) {
    const sp = pickSpot({ pages: [10, 11], contentOf, ayahsIn, len: 2, rnd });
    const ok = content[sp.page].some(g => g.s === sp.s && sp.from >= g.from && sp.from <= g.to);
    assert.ok(ok);
    assert.ok(sp.to >= sp.from && sp.to - sp.from <= 1);
    if (sp.from > 1) assert.deepEqual(sp.cue, { s: sp.s, a: sp.from - 1 }); else assert.equal(sp.cue, null);
  }
});

test('the test never runs past the end of the surah', () => {
  const sp = pickSpot({ pages: [5], contentOf: () => [{ s: 114, from: 6, to: 6 }], ayahsIn: () => 6, len: 3, rnd: () => 0 });
  assert.equal(sp.from, 6); assert.equal(sp.to, 6);
});

test('every ayah of the page can come up', () => {
  const seen = new Set(); const rnd = seeded(3);
  for (let i = 0; i < 400; i++) { const sp = pickSpot({ pages: [10], contentOf, ayahsIn, rnd }); seen.add(sp.from); }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5]);
});

test('weaker and older pages are chosen more often', () => {
  const weight = p => (p === 10 ? pageWeight(1, 40) : pageWeight(3, 1));
  const rnd = seeded(11); let weak = 0;
  for (let i = 0; i < 1000; i++) if (pickSpot({ pages: [10, 11], weight, contentOf, ayahsIn, rnd }).page === 10) weak++;
  assert.ok(weak > 650, 'weak page picked ' + weak + ' / 1000');
  assert.ok(pageWeight(1, 40) > pageWeight(3, 1));
});
