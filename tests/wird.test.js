import test from 'node:test';
import assert from 'node:assert/strict';
import { makePlan, pagesFor, status, nextPage, logPage, dayIndex, PAGES } from '../src/core/wird.js';

const START = '2026-01-01';
const day = n => { const d = new Date(START + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

test('a 30-day khatma covers all 604 pages exactly once, in order', () => {
  const plan = makePlan({ kind: 'khatma', days: 30, start: START });
  const all = [];
  for (let i = 0; i < plan.days; i++) all.push(...pagesFor(plan, i));
  assert.equal(all.length, PAGES);
  assert.deepEqual(all, Array.from({ length: PAGES }, (_, k) => k + 1));
  for (let i = 0; i < 30; i++) assert.ok(pagesFor(plan, i).length >= 20 && pagesFor(plan, i).length <= 21);
});

test('pages-per-day plans run until the Mushaf ends', () => {
  const plan = makePlan({ kind: 'pages', perDay: 5, start: START });
  assert.equal(plan.days, Math.ceil(604 / 5));
  assert.equal(pagesFor(plan, 0).length, 5);
  assert.equal(pagesFor(plan, plan.days - 1).length, 604 - 5 * (plan.days - 1));
  assert.deepEqual(pagesFor(plan, plan.days), []);
});

test('a plan can start in the middle of the Mushaf and wraps after page 604', () => {
  const plan = makePlan({ kind: 'khatma', days: 2, start: START, startPage: 303 });
  const a = pagesFor(plan, 0), b = pagesFor(plan, 1);
  assert.equal(a[0], 303); assert.equal(a[a.length - 1], 604);
  assert.equal(b[0], 1); assert.equal(b[b.length - 1], 302);
});

test('today: planned pages, what is left, done when all are read', () => {
  const plan = makePlan({ kind: 'pages', perDay: 3, start: START });
  const log = {};
  let st = status(plan, log, day(0));
  assert.deepEqual(st.today, [1, 2, 3]); assert.equal(st.todayDone, false); assert.equal(nextPage(st), 1);
  logPage(log, day(0), 1); logPage(log, day(0), 2);
  st = status(plan, log, day(0));
  assert.deepEqual(st.todayLeft, [3]); assert.equal(nextPage(st), 3);
  logPage(log, day(0), 3);
  assert.equal(status(plan, log, day(0)).todayDone, true);
});

test('missed days become owed pages, and catching up clears them', () => {
  const plan = makePlan({ kind: 'pages', perDay: 3, start: START });
  const log = {};
  logPage(log, day(0), 1); logPage(log, day(0), 2); logPage(log, day(0), 3);   // day 0 done, day 1 and 2 missed
  const st = status(plan, log, day(3));
  assert.deepEqual(st.owed, [4, 5, 6, 7, 8, 9]);
  assert.equal(nextPage(st), 4);                                               // catch-up comes first
  for (const p of [4, 5, 6, 7, 8, 9]) logPage(log, day(3), p);
  assert.deepEqual(status(plan, log, day(3)).owed, []);
});

test('reading ahead counts: pages read early are not owed or planned again', () => {
  const plan = makePlan({ kind: 'pages', perDay: 3, start: START });
  const log = {};
  for (const p of [1, 2, 3, 4, 5, 6]) logPage(log, day(0), p);                 // day 0 and day 1 read on day 0
  const st = status(plan, log, day(1));
  assert.equal(st.todayDone, true); assert.deepEqual(st.owed, []);
});

test('streak counts consecutive on-time days, ends at the first missed one', () => {
  const plan = makePlan({ kind: 'pages', perDay: 2, start: START });
  const log = {};
  for (let i = 0; i < 3; i++) for (const p of pagesFor(plan, i)) logPage(log, day(i), p);   // days 0..2 on time
  assert.equal(status(plan, log, day(2)).streak, 3);
  assert.equal(status(plan, log, day(3)).streak, 3);                            // today not done yet: yesterday's run still shows
  // day 3 missed, then day 4 read on time: the run restarts
  for (const p of pagesFor(plan, 4)) logPage(log, day(4), p);
  assert.equal(status(plan, log, day(4)).streak, 1);
  // a page read late does not make its day on time
  logPage(log, day(5), pagesFor(plan, 3)[0]); logPage(log, day(5), pagesFor(plan, 3)[1]);
  assert.equal(status(plan, log, day(4)).streak, 1);
});

test('before the start date nothing is planned; after the end the plan is finished', () => {
  const plan = makePlan({ kind: 'khatma', days: 30, start: START });
  assert.equal(dayIndex(plan, day(-1)), -1);
  assert.deepEqual(status(plan, {}, day(-1)).today, []);
  assert.equal(status(plan, {}, day(40)).finished, true);
  assert.equal(status(null, {}, day(0)), null);
});

test('logPage ignores invalid pages and duplicates', () => {
  const log = {};
  logPage(log, START, 0); logPage(log, START, 605); logPage(log, START, 'x'); logPage(log, START, 7); logPage(log, START, 7);
  assert.deepEqual(log, { [START]: [7] });
});
