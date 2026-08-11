'use strict';

const LlmClient = (function () {
  const API_KEY_KEY = 'dsk_api_key';
  const PASS_KEY = 'tk_site_pass';
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

  async function generateCards(dumpText, existingCategories) {
    const apiKey = getApiKey();
    if (IS_LOCAL && !apiKey) {
      throw new Error('No API key saved. Add it in Settings first.');
    }
    const headers = { 'Content-Type': 'application/json' };
    if (!IS_LOCAL) headers['x-pass'] = getPass();
    const payload = { dumpText, existingCategories: existingCategories || [] };
    if (apiKey) payload.apiKey = apiKey;
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    if (!res.ok) {
      throw new Error((data && data.error) || 'Request failed (HTTP ' + res.status + ')');
    }
    if (data && data.error) {
      throw new Error(data.error);
    }
    if (!data || !Array.isArray(data.cards)) {
      throw new Error('Unexpected response from server');
    }
    return data.cards;
  }

  return { getApiKey, setApiKey, hasApiKey, keyManagedRemotely, generateCards, getPass, setPass, isLocked, lock, login };
})();

if (typeof module !== 'undefined') module.exports = LlmClient;