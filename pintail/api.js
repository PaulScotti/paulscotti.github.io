// Pintail's worker, on Paul's own Cloudflare: his todo.txt in D1. The apps' one password opens it, checked by
// worker.js at the top of the repo before a request reaches this file. GET /todo.txt reads it with its version as the
// ETag; PUT /todo.txt writes it only with If-Match set to the version it was edited from, so no device or script can
// overwrite a change it hasn't seen.

export default async function route(request, env, ctx, path) {
  const url = new URL(request.url);
  if (path === '/versions' && request.method === 'GET') {
    const before = url.searchParams.get('before');
    if (before && !/^[1-9]\d*$/.test(before)) return new Response('Invalid version.', { status: 400 });
    const { results } = await env.PINTAIL.prepare('SELECT v, at FROM versions WHERE v < ? ORDER BY v DESC LIMIT 100').bind(before ? +before : Number.MAX_SAFE_INTEGER).all();
    return Response.json(results, { headers: { 'cache-control': 'no-store' } });
  }
  if (path !== '/todo.txt') return new Response('Not found.', { status: 404 });
  const head = async () => await env.PINTAIL.prepare('SELECT v, text FROM versions ORDER BY v DESC LIMIT 1').first() || { v: 0, text: '' };
  const send = (status, { v, text }) => new Response(text, { status, headers: { etag: `"${v}"`, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  // Cloudflare turns the ETag into W/"7" when it compresses a response, so either form is taken back.
  const version = name => (request.headers.get(name) || '').match(/^(?:W\/)?"(\d+)"$/)?.[1];
  if (request.method === 'GET') {
    const v = url.searchParams.get('version');
    if (v && !/^[1-9]\d*$/.test(v)) return new Response('Invalid version.', { status: 400 });
    const now = v ? await env.PINTAIL.prepare('SELECT v, text FROM versions WHERE v = ?').bind(+v).first() : await head();
    if (!now) return new Response('That version is no longer available.', { status: 404 });
    return version('if-none-match') === String(now.v) ? new Response(null, { status: 304, headers: { etag: `"${now.v}"` } }) : send(200, now);
  }
  if (request.method !== 'PUT') return new Response('Use GET or PUT.', { status: 405, headers: { allow: 'GET, PUT, OPTIONS' } });
  const base = version('if-match');
  if (!base) return new Response('Send If-Match with the version you edited, from the ETag of GET /todo.txt.', { status: 428 });
  // One statement, so of two writers editing the same version only the first gets in. The other gets the new text
  // back to merge with.
  const text = await request.text();
  const { meta } = await env.PINTAIL.prepare('INSERT INTO versions (at, text) SELECT ?, ? WHERE (SELECT coalesce(max(v), 0) FROM versions) = ?').bind(Date.now(), text, +base).run();
  if (!meta.changes) return send(412, await head());
  // Every version of the last 30 days is kept, and one a day before that.
  await env.PINTAIL.prepare('DELETE FROM versions WHERE at < ? AND v NOT IN (SELECT max(v) FROM versions GROUP BY at / 86400000)').bind(Date.now() - 30 * 86400000).run();
  return new Response(null, { status: 204, headers: { etag: `"${meta.last_row_id}"` } });
}
