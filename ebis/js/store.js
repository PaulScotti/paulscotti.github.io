// The library on this device (IndexedDB), kept in step with Cloudflare when signed in.
// Everything small (books, reading positions, highlights, open tabs) is a record that
// replicates last-write-wins; each book's content is a zip package stored beside it.

import { unzipSync, strFromU8 } from '../vendor/fflate.js';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8787' : 'https://ebis.scottibrain.workers.dev';
const records = new Map(); // "kind/id" → { kind, id, data, updated, dirty }
const listeners = new Set();
const opened = new Map(); // id → unpacked package, for books open in tabs
let key = localStorage.getItem('ebis.key');
let syncing = null, timer = 0;

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

export const signedIn = () => !!key;
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
  if (!zip) {
    zip = await download(id, progress);
    await idb('packages', 'readwrite', s => s.put(zip, id));
  }
  const files = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const book = JSON.parse(strFromU8(files['book.json']));
  const urls = {};
  for (const name of Object.keys(book.images)) urls[name] = URL.createObjectURL(new Blob([files[`img/${name}`]]));
  const pkg = { book, urls };
  opened.set(id, pkg);
  return pkg;
}
export function close(id) {
  for (const url of Object.values(opened.get(id)?.urls || {})) URL.revokeObjectURL(url);
  opened.delete(id);
}

// Cloudflare.
async function api(path, init = {}) {
  const res = await fetch(API + path, { ...init, headers: { authorization: `Bearer ${key}`, ...init.headers } });
  if (res.status === 401) {
    signOut();
    throw new Error('Your library key was not accepted.');
  }
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res;
}

export async function signIn(newKey) {
  key = newKey.trim();
  try {
    await api('/sync', { method: 'POST', body: JSON.stringify({ since: 0, records: [] }) });
  } catch (e) {
    key = null;
    throw e;
  }
  localStorage.setItem('ebis.key', key);
  await idb('meta', 'readwrite', s => s.delete('cursor'));
  return sync();
}
export function signOut() {
  key = null;
  localStorage.removeItem('ebis.key');
  emit({ auth: true });
}

function schedule(ms) {
  clearTimeout(timer);
  if (key) timer = setTimeout(sync, ms);
}

export function sync() {
  if (!key) return Promise.resolve();
  syncing ||= run().finally(() => { syncing = null; });
  return syncing;
}

async function run() {
  emit({ syncing: true });
  try {
    let since = (await idb('meta', 'readonly', s => s.get('cursor'))) || 0, more = true;
    while (more) { // a page at a time, both ways
      const sent = [...records.values()].filter(r => r.dirty).slice(0, 40);
      const res = await (await api('/sync', {
        method: 'POST',
        body: JSON.stringify({ since, records: sent.map(({ kind, id, data, updated }) => ({ kind, id, data, updated })) }),
      })).json();
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
  } finally {
    emit({ syncing: false });
  }
}

async function uploadPackages() {
  const sent = new Set((await idb('meta', 'readonly', s => s.get('uploaded'))) || []);
  for (const { id } of all('book')) {
    if (sent.has(id)) continue;
    const zip = await idb('packages', 'readonly', s => s.get(id));
    if (!zip) { sent.add(id); continue; } // made on another device, which uploads it
    await api(`/files/${id}`, { method: 'PUT', body: zip, headers: { 'content-type': 'application/zip' } });
    sent.add(id);
    await idb('meta', 'readwrite', s => s.put([...sent], 'uploaded'));
  }
}

async function download(id, progress = () => {}) {
  if (!key) throw new Error('This book is in your library on another device. Sign in to bring it here.');
  const res = await api(`/files/${id}`);
  const total = +res.headers.get('content-length') || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (let r; !(r = await reader.read()).done;) {
    chunks.push(r.value);
    progress(total ? (got += r.value.length) / total : 0);
  }
  return new Blob(chunks, { type: 'application/zip' });
}

// Pages and images from other sites, fetched through the worker (browsers block direct reads).
export async function fetchPage(url) {
  if (!key) throw new Error('Sign in to add links: ebis fetches pages through your Cloudflare worker.');
  const res = await api(`/fetch?url=${encodeURIComponent(url)}`);
  return { blob: await res.blob(), url: res.headers.get('x-final-url') || url };
}
export const fetchBlob = async url => (await fetchPage(url)).blob;
