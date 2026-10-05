// Myna's worker, on Paul's own Cloudflare. The deck lives in D1 and every spoken card in R2. One password
// opens it: the KEY secret, the same as ebis. OpenAI picks new words and writes how each card is asked as it
// climbs; Azure's MAI-Voice-2.1 says them. Days are Paul's local dates, sent by the app.

import config from '../config.js';

const ORIGINS = ['https://www.paulscotti.com', 'https://paulscotti.com', 'https://paulscotti.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// FSRS-6 with its published default parameters (github.com/open-spaced-repetition/py-fsrs).
const W = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796,
  1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
const DECAY = -W[20], FACTOR = 0.9 ** (1 / DECAY) - 1;
const POOL = 10; // words chosen ahead of time, so a new day starts without waiting on OpenAI
const SAID = 'ko is hangeul only, never romanization. en is read aloud, so no slashes, brackets or notes, and it starts in lowercase unless it is a sentence.';
const CARD = { type: 'object', additionalProperties: false, required: ['ko', 'en'], properties: { ko: { type: 'string' }, en: { type: 'string' } } };
const WORDS = { type: 'object', additionalProperties: false, required: ['words'], properties: { words: { type: 'array', items: CARD } } };

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': ORIGINS.includes(origin) || LOCAL.test(origin) ? origin : ORIGINS[0],
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const res = await route(request, env, ctx).catch(e => new Response(e.message, { status: 500 }));
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

async function route(request, env, ctx) {
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  if (!given || !crypto.subtle.timingSafeEqual(await digest(given), await digest(env.KEY))) return new Response('Wrong password.', { status: 401 });
  const body = await request.json();
  const path = new URL(request.url).pathname;
  if (path === '/today') return Response.json(await today(env, ctx, body.day, body.early));
  if (path === '/grade') return Response.json(await grade(env, ctx, body));
  if (path === '/add') return Response.json(await add(env, body));
  if (path === '/speak') return speak(env, body);
  if (path === '/words') return Response.json((await env.DB.prepare('SELECT ko, en, level FROM cards ORDER BY level, ko').all()).results);
  return new Response('Not found.', { status: 404 });
}

// A session's cards: those due, and new words, the more of them the fewer reviews it holds. The day's own
// session counts what was already answered and met that day, so it holds steady as the day goes on; a session
// started early takes the cards of the next day that has any due, and counts only itself.
async function today(env, ctx, day, early) {
  const db = env.DB;
  const until = early ? (await db.prepare('SELECT min(due) AS due FROM cards WHERE level BETWEEN 1 AND 8 AND due > ?').bind(day).first()).due || day : day;
  const { load, met, pool } = await db.prepare(`SELECT
    count(CASE WHEN level BETWEEN 1 AND 8 AND ${early ? 'due <= ?2' : '(due <= ?2 OR last = ?1) AND intro != ?1'} THEN 1 END) AS load,
    count(CASE WHEN ${early ? 's IS NULL AND intro <= ?1' : 'intro = ?1 OR (s IS NULL AND intro < ?1)'} THEN 1 END) AS met,
    count(CASE WHEN intro IS NULL THEN 1 END) AS pool FROM cards`).bind(day, until).first();
  const { most, least, reviewsEach } = config.newWords;
  const want = Math.max(least, most - Math.floor(load / reviewsEach)) - met;
  let ready = pool;
  if (want > ready) ready += await invent(env, want - ready);
  if (want > 0) await db.prepare('UPDATE cards SET intro = ?1 WHERE id IN (SELECT id FROM cards WHERE intro IS NULL ORDER BY id LIMIT ?2)').bind(day, want).run();
  if (ready - Math.max(want, 0) < POOL) ctx.waitUntil(invent(env, POOL - ready + Math.max(want, 0)));

  const asked = 'SELECT * FROM cards WHERE ((level BETWEEN 1 AND 8 AND due <= ?2) OR (s IS NULL AND intro <= ?1))';
  const { results: unwritten } = await db.prepare(`${asked} AND ask_ko IS NULL`).bind(day, until).all(); // a variation that failed to be written
  await Promise.all(unwritten.map(c => vary(env, c)));
  const { results: cards } = await db.prepare(asked).bind(day, until).all();
  const { results: counts } = await db.prepare('SELECT level, count(*) AS n FROM cards GROUP BY level').all();
  const levels = Array(10).fill(0);
  for (const { level, n } of counts) levels[level] = n;
  return { cards: cards.map(c => shape(c, day)), levels };
}

// A card as the app asks it. Which language comes first is random, but fixed for the card all day.
const shape = (c, day) => ({
  id: c.id, ko: c.ask_ko, en: c.ask_en, word: c.ko, gloss: c.en, level: c.level, fresh: c.s === null,
  front: [...`${c.id}/${day}`].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261) < 0 ? 'en' : 'ko',
});

// FSRS-6 with two grades, Again and Good. A card's level follows its stability, the days it can be remembered.
async function grade(env, ctx, { id, good, day }) {
  const db = env.DB;
  const c = await db.prepare('SELECT * FROM cards WHERE id = ?').bind(id).first();
  const g = good ? 3 : 1, d0 = g => W[4] - Math.exp(W[5] * (g - 1)) + 1;
  let s = W[g - 1], d = d0(g);
  if (c.s !== null) {
    const t = (Date.parse(day) - Date.parse(c.last)) / 864e5;
    const r = (1 + FACTOR * t / c.s) ** DECAY;
    s = t < 1 ? c.s * Math.max(Math.exp(W[17] * (g - 3 + W[18])) * c.s ** -W[19], good ? 1 : 0)
      : good ? c.s * (1 + Math.exp(W[8]) * (11 - c.d) * c.s ** -W[9] * (Math.exp((1 - r) * W[10]) - 1))
      : Math.min(W[11] * c.d ** -W[12] * ((c.s + 1) ** W[13] - 1) * Math.exp((1 - r) * W[14]), c.s / Math.exp(W[17] * W[18]));
    d = W[7] * d0(4) + (1 - W[7]) * (c.d - W[6] * (g - 3) * (10 - c.d) / 9);
  }
  s = Math.max(s, 0.001);
  d = Math.min(Math.max(d, 1), 10);
  const level = Math.min(Math.max(Math.floor(Math.log2(s)) + 1, 1), 9);
  const days = Math.max(1, Math.round(s / FACTOR * (config.retention ** (1 / DECAY) - 1)));
  // A missed card stays due today, asked the same way until it's answered; a remembered one is asked anew next time.
  const due = good ? new Date(Date.parse(day) + days * 864e5).toISOString().slice(0, 10) : day;
  await db.batch([
    db.prepare(`UPDATE cards SET s = ?, d = ?, level = ?, last = ?, due = ?${good ? ', ask_ko = NULL, ask_en = NULL' : ''} WHERE id = ?`).bind(s, d, level, day, due, id),
    db.prepare('INSERT INTO answers (card, day, at, good, ko, en) VALUES (?, ?, ?, ?, ?, ?)').bind(id, day, Date.now(), good ? 1 : 0, c.ask_ko, c.ask_en),
  ]);
  if (good && level < 9) ctx.waitUntil(vary(env, { ...c, level, due }));
  return { level };
}

// How a card is asked at its level: the word itself, or a form or sentence OpenAI writes around it from
// words Paul knows about as well, unlike the lines other cards will be asked around the same day.
async function vary(env, c) {
  const forms = config.levels[c.level], form = forms[Math.floor(Math.random() * forms.length)];
  let ask = { ko: c.ko, en: c.en };
  if (form !== 'word') {
    const [{ results: known }, { results: nearby }] = await env.DB.batch([
      env.DB.prepare('SELECT ko, en FROM cards WHERE level >= 2 AND id != ?1 ORDER BY abs(level - ?2), random() LIMIT 40').bind(c.id, c.level),
      env.DB.prepare('SELECT ask_ko FROM cards WHERE ask_ko != ko AND id != ?1 ORDER BY abs(julianday(due) - julianday(?2)) LIMIT 20').bind(c.id, c.due),
    ]);
    ask = await gpt(env, `You write one flashcard for an English speaker learning Korean from spoken flashcards. It tests the given word in the given form. The Korean must contain the word, inflected as the form needs, and be natural, correct, everyday spoken Korean, polite unless the form asks otherwise. Every other word must be one of the learner's known words, apart from particles, endings and pointing words like 이거 or 저기. Make it different from the lines other cards are asked with. en is its natural English translation, specific enough that the Korean is the obvious answer. ${SAID}`,
      `Word: ${c.ko} (${c.en})\nForm: ${config.forms[form]}\nWords the learner knows, those known about as well as this one first: ${known.map(k => `${k.ko} (${k.en})`).join(', ')}\nLines other cards are asked with: ${nearby.map(n => n.ask_ko).join(' / ')}`, CARD);
  }
  await env.DB.prepare('UPDATE cards SET ask_ko = ?, ask_en = ? WHERE id = ?').bind(ask.ko, ask.en, c.id).run();
}

// New words for the pool, chosen against everything already in the deck. Returns how many were new.
async function invent(env, n) {
  const db = env.DB;
  const { results: have } = await db.prepare('SELECT ko, en FROM cards').all();
  const { words } = await gpt(env, `You choose vocabulary for an English speaker learning Korean from spoken flashcards. Choose the words or set expressions they should learn next: the ones heard most often in real everyday conversation, spread across the situations of daily life rather than one topic, and for each meaning the most common way to say it. Never repeat a word they have, or give one that means nearly the same as one they have. Most useful first. Verbs and adjectives in dictionary form. ${SAID}`,
    `They have: ${have.map(w => `${w.ko} (${w.en})`).join(', ')}\n\nChoose ${n}.`, WORDS);
  const done = await db.batch(words.map(w => db.prepare('INSERT INTO cards (ko, en, ask_ko, ask_en) VALUES (?1, ?2, ?1, ?2) ON CONFLICT (ko) DO NOTHING').bind(w.ko, w.en)));
  return done.reduce((sum, r) => sum + r.meta.changes, 0);
}

// Words Paul adds join today's session. One already waiting in the pool is brought forward instead.
async function add(env, { text, day }) {
  const db = env.DB;
  const { words } = await gpt(env, `You turn what an English speaker learning Korean typed into flashcards, one for each word or phrase they listed. If they wrote Korean, keep their wording, fixing only clear typos. If they wrote English, give the most common natural Korean for it in everyday speech, verbs and adjectives in dictionary form. ${SAID}`, text, WORDS);
  const done = await db.batch(words.map(w => db.prepare(`INSERT INTO cards (ko, en, ask_ko, ask_en, intro) VALUES (?1, ?2, ?1, ?2, ?3)
    ON CONFLICT (ko) DO UPDATE SET intro = ?3 WHERE intro IS NULL RETURNING *`).bind(w.ko, w.en, day)));
  return { cards: done.flatMap(r => r.results).map(c => shape(c, day)), had: words.filter((w, i) => !done[i].results.length).map(w => w.ko) };
}

async function gpt(env, instructions, input, schema) {
  const res = await busy('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.model, reasoning: { effort: config.effort }, store: false, instructions, input,
      text: { format: { type: 'json_schema', name: 'cards', strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI: ${(await res.json()).error.message}`);
  return JSON.parse((await res.json()).output.find(o => o.type === 'message').content[0].text);
}

// OpenAI and Azure answer 429 or 5xx when they're busy, which usually passes within seconds.
async function busy(url, init) {
  for (let tries = 1; ; tries++) {
    const res = await fetch(url, init);
    if (res.ok || tries === 3 || res.status !== 429 && res.status < 500) return res;
    await new Promise(resolve => setTimeout(resolve, 2000 * tries));
  }
}

// Each line is synthesized once and kept in R2, keyed by voice and text.
async function speak(env, { text, lang }) {
  const voice = config.voices[lang];
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const key = `${voice}/${[...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')}.mp3`;
  let mp3 = await env.AUDIO.get(key).then(o => o?.arrayBuffer());
  if (!mp3) {
    const xml = text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
    const res = await busy('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1', {
      method: 'POST',
      headers: { 'ocp-apim-subscription-key': env.AZURE_KEY, 'content-type': 'application/ssml+xml', 'x-microsoft-outputformat': 'audio-24khz-48kbitrate-mono-mp3', 'user-agent': 'myna' },
      body: `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.slice(0, 5)}"><voice name="${voice}">${xml}</voice></speak>`,
    });
    if (!res.ok) throw new Error(`Azure Speech: ${res.status} ${await res.text()}`);
    mp3 = await res.arrayBuffer();
    await env.AUDIO.put(key, mp3);
  }
  return new Response(mp3, { headers: { 'content-type': 'audio/mpeg' } });
}
