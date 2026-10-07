// The library on this device (IndexedDB), kept in step with Paul's Cloudflare worker.
// Everything small (books, reading positions, highlights, open tabs) is a record that
// replicates last-write-wins; each book's content is a zip package stored beside it.

import { unzipSync, strFromU8 } from '../vendor/fflate.js';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://ebis.scottibrain.workers.dev';
const LARGEST = 100e6; // the largest upload a worker accepts; a larger book stays on the device it was added on
const records = new Map(); // "kind/id" → { kind, id, data, updated, dirty }
const listeners = new Set();
const opened = new Map(); // id → unpacked package, for books open in tabs
let password = localStorage.getItem('ebis.password'); // typed once on each device
let syncing = null, timer = 0;
let last = { at: 0, error: '' }; // the last sync: when it finished, or why it didn't

const db = new Promise((resolve, reject) => {
  const req = indexedDB.open('ebis', 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('records');
    req.result.createObjectStore('packages');
    req.result.createObjectStore('meta');
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const idb = async (store, mode, op) => {
  const tx = (await db).transaction(store, mode);
  const req = op(tx.objectStore(store));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
};

export const ready = idb('records', 'readonly', s => s.getAll()).then(all => {
  for (const r of all) records.set(`${r.kind}/${r.id}`, r);
});

export const unlocked = () => !!password;
export const syncStatus = () => last;
export const onChange = fn => listeners.add(fn);
const emit = change => listeners.forEach(fn => fn(change));

export function get(kind, id) {
  const r = records.get(`${kind}/${id}`);
  return r && !r.data.deleted ? r.data : null;
}
export function all(kind) {
  return [...records.values()].filter(r => r.kind === kind && !r.data.deleted).map(r => ({ id: r.id, ...r.data }));
}
export function put(kind, id, data, soon = true) {
  const r = { kind, id, data, updated: Date.now(), dirty: true };
  records.set(`${kind}/${id}`, r);
  idb('records', 'readwrite', s => s.put(r, `${kind}/${id}`));
  emit({ kind, id, local: true });
  schedule(soon ? 1500 : 8000);
}
export const remove = (kind, id) => put(kind, id, { deleted: true });

export async function addBook(record, zip) {
  const id = crypto.randomUUID().slice(0, 13).replace('-', '');
  await idb('packages', 'readwrite', s => s.put(zip, id));
  put('book', id, record);
  return id;
}
// A book built again (by a newer ebis, from the same source) takes the old one's place: on the
// shelf, in the open tabs, with its reading position and highlights. It does so under an id of
// its own, so every device fetches the new package.
export async function replaceBook(old, record, zip) {
  const id = await addBook({ ...record, added: get('book', old)?.added ?? record.added }, zip);
  const pos = get('pos', old), tabs = get('tabs', 'open');
  if (pos) put('pos', id, pos);
  for (const { id: mark, ...m } of all('mark').filter(m => m.book === old)) put('mark', mark, { ...m, book: id });
  if (tabs?.ids.includes(old)) put('tabs', 'open', { ids: tabs.ids.map(x => x === old ? id : x) });
  await removeBook(old);
  return id;
}
export async function removeBook(id) {
  remove('book', id);
  remove('pos', id);
  for (const m of all('mark').filter(m => m.book === id)) remove('mark', m.id);
  close(id);
  await idb('packages', 'readwrite', s => s.delete(id));
}

// A book's content, unpacked: book.json plus object URLs for its images.
export async function open(id, progress) {
  if (opened.has(id)) return opened.get(id);
  let zip = await idb('packages', 'readonly', s => s.get(id));
  if (!zip) { // added on another device
    if (get('book', id).bytes > LARGEST) throw new Error('This book is too large to sync, so it’s only on the device it was added on.');
    zip = await download(id, progress);
    await idb('packages', 'readwrite', s => s.put(zip, id));
    await onServer(id);
  }
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const book = JSON.parse(strFromU8(files['book.json']));
  const urls = {};
  for (const name of Object.keys(book.images)) { // a browser knows other pictures by their bytes, but an SVG only by its type
    urls[name] = URL.createObjectURL(new Blob([files[`img/${name}`]], name.endsWith('.svg') ? { type: 'image/svg+xml' } : {}));
  }
  const pkg = { book, urls };
  opened.set(id, pkg);
  return pkg;
}
export function close(id) {
  for (const url of Object.values(opened.get(id)?.urls || {})) URL.revokeObjectURL(url);
  opened.delete(id);
}

// ebis is Paul's alone: its password is typed once on each device, and the worker checks it on
// every request. If the worker stops accepting it (the password changed), the device asks again.
export async function unlock(typed) {
  await api('/sync', { method: 'POST', body: '{"since":0,"records":[]}' }, typed);
  // The device joins the library afresh: all it holds goes up once, and all the library holds comes down.
  await idb('meta', 'readwrite', s => s.clear());
  await idb('records', 'readwrite', s => { for (const r of records.values()) r.dirty = true, s.put(r, `${r.kind}/${r.id}`); });
  password = typed;
  localStorage.setItem('ebis.password', password);
}
function lock() {
  password = null;
  localStorage.removeItem('ebis.password');
  emit({ locked: true });
}

// Syncing never interrupts reading: a failure is remembered and retried at the next chance.
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}

export function sync() {
  if (!password) return Promise.resolve();
  syncing ||= run().then(() => { last = { at: Date.now(), error: '' }; }, e => { last = { ...last, error: e.message }; })
    .finally(() => { syncing = null; emit({ syncing: false }); });
  return syncing;
}
addEventListener('online', sync);
document.addEventListener('visibilitychange', sync); // leaving pushes what changed; returning pulls what's new

async function run() {
  emit({ syncing: true });
  let since = (await idb('meta', 'readonly', s => s.get('cursor'))) || 0, more = true;
  while (more) { // a page at a time, both ways
    const sent = [...records.values()].filter(r => r.dirty).slice(0, 20);
    const body = JSON.stringify({ since, records: sent.map(({ kind, id, data, updated }) => ({ kind, id, data, updated })) });
    const res = await (await api('/sync', { method: 'POST', body })).json();
    for (const r of sent) {
      const now = records.get(`${r.kind}/${r.id}`);
      if (now.updated === r.updated) now.dirty = false, idb('records', 'readwrite', s => s.put(now, `${r.kind}/${r.id}`));
    }
    for (const r of res.records) {
      const k = `${r.kind}/${r.id}`;
      if (records.get(k)?.updated >= r.updated) continue;
      records.set(k, { ...r, dirty: false });
      await idb('records', 'readwrite', s => s.put({ ...r, dirty: false }, k));
      if (r.kind === 'book' && r.data.deleted) await idb('packages', 'readwrite', s => s.delete(r.id));
      emit({ kind: r.kind, id: r.id, remote: true });
    }
    since = res.cursor;
    await idb('meta', 'readwrite', s => s.put(since, 'cursor'));
    more = res.more || [...records.values()].some(r => r.dirty);
  }
  await uploadPackages();
}

// A package goes up once, from the device its book was added on; one too large stays there.
// A package downloaded from the server is already on it.
const uploaded = async () => new Set((await idb('meta', 'readonly', s => s.get('uploaded'))) || []);
async function onServer(id) {
  const ids = await uploaded();
  await idb('meta', 'readwrite', s => s.put([...ids.add(id)], 'uploaded'));
}
async function uploadPackages() {
  const sent = await uploaded();
  for (const { id } of all('book')) {
    if (sent.has(id)) continue;
    const zip = await idb('packages', 'readonly', s => s.get(id));
    if (zip && zip.size <= LARGEST) await api(`/files/${id}`, { method: 'PUT', body: zip });
    await onServer(id);
  }
}

async function download(id, progress) {
  const res = await api(`/files/${id}`);
  const total = +res.headers.get('content-length');
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (let r; !(r = await reader.read()).done;) {
    chunks.push(r.value);
    progress(total ? (got += r.value.length) / total : 0);
  }
  return new Blob(chunks, { type: 'application/zip' });
}

// Pages and images from other sites come through the worker, since browsers won't read them across sites.
export async function fetchPage(url) {
  const res = await api('/fetch', { method: 'POST', body: url });
  return { blob: await res.blob(), url: res.headers.get('x-final-url') };
}
export const fetchBlob = async url => (await fetchPage(url)).blob;

// The worker answers in words a reader can be shown.
async function api(path, init = {}, key = password) {
  const res = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${key}` } })
    .catch(() => { throw new Error('ebis can’t reach your library right now.'); });
  if (res.status === 401) lock();
  if (!res.ok) throw new Error(await res.text());
  return res;
}
