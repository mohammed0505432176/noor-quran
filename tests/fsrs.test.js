import test from 'node:test';
import assert from 'node:assert/strict';
import { W, retrievability, nextInterval, review, fromBox, newCard, AGAIN, HARD, GOOD, EASY, MAX_DAYS, DESIRED_RETENTION } from '../src/core/fsrs.js';

test('recall probability is exactly 90% when the gap equals the stability, and falls with time', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-12);
  assert.equal(retrievability(0, 5), 1);
  assert.ok(retrievability(30, 5) < retrievability(5, 5));
});

test('first review: stability starts at the published parameters, easier ratings wait longer', () => {
  const a = review(newCard(), AGAIN), h = review(newCard(), HARD), g = review(newCard(), GOOD), e = review(newCard(), EASY);
  assert.equal(g.card.st, +W[2].toFixed(4));
  assert.equal(a.interval, 1);
  assert.ok(h.interval <= g.interval && g.interval < e.interval);
  assert.ok(a.card.df > g.card.df && g.card.df > e.card.df);   // forgetting makes a passage harder, an easy one easier
});

test('a successful review at the planned day grows the stability; good > hard, easy > good', () => {
  const c = review(newCard(), GOOD);
  const t = c.interval;
  const h = review(c.card, HARD, t), g = review(c.card, GOOD, t), e = review(c.card, EASY, t);
  assert.ok(g.card.st > c.card.st);
  assert.ok(h.card.st < g.card.st && g.card.st < e.card.st);
  assert.ok(g.interval >= c.interval);
});

test('a lapse cuts the stability, counts a lapse and brings the passage back tomorrow', () => {
  const c = review(review(newCard(), GOOD).card, GOOD, 4).card;
  const f = review(c, AGAIN, 6);
  assert.ok(f.card.st < c.st);
  assert.equal(f.card.lp, c.lp + 1);
  assert.equal(f.interval, 1);
});

test('reviewing late is rewarded more than reviewing early when recalled', () => {
  const c = review(newCard(), GOOD).card;
  const early = review(c, GOOD, 1), late = review(c, GOOD, 10);
  assert.ok(late.card.st > early.card.st);
  assert.ok(late.r < early.r);
});

test('intervals are whole days between 1 and the cap', () => {
  assert.equal(nextInterval(0.2), 1);
  assert.equal(nextInterval(100000), MAX_DAYS);
  for (const st of [0.5, 3, 9, 40]) { const n = nextInterval(st); assert.ok(Number.isInteger(n) && n >= 1 && n <= MAX_DAYS); }
  // a higher target retention means a shorter gap
  assert.ok(nextInterval(20, 0.97) < nextInterval(20, 0.85));
  assert.ok(DESIRED_RETENTION > 0.9);
});

test('old Leitner boxes convert to a card whose stability follows the box days', () => {
  assert.equal(fromBox(0).st, 1);
  assert.equal(fromBox(3).st, 7);
  assert.equal(fromBox(6).st, 60);
  assert.equal(fromBox(99).st, 60);
  const next = review(fromBox(3), GOOD, 7);
  assert.ok(next.card.st > 7);
});

test('difficulty and stability stay inside their bounds over a long run of mixed ratings', () => {
  let c = newCard();
  const seq = [GOOD, HARD, AGAIN, AGAIN, EASY, GOOD, HARD, AGAIN, GOOD, GOOD, EASY, AGAIN];
  for (const g of seq) {
    const r = review(c, g, c.st ? Math.max(1, Math.round(c.st)) : 0);
    c = r.card;
    assert.ok(c.df >= 1 && c.df <= 10 && c.st >= 0.1 && Number.isFinite(c.st));
  }
});
