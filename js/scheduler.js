'use strict';

if (typeof FSRS === 'undefined') {
  if (typeof require === 'function') {
    var FSRS = require('./vendor/ts-fsrs.js'); // eslint-disable-line no-var
  } else {
    throw new Error('FSRS library failed to load (js/vendor/ts-fsrs.js)');
  }
}

const Scheduler = (function () {
  const RATINGS = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' };

  // fuzz ON for real use (per-library default seed = card id + reps, per review);
  // tests disable it via configure({ enable_fuzz: false }) for determinism.
  const BASE_CONFIG = {
    request_retention: 0.9,
    enable_short_term: false,
    learning_steps: [],
    relearning_steps: [],
    enable_fuzz: true
  };

  let fsrs = FSRS.fsrs(BASE_CONFIG);

  function configure(opts) {
    fsrs = FSRS.fsrs(Object.assign({}, BASE_CONFIG, opts || {}));
  }

  function floorDays(a, b) {
    const utc = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.floor((utc(b) - utc(a)) / 86400000);
  }

  // Legacy safety net: old SM-2 cards carry n/interval/easeFactor (or imports).
  // Inline-normalize them to FSRS fields; FSRS cards pass through untouched.
  function normalizeCard(card) {
    if (typeof card.state === 'string' && typeof card.difficulty === 'number' && typeof card.stability === 'number') {
      return card;
    }
    const n = typeof card.n === 'number' ? card.n : 0;
    const interval = typeof card.interval === 'number' ? card.interval : 0;
    const norm = Object.assign({}, card);
    norm.state = n > 0 ? 'Review' : 'New';
    norm.stability = n > 0 && interval > 0 ? Math.max(interval, 1) : 0;
    norm.difficulty = 5;
    norm.reps = n;
    norm.lapses = 0;
    return norm;
  }

  // PURE: never mutates the input card. Returns a fresh plain object the caller
  // Object.assigns onto the card: { state, difficulty, stability, reps, lapses,
  // dueDate, lastReviewed, lastLog }.
  function schedule(card, rating, now) {
    const grade = RATINGS[rating];
    if (!grade) throw new Error('Unknown rating: ' + rating);
    const norm = normalizeCard(card);
    const when = now ? new Date(now) : new Date();

    // FSRS treats "no memory state yet" as (difficulty 0, stability 0): a New
    // card's placeholder difficulty/stability must not be fed to the library,
    // which validates d>=1, s>=S_MIN for any card with prior memory.
    const stateNum = FSRS.State[norm.state] !== undefined ? FSRS.State[norm.state] : FSRS.State.New;
    const isNew = stateNum === FSRS.State.New;
    let difficulty = isNew ? 0 : (norm.difficulty || 0);
    let stability = isNew ? 0 : (norm.stability || 0);
    if (!isNew) {
      difficulty = Math.max(difficulty, 1);
      stability = Math.max(stability, 0.001);
    }

    const libCard = {
      due: norm.dueDate ? new Date(norm.dueDate) : new Date(when),
      stability,
      difficulty,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: norm.reps || 0,
      lapses: norm.lapses || 0,
      state: stateNum,
      last_review: norm.lastReviewed ? new Date(norm.lastReviewed) : null
    };

    const item = fsrs.repeat(libCard, when)[FSRS.Rating[grade]];
    const next = item.card;
    const log = item.log;

    const state = FSRS.State[next.state];
    const elapsedDays = log.elapsed_days;
    const scheduledDays = norm.lastReviewed && norm.dueDate
      ? Math.max(floorDays(new Date(norm.lastReviewed), new Date(norm.dueDate)), 0)
      : 0;

    return {
      state,
      difficulty: next.difficulty,
      stability: next.stability,
      reps: next.reps,
      lapses: next.lapses,
      dueDate: next.due.toISOString(),
      lastReviewed: when.toISOString(),
      lastLog: {
        rating,
        reviewedAt: when.toISOString(),
        elapsedDays,
        scheduledDays,
        state
      }
    };
  }

  function initialFields() {
    const now = new Date().toISOString();
    return {
      state: 'New',
      difficulty: 5,
      stability: 0,
      reps: 0,
      lapses: 0,
      dueDate: now,
      lastReviewed: null
    };
  }

  return { schedule, initialFields, configure };
})();

if (typeof globalThis !== 'undefined') globalThis.Scheduler = Scheduler;
if (typeof module !== 'undefined') module.exports = Scheduler;
