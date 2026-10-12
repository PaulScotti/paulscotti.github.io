// Paisano's worker, on Paul's own Cloudflare: the log of snacks and feedings, in D1. One password opens it, the KEY
// secret, the same as ebis and myna. The app works out everything else from the log.

import config from '../config.js';

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
    const res = await route(request, env);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

async function route(request, env) {
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405, headers: { allow: 'POST, OPTIONS' } });
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  if (!given || !crypto.subtle.timingSafeEqual(await digest(given), await digest(env.KEY))) return new Response('Wrong password.', { status: 401 });
  if (new URL(request.url).pathname !== '/sync') return new Response('Not found.', { status: 404 });
  // A device's new events go in once each (one sent again is ignored), and every event after its cursor comes back.
  const body = await request.json();
  if (!body || !Number.isSafeInteger(body.since) || body.since < 0 || !Array.isArray(body.events) || body.events.length > 40)
    return new Response('Invalid sync request.', { status: 400 });
  const { since, events } = body;
  for (const e of events) {
    if (!e || typeof e.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.id) || !Number.isSafeInteger(e.at) || e.at < 0 || !e.data)
      return new Response('Invalid event.', { status: 400 });
    const d = e.data;
    let valid = false;
    if (e.kind === 'snack') {
      const x = config.exercises.find(x => x.id === d.x);
      if (x) {
        const weights = x.hold === 'none' ? [null] : x.share ? [0, ...config.weights] : config.weights;
        const rep = r => Number.isInteger(r) && r >= 0 && r <= 99;
        valid = ['easy', 'good', 'hard', 'pain'].includes(d.feel) && (d.rounds
          ? Array.isArray(d.rounds) && d.rounds.length === config.minutes && d.rounds.every(v => v && rep(v.r) && weights.includes(v.w)) && d.rounds.some(v => v.r > 0)
            && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && Number.isFinite(Date.parse(d.day)) && new Date(d.day).toISOString().slice(0, 10) === d.day && Number.isInteger(d.hour) && d.hour >= 0 && d.hour < 24
          : rep(d.r) && d.r > 0 && weights.includes(d.w));
      }
    } else if (e.kind === 'feed') valid = d.n === 1;
    else if (e.kind === 'plant') valid = config.plants.some(p => p.id === d.p);
    else if (e.kind === 'hunt') valid = typeof d.v === 'string' && typeof d.ok === 'boolean' && (d.c === undefined || config.creatures.some(c => c.id === d.c));
    if (!valid) return new Response('Invalid ' + e.kind + ' event.', { status: 400 });
  }
  // A hunt must reference a real snack, otherwise one malformed event breaks every device's replay.
  const targets = new Set(events.filter(e => e.kind === 'snack').map(e => e.id));
  const missing = [...new Set(events.filter(e => e.kind === 'hunt' && !targets.has(e.data.v)).map(e => e.data.v))];
  if (missing.length) {
    const { results } = await env.DB.prepare(`SELECT id FROM events WHERE kind = 'snack' AND id IN (${missing.map(() => '?').join(',')})`).bind(...missing).all();
    if (results.length !== missing.length) return new Response('Hunt has no snack.', { status: 400 });
  }
  if (events.length) await env.DB.batch(events.map(e => env.DB.prepare('INSERT OR IGNORE INTO events (id, at, kind, data) VALUES (?, ?, ?, ?)').bind(e.id, e.at, e.kind, JSON.stringify(e.data))));
  const { results } = await env.DB.prepare('SELECT seq, id, at, kind, data FROM events WHERE seq > ? ORDER BY seq').bind(since).all();
  return Response.json(results.map(e => ({ ...e, data: JSON.parse(e.data) })));
}
