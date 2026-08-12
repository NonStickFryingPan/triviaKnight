'use strict';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';
const MAX_DUMP_CHARS = 20000;
const MAX_TOKENS = 8192;
const MAX_ATTEMPTS = 2;
const MAX_CORRECTION_REASONS = 6;
const ALLOWED_TYPES = ['flashcard', 'mcq', 'fill_blank'];

const LIMITS = { text: 120, short: 80, category: 40 };

function buildSystemPrompt(existingCategories) {
  const cats = Array.isArray(existingCategories) && existingCategories.length
    ? existingCategories.filter((c) => typeof c === 'string' && c).join(', ')
    : 'No existing categories yet — invent sensible ones.';

  return [
    'You are a study-card generator. The user will paste raw notes or',
    'random facts they want to remember. Break the input into small,',
    'atomic study cards — one distinct fact per card. Do not combine',
    'multiple facts into a single card, and do not repeat a fact.',
    '',
    'For each card, assign a short category. Reuse one of these existing',
    'categories if it fits: ' + cats + '. Only invent a new category if',
    'none of the existing ones fit.',
    '',
    'Choose the best card type for each fact:',
    '- "flashcard": question on the front, answer on the back. Use by default.',
    '- "mcq": multiple-choice question with exactly 4 options and one correct answer. Use only when a fact naturally has plausible wrong answers.',
    '- "fill_blank": a sentence with the key name or detail replaced by "___". Use for definitions or single-word recalls.',
    '',
    'Respond in JSON only. The output must be valid json, matching this exact shape:',
    '{',
    '  "cards": [',
    '    { "type": "flashcard", "category": "Biology", "front": "How many base pairs does human DNA use?", "back": "4 (Adenine, Thymine, Cytosine, Guanine)" },',
    '    { "type": "mcq", "category": "Mythology", "question": "Who was Gilgamesh\'s closest companion?", "options": ["Enkidu", "Humbaba", "Utnapishtim", "Ishtar"], "correctIndex": 0 },',
    '    { "type": "fill_blank", "category": "Mythology", "sentence": "In the Epic of Gilgamesh, ___ was Gilgamesh\'s closest friend.", "answer": "Enkidu" }',
    '  ]',
    '}',
    '',
    'Rules — every card must satisfy ALL of these, exactly:',
    '- Use ONLY the fields shown above for the card\'s type. No extra fields.',
    '- "flashcard": "front" at most 120 characters, "back" at most 80 characters.',
    '- "mcq": "options" must contain EXACTLY 4 strings, each at most 80 characters;',
    '  "correctIndex" must be the 0-based index (0, 1, 2, or 3) of the correct option inside "options".',
    '- "fill_blank": "sentence" at most 120 characters and must contain "___" marking the missing word exactly once; "answer" at most 80 characters.',
    '- "category" at most 40 characters.',
    '- Never emit two cards with the same "front" (or "question" or "sentence").',
    '- Keep front/question/sentence short — a question or prompt.',
    '- Keep back/answers short and precise — just the answer, no commentary.',
    '',
    'Return raw JSON only: no markdown fences, no ``` markers, no text before or after the JSON.'
  ].join('\n');
}

function validateRequest(body) {
  if (!body || typeof body !== 'object') return 'Request body must be JSON';
  if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) return 'Missing apiKey';
  if (typeof body.dumpText !== 'string' || !body.dumpText.trim()) return 'dumpText must be a non-empty string';
  if (body.dumpText.length > MAX_DUMP_CHARS) {
    return 'dumpText too long (max ' + MAX_DUMP_CHARS + ' characters)';
  }
  return null;
}

function cleanCard(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'card is not an object' };
  const type = String(raw.type || '');
  if (ALLOWED_TYPES.indexOf(type) === -1) return { error: 'unknown type "' + type + '"' };

  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  if (!category) return { error: 'missing category' };
  if (category.length > LIMITS.category) return { error: 'category too long' };

  if (type === 'flashcard') {
    const front = typeof raw.front === 'string' ? raw.front.trim() : '';
    const back = typeof raw.back === 'string' ? raw.back.trim() : '';
    if (!front || !back) return { error: 'flashcard missing front or back' };
    if (front.length > LIMITS.text) return { error: 'front too long' };
    if (back.length > LIMITS.short) return { error: 'back too long' };
    return { card: { type, category, front, back } };
  }

  if (type === 'mcq') {
    const question = typeof raw.question === 'string' ? raw.question.trim() : '';
    if (!question) return { error: 'mcq missing question' };
    if (question.length > LIMITS.text) return { error: 'question too long' };
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
      : [];
    if (options.length !== 4) return { error: 'mcq needs exactly 4 options, got ' + options.length };
    if (options.some((o) => o.length > LIMITS.short)) return { error: 'option too long' };
    const correctIndex = Number.isInteger(raw.correctIndex) ? raw.correctIndex : -1;
    if (correctIndex < 0 || correctIndex >= options.length) return { error: 'invalid correctIndex' };
    return { card: { type, category, question, options, correctIndex } };
  }

  if (type === 'fill_blank') {
    const sentence = typeof raw.sentence === 'string' ? raw.sentence.trim() : '';
    const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
    if (!sentence || !answer) return { error: 'fill_blank missing sentence or answer' };
    if (sentence.length > LIMITS.text) return { error: 'sentence too long' };
    if (answer.length > LIMITS.short) return { error: 'answer too long' };
    if (sentence.split('___').length - 1 !== 1) return { error: 'sentence must contain exactly one ___' };
    return { card: { type, category, sentence, answer } };
  }

  return { error: 'unreachable' };
}

function buildCorrection(failure) {
  const reasons = Array.isArray(failure) && failure.length
    ? failure.slice(0, MAX_CORRECTION_REASONS).map((r) => '- ' + r).join('\n')
    : '';
  return [
    'Your previous response was rejected: it does not satisfy the schema and will NOT be used.',
    reasons ? 'Rejected cards:\n' + reasons : 'Your previous response was not valid JSON.',
    '',
    'Return ONLY the complete corrected "cards" array as raw JSON matching the system prompt schema exactly.',
    'Every card must pass all rules: mcq with exactly 4 options and a valid 0-based "correctIndex",',
    'fill_blank with exactly one "___", front/question/sentence at most 120 chars, back/answer/option at most 80 chars,',
    'category at most 40 chars, no duplicate cards.',
    'No markdown fences, no text outside the JSON.'
  ].join('\n');
}

async function callDeepSeek(apiKey, messages) {
  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      max_tokens: MAX_TOKENS,
      messages
    })
  });

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = (data && data.error && data.error.message) || '';
    } catch {}
    return { statusCode: response.status, error: 'DeepSeek request failed' + (detail ? ': ' + detail : '') };
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return { statusCode: 502, error: 'Could not read DeepSeek response' };
  }

  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : null;

  if (!content || typeof content !== 'string') {
    return { statusCode: 200, cards: [], failure: ['response was empty'] };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { statusCode: 200, cards: [], failure: ['response was not valid JSON'] };
  }

  const rawCards = parsed && Array.isArray(parsed.cards) ? parsed.cards : [];
  const cards = [];
  const failure = [];
  const seen = new Set();

  rawCards.forEach((raw, i) => {
    const label = 'card ' + (i + 1);
    const res = cleanCard(raw);
    if (res.error) {
      failure.push(label + ': ' + res.error);
      return;
    }
    const key = res.card.front || res.card.question || res.card.sentence;
    if (seen.has(key)) {
      failure.push(label + ': duplicate of another card');
      return;
    }
    seen.add(key);
    cards.push(res.card);
  });

  if (failure.length > 0) {
    return { statusCode: 200, cards, failure };
  }
  return { statusCode: 200, cards, failure: null };
}

async function generateCards({ apiKey, dumpText, existingCategories }) {
  const err = validateRequest({ apiKey, dumpText });
  if (err) return { statusCode: 400, error: err };

  const systemPrompt = buildSystemPrompt(existingCategories);
  let lastFailure = null;
  let fallback = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: dumpText }
    ];
    if (attempt > 1 && lastFailure) {
      messages.push({ role: 'user', content: buildCorrection(lastFailure) });
    }

    const result = await callDeepSeek(apiKey, messages);
    if (result.failure) {
      lastFailure = result.failure;
      if (result.cards.length > 0) fallback = { cards: result.cards, skipped: result.failure.length };
      continue;
    }
    if (result.statusCode !== 200) return { statusCode: result.statusCode, error: result.error };
    return { statusCode: 200, cards: result.cards };
  }

  if (fallback) {
    return { statusCode: 200, cards: fallback.cards, skipped: fallback.skipped };
  }
  return { statusCode: 502, error: 'No valid cards were generated; try splitting the text into smaller chunks' };
}

module.exports = { generateCards, MAX_DUMP_CHARS };