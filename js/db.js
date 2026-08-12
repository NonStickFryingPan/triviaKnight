'use strict';

const Db = (function () {
  const DB_NAME = 'triviaKnight';
  const DB_VERSION = 4;
  const STORE = 'cards';
  const LOG_STORE = 'review_logs';

  let dbPromise = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const vtx = req.transaction;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('dueDate', 'dueDate');
          store.createIndex('category', 'category');
        }
        if (!db.objectStoreNames.contains(LOG_STORE)) {
          const store = db.createObjectStore(LOG_STORE, { keyPath: 'id' });
          store.createIndex('cardId', 'cardId');
        } else if (!vtx.objectStore(LOG_STORE).indexNames.contains('cardId')) {
          vtx.objectStore(LOG_STORE).createIndex('cardId', 'cardId');
        }
        // pre-v4 logs are character-indexed garbage (or fresh-install leftovers);
        // clearing them during the versionchange transaction is always safe
        if (e.oldVersion < 4 && db.objectStoreNames.contains(LOG_STORE)) {
          vtx.objectStore(LOG_STORE).clear();
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // run(store) may return a value or a promise; resolved when the tx commits
  function tx(storeName, mode, run) {
    return dbPromise
      .then((db) => db.transaction(storeName, mode))
      .then((t) => {
        const result = run(t.objectStore(storeName));
        return new Promise((resolve, reject) => {
          t.oncomplete = () => resolve(result);
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        });
      });
  }

  function txCards(mode, run) {
    return tx(STORE, mode, run);
  }

  function initDB() {
    if (!dbPromise) dbPromise = open();
    return dbPromise.then(() => {});
  }

  function addCard(card) {
    const now = new Date().toISOString();
    const full = Object.assign({}, card, {
      id: typeof card.id === 'string' && card.id ? card.id : crypto.randomUUID(),
      createdAt: card.createdAt || now,
      updatedAt: now
    }, Scheduler.initialFields(), {
      lastReviewed: null
    });
    return txCards('readwrite', (store) => store.put(full)).then(() => full);
  }

  function getCard(id) {
    return txCards('readonly', (store) => reqP(store.get(id)));
  }

  function updateCard(card) {
    if (!card || !card.id) return Promise.reject(new Error('updateCard: card needs an id'));
    const updated = Object.assign({}, card, { updatedAt: new Date().toISOString() });
    return txCards('readwrite', (store) => store.put(updated)).then(() => updated);
  }

  // raw put, no timestamp stamping - used by sync to preserve remote updatedAt
  function putCard(card) {
    if (!card || !card.id) return Promise.reject(new Error('putCard: card needs an id'));
    return txCards('readwrite', (store) => store.put(card)).then(() => card);
  }

  function deleteCard(id) {
    return dbPromise.then((db) => new Promise((resolve, reject) => {
      const t = db.transaction([STORE, LOG_STORE], 'readwrite');
      t.objectStore(STORE).delete(id);
      const logKeys = t.objectStore(LOG_STORE).index('cardId').getAllKeys(id);
      logKeys.onsuccess = () => {
        const store = t.objectStore(LOG_STORE);
        (logKeys.result || []).forEach((k) => store.delete(k));
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }

  function getAllCards() {
    return txCards('readonly', (store) => reqP(store.getAll()));
  }

  function getDueCards(beforeDate) {
    const bound = beforeDate ? IDBKeyRange.upperBound(beforeDate, true) : null;
    return txCards('readonly', (store) => reqP(store.index('dueDate').getAll(bound)));
  }

  function getCategories() {
    return txCards('readonly', (store) => reqP(store.index('category').getAllKeys()))
      .then((keys) => Array.from(new Set(keys.filter((k) => typeof k === 'string' && k))).sort());
  }

  function exportAll() {
    return getAllCards().then((cards) => JSON.stringify(cards, null, 2));
  }

  function importAll(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch {
      return Promise.reject(new Error('Import failed: not valid JSON'));
    }
    if (!Array.isArray(data)) {
      return Promise.reject(new Error('Import failed: expected an array of cards'));
    }
    const clean = data
      .filter((c) => c && typeof c === 'object' && typeof c.id === 'string')
      .map((c) => {
        const copy = Object.assign({}, c);
        // FSRS cards are kept as-is; legacy SM-2 cards (n/interval) get
        // get normalized to FSRS fields — same rules as the scheduler safety net.
        const hasFSRS = typeof copy.state === 'string' &&
          typeof copy.difficulty === 'number' &&
          typeof copy.stability === 'number';
        if (!hasFSRS) {
          const n = typeof copy.n === 'number' ? copy.n : 0;
          const interval = typeof copy.interval === 'number' ? copy.interval : 0;
          copy.state = n > 0 ? 'Review' : 'New';
          copy.stability = n > 0 && interval > 0 ? Math.max(interval, 1) : 0;
          copy.difficulty = 5;
          copy.reps = n;
          copy.lapses = 0;
        }
        if (!copy.createdAt) copy.createdAt = new Date().toISOString();
        if (typeof copy.updatedAt !== 'string') copy.updatedAt = copy.createdAt;
        if (!copy.dueDate) copy.dueDate = new Date().toISOString();
        if (!copy.lastReviewed) copy.lastReviewed = null;
        return copy;
      });
    return txCards('readwrite', (store) => {
      clean.forEach((c) => store.put(c));
    }).then(() => {});
  }

  function getDueCount() {
    return getDueCards(new Date().toISOString()).then((cards) => cards.length);
  }

  function addReviewLog(log) {
    const record = Object.assign({ id: crypto.randomUUID(), cardId: '' }, log, { cardId: log.cardId || '' });
    return tx(LOG_STORE, 'readwrite', (store) => store.put(record)).then(() => record);
  }

  return {
    initDB, addCard, getCard, updateCard, putCard, deleteCard,
    getAllCards, getDueCards, getDueCount, getCategories, exportAll, importAll, addReviewLog
  };
})();

if (typeof globalThis !== 'undefined') globalThis.Db = Db;
if (typeof module !== 'undefined') module.exports = Db;