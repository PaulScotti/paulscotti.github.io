// Encryption for everything stored in the public repo's `parenthood-data` branch.
// passphrase --PBKDF2-SHA256 (600k iterations, random salt)--> 256-bit key --AES-GCM--> {v, iv, ct}
// The browser (js/store.js) derives the same key with WebCrypto and decrypts; the file name is bound as AAD so
// encrypted files can't be swapped for one another.
import crypto from 'node:crypto';

export const ITERATIONS = 600000;

/** Forgiving on phones: case, surrounding spaces and repeated spaces don't matter. */
export function normalizePassphrase(p) {
  return String(p).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function newKeyInfo() {
  return {
    v: 1, kdf: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS,
    salt: crypto.randomBytes(16).toString('base64'), created: new Date().toISOString().slice(0, 10),
  };
}

export function deriveKey(passphrase, keyinfo) {
  return crypto.pbkdf2Sync(normalizePassphrase(passphrase), Buffer.from(keyinfo.salt, 'base64'), keyinfo.iterations, 32, 'sha256');
}

export function seal(key, name, data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`parenthood:${name}`));
  const ct = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(data))), cipher.final(), cipher.getAuthTag()]);
  return { v: 1, iv: iv.toString('base64'), ct: ct.toString('base64') };
}

export function open(key, name, envelope) {
  const buf = Buffer.from(envelope.ct, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(`parenthood:${name}`));
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  const pt = Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

/** Pronounceable, phone-friendly passphrase: four CVCVCV groups (~80 bits), e.g. "kovite-rasumo-pelado-nitaku". */
export function generatePassphrase(groups = 4) {
  const C = 'bdfghjklmnprstvz';
  const V = 'aeiou';
  const pick = (s) => s[crypto.randomInt(s.length)];
  return Array.from({ length: groups }, () => Array.from({ length: 3 }, () => pick(C) + pick(V)).join('')).join('-');
}
