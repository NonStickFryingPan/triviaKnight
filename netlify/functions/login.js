'use strict';

const crypto = require('crypto');
const { createRateLimiter } = require('./_rateLimit');

const rateLimit = createRateLimiter({ hourly: 20, daily: 100 });

// sha256 both sides, then constant-time compare of the digests
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hb = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

exports.handler = async (event) => {
  const pass = process.env.ACCESS_PASS || '';
  if (!pass) {
    return json(500, { error: 'ACCESS_PASS is not set in Netlify environment variables' });
  }

  const headers = event.headers || {};
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

  const secret = (typeof body.password === 'string' && body.password) || '';
  if (!secret || !safeEqual(secret, pass)) {
    return json(401, { error: 'wrong passcode' });
  }

  return json(200, {
    ok: true,
    sheetUrl: process.env.SHEET_URL || '',
    sheetToken: process.env.SHEET_TOKEN || ''
  });
};

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}