// Paul's apps on www.paulscotti.com, as one Worker. Cloudflare serves each app's files from the repo; a request to
// /<app>/api/... comes here and goes to that app's api.js. The apps share one password, the KEY secret. Typed once
// into any of them (POST /<app>/api/login), it becomes HttpOnly cookies, one per app's API, that page scripts can't
// read; a script can send the password as a Bearer token instead. An error an app throws goes back as text it can show.

import ebis from './ebis/api.js';
import myna from './myna/api.js';
import pintail from './pintail/api.js';
import paisano from './paisano/api.js';

const APPS = { ebis, myna, pintail, paisano };

export default {
  async fetch(request, env, ctx) {
    const [, app, path] = new URL(request.url).pathname.match(/^\/(\w+)\/api(\/.*)$/) || [];
    if (!APPS[app]) return new Response('Not found.', { status: 404 });
    const digest = s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    const same = async (a, b) => !!a && crypto.subtle.timingSafeEqual(await digest(a), await digest(b));
    // The cookie holds a hash of the password, not the password, so a new password signs every device out.
    const session = [...new Uint8Array(await digest('session ' + env.KEY))].map(b => b.toString(16).padStart(2, '0')).join('');
    const login = path === '/login' && request.method === 'POST';
    // Ten tries with a password a minute from one address, so the password can't be guessed quickly.
    if ((login || request.headers.has('authorization')) && !(await env.TRIES.limit({ key: request.headers.get('cf-connecting-ip') })).success)
      return new Response('Too many tries. Wait a minute.', { status: 429 });
    const ok = !!env.KEY && (login ? await same(await request.text(), env.KEY)
      : await same((request.headers.get('authorization') || '').replace(/^Bearer /, ''), env.KEY)
        || await same((request.headers.get('cookie') || '').match(/(?:^|;\s*)login=(\w+)/)?.[1], session));
    if (!ok) return new Response('Wrong password.', { status: 401 });
    const res = login ? new Response(null, { status: 204 }) : await APPS[app](request, env, ctx, path).catch(e => new Response(e.message, { status: 500 }));
    // Every answer renews the cookies for 400 days, the longest a browser keeps one.
    for (const name in APPS) res.headers.append('set-cookie', `login=${session}; Path=/${name}/api; Max-Age=34560000; HttpOnly; Secure; SameSite=Strict`);
    return res;
  },
};
