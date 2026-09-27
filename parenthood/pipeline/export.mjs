#!/usr/bin/env node
// Back up everything (digests, overview, ledger, members, state, inbox, feedback, questions, meta, private) to
// pipeline/private/exports/<timestamp>/ as JSON. Usage: node export.mjs --key <service-account.json>
import path from 'node:path';
import { initDb, useKeyFile, toPlain } from './lib/db.mjs';
import { parseArgs, log, writeJSON, PRIVATE_DIR } from './lib/env.mjs';

const args = parseArgs();
if (args.key) useKeyFile(args.key);
const db = initDb();
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dir = path.join(PRIVATE_DIR, 'exports', stamp);
let total = 0;
for (const name of ['digests', 'overview', 'ledger', 'members', 'state', 'inbox', 'feedback', 'questions', 'meta', 'private']) {
  const snap = await db.collection(name).get();
  writeJSON(path.join(dir, `${name}.json`), Object.fromEntries(snap.docs.map((d) => [d.id, toPlain(d.data())])));
  total += snap.size;
}
log(`Exported ${total} documents to ${dir}`);
process.exit(0);
