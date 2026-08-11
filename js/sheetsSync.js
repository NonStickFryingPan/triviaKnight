'use strict';

const SheetsSync = (function () {
  const URL_KEY = 'tk_sheet_url';
  const TOKEN_KEY = 'tk_sheet_token';
  const LAST_SYNC_KEY = 'tk_sheet_last_sync';
  const TIMEOUT_MS = 60000;

  function isConfigured() {
    return !!Tk.storage.get(URL_KEY, '') && !!Tk.storage.get(TOKEN_KEY, '');
  }

  function call(payload) {
    const url = Tk.storage.get(URL_KEY, '');
    const token = Tk.storage.get(TOKEN_KEY, '');
    if (!url || !token) return Promise.reject(new Error('Sheet sync not configured'));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    return fetch(url + '?token=' + encodeURIComponent(token), {
      method: 'POST',
      body: JSON.stringify(payload),
      signal: ctrl.signal
    }).then((res) => {
      if (!res.ok) throw new Error('Sheet server responded ' + res.status);
      return res.json();
    }).then((data) => {
      if (!data || data.ok !== true) throw new Error((data && data.error) || 'Sheet server error');
      return data;
    }).finally(() => clearTimeout(timer));
  }

  function cardTs(card) {
    return card.updatedAt || card.createdAt || '';
  }

  function mergeDecks(localCards, remoteCards) {
    const remote = new Map();
    remoteCards.forEach((c) => remote.set(c.id, c));
    const writes = [];
    let added = 0;
    let updated = 0;
    localCards.forEach((local) => {
      const other = remote.get(local.id);
      if (!other) {
        return; // local-only: keep as-is
      }
      remote.delete(local.id);
      if (cardTs(other) > cardTs(local)) {
        writes.push(other);
        updated++;
      }
    });
    remote.forEach((c) => {
      writes.push(c);
      added++;
    });
    return { writes, added, updated };
  }

  function pull() {
    return call({ op: 'pull' }).then((data) => Db.getAllCards().then((local) => {
      const merged = mergeDecks(local, data.cards || []);
      let chain = Promise.resolve();
      merged.writes.forEach((w) => {
        chain = chain.then(() => Db.putCard(w));
      });
      return chain.then(() => {
        if (typeof data.remoteTs === 'string') Tk.storage.set(LAST_SYNC_KEY, data.remoteTs);
        return { added: merged.added, updated: merged.updated };
      });
    }));
  }

  function push() {
    return Db.getAllCards().then((cards) => call({ op: 'push', cards }).then((data) => {
      if (typeof data.remoteTs === 'string') Tk.storage.set(LAST_SYNC_KEY, data.remoteTs);
      return { remoteTs: data.remoteTs, count: cards.length };
    }));
  }

  // remote timestamp only; cards are discarded
  function remoteStatus() {
    return call({ op: 'pull' }).then((data) => (typeof data.remoteTs === 'string' ? data.remoteTs : ''));
  }

  function lastSync() {
    return Tk.storage.get(LAST_SYNC_KEY, '') || '';
  }

  return {
    isConfigured, pull, push, remoteStatus, lastSync, mergeDecks
  };
})();

if (typeof module !== 'undefined') module.exports = SheetsSync;
