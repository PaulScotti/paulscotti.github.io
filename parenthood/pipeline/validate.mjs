#!/usr/bin/env node
// Usage: node validate.mjs <digest.json> [--ledger <ledger.json>] [--no-urls]
// Default ledger: <digest dir>/context/ledger.json (written by pull-context). Exit 0 = VALID.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateDigest } from './lib/validate-core.mjs';
import { loadCurriculum, parseArgs } from './lib/env.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36';

/** Resolve each source URL. 404/410 → error (likely invented); other failures → warning (bot walls are common). */
export async function checkUrls(digest, { timeoutMs = 15000 } = {}) {
  const errors = [];
  const warnings = [];
  const targets = [
    ...(digest.sources || []).map((s, i) => [`sources[${i}]`, s.url]),
    ...(digest.figures || []).filter((f) => f.type === 'image').map((f) => [`figures.${f.id}.src`, f.src]),
  ];
  const one = async ([where, url]) => {
    if (!url) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' } });
      if (res.status === 404 || res.status === 410) errors.push(`${where}: ${url} returned ${res.status} (does this page exist?)`);
      else if (res.status >= 400) warnings.push(`${where}: ${url} returned ${res.status} (may be a bot wall)`);
      res.body?.cancel?.();
    } catch (e) {
      warnings.push(`${where}: ${url} could not be fetched (${e.name === 'AbortError' ? 'timeout' : e.message})`);
    } finally {
      clearTimeout(timer);
    }
  };
  for (let i = 0; i < targets.length; i += 4) await Promise.all(targets.slice(i, i + 4).map(one));
  return { errors, warnings };
}

async function main() {
  const args = parseArgs();
  const file = args._[0];
  if (!file) {
    console.error('usage: node validate.mjs <digest.json> [--ledger file] [--no-urls]');
    process.exit(2);
  }
  let digest;
  try {
    digest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`ERROR digest: cannot parse JSON (${e.message})`);
    console.log('INVALID (1 error)');
    process.exit(1);
  }
  const ledgerFile = args.ledger || path.join(path.dirname(path.resolve(file)), 'context', 'ledger.json');
  const raw = fs.existsSync(ledgerFile) ? fs.readFileSync(ledgerFile, 'utf8').trim() : '';
  const ledger = raw ? JSON.parse(raw) : [];
  const result = validateDigest(digest, { ledger, curriculum: loadCurriculum() });
  if (!args['no-urls'] && result.errors.length === 0) {
    const u = await checkUrls(digest);
    result.errors.push(...u.errors);
    result.warnings.push(...u.warnings);
  }
  for (const e of result.errors) console.log(`ERROR ${e}`);
  for (const w of result.warnings) console.log(`WARN  ${w}`);
  console.log(`STATS ${JSON.stringify(result.stats)}`);
  if (result.errors.length) {
    console.log(`INVALID (${result.errors.length} error${result.errors.length > 1 ? 's' : ''})`);
    process.exit(1);
  }
  console.log('VALID');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
