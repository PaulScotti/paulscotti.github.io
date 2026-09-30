#!/usr/bin/env node
// Daily orchestrator: (skip if today's digest exists) → fetch emailed notes → pull private context → run Claude
// Code headless to plan, research and write → validate (up to 2 repair rounds) → a separate Claude session reviews
// the Korean edition against the English → publish into the encrypted data checkout. The GitHub workflow commits
// and pushes the data branch afterwards. Logs are public in GitHub Actions, so this prints status only, never content.
//
// Usage: node generate.mjs --data <data dir> [--date YYYY-MM-DD] [--force] [--model opus] [--no-publish] [--keep]
//        [--no-ko-review]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Store } from './lib/store.mjs';
import { pullContext } from './pull-context.mjs';
import { fetchInbox, describeInbox } from './inbox.mjs';
import { validateDigest } from './lib/validate-core.mjs';
import { mergeKorean, withoutKorean, countKoreanEdits } from './lib/korean.mjs';
import { recordFailure, alertOnce } from './lib/alert.mjs';
import { checkUrls } from './validate.mjs';
import { publishDigest, cleanStateUpdate } from './publish.mjs';
import { loadCurriculum, parseArgs, log, PIPELINE_DIR, WORK_ROOT } from './lib/env.mjs';
import { todayPT, weekdayOf, isDateStr } from './lib/dates.mjs';

const args = parseArgs();
const date = args.date || todayPT();
const model = args.model || process.env.PARENTHOOD_MODEL || 'opus';
const timeoutMs = Number(args['timeout-min'] || 50) * 60_000;

if (!isDateStr(date)) throw new Error(`bad --date ${date}`);
if (!process.env.PARENTHOOD_PASSPHRASE) {
  log('PARENTHOOD_PASSPHRASE is not set yet - skipping (see parenthood/SETUP.md).');
  process.exit(0);
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY && !args.local) {
  log('No CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY - skipping (see parenthood/SETUP.md). Use --local to use this machine\'s Claude login.');
  process.exit(0);
}

const store = Store.open(path.resolve(args.data || 'data'), process.env.PARENTHOOD_PASSPHRASE);

// Every run reads new emailed notes, even when today's digest already exists, so a reply is stored within hours.
try {
  log(describeInbox(await fetchInbox(store)));
} catch (e) {
  log(`Inbox unavailable (${e.code || e.message}); continuing without new notes.`);
}

if (store.hasDigest(date) && !args.force) {
  log(`Digest for ${date} already exists; nothing to do.`);
  process.exit(0);
}

const workDir = path.join(WORK_ROOT, `${date}-${Date.now()}`);
fs.mkdirSync(workDir, { recursive: true });
const { brief, ledger } = pullContext(store, { date, workDir });
// Reference files are copied in so Claude never needs access to the pipeline folder itself.
fs.mkdirSync(path.join(workDir, 'ref'), { recursive: true });
for (const f of ['curriculum.json', 'schema.md', 'ko-style.md']) fs.copyFileSync(path.join(PIPELINE_DIR, f), path.join(workDir, 'ref', f));
log(`Generating Day ${brief.day} for ${date} (${brief.coveredUnits.length} prior digests; stage: ${brief.stage.stage || 'ttc'}; ${brief.openInbox} open notes)`);

const loadPrompt = (name) => fs.readFileSync(path.join(PIPELINE_DIR, 'prompts', name), 'utf8')
  .replaceAll('{{DAY}}', String(brief.day))
  .replaceAll('{{DATE}}', date)
  .replaceAll('{{WEEKDAY}}', weekdayOf(date))
  .replaceAll('{{WORK}}', workDir)
  .replaceAll('{{PIPELINE}}', PIPELINE_DIR);
const prompt = loadPrompt('generate.md');

// Only what Claude needs: the passphrase and mail credentials never reach the model's environment.
const childEnv = {};
for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM',
  'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME']) {
  if (process.env[k]) childEnv[k] = process.env[k];
}
childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
childEnv.DISABLE_AUTOUPDATER = '1';

const allowed = ['WebSearch', 'WebFetch', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'TodoWrite',
  `Bash(node ${path.join(PIPELINE_DIR, 'validate.mjs')}:*)`];

function runClaude(promptText, { resume, timeout = timeoutMs } = {}) {
  return new Promise((resolve) => {
    const cliArgs = ['-p', promptText, '--model', model, '--output-format', 'json', '--permission-mode', 'dontAsk'];
    if (resume) cliArgs.push('--resume', resume);
    cliArgs.push('--allowedTools', ...allowed); // variadic: keep last
    const outFile = path.join(workDir, `claude-${Date.now()}.json`);
    const out = fs.openSync(outFile, 'w');
    const child = spawn(process.env.CLAUDE_BIN || 'claude', cliArgs, { cwd: workDir, env: childEnv, stdio: ['ignore', out, out] });
    const timer = setTimeout(() => { log('Claude run timed out; stopping it.'); child.kill('SIGTERM'); }, timeout);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.closeSync(out);
      let sessionId = null;
      let authError = false;
      const raw = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
      try {
        const json = JSON.parse(raw.slice(raw.indexOf('{')));
        sessionId = json.session_id || null;
        // A login problem fails on the first request; later errors (limits, timeouts) are not about the token.
        authError = Boolean(json.is_error) && (json.num_turns ?? 0) <= 1
          && /authenticat|oauth|api key|invalid.{0,20}token|token.{0,20}(expired|revoked|invalid)|\b40[13]\b/i.test(json.result || '');
        log(`Claude finished (exit ${code}; ${json.num_turns ?? '?'} turns; ${Math.round((json.duration_ms || 0) / 60000)} min)${authError ? ' - AUTHENTICATION FAILED: renew CLAUDE_CODE_OAUTH_TOKEN' : ''}`);
        // An error before any work is the CLI's own message (never digest content), so it is safe to show.
        if (json.is_error && (json.num_turns ?? 0) <= 1) log(`Claude said: ${String(json.result || json.subtype || '').replace(/\s+/g, ' ').slice(0, 200)}`);
      } catch {
        log(`Claude finished (exit ${code}); no JSON result: ${raw.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      resolve({ code, sessionId, authError });
    });
  });
}

const digestFile = path.join(workDir, 'digest.json');

async function check() {
  if (!fs.existsSync(digestFile)) return { digest: null, errors: ['digest.json was not written'] };
  let digest;
  try {
    digest = JSON.parse(fs.readFileSync(digestFile, 'utf8'));
  } catch (e) {
    return { digest: null, errors: [`digest.json is not valid JSON: ${e.message}`] };
  }
  const res = validateDigest(digest, { ledger, curriculum: loadCurriculum() });
  if (digest.date !== date) res.errors.push(`date: must be ${date}`);
  if (!res.errors.length) {
    const u = await checkUrls(digest);
    res.errors.push(...u.errors);
  }
  return { digest, ...res };
}

/**
 * Second opinion on the Korean: a fresh Claude session (no memory of writing it) compares the Korean with the
 * English and edits only Korean fields. Its edits are kept only if the merged digest still validates; anything it
 * changed outside the Korean fields is ignored. Returns the (possibly revised) result and the editor's lessons.
 */
async function reviewKorean(res) {
  const original = res.digest;
  const reviewFile = path.join(workDir, 'ko-review.json');
  const keepOriginal = (why) => {
    fs.writeFileSync(digestFile, JSON.stringify(original, null, 2));
    log(`Korean review ${why}; keeping the writer's Korean.`);
    return { result: res, lessons: [] };
  };
  const vetted = () => {
    let reviewed;
    try { reviewed = JSON.parse(fs.readFileSync(digestFile, 'utf8')); } catch { return { errors: ['digest.json is not valid JSON'] }; }
    const merged = mergeKorean(original, reviewed);
    const v = validateDigest(merged, { ledger, curriculum: loadCurriculum() });
    const strayEdits = JSON.stringify(withoutKorean(reviewed)) !== JSON.stringify(withoutKorean(original));
    return { merged, strayEdits, ...v };
  };

  let run = await runClaude(loadPrompt('review-ko.md'), { timeout: 25 * 60_000 });
  let out = vetted();
  if (out.errors.length && run.sessionId) {
    log(`Korean review left ${out.errors.length} validation error(s); one repair round.`);
    const fix = `After your edits, ${digestFile} fails validation:\n${out.errors.map((e) => `- ${e}`).join('\n')}\n\n` +
      `Fix these in the Korean fields only, re-run \`node ${path.join(PIPELINE_DIR, 'validate.mjs')} ${digestFile}\` until it prints VALID, then reply DONE.`;
    run = await runClaude(fix, { resume: run.sessionId, timeout: 15 * 60_000 });
    out = vetted();
  }
  if (out.errors.length) return keepOriginal(`discarded (${out.errors.length} validation error(s) after its edits)`);

  fs.writeFileSync(digestFile, JSON.stringify(out.merged, null, 2));
  let review = {};
  try { review = JSON.parse(fs.readFileSync(reviewFile, 'utf8')); } catch { /* optional */ }
  const lessons = (Array.isArray(review.issues) ? review.issues : [])
    .filter((i) => i && typeof i.before === 'string' && typeof i.after === 'string')
    .slice(0, 12)
    .map((i) => ({ type: String(i.type || '').slice(0, 20), before: i.before.slice(0, 200), after: i.after.slice(0, 200), why: String(i.why || '').slice(0, 200) }));
  const concerns = Array.isArray(review.englishConcerns) ? review.englishConcerns.length : 0;
  log(`Korean review: ${countKoreanEdits(original, out.merged)} Korean field(s) revised, ${lessons.length} lesson(s) noted` +
    `${concerns ? `, ${concerns} possible issue(s) in the English flagged` : ''}${out.strayEdits ? '; edits outside the Korean fields were ignored' : ''}.`);
  return { result: { digest: out.merged, errors: [], warnings: out.warnings, stats: out.stats }, lessons };
}

/** Claude rejected the token: retrying can't help, so say how to fix it (by email, once, for unattended runs). */
async function tokenRejected() {
  log('FAILED: Claude rejected CLAUDE_CODE_OAUTH_TOKEN. Fix: on your Mac run `node parenthood/pipeline/setup.mjs --claude`. Nothing published.');
  recordFailure(store.dir, date, 'claude-token');
  if (process.env.EVENT === 'schedule') {
    try {
      if (await alertOnce(store, date, 'claude-token')) log('Emailed the site owner how to fix it.');
    } catch (e) {
      log(`Could not email the alert (${e.code || e.message}).`);
    }
  }
  process.exit(1);
}

let run = await runClaude(prompt);
if (run.authError) await tokenRejected();
let result = await check();
for (let round = 1; round <= 2 && result.errors.length; round++) {
  log(`Validation failed with ${result.errors.length} error(s); repair round ${round}.`);
  const fix = `The digest at ${path.join(workDir, 'digest.json')} failed validation:\n` +
    result.errors.map((e) => `- ${e}`).join('\n') +
    `\n\nFix every error (edit the file), re-run \`node ${path.join(PIPELINE_DIR, 'validate.mjs')} ${path.join(workDir, 'digest.json')}\` until it prints VALID, then reply DONE.`;
  run = await runClaude(run.sessionId ? fix : `${prompt}\n\n${fix}`, { resume: run.sessionId || undefined });
  if (run.authError) await tokenRejected();
  result = await check();
}

if (result.errors.length) {
  log(`FAILED: digest still invalid after repairs (${result.errors.length} errors). Nothing published.`);
  process.exit(1);
}
const stats = result.stats || {};
log(`Valid digest: unit ${result.digest.unit}, track ${result.digest.track}, ${stats.enWords} EN words, ${stats.koHangul} KO syllables, max repeat ${stats.maxRepeat ?? 0}.`);

let koLessons = [];
if (!args['no-ko-review']) ({ result, lessons: koLessons } = await reviewKorean(result));

if (args['no-publish']) {
  log(`--no-publish: left in ${workDir}`);
  process.exit(0);
}
let stateUpdate = null;
try {
  const f = path.join(workDir, 'state-update.json');
  if (fs.existsSync(f)) stateUpdate = cleanStateUpdate(JSON.parse(fs.readFileSync(f, 'utf8')));
} catch { stateUpdate = null; }
const pub = publishDigest(store, result.digest, { generator: { tool: 'claude-code', model, at: new Date().toISOString(), koReview: !args['no-ko-review'] }, stateUpdate, koLessons });
log(`Published ${date} as Day ${pub.day}${pub.stageUpdated ? ' (journey stage updated from a note)' : ''}.`);
if (!args.keep) fs.rmSync(workDir, { recursive: true, force: true });
