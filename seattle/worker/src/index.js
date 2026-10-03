// Shared notes and edits for paulscotti.com/seattle.
// Anyone with the page can read and write; every write is kept in `history`.

const ALLOWED_ORIGINS = [
  "https://paulscotti.com",
  "https://www.paulscotti.com",
  "https://paulscotti.github.io",
];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const STATUSES = ["booked", "contacted", "none"];
const TEXT_FIELDS = [
  "name", "address", "neighborhood", "type", "rent", "fees", "lease", "available",
  "parking", "laundry", "ac", "pets", "requested", "tour_at", "listing_url", "photo_url",
  "sqft", "beds", "baths", "year_built",
];
const LIST_FIELDS = ["highlights", "watch_outs"];
const MAX_TEXT = 600;
const MAX_NOTE = 4000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (request.method !== "GET") {
        if (origin && !cors["Access-Control-Allow-Origin"]) return json({ error: "origin not allowed" }, 403, cors);
        if (env.WRITE_LIMIT) {
          const ip = request.headers.get("CF-Connecting-IP") || "unknown";
          const { success } = await env.WRITE_LIMIT.limit({ key: ip });
          if (!success) return json({ error: "Too many changes at once. Wait a minute and try again." }, 429, cors);
        }
      }

      if (url.pathname === "/api/state" && request.method === "GET") return json(await readState(env), 200, cors);

      if (url.pathname === "/api/notes" && request.method === "POST") {
        const body = await readJson(request);
        const placeId = cleanId(body.place_id);
        const text = clean(body.body, MAX_NOTE);
        if (!placeId || !text) return json({ error: "place_id and body are required" }, 400, cors);
        const note = {
          place_id: placeId,
          author: clean(body.author, 40),
          body: text,
          created_at: new Date().toISOString(),
        };
        const res = await env.DB.prepare(
          "INSERT INTO notes (place_id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id",
        ).bind(note.place_id, note.author, note.body, note.created_at).first();
        note.id = res.id;
        await log(env, "note.add", placeId, note);
        return json({ note }, 200, cors);
      }

      const noteMatch = url.pathname.match(/^\/api\/notes\/(\d+)$/);
      if (noteMatch && request.method === "DELETE") {
        const id = Number(noteMatch[1]);
        const row = await env.DB.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
        if (!row) return json({ error: "not found" }, 404, cors);
        await env.DB.prepare("UPDATE notes SET deleted_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
        await log(env, "note.delete", row.place_id, row);
        return json({ ok: true }, 200, cors);
      }

      const placeMatch = url.pathname.match(/^\/api\/places\/([a-z0-9-]{1,80})$/);
      if (placeMatch && request.method === "PATCH") {
        const placeId = placeMatch[1];
        const body = await readJson(request);
        const patch = cleanPatch(body.fields || {});
        if (!Object.keys(patch).length) return json({ error: "nothing to change" }, 400, cors);
        const data = await savePatch(env, placeId, patch, clean(body.by, 40));
        await log(env, "place.edit", placeId, { patch, by: clean(body.by, 40) });
        return json({ place_id: placeId, data }, 200, cors);
      }

      if (url.pathname === "/api/places" && request.method === "POST") {
        const body = await readJson(request);
        const fields = cleanPatch(body.fields || {});
        if (!fields.address) return json({ error: "An address is required." }, 400, cors);
        const geo = await geocode(fields.address);
        if (!geo) return json({ error: "Couldn't find that address on the map. Include the city and zip." }, 422, cors);
        if (fields.listing_url && !fields.photo_url) {
          const meta = await pageMeta(fields.listing_url);
          if (meta.image) fields.photo_url = meta.image;
          if (!fields.name && meta.title) fields.name = meta.title.slice(0, 120);
        }
        const placeId = "u-" + slug(fields.address).slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
        const data = await savePatch(env, placeId, {
          ...fields,
          name: fields.name || fields.address,
          status: fields.status || "none",
          lat: geo.lat,
          lng: geo.lng,
          added: true,
        }, clean(body.by, 40));
        await log(env, "place.add", placeId, { data });
        return json({ place_id: placeId, data }, 200, cors);
      }

      return json({ error: "not found" }, 404, cors);
    } catch (err) {
      return json({ error: err.message || "server error" }, err.status || 500, cors);
    }
  },
};

async function readState(env) {
  const [notes, edits] = await env.DB.batch([
    env.DB.prepare("SELECT id, place_id, author, body, created_at FROM notes WHERE deleted_at IS NULL ORDER BY id"),
    env.DB.prepare("SELECT place_id, data, updated_at, updated_by FROM place_edits"),
  ]);
  const byPlace = {};
  for (const row of edits.results) {
    byPlace[row.place_id] = { ...JSON.parse(row.data), _updated_at: row.updated_at, _updated_by: row.updated_by };
  }
  return { notes: notes.results, edits: byPlace, now: new Date().toISOString() };
}

async function savePatch(env, placeId, patch, by) {
  const row = await env.DB.prepare("SELECT data FROM place_edits WHERE place_id = ?").bind(placeId).first();
  const data = row ? JSON.parse(row.data) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete data[k];
    else data[k] = v;
  }
  await env.DB.prepare(
    "INSERT INTO place_edits (place_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(place_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  ).bind(placeId, JSON.stringify(data), new Date().toISOString(), by || "").run();
  return data;
}

// Only known fields survive; null means "clear this edit".
function cleanPatch(fields) {
  const out = {};
  for (const k of TEXT_FIELDS) {
    if (!(k in fields)) continue;
    out[k] = fields[k] === null || fields[k] === "" ? null : clean(String(fields[k]), MAX_TEXT);
  }
  for (const k of LIST_FIELDS) {
    if (!(k in fields)) continue;
    out[k] = Array.isArray(fields[k])
      ? fields[k].map((s) => clean(String(s), 200)).filter(Boolean).slice(0, 12)
      : null;
  }
  if ("status" in fields) {
    if (!STATUSES.includes(fields.status)) throw httpError(400, "status must be booked, contacted or none");
    out.status = fields.status;
  }
  if ("hidden" in fields) out.hidden = fields.hidden ? true : null;
  for (const k of ["listing_url", "photo_url"]) {
    if (out[k] && !/^https?:\/\//i.test(out[k])) throw httpError(400, `${k} must start with http`);
  }
  if (out.tour_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(out.tour_at)) {
    throw httpError(400, "tour_at must look like 2026-10-17T09:30");
  }
  return out;
}

async function geocode(address) {
  const q = encodeURIComponent(address);
  try {
    const r = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`,
    );
    const m = (await r.json())?.result?.addressMatches?.[0];
    if (m) return { lat: m.coordinates.y, lng: m.coordinates.x };
  } catch {}
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${q}`, {
      headers: { "User-Agent": "paulscotti.com-seattle-map/1.0" },
    });
    const m = (await r.json())?.[0];
    if (m) return { lat: Number(m.lat), lng: Number(m.lon) };
  } catch {}
  return null;
}

// Pull the share image and title from a listing page, the same data link previews use.
async function pageMeta(pageUrl) {
  try {
    const r = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const html = (await r.text()).slice(0, 600000);
    const meta = (prop) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
      const m = html.match(re);
      return m ? decodeEntities(m[1] || m[2]) : null;
    };
    let image = meta("og:image") || meta("og:image:url") || meta("twitter:image");
    if (image) image = new URL(image, r.url).toString();
    return { image, title: meta("og:title") };
  } catch {
    return {};
  }
}

async function log(env, action, placeId, payload) {
  await env.DB.prepare("INSERT INTO history (at, action, place_id, payload) VALUES (?, ?, ?, ?)")
    .bind(new Date().toISOString(), action, placeId, JSON.stringify(payload)).run();
}

function corsHeaders(origin) {
  const h = {
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 20000) throw httpError(413, "too large");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw httpError(400, "invalid JSON");
  }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clean(s, max) {
  return typeof s === "string" ? s.replace(/\u0000/g, "").trim().slice(0, max) : "";
}
function cleanId(s) {
  return typeof s === "string" && /^[a-z0-9-]{1,80}$/.test(s) ? s : "";
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
