import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PIPELINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_DIR = path.resolve(PIPELINE_DIR, '..');
export const PRIVATE_DIR = path.join(PIPELINE_DIR, 'private');
export const WORK_ROOT = path.join(PIPELINE_DIR, 'work');
export const SITE_URL = (process.env.PARENTHOOD_SITE_URL || 'https://www.paulscotti.com/parenthood/').replace(/\/?$/, '/');

export function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export function loadCurriculum() {
  return readJSON(path.join(PIPELINE_DIR, 'curriculum.json'));
}

/** Tiny argv parser: --flag, --key value, --key=value, positional args. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > -1) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

export function log(...parts) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}]`, ...parts);
}
