'use strict';

const LlmClient = (function () {
  const API_KEY_KEY = 'dsk_api_key';
  const PASS_KEY = 'tk_site_pass';
  const CHUNK_SIZE = 3000;
  const IS_LOCAL = typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const API_ENDPOINT = IS_LOCAL
    ? '/api/generate-cards'
    : '/.netlify/functions/generate-cards';
  const LOGIN_ENDPOINT = IS_LOCAL
    ? '/api/login'
    : '/.netlify/functions/login';

  function getApiKey() {
    return Tk.storage.get(API_KEY_KEY, '');
  }

  function setApiKey(key) {
    Tk.storage.set(API_KEY_KEY, (key || '').trim());
  }

  function hasApiKey() {
    return getApiKey().length > 0;
  }

  function keyManagedRemotely() {
    return !IS_LOCAL;
  }

  function getPass() {
    return Tk.storage.get(PASS_KEY, '');
  }

  function setPass(pass) {
    Tk.storage.set(PASS_KEY, (pass || '').trim());
  }

  function isLocked() {
    return !IS_LOCAL && getPass().length === 0;
  }

  function lock() {
    Tk.storage.remove(PASS_KEY);
    Tk.storage.remove('tk_sheet_url');
    Tk.storage.remove('tk_sheet_token');
  }

  function login(password) {
    return fetch(LOGIN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }).then((res) => res.json().catch(() => null).then((data) => {
      if (!res.ok) {
        throw new Error((data && data.error) || 'Login failed (HTTP ' + res.status + ')');
      }
      if (!data || data.ok !== true) {
        throw new Error((data && data.error) || 'Login failed');
      }
      setPass(password);
      if (data.sheetUrl) Tk.storage.set('tk_sheet_url', data.sheetUrl);
      if (data.sheetToken) Tk.storage.set('tk_sheet_token', data.sheetToken);
      return data;
    }));
  }

  function callOnce(dumpText, existingCategories) {
    const apiKey = getApiKey();
    if (IS_LOCAL && !apiKey) {
      throw new Error('No API key saved. Add it in Settings first.');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (!IS_LOCAL) headers['x-pass'] = getPass();
    const payload = { dumpText, existingCategories: existingCategories || [] };
    if (apiKey) payload.apiKey = apiKey;
    return fetch(API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }).then((res) => res.json().catch(() => null)).then((data) => {
      const ok = data && data.cards !== undefined;
      const failed = data && data.error;
      if (ok && Array.isArray(data.cards)) {
        return {
          cards: data.cards,
          skipped: typeof data.skipped === 'number' ? data.skipped : 0
        };
      }
      throw new Error((failed || 'Request failed') + (data ? '' : ' (unreadable response)'));
    });
  }

  async function generateCards(dumpText, existingCategories, onProgress) {
    const chunks = Tk.splitIntoChunks(dumpText, CHUNK_SIZE);
    const all = [];
    let skipped = 0;
    const errors = [];
    for (let i = 0; i < chunks.length; i++) {
      if (onProgress) onProgress(i + 1, chunks.length, all.length);
      try {
        const res = await callOnce(chunks[i], existingCategories);
        all.push(...res.cards);
        skipped += res.skipped;
      } catch (err) {
        errors.push((err && err.message) || String(err));
      }
    }
    if (all.length === 0 && errors.length > 0) {
      throw new Error(errors[0]);
    }
    return { cards: all, skipped, chunks: chunks.length, failedChunks: errors.length };
  }

  return { getApiKey, setApiKey, hasApiKey, keyManagedRemotely, generateCards, getPass, setPass, isLocked, lock, login };
})();

if (typeof globalThis !== 'undefined') globalThis.LlmClient = LlmClient;
if (typeof module !== 'undefined') module.exports = LlmClient;