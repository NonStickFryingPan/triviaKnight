'use strict';

const { generateCards } = require('../../shared/generateCardsHandler');
const { createRateLimiter } = require('./_rateLimit');

const rateLimit = createRateLimiter({ hourly: 60, daily: 300 });

exports.handler = async (event) => {
  const pass = process.env.ACCESS_PASS || '';
  if (!pass) {
    return json(500, { error: 'ACCESS_PASS is not set in Netlify environment variables' });
  }
  const headers = event.headers || {};
  const xpass = headers['x-pass'] || headers['X-Pass'] || '';
  if (xpass !== pass) {
    return json(401, { error: 'wrong passcode' });
  }

  const ip = (headers['x-forwarded-for'] || headers['client-ip'] || '').split(',')[0].trim();
  const limit = rateLimit(ip);
  if (!limit.ok) {
    return json(429, { error: 'Rate limit exceeded, try again later' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Request body must be JSON' });
  }

  const apiKey = process.env.DEEPSEEK_KEY || '';
  if (!apiKey) {
    return json(500, { error: 'DEEPSEEK_KEY is not set in Netlify environment variables' });
  }

  let result;
  try {
    result = await generateCards({
      apiKey,
      dumpText: typeof body.dumpText === 'string' ? body.dumpText : '',
      existingCategories: Array.isArray(body.existingCategories) ? body.existingCategories : []
    });
  } catch (err) {
    console.error('generate-cards upstream error:', err.message);
    return json(502, { error: 'Upstream request failed' });
  }

  return json(
    result.statusCode || (result.error ? 400 : 200),
    result.cards ? { cards: result.cards } : { error: result.error }
  );
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}
