// Pintail's worker, on Paul's own Cloudflare: his todo.txt in D1. One password opens it, the KEY secret, the same as
// ebis, myna and paisano. GET /todo.txt reads it with its version as the ETag; PUT /todo.txt writes it only with
// If-Match set to the version it was edited from, so no device or script can overwrite a change it hasn't seen.

const ORIGINS = ['https://www.paulscotti.com', 'https://paulscotti.com', 'https://paulscotti.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': ORIGINS.includes(origin) || LOCAL.test(origin) ? origin : ORIGINS[0],
      'access-control-allow-methods': 'GET, PUT, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, if-match, if-none-match',
      'access-control-expose-headers': 'etag',
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
  const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  if (!given || !crypto.subtle.timingSafeEqual(await digest(given), await digest(env.KEY))) return new Response('Wrong password.', { status: 401 });
  if (new URL(request.url).pathname !== '/todo.txt') return new Response('Not found.', { status: 404 });
  const head = async () => await env.DB.prepare('SELECT v, text FROM versions ORDER BY v DESC LIMIT 1').first() || { v: 0, text: '' };
  const send = (status, { v, text }) => new Response(text, { status, headers: { etag: `"${v}"`, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  // Cloudflare turns the ETag into W/"7" when it compresses a response, so either form is taken back.
  const version = name => (request.headers.get(name) || '').match(/^(?:W\/)?"(\d+)"$/)?.[1];
  if (request.method === 'GET') {
    const now = await head();
    return version('if-none-match') === String(now.v) ? new Response(null, { status: 304, headers: { etag: `"${now.v}"` } }) : send(200, now);
  }
  if (request.method !== 'PUT') return new Response('Use GET or PUT.', { status: 405, headers: { allow: 'GET, PUT, OPTIONS' } });
  const base = version('if-match');
  if (!base) return new Response('Send If-Match with the version you edited, from the ETag of GET /todo.txt.', { status: 428 });
  // One statement, so of two writers editing the same version only the first gets in. The other gets the new text
  // back to merge with.
  const text = await request.text();
  const { meta } = await env.DB.prepare('INSERT INTO versions (at, text) SELECT ?, ? WHERE (SELECT coalesce(max(v), 0) FROM versions) = ?').bind(Date.now(), text, +base).run();
  if (!meta.changes) return send(412, await head());
  // Every version of the last 30 days is kept, and one a day before that.
  await env.DB.prepare('DELETE FROM versions WHERE at < ? AND v NOT IN (SELECT max(v) FROM versions GROUP BY at / 86400000)').bind(Date.now() - 30 * 86400000).run();
  return new Response(null, { status: 204, headers: { etag: `"${meta.last_row_id}"` } });
}
