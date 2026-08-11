'use strict';

exports.handler = async (event) => {
  const pass = process.env.ACCESS_PASS || '';
  if (!pass) {
    return json(500, { error: 'ACCESS_PASS is not set in Netlify environment variables' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Request body must be JSON' });
  }

  const secret = (typeof body.password === 'string' && body.password) || '';
  if (!secret || secret !== pass) {
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