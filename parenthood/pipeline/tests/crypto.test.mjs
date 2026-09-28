// The browser decrypts with WebCrypto what the pipeline encrypts with node:crypto: prove they agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { newKeyInfo, deriveKey, seal, open, generatePassphrase, normalizePassphrase } from '../lib/crypto.mjs';
import { Store } from '../lib/store.mjs';
import { stripQuoted, isAuthenticated } from '../inbox.mjs';

const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64'));

async function browserOpen(passphrase, keyinfo, name, env) {
  const { subtle } = webcrypto;
  const base = await subtle.importKey('raw', new TextEncoder().encode(normalizePassphrase(passphrase)), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt: b64(keyinfo.salt), iterations: keyinfo.iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv), additionalData: new TextEncoder().encode(`parenthood:${name}`) }, key, b64(env.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

test('node seal → WebCrypto open round-trips; surrounding spaces are ignored but case matters', async () => {
  const ki = { ...newKeyInfo(), iterations: 1000 };
  const env = seal(deriveKey('Kp7mX2q', ki), 'd/2026-09-27', { hello: '안녕하세요', n: 1 });
  assert.deepEqual(await browserOpen('  Kp7mX2q ', ki, 'd/2026-09-27', env), { hello: '안녕하세요', n: 1 });
  await assert.rejects(browserOpen('kp7mx2q', ki, 'd/2026-09-27', env));
});

test('wrong passphrase and swapped file names are rejected', async () => {
  const ki = { ...newKeyInfo(), iterations: 1000 };
  const key = deriveKey('right horse battery', ki);
  const env = seal(key, 'index', { a: 1 });
  await assert.rejects(browserOpen('wrong horse battery', ki, 'index', env));
  assert.throws(() => open(key, 'private', env));
  assert.deepEqual(open(key, 'index', env), { a: 1 });
});

test('generated passwords are 7 characters mixing lower, upper and digits, without look-alikes', () => {
  for (let i = 0; i < 200; i++) {
    const p = generatePassphrase();
    assert.equal(p.length, 7);
    assert.match(p, /[a-z]/);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[2-9]/);
    assert.doesNotMatch(p, /[01ilIoO]/);
  }
  assert.notEqual(generatePassphrase(), generatePassphrase());
});

test('store verifies the passphrase on open', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ph-store-'));
  fs.writeFileSync(path.join(dir, 'keyinfo.json'), JSON.stringify({ ...newKeyInfo(), iterations: 1000 }));
  const s = Store.open(dir, 'Yh7kQ3w', { create: true });
  s.writePrivate({ members: [{ key: 'paul' }] });
  s.writeDigest('2026-09-27', { day: 1 });
  assert.equal(Store.open(dir, ' Yh7kQ3w ').readDigest('2026-09-27').day, 1);
  assert.throws(() => Store.open(dir, 'yh7kq3w'), /Wrong passphrase/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('email notes keep only what was written', () => {
  const reply = 'We got a positive test today!\nLMP was Jan 5.\n\nOn Sun, Sep 27, 2026 at 9:30 PM Parenthood Digest <x@gmail.com> wrote:\n> Day 1 · The six fertile days\n> ...';
  assert.equal(stripQuoted(reply), 'We got a positive test today!\nLMP was Jan 5.');
  const ko = '다음에는 산후조리에 대해 알고 싶어요.\n\n2026년 9월 27일 (일) 오후 9:30, Parenthood Digest <x@gmail.com>님이 작성:\n> 1일차';
  assert.equal(stripQuoted(ko), '다음에는 산후조리에 대해 알고 싶어요.');
  const h = new Map([['authentication-results', 'mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601; spf=pass']]);
  assert.equal(isAuthenticated(h, new Set(['\\Inbox'])), true);
  assert.equal(isAuthenticated(new Map([['authentication-results', 'mx.google.com; dkim=fail; spf=softfail']]), new Set(['\\Inbox'])), false);
  assert.equal(isAuthenticated(new Map(), new Set(['\\Sent'])), true);
});
