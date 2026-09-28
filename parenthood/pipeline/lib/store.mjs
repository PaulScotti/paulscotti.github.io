// File-based store over a checkout of the `parenthood-data` branch. Layout (all .enc files are encrypted):
//   keyinfo.json   KDF salt + parameters (public by design)
//   index.enc      what the site needs: day list (titles, takeaways, glossary), readers, reply-to, stage
//   d/<date>.enc   one digest per day
//   private.enc    pipeline-only state: profile, members (emails), stage, ledger, inbox, backlog, mail cursor
//   status.json    non-sensitive bookkeeping: last published day, which days were emailed
import fs from 'node:fs';
import path from 'node:path';
import { deriveKey, seal, open, newKeyInfo } from './crypto.mjs';

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, d) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(d, null, 1)}\n`);
};

export const EMPTY_PRIVATE = () => ({
  profile: {}, members: [], state: { stage: 'ttc' }, ledger: [], inbox: [], backlog: [], mail: { lastUid: 0 },
});

export class Store {
  constructor(dir, key) {
    this.dir = dir;
    this.key = key;
  }

  /** Open an existing store (verifies the passphrase) or, with create=true, initialize a new one. */
  static open(dir, passphrase, { create = false } = {}) {
    if (!passphrase) throw new Error('PARENTHOOD_PASSPHRASE is not set');
    const kiFile = path.join(dir, 'keyinfo.json');
    if (!fs.existsSync(kiFile)) {
      if (!create) throw new Error(`No keyinfo.json in ${dir} (run setup first)`);
      writeJSON(kiFile, newKeyInfo());
    }
    const store = new Store(dir, deriveKey(passphrase, readJSON(kiFile)));
    if (fs.existsSync(path.join(dir, 'private.enc'))) {
      try {
        store.readPrivate();
      } catch {
        throw new Error('Wrong passphrase for this data (could not decrypt private.enc)');
      }
    }
    return store;
  }

  file(name) { return path.join(this.dir, `${name}.enc`); }
  has(name) { return fs.existsSync(this.file(name)); }
  read(name, fallback = null) { return this.has(name) ? open(this.key, name, readJSON(this.file(name))) : fallback; }
  write(name, data) { writeJSON(this.file(name), seal(this.key, name, data)); }

  readPrivate() { return { ...EMPTY_PRIVATE(), ...(this.read('private') || {}) }; }
  writePrivate(p) { this.write('private', p); }
  readIndex() { return this.read('index', { days: [], readers: [], replyTo: '', stage: { stage: 'ttc' } }); }
  writeIndex(i) { this.write('index', { ...i, updated: new Date().toISOString() }); }
  readDigest(date) { return this.read(`d/${date}`); }
  writeDigest(date, d) { this.write(`d/${date}`, d); }
  hasDigest(date) { return this.has(`d/${date}`); }

  readStatus() {
    const f = path.join(this.dir, 'status.json');
    return fs.existsSync(f) ? readJSON(f) : { emailed: {} };
  }
  writeStatus(s) { writeJSON(path.join(this.dir, 'status.json'), s); }
}

/** Notes for the digest are emailed to <mailbox>+digest@…; replies to the nightly email go there too. */
export function replyAddress(mailbox) {
  return mailbox && mailbox.includes('@') ? mailbox.replace('@', '+digest@') : '';
}

/** The part of the private state the site may see (reader names/languages, the reply address, the stage). */
export function publicIndexFields(priv) {
  return {
    readers: (priv.members || []).map((m) => ({ key: m.key, lang: m.lang, name: m.name })),
    replyTo: replyAddress(priv.mailbox),
    stage: priv.state || { stage: 'ttc' },
  };
}
