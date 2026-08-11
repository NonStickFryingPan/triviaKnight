'use strict';

const assert = require('assert');
const Scheduler = require('../js/scheduler.js');

// deterministic golden values: fuzz off (see Scheduler.configure below)
Scheduler.configure({ enable_fuzz: false });

const BASE = '2026-08-12T10:00:00.000Z';

function daysBetween(aIso, bIso) {
  const utc = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((utc(new Date(bIso)) - utc(new Date(aIso))) / 86400000);
}

// 1. initialFields shape
{
  const f = Scheduler.initialFields();
  assert.deepStrictEqual(Object.keys(f).sort(),
    ['difficulty', 'dueDate', 'lapses', 'lastReviewed', 'reps', 'stability', 'state']);
  assert.strictEqual(f.state, 'New');
  assert.strictEqual(f.difficulty, 5);
  assert.strictEqual(f.stability, 0);
  assert.strictEqual(f.reps, 0);
  assert.strictEqual(f.lapses, 0);
  assert.strictEqual(f.lastReviewed, null);
  assert.ok(!Number.isNaN(Date.parse(f.dueDate)), 'dueDate is a valid ISO timestamp');
}

// 2. golden chain — values captured by running ts-fsrs 5.4.1 once via the
// adapter with fuzz off; deterministic across runs (verified).
// Each step reviews at BASE + N days, so elapsedDays between steps is 1.
const chain = [
  // rating, atDay, state, difficulty, stability, reps, lapses, dueDelta, dueIso, schedDays
  ['good', 1, 'Review', 2.11810397, 2.3065, 1, 0, 3, '2026-08-16T10:00:00.000Z', 0],
  ['good', 2, 'Review', 2.11121424, 7.31530068, 2, 0, 7, '2026-08-21T10:00:00.000Z', 3],
  ['good', 3, 'Review', 2.1043314, 11.9910269, 3, 0, 12, '2026-08-27T10:00:00.000Z', 7],
  ['again', 4, 'Review', 7.38997579, 1.39124787, 4, 1, 1, '2026-08-17T10:00:00.000Z', 12],
  ['hard', 5, 'Review', 8.25257267, 2.59704346, 5, 1, 3, '2026-08-20T10:00:00.000Z', 1]
];
{
  let card = Scheduler.initialFields();
  chain.forEach(([rating, day, state, difficulty, stability, reps, lapses, delta, dueIso, schedDays], i) => {
    const now = new Date(new Date(BASE).getTime() + day * 86400000);
    const out = Scheduler.schedule(card, rating, now);
    assert.strictEqual(out.state, state, `step ${i + 1}: state`);
    assert.ok(Math.abs(out.difficulty - difficulty) < 1e-6, `step ${i + 1}: difficulty ${out.difficulty} != ${difficulty}`);
    assert.ok(Math.abs(out.stability - stability) < 1e-6, `step ${i + 1}: stability ${out.stability} != ${stability}`);
    assert.strictEqual(out.reps, reps, `step ${i + 1}: reps`);
    assert.strictEqual(out.lapses, lapses, `step ${i + 1}: lapses`);
    assert.strictEqual(out.dueDate, dueIso, `step ${i + 1}: dueDate`);
    assert.strictEqual(daysBetween(out.lastReviewed, out.dueDate), delta, `step ${i + 1}: due in days`);
    assert.strictEqual(out.lastReviewed, now.toISOString(), `step ${i + 1}: lastReviewed`);
    assert.strictEqual(out.lastLog.rating, rating, `step ${i + 1}: log.rating`);
    assert.strictEqual(out.lastLog.reviewedAt, now.toISOString(), `step ${i + 1}: log.reviewedAt`);
    assert.strictEqual(out.lastLog.elapsedDays, i === 0 ? 0 : 1, `step ${i + 1}: log.elapsedDays`);
    assert.strictEqual(out.lastLog.scheduledDays, schedDays, `step ${i + 1}: log.scheduledDays`);
    assert.strictEqual(out.lastLog.state, state, `step ${i + 1}: log.state`);
    card = Object.assign({}, card, out);
  });
  // sanity: stability grows across goods, collapses on again, recovers on hard
  assert.ok(chain[2][4] > chain[1][4] && chain[1][4] > chain[0][4], 'stability grows across goods');
  assert.ok(chain[3][4] < chain[2][4], 'again drops stability');
}

// 3. purity — schedule() must not mutate the input card
{
  const card = {
    state: 'Review', difficulty: 3, stability: 5, reps: 4, lapses: 0,
    dueDate: '2026-08-10T10:00:00.000Z', lastReviewed: '2026-08-01T10:00:00.000Z'
  };
  const before = JSON.stringify(card);
  Scheduler.schedule(card, 'good', BASE);
  assert.strictEqual(JSON.stringify(card), before, 'FSRS card not mutated');
  const legacy = { n: 5, interval: 12, easeFactor: 2.5 };
  const legacyBefore = JSON.stringify(legacy);
  Scheduler.schedule(legacy, 'good', BASE);
  assert.strictEqual(JSON.stringify(legacy), legacyBefore, 'legacy card not mutated');
}

// 4. legacy safety net: SM-2 fields normalize inline, no FSRS fields needed
{
  const out = Scheduler.schedule({ n: 5, interval: 12, easeFactor: 2.5 }, 'good', BASE);
  assert.strictEqual(out.state, 'Review');
  assert.ok(out.stability > 0, 'stability derived from legacy interval');
  assert.strictEqual(out.reps, 6);
}

// 5. lastLog shape + elapsed/scheduled days for a card reviewed 10 days prior
{
  const card = {
    state: 'Review', difficulty: 3, stability: 5, reps: 4, lapses: 0,
    dueDate: '2026-08-05T10:00:00.000Z', lastReviewed: '2026-08-02T10:00:00.000Z'
  };
  const out = Scheduler.schedule(card, 'good', BASE);
  assert.deepStrictEqual(Object.keys(out.lastLog).sort(),
    ['elapsedDays', 'rating', 'reviewedAt', 'scheduledDays', 'state']);
  assert.strictEqual(out.lastLog.rating, 'good');
  assert.strictEqual(out.lastLog.reviewedAt, BASE);
  assert.strictEqual(out.lastLog.elapsedDays, 10);
  assert.strictEqual(out.lastLog.scheduledDays, 3);
  assert.strictEqual(out.lastLog.state, 'Review');
}

console.log('scheduler: all FSRS golden assertions passed (ts-fsrs 5.4.1, fuzz off)');
