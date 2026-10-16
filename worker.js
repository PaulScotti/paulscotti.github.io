// What every app Worker of Paul's has in common (ebis, myna, pintail and paisano), kept in one place so they can't drift:
// one password, the KEY secret, checked on every request, and CORS for paulscotti.com and local copies. Each Worker
// exports worker(route). route only sees requests that carry the password, and an error it throws goes back as text
// the app can show; thrown out of the Worker, it would reach the browser without CORS and look like being offline.

const ORIGINS = ['https://www.paulscotti.com', 'https://paulscotti.com', 'https://paulscotti.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default route => ({
  async fetch(request, env, ctx) {
    const origin = request.headers.get('origin') || '';
    const cors = {
      'access-control-allow-origin': ORIGINS.includes(origin) || LOCAL.test(origin) ? origin : ORIGINS[0],
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, if-match, if-none-match',
      'access-control-expose-headers': 'etag, x-final-url, content-length',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const given = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
    const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    const res = given && crypto.subtle.timingSafeEqual(await digest(given), await digest(env.KEY)) // a missing secret opens nothing
      ? await route(request, env, ctx).catch(e => new Response(e.message, { status: 500 }))
      : new Response('Wrong password.', { status: 401 });
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
});
