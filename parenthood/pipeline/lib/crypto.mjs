// Encryption for everything stored in the public repo's `parenthood-data` branch.
// password --PBKDF2-SHA256 (5M iterations, random salt)--> 256-bit key --AES-GCM--> {v, iv, ct}
// The browser (js/store.js) derives the same key with WebCrypto and decrypts; the file name is bound as AAD so
// encrypted files can't be swapped for one another.
import crypto from 'node:crypto';

// High on purpose: the ciphertext is public, so every guess must be expensive (~1 s once per device on a phone).
export const ITERATIONS = 5000000;

/** Case-sensitive (every character counts for a short password); only surrounding spaces are ignored. */
export function normalizePassphrase(p) {
  return String(p).normalize('NFKC').trim();
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

/** Random password without look-alike characters, always mixing upper case, lower case and a digit. */
export function generatePassphrase(length = 7) {
  const sets = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789'];
  const all = sets.join('');
  for (;;) {
    const p = Array.from({ length }, () => all[crypto.randomInt(all.length)]).join('');
    if (sets.every((set) => [...p].some((ch) => set.includes(ch)))) return p;
  }
}
