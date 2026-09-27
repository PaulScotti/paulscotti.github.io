#!/usr/bin/env node
// Daily orchestrator: (skip if today's digest exists) → pull private context → run Claude Code headless to plan,
// research and write → validate (with up to 2 repair rounds) → publish. Logs are public in GitHub Actions, so this
// prints status only - never content.
//
// Usage: node generate.mjs [--date YYYY-MM-DD] [--force] [--model opus] [--no-publish] [--timeout-min 50]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { initDb, hasCredentials } from './lib/db.mjs';
import { pullContext } from './pull-context.mjs';
import { validateDigest } from './lib/validate-core.mjs';
import { checkUrls } from './validate.mjs';
import { publishDigest } from './publish.mjs';
import { loadCurriculum, parseArgs, log, PIPELINE_DIR, WORK_ROOT } from './lib/env.mjs';
import { todayPT, weekdayOf, isDateStr } from './lib/dates.mjs';

const args = parseArgs();
const date = args.date || todayPT();
const model = args.model || process.env.PARENTHOOD_MODEL || 'opus';
const timeoutMs = Number(args['timeout-min'] || 50) * 60_000;

if (!isDateStr(date)) throw new Error(`bad --date ${date}`);
if (!hasCredentials()) {
  log('No Firebase credentials configured yet - skipping (see parenthood/SETUP.md).');
  process.exit(0);
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY && !args.local) {
  log('No CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY - skipping (see parenthood/SETUP.md). Use --local to use this machine\'s Claude login.');
  process.exit(0);
}

const db = initDb();
const existing = await db.doc(`digests/${date}`).get();
if (existing.exists && !args.force) {
  log(`Digest for ${date} already exists (Day ${existing.data().day}); nothing to do.`);
  process.exit(0);
}

const workDir = path.join(WORK_ROOT, `${date}-${Date.now()}`);
fs.mkdirSync(workDir, { recursive: true });
const { brief, ledger } = await pullContext(db, { date, workDir });
// Reference files are copied in so Claude never needs access to the pipeline folder itself.
fs.mkdirSync(path.join(workDir, 'ref'), { recursive: true });
for (const f of ['curriculum.json', 'schema.md']) fs.copyFileSync(path.join(PIPELINE_DIR, f), path.join(workDir, 'ref', f));
log(`Generating Day ${brief.day} for ${date} (${brief.coveredUnits.length} prior digests; stage: ${brief.stage.stage || 'ttc'})`);

const prompt = fs.readFileSync(path.join(PIPELINE_DIR, 'prompts', 'generate.md'), 'utf8')
  .replaceAll('{{DAY}}', String(brief.day))
  .replaceAll('{{DATE}}', date)
  .replaceAll('{{WEEKDAY}}', weekdayOf(date))
  .replaceAll('{{WORK}}', workDir)
  .replaceAll('{{PIPELINE}}', PIPELINE_DIR);

// Only what Claude needs: no Firebase or mail credentials reach the model's environment.
const childEnv = {};
for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM',
  'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME']) {
  if (process.env[k]) childEnv[k] = process.env[k];
}
childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
childEnv.DISABLE_AUTOUPDATER = '1';

const allowed = ['WebSearch', 'WebFetch', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'TodoWrite',
  `Bash(node ${path.join(PIPELINE_DIR, 'validate.mjs')}:*)`];

function runClaude(promptText, { resume } = {}) {
  return new Promise((resolve) => {
    const cliArgs = ['-p', promptText, '--model', model, '--output-format', 'json', '--permission-mode', 'dontAsk'];
    if (resume) cliArgs.push('--resume', resume);
    cliArgs.push('--allowedTools', ...allowed); // variadic: keep last
    const out = fs.openSync(path.join(workDir, `claude-${Date.now()}.json`), 'w');
    const child = spawn(process.env.CLAUDE_BIN || 'claude', cliArgs, { cwd: workDir, env: childEnv, stdio: ['ignore', out, out] });
    const timer = setTimeout(() => { log('Claude run timed out; stopping it.'); child.kill('SIGTERM'); }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.closeSync(out);
      let sessionId = null;
      try {
        const files = fs.readdirSync(workDir).filter((f) => f.startsWith('claude-')).sort();
        const raw = fs.readFileSync(path.join(workDir, files.at(-1)), 'utf8');
        const json = JSON.parse(raw.slice(raw.indexOf('{')));
        sessionId = json.session_id || null;
        log(`Claude finished (exit ${code}; ${json.num_turns ?? '?'} turns; ${Math.round((json.duration_ms || 0) / 60000)} min; cost-equivalent $${(json.total_cost_usd ?? 0).toFixed(2)})`);
      } catch {
        log(`Claude finished (exit ${code}); no JSON result`);
      }
      resolve({ code, sessionId });
    });
  });
}

async function check() {
  const file = path.join(workDir, 'digest.json');
  if (!fs.existsSync(file)) return { digest: null, errors: ['digest.json was not written'] };
  let digest;
  try {
    digest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { digest: null, errors: [`digest.json is not valid JSON: ${e.message}`] };
  }
  const curriculum = loadCurriculum();
  const res = validateDigest(digest, { ledger, curriculum });
  if (digest.date !== date) res.errors.push(`date: must be ${date}`);
  if (!res.errors.length) {
    const u = await checkUrls(digest);
    res.errors.push(...u.errors);
  }
  return { digest, ...res };
}

let run = await runClaude(prompt);
let result = await check();
for (let round = 1; round <= 2 && result.errors.length; round++) {
  log(`Validation failed with ${result.errors.length} error(s); repair round ${round}.`);
  const fix = `The digest at ${path.join(workDir, 'digest.json')} failed validation:\n` +
    result.errors.map((e) => `- ${e}`).join('\n') +
    `\n\nFix every error (edit the file), re-run \`node ${path.join(PIPELINE_DIR, 'validate.mjs')} ${path.join(workDir, 'digest.json')}\` until it prints VALID, then reply DONE.`;
  run = await runClaude(run.sessionId ? fix : `${prompt}\n\n${fix}`, { resume: run.sessionId || undefined });
  result = await check();
}

if (result.errors.length) {
  log(`FAILED: digest still invalid after repairs (${result.errors.length} errors). Nothing published.`);
  process.exit(1);
}
const stats = result.stats || {};
log(`Valid digest: unit ${result.digest.unit}, track ${result.digest.track}, ${stats.enWords} EN words, ${stats.koHangul} KO syllables, max repeat ${stats.maxRepeat ?? 0}.`);

if (args['no-publish']) {
  log(`--no-publish: left in ${workDir}`);
  process.exit(0);
}
const trFile = path.join(workDir, 'translations.json');
let translations = [];
try { translations = fs.existsSync(trFile) ? JSON.parse(fs.readFileSync(trFile, 'utf8')) : []; } catch { translations = []; }
const pub = await publishDigest(db, result.digest, { generator: { tool: 'claude-code', model, at: new Date().toISOString() }, translations });
log(`Published ${date} as Day ${pub.day}${pub.translated ? ` (+${pub.translated} translations)` : ''}.`);
if (!args.keep) fs.rmSync(workDir, { recursive: true, force: true });
