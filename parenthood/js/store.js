// Encrypted data access. The password → PBKDF2-SHA256 (iterations from keyinfo.json) → AES-GCM key, derived once per device
// and remembered in IndexedDB as a non-extractable key. Matches pipeline/lib/crypto.mjs.
import { DATA_URL } from './config.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const BASE = LOCAL ? new URL('.data/', location.href).href : DATA_URL;
const te = new TextEncoder();
const td = new TextDecoder();
let key = null;
let keyinfo = null;

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const normalizePassphrase = (p) => String(p).normalize('NFKC').trim(); // case-sensitive, like the pipeline

async function fetchJSON(name, { fresh = false } = {}) {
  const res = await fetch(BASE + name, { cache: fresh ? 'no-cache' : 'default' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function decryptFile(name, { fresh = false } = {}) {
  const env = await fetchJSON(`${name}.enc`, { fresh });
  if (!env) return null;
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv), additionalData: te.encode(`parenthood:${name}`) }, key, b64(env.ct));
  return JSON.parse(td.decode(pt));
}

// ---- tiny IndexedDB key-value store (for the non-extractable CryptoKey) ----
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('parenthood', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbDo(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode);
    const req = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}
const idbGet = (k) => idbDo('readonly', (s) => s.get(k)).catch(() => undefined);
const idbSet = (k, v) => idbDo('readwrite', (s) => s.put(v, k)).catch(() => undefined);
const idbDel = (k) => idbDo('readwrite', (s) => s.delete(k)).catch(() => undefined);

/** Returns keyinfo, or null when the data branch doesn't exist yet (setup pending). */
export async function init() {
  keyinfo = await fetchJSON('keyinfo.json', { fresh: true });
  return keyinfo;
}

/** Try the key remembered on this device. Resolves to the index, or null if a passphrase is needed. */
export async function resume() {
  const saved = await idbGet('key');
  if (!saved?.key || saved.salt !== keyinfo?.salt) return null;
  key = saved.key;
  try {
    return await decryptFile('index', { fresh: true });
  } catch {
    key = null;
    return null;
  }
}

/** Derive the key from the passphrase; throws 'wrong-passphrase' if it doesn't decrypt. */
export async function unlock(passphrase) {
  const base = await crypto.subtle.importKey('raw', te.encode(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64(keyinfo.salt), iterations: keyinfo.iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  );
  let index;
  try {
    index = await decryptFile('index', { fresh: true });
  } catch (e) {
    key = null;
    throw new Error(e.name === 'OperationError' ? 'wrong-passphrase' : 'offline');
  }
  if (!index) { key = null; throw new Error('offline'); }
  await idbSet('key', { key, salt: keyinfo.salt });
  return index;
}

export async function lock() {
  key = null;
  await idbDel('key');
}

export const index = () => decryptFile('index', { fresh: true });
export const digest = (date) => decryptFile(`d/${date}`);

export async function exportAll(idx) {
  const out = { exportedAt: new Date().toISOString(), index: idx, digests: {} };
  for (const d of idx.days || []) out.digests[d.date] = await digest(d.date);
  return out;
}

// ---- per-device preferences and the doctor list (localStorage) ----
const ls = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export const prefs = {
  get reader() { return ls.get('ph.reader'); },
  set reader(v) { ls.set('ph.reader', v); },
};
export const questions = {
  all() { return ls.get('ph.questions', []); },
  save(list) { ls.set('ph.questions', list); },
  add(q) { const list = this.all(); list.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, done: false, at: Date.now(), ...q }); this.save(list); return list; },
  update(id, patch) { const list = this.all().map((x) => (x.id === id ? { ...x, ...patch } : x)); this.save(list); return list; },
  remove(id) { const list = this.all().filter((x) => x.id !== id); this.save(list); return list; },
};
