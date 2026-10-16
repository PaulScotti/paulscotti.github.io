// Paisano's worker, on Paul's own Cloudflare: the log of snacks, feedings, hunts, plantings and resets, in D1. The
// apps' one password opens it, checked by worker.js at the top of the repo. The app works out everything else from the log.

import config from './config.js';

export default async function route(request, env, ctx, path) {
  if (request.method !== 'POST') return new Response('Use POST.', { status: 405, headers: { allow: 'POST, OPTIONS' } });
  if (path !== '/sync') return new Response('Not found.', { status: 404 });
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
        // One set, or a set a side, with the reps expected for each; versions before 14 send two sets and no expect.
        valid = [undefined, 'seed'].includes(d.prize) && ['hard', 'pain'].includes(d.feel)
          && Array.isArray(d.rounds) && [x.sides ? 2 : 1, 2].includes(d.rounds.length) && d.rounds.every(v => v && rep(v.r) && weights.includes(v.w)) && d.rounds.some(v => v.r > 0)
          && (d.expect === undefined || Array.isArray(d.expect) && d.expect.length === d.rounds.length && d.expect.every(r => rep(r) && r > 0))
          && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && Number.isFinite(Date.parse(d.day)) && new Date(d.day).toISOString().slice(0, 10) === d.day && Number.isInteger(d.hour) && d.hour >= 0 && d.hour < 24;
      }
    } else if (e.kind === 'feed') valid = d.n === 1;
    else if (e.kind === 'plant') valid = config.plants.some(p => p.id === d.p);
    else if (e.kind === 'reset') valid = true; // the app replays only what comes after the last one
    else if (e.kind === 'hunt') valid = typeof d.v === 'string' && typeof d.ok === 'boolean' && config.creatures.some(c => c.id === d.c);
    if (!valid) return new Response('Invalid ' + e.kind + ' event.', { status: 400 });
  }
  // A hunt must reference a real snack, otherwise one malformed event breaks every device's replay.
  const targets = new Set(events.filter(e => e.kind === 'snack').map(e => e.id));
  const missing = [...new Set(events.filter(e => e.kind === 'hunt' && !targets.has(e.data.v)).map(e => e.data.v))];
  if (missing.length) {
    const { results } = await env.PAISANO.prepare(`SELECT id FROM events WHERE kind = 'snack' AND id IN (${missing.map(() => '?').join(',')})`).bind(...missing).all();
    if (results.length !== missing.length) return new Response('Hunt has no snack.', { status: 400 });
  }
  if (events.length) await env.PAISANO.batch(events.map(e => env.PAISANO.prepare('INSERT OR IGNORE INTO events (id, at, kind, data) VALUES (?, ?, ?, ?)').bind(e.id, e.at, e.kind, JSON.stringify(e.data))));
  const { results } = await env.PAISANO.prepare('SELECT seq, id, at, kind, data FROM events WHERE seq > ? ORDER BY seq').bind(since).all();
  return Response.json(results.map(e => ({ ...e, data: JSON.parse(e.data) })));
}
