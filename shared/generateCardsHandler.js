'use strict';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';
const MAX_DUMP_CHARS = 20000;
const MAX_TOKENS = 2000;
const ALLOWED_TYPES = ['flashcard', 'mcq', 'fill_blank'];

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
    'Rules:',
    '- "options" must contain exactly 4 strings; "correctIndex" must be the index of the correct option inside "options".',
    '- "sentence" must contain "___" marking the missing word.',
    '- Keep front/question/sentence short — a question or prompt.',
    '- Keep back/answers short and precise — just the answer, no commentary.'
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
  if (!raw || typeof raw !== 'object') return null;
  const type = String(raw.type || '');
  if (ALLOWED_TYPES.indexOf(type) === -1) return null;

  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  if (!category) return null;

  if (type === 'flashcard') {
    const front = typeof raw.front === 'string' ? raw.front.trim() : '';
    const back = typeof raw.back === 'string' ? raw.back.trim() : '';
    if (!front || !back) return null;
    return { type, category, front, back };
  }

  if (type === 'mcq') {
    const question = typeof raw.question === 'string' ? raw.question.trim() : '';
    const options = Array.isArray(raw.options)
      ? raw.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
      : [];
    const correctIndex = Number.isInteger(raw.correctIndex) ? raw.correctIndex : -1;
    if (!question || options.length < 2 || correctIndex < 0 || correctIndex >= options.length) return null;
    return { type, category, question, options, correctIndex };
  }

  if (type === 'fill_blank') {
    const sentence = typeof raw.sentence === 'string' ? raw.sentence.trim() : '';
    const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
    if (!sentence || sentence.indexOf('___') === -1 || !answer) return null;
    return { type, category, sentence, answer };
  }

  return null;
}

async function generateCards({ apiKey, dumpText, existingCategories }) {
  const err = validateRequest({ apiKey, dumpText });
  if (err) return { statusCode: 400, error: err };

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
      messages: [
        { role: 'system', content: buildSystemPrompt(existingCategories) },
        { role: 'user', content: dumpText }
      ]
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
    return { statusCode: 502, error: 'DeepSeek returned an empty response' };
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { statusCode: 502, error: 'DeepSeek returned malformed JSON' };
  }

  const rawCards = parsed && Array.isArray(parsed.cards) ? parsed.cards : [];
  const cards = rawCards.map(cleanCard).filter((c) => c !== null);

  if (cards.length === 0) {
    return { statusCode: 502, error: 'No valid cards were generated; try splitting the text into smaller chunks' };
  }

  return { statusCode: 200, cards };
}

module.exports = { generateCards, MAX_DUMP_CHARS };