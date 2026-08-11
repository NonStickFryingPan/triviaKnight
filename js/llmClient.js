'use strict';

const LlmClient = (function () {
  const API_KEY_KEY = 'dsk_api_key';
  const IS_LOCAL = typeof location !== 'undefined' &&
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const API_ENDPOINT = IS_LOCAL
    ? '/api/generate-cards'
    : '/.netlify/functions/generate-cards';

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

  async function generateCards(dumpText, existingCategories) {
    const apiKey = getApiKey();
    if (IS_LOCAL && !apiKey) {
      throw new Error('No API key saved. Add it in Settings first.');
    }
    const payload = { dumpText, existingCategories: existingCategories || [] };
    if (apiKey) payload.apiKey = apiKey;
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  return { getApiKey, setApiKey, hasApiKey, keyManagedRemotely, generateCards };
})();

if (typeof module !== 'undefined') module.exports = LlmClient;