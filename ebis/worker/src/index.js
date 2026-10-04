// ebis sync, on Paul's own Cloudflare account. One library, one key.
// Records (books, reading positions, highlights, tabs) replicate last-write-wins through D1;
// book packages live in R2; /fetch reads web pages for the reader, which browsers can't do directly.

const ORIGINS = ['https://www.paulscotti.com', 'https://paulscotti.com', 'https://paulscotti.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const PAGE = 200; // records per response, so each request stays small
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
  if (!(await authorized(request, env))) return new Response('Not signed in.', { status: 401 });
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
      : new Response('No such book.', { status: 404 });
  }
  if (url.pathname === '/fetch') return proxy(url.searchParams.get('url'));
  return new Response('Not found.', { status: 404 });
}

async function authorized(request, env) {
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([digest(given), digest(env.KEY)]);
  return given.length > 0 && crypto.subtle.timingSafeEqual(a, b);
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
    ).bind(String(r.kind), String(r.id), JSON.stringify(r.data), Number(r.updated))));
    const gone = records.filter(r => r.kind === 'book' && r.data?.deleted).map(r => r.id);
    if (gone.length) await env.FILES.delete(gone);
  }
  const [rows] = await db.batch([db.prepare(
    `SELECT seq, json_object('kind', kind, 'id', id, 'updated', updated, 'data', json(data)) AS r
     FROM records WHERE seq > ?1 ORDER BY seq LIMIT ${PAGE}`,
  ).bind(Number(since))]);
  const list = rows.results;
  const cursor = list.length ? list.at(-1).seq : Number(since);
  return new Response(`{"cursor":${cursor},"more":${list.length === PAGE},"records":[${list.map(x => x.r).join(',')}]}`, {
    headers: { 'content-type': 'application/json' },
  });
}

async function proxy(target) {
  const url = new URL(target);
  if (!/^https?:$/.test(url.protocol)) return new Response('Only web links can be added.', { status: 400 });
  const res = await fetch(url, { headers: BROWSER, redirect: 'follow' });
  if (!res.ok) return new Response(`The site answered ${res.status}.`, { status: 502 });
  return new Response(res.body, {
    headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream', 'x-final-url': res.url },
  });
}
