import Anthropic from '@anthropic-ai/sdk';

// ebis sync, on Paul's own Cloudflare account. One library, opened by one password: the KEY secret.
// Records (books, reading positions, highlights, margin notes, tabs) replicate last-write-wins through
// D1; book packages live in R2; /fetch reads web pages for the reader, which browsers can't do
// directly; /notes has Claude write margin notes (the ANTHROPIC_API_KEY secret, and for a personal
// key that spans workspaces, ANTHROPIC_WORKSPACE).

const ORIGINS = ['https://www.paulscotti.com', 'https://paulscotti.com', 'https://paulscotti.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const PAGE = 50; // records per response; book records carry a cover, so each request stays small
const BROWSER = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': ORIGINS.includes(origin) || LOCAL.test(origin) ? origin : ORIGINS[0],
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-expose-headers': 'x-final-url, content-length',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const res = await route(request, env).catch(e => new Response(e.message, { status: 500 }));
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

async function route(request, env) {
  if (!(await authorized(request, env))) return new Response('Wrong password.', { status: 401 });
  const url = new URL(request.url);
  const file = url.pathname.match(/^\/files\/([\w-]{1,40})$/)?.[1];
  if (url.pathname === '/sync' && request.method === 'POST') return sync(await request.json(), env);
  if (file && request.method === 'PUT') {
    await env.FILES.put(file, request.body, { httpMetadata: { contentType: 'application/zip' } });
    return new Response('Stored.');
  }
  if (file && request.method === 'GET') {
    const obj = await env.FILES.get(file);
    return obj ? new Response(obj.body, { headers: { 'content-type': 'application/zip', 'content-length': obj.size } })
      : new Response('This book hasn’t finished uploading from your other device yet.', { status: 404 });
  }
  if (url.pathname === '/fetch' && request.method === 'POST') return proxy(await request.text());
  if (url.pathname === '/notes' && request.method === 'POST') return annotate(await request.json(), env);
  return new Response('Not found.', { status: 404 });
}

async function authorized(request, env) {
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([digest(given), digest(env.KEY)]);
  return given.length > 0 && crypto.subtle.timingSafeEqual(a, b); // a missing secret opens nothing
}

// Push what changed here, pull what changed elsewhere. The database writes the JSON.
async function sync({ since = 0, records = [] }, env) {
  const db = env.DB;
  if (records.length) {
    await db.batch(records.map(r => db.prepare(
      `INSERT INTO records (kind, id, data, updated, seq)
       VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
       ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, updated = excluded.updated, seq = excluded.seq
       WHERE excluded.updated > records.updated`,
    ).bind(r.kind, r.id, JSON.stringify(r.data), r.updated)));
    const gone = records.filter(r => r.kind === 'book' && r.data.deleted).map(r => r.id);
    if (gone.length) await env.FILES.delete(gone);
  }
  const { results } = await db.prepare(
    `SELECT seq, json_object('kind', kind, 'id', id, 'updated', updated, 'data', json(data)) AS r
     FROM records WHERE seq > ?1 ORDER BY seq LIMIT ${PAGE}`,
  ).bind(since).all();
  const cursor = results.length ? results.at(-1).seq : since;
  return new Response(`{"cursor":${cursor},"more":${results.length === PAGE},"records":[${results.map(x => x.r).join(',')}]}`, {
    headers: { 'content-type': 'application/json' },
  });
}

// The address arrives in the body, so what Paul reads stays out of request logs.
async function proxy(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return new Response('That isn’t a web address.', { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol)) return new Response('Only web links can be added.', { status: 400 });
  const silent = new AbortController(); // a site that never answers can't hold up what's waiting behind it
  const timer = setTimeout(() => silent.abort(), 20000);
  const res = await fetch(url, { headers: BROWSER, signal: silent.signal }).catch(() => null);
  clearTimeout(timer);
  if (!res) return new Response('That page can’t be reached.', { status: 502 });
  if (!res.ok) return new Response(`The site ${res.status < 500 ? 'wouldn’t give ebis that page' : 'isn’t working right now'} (it answered ${res.status}).`, { status: 502 });
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'x-final-url': res.url },
  });
}

// Margin notes, written by Claude to help a reader understand what they read. A passage arrives in
// numbered pieces of a sentence or few, after the text around it for context (the same for every
// passage of a chapter, so Claude keeps it cached); the notes go back as runs of pieces, each with
// what it means.
const MODEL = 'claude-haiku-5-5';
const SPAN = 700; // characters of text a note sums up, at least on average: room in the margin beside them
const NOTE = `You write the margin notes in one reader's copy of a book, paper or article: brackets beside the text, each with a note that helps them understand that stretch at a glance.

You get the text first (all of it, or as much as leads up to the passage and around it), then one passage of it to note. The passage comes one paragraph to a line, each paragraph in numbered pieces: a short paragraph is one piece, a longer one a few pieces of a couple of sentences or more. A line starting with # is a heading; one starting with "Formula:" is a displayed formula.

Bracket the passage into runs of consecutive pieces, in order, each making one point. Think in paragraphs: a run is a whole paragraph, or several that make one point together (as a stretch of dialogue usually does). Split a paragraph only when it is long and makes separate points.

Beside each run, write what a knowledgeable friend reading over the reader's shoulder would say to make it click:
- Explain it, in your own plain words, for a smart reader new to the subject. Don't reuse the text's phrasing (beyond names and numbers): someone it lost needs it said another way. Assume they don't know the field's terms; when one can't be avoided, say in a few words what it is or does.
- Explain the run's main point well rather than list everything in it. If a run packs in more than one note can explain, split it.
- Make it make sense: the reason behind a claim, how a mechanism works, what a number implies, or why this matters to what the piece is arguing. Use the rest of the text for this (what its terms mean, what this run sets up or answers) and your own knowledge of the subject, but only to explain what the text says, never to add claims of your own.
- Keep the substance: the claim, the result, with the names and numbers that matter (in a story: what happens, to whom, and what it reveals). Never describe the text ("The author argues…", "This section discusses…").
- Two or three short sentences, about 40 words at most.
- In a story, give nothing away from later in it.

For instance, beside "fUSI transmits unfocused plane waves with flat wavefronts that insonify the whole imaging plane at once, so a single pulse can produce a whole image", not "fUSI sends unfocused plane waves that insonify the whole plane", which only shortens it, but "Ordinary ultrasound sweeps a narrow beam across, one line at a time. fUSI fires one broad, flat pulse that hits the whole slice at once, so each echo is already a full image, which is what makes it so fast." And beside "We freeze the pretrained weights and inject trainable rank-decomposition matrices into each layer", not "LoRA freezes weights and injects low-rank matrices" but "Instead of retraining the whole model, they leave it untouched and train small add-on pieces in each layer, so fine-tuning needs a sliver of the memory and storage."

Mark each run as part of the work (any prose written to be read, prefaces, introductions, notes and appendices included) or as apparatus, which no one reads for what it says, however long it runs: licences and legal terms (a Project Gutenberg licence, say), copyright and publication details, title pages, bylines, tables of contents, reference lists, acknowledgments, captions, code, and lead-ins like "Our contributions are threefold." Apparatus gets no note. Write in English.`;
const NOTES = {
  type: 'object', additionalProperties: false, required: ['notes'],
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['from', 'to', 'part', 'note'],
        properties: {
          from: { type: 'integer', description: 'first piece of the run' },
          to: { type: 'integer', description: 'last piece of the run' },
          part: { type: 'string', enum: ['work', 'apparatus'] },
          note: { type: 'string', description: 'for the work, what the run means; for apparatus, empty' },
        },
      },
    },
  },
};

async function annotate({ title, author, text, context = text }, env) {
  if (!env.ANTHROPIC_API_KEY) return new Response('The worker has no ANTHROPIC_API_KEY.', { status: 503 });
  const claude = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    defaultHeaders: env.ANTHROPIC_WORKSPACE ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE } : {}, // a personal key spanning workspaces names one
  });
  const message = await claude.messages.create({
    model: MODEL, max_tokens: 16000, system: NOTE,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: NOTES } },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `<text${title ? ` title="${title}"` : ''}${author ? ` author="${author}"` : ''}>\n${context}\n</text>`, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: `<passage>\n${text}\n</passage>\n\nNote this passage, in at most ${Math.ceil(text.length / SPAN)} notes.` },
      ],
    }],
  }).catch(e => { throw new Error(`Claude answered ${e.status ?? 'nothing'}: ${(e.error?.error?.message ?? e.message).replace(/\.$/, '')}.`); });
  if (message.stop_reason !== 'end_turn') throw new Error(`Claude stopped early (${message.stop_reason}).`);
  const { notes } = JSON.parse(message.content.find(b => b.type === 'text').text);
  return Response.json({ notes: notes.filter(n => n.part === 'work').map(({ from, to, note }) => ({ from, to, note })) });
}
