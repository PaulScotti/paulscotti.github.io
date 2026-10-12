// Paisano's worker, on Paul's own Cloudflare: the log of snacks and feedings, in D1. One password opens it, the KEY
// secret, the same as ebis and myna. The app works out everything else from the log.

const ORIGINS = ['https://www.paulscotti.com', 'https://paulscotti.com', 'https://paulscotti.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': ORIGINS.includes(origin) || LOCAL.test(origin) ? origin : ORIGINS[0],
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
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
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  if (!given || !crypto.subtle.timingSafeEqual(await digest(given), await digest(env.KEY))) return new Response('Wrong password.', { status: 401 });
  if (new URL(request.url).pathname !== '/sync') return new Response('Not found.', { status: 404 });
  // A device's new events go in once each (one sent again is ignored), and every event after its cursor comes back.
  const { since, events } = await request.json();
  if (events.length) await env.DB.batch(events.map(e => env.DB.prepare('INSERT OR IGNORE INTO events (id, at, kind, data) VALUES (?, ?, ?, ?)').bind(e.id, e.at, e.kind, JSON.stringify(e.data))));
  const { results } = await env.DB.prepare('SELECT seq, id, at, kind, data FROM events WHERE seq > ? ORDER BY seq').bind(since).all();
  return Response.json(results.map(e => ({ ...e, data: JSON.parse(e.data) })));
}
