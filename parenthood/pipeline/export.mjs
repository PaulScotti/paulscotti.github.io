#!/usr/bin/env node
// Decrypt everything in the data checkout into pipeline/private/exports/<timestamp>/ (a readable backup).
// Usage: PARENTHOOD_PASSPHRASE=… node export.mjs --data ../.data
import fs from 'node:fs';
import path from 'node:path';
import { Store } from './lib/store.mjs';
import { parseArgs, log, writeJSON, PRIVATE_DIR, SITE_DIR } from './lib/env.mjs';

const args = parseArgs();
const store = Store.open(path.resolve(args.data || path.join(SITE_DIR, '.data')), process.env.PARENTHOOD_PASSPHRASE);
const out = path.join(PRIVATE_DIR, 'exports', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
writeJSON(path.join(out, 'private.json'), store.readPrivate());
writeJSON(path.join(out, 'index.json'), store.readIndex());
const dDir = path.join(store.dir, 'd');
const dates = fs.existsSync(dDir) ? fs.readdirSync(dDir).filter((f) => f.endsWith('.enc')).map((f) => f.slice(0, -4)) : [];
for (const d of dates) writeJSON(path.join(out, 'digests', `${d}.json`), store.readDigest(d));
log(`Exported ${dates.length} digests + index + private state to ${out}`);
