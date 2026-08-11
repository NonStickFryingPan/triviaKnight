'use strict';

const { generateCards } = require('../../shared/generateCardsHandler');

exports.handler = async (event) => {
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

  const result = await generateCards({
    apiKey,
    dumpText: typeof body.dumpText === 'string' ? body.dumpText : '',
    existingCategories: Array.isArray(body.existingCategories) ? body.existingCategories : []
  });

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
