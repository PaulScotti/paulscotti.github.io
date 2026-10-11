#!/usr/bin/env node
// Daily orchestrator. Every run first reads new emailed notes and reactions; then, unless today's digest exists:
//   pull private context → the writer (Claude Code, headless) plans, researches and writes → validate (2 repair rounds)
//   → fact-check: a fresh session checks each claim against the source it cites and fixes both languages
//   → Korean review: a fresh session edits only the Korean; English problems it notices go back to the fact-checker
//   → publish into the encrypted data checkout (the workflow commits and pushes it).
// Each later step's edits are kept only if the digest still validates. The repo is public and so are its Actions logs:
// print counts and status only, never content, topics or anything about the couple's situation.
//
// Usage: node generate.mjs --data <dir> [--date YYYY-MM-DD] [--force] [--model id] [--effort level] [--no-publish]
//        [--keep] [--no-fact-check] [--no-ko-review] [--local] [--timeout-min 45]
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
// Pinned to Opus 5.5 at extra-high reasoning effort. If that model is ever unavailable (overloaded or retired), the
// CLI falls back to the newest Opus, and the log line after each run names the model that actually answered.
const model = args.model || process.env.PARENTHOOD_MODEL || 'claude-opus-5-5';
const effort = args.effort || process.env.PARENTHOOD_EFFORT || 'xhigh';
const FALLBACK_MODEL = 'opus';
const WRITE_MIN = Number(args['timeout-min'] || 45);
const VALIDATE = path.join(PIPELINE_DIR, 'validate.mjs');
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;

let store = null;

/**
 * Stop without publishing. Unattended runs email the owner: at once when only a person can fix it (the Claude token),
 * otherwise once a second attempt for the same day has failed, while there is still time before 8:30pm.
 */
async function failed(reason, message) {
  log(`FAILED: ${message}. Nothing published.`);
  if (store) {
    try {
      const attempts = recordFailure(store.dir, date, reason, { runUrl });
      const alertNow = reason === 'claude-token' || attempts >= 2;
      if (process.env.EVENT === 'schedule' && alertNow && (await alertOnce(store, date, reason))) log('Emailed the site owner what happened and how to fix it.');
    } catch (e) {
      log(`Could not record or email the failure (${e.code || e.name}).`);
    }
  }
  process.exit(1);
}
// Error messages can quote file contents, so only the error's type reaches the (public) log.
const crashed = (e) => failed('crash', `unexpected ${e?.name || 'error'}${e?.code ? ` (${e.code})` : ''}`);
process.on('uncaughtException', crashed);
process.on('unhandledRejection', crashed);

if (!isDateStr(date)) throw new Error(`bad --date ${date}`);
if (!process.env.PARENTHOOD_PASSPHRASE) {
  log('PARENTHOOD_PASSPHRASE is not set yet - skipping (see parenthood/SETUP.md).');
  process.exit(0);
}
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY && !args.local) {
  log('No CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY - skipping (see parenthood/SETUP.md). Use --local to use this machine\'s Claude login.');
  process.exit(0);
}

store = Store.open(path.resolve(args.data || 'data'), process.env.PARENTHOOD_PASSPHRASE);

// Every run reads new emailed notes and reactions, even when today's digest already exists, so they are stored within hours.
try {
  log(describeInbox(await fetchInbox(store)));
} catch (e) {
  log(`Inbox unavailable (${e.code || e.name}); continuing without new notes.`);
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
log(`Generating Day ${brief.day} for ${date} (${brief.coveredUnits.length} prior digests; ${brief.openInbox} open notes; ${model}, effort ${effort})`);

const loadPrompt = (name) => fs.readFileSync(path.join(PIPELINE_DIR, 'prompts', name), 'utf8')
  .replaceAll('{{DAY}}', String(brief.day))
  .replaceAll('{{DATE}}', date)
  .replaceAll('{{WEEKDAY}}', weekdayOf(date))
  .replaceAll('{{WORK}}', workDir)
  .replaceAll('{{PIPELINE}}', PIPELINE_DIR);

// Only what Claude needs: the passphrase and mail credentials never reach the model's environment.
const childEnv = {};
for (const k of ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TMPDIR', 'TERM',
  'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME']) {
  if (process.env[k]) childEnv[k] = process.env[k];
}
childEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
childEnv.DISABLE_AUTOUPDATER = '1';

const allowed = ['WebSearch', 'WebFetch', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'TodoWrite', `Bash(node ${VALIDATE}:*)`];
const modelsUsed = new Set();

function runClaude(promptText, { resume, timeout } = {}) {
  return new Promise((resolve) => {
    const cliArgs = ['-p', promptText, '--model', model, '--effort', effort, '--fallback-model', FALLBACK_MODEL,
      '--output-format', 'json', '--permission-mode', 'dontAsk'];
    if (resume) cliArgs.push('--resume', resume);
    cliArgs.push('--allowedTools', ...allowed); // variadic: keep last
    const outFile = path.join(workDir, `claude-${Date.now()}.json`);
    const out = fs.openSync(outFile, 'w');
    const child = spawn(process.env.CLAUDE_BIN || 'claude', cliArgs, { cwd: workDir, env: childEnv, stdio: ['ignore', out, out] });
    const timer = setTimeout(() => { log('Claude run timed out; stopping it.'); child.kill('SIGTERM'); }, timeout || WRITE_MIN * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.closeSync(out);
      let sessionId = null;
      let authError = false;
      const raw = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
      try {
        const json = JSON.parse(raw.slice(raw.indexOf('{')));
        sessionId = json.session_id || null;
        const models = Object.keys(json.modelUsage || {});
        models.forEach((m) => modelsUsed.add(m));
        // A login problem fails on the first request; later errors (limits, timeouts) are not about the token.
        authError = Boolean(json.is_error) && (json.num_turns ?? 0) <= 1
          && /authenticat|oauth|api key|invalid.{0,20}token|token.{0,20}(expired|revoked|invalid)|\b40[13]\b/i.test(json.result || '');
        log(`Claude finished (exit ${code}; ${json.num_turns ?? '?'} turns; ${Math.round((json.duration_ms || 0) / 60000)} min${models.length ? `; ${models.join(', ')}` : ''})${authError ? ' - AUTHENTICATION FAILED: renew CLAUDE_CODE_OAUTH_TOKEN' : ''}`);
        // An error before any work is the CLI's own message (never digest content), so it is safe to show.
        if (json.is_error && (json.num_turns ?? 0) <= 1) log(`Claude said: ${String(json.result || json.subtype || '').replace(/\s+/g, ' ').slice(0, 200)}`);
      } catch {
        log(`Claude finished (exit ${code}); no JSON result: ${raw.replace(/\s+/g, ' ').slice(0, 200)}`);
      }
      resolve({ code, sessionId, authError });
    });
  });
}

const tokenRejected = () => failed('claude-token', 'Claude rejected CLAUDE_CODE_OAUTH_TOKEN. Fix: on your Mac run `node parenthood/pipeline/setup.mjs --claude`');
async function claude(promptText, opts) {
  const run = await runClaude(promptText, opts);
  if (run.authError) await tokenRejected();
  return run;
}

const digestFile = path.join(workDir, 'digest.json');
const work = (f) => path.join(workDir, f);
const readWorkJSON = (f) => {
  try { return JSON.parse(fs.readFileSync(work(f), 'utf8')); } catch { return null; }
};
const writeDigest = (d) => fs.writeFileSync(digestFile, JSON.stringify(d, null, 2));
const fixPrompt = (errors, note = '') => `${digestFile} fails validation:\n${errors.map((e) => `- ${e}`).join('\n')}\n\n`
  + `${note ? `${note} ` : ''}Fix every error (edit the file), re-run \`node ${VALIDATE} ${digestFile}\` until it prints VALID, then reply DONE.`;

// Fields only the writer decides; later steps can't change them.
const IDENTITY = ['schema', 'date', 'unit', 'track', 'depth', 'buildsOn', 'addresses', 'planNote', 'unitProposals'];

/** Read digest.json and run the full checks (format, Korean, no-repeat, then source URLs). */
async function check({ keepFrom } = {}) {
  let digest;
  try {
    digest = JSON.parse(fs.readFileSync(digestFile, 'utf8'));
  } catch (e) {
    return { digest: null, errors: [fs.existsSync(digestFile) ? `digest.json is not valid JSON (${e.name})` : 'digest.json was not written'] };
  }
  if (keepFrom && digest && typeof digest === 'object') {
    for (const k of IDENTITY) {
      if (keepFrom[k] === undefined) delete digest[k];
      else digest[k] = keepFrom[k];
    }
  }
  const res = validateDigest(digest, { ledger, curriculum: loadCurriculum() });
  if (digest?.date !== date) res.errors.push(`date: must be ${date}`);
  if (!res.errors.length) res.errors.push(...(await checkUrls(digest)).errors);
  return { digest, ...res };
}

/** Fact-check in a fresh session; its edits (both languages, sources, nuggets) are kept only if the digest still validates. */
async function factCheck(res) {
  const before = res.digest;
  let run = await claude(loadPrompt('fact-check.md'), { timeout: 30 * 60_000 });
  let out = await check({ keepFrom: before });
  if (out.errors.length && run.sessionId) {
    log(`Fact-check left ${out.errors.length} validation error(s); one repair round.`);
    run = await claude(fixPrompt(out.errors, 'Keep your fact fixes; repair only what broke.'), { resume: run.sessionId, timeout: 15 * 60_000 });
    out = await check({ keepFrom: before });
  }
  if (out.errors.length) {
    writeDigest(before);
    log(`Fact-check discarded (${out.errors.length} validation error(s) after its edits); keeping the writer's version.`);
    return { result: res, session: run.sessionId };
  }
  writeDigest(out.digest);
  const r = readWorkJSON('fact-check.json') || {};
  const n = (x) => (Array.isArray(x) ? x.length : 0);
  log(`Fact-check: ${Number(r.checked) || 0} claim(s) checked, ${n(r.fixed)} fixed, ${n(r.unverified)} not verifiable.`);
  return { result: out, session: run.sessionId };
}

/**
 * Second opinion on the Korean: a fresh session compares it with the English and edits only Korean fields. Its edits
 * are kept only if the merged digest still validates. Returns its reusable lessons and any English problems it noticed.
 */
async function reviewKorean(res) {
  const original = res.digest;
  const vetted = () => {
    let reviewed;
    try { reviewed = JSON.parse(fs.readFileSync(digestFile, 'utf8')); } catch { return { errors: ['digest.json is not valid JSON'] }; }
    const merged = mergeKorean(original, reviewed);
    const v = validateDigest(merged, { ledger, curriculum: loadCurriculum() });
    const strayEdits = JSON.stringify(withoutKorean(reviewed)) !== JSON.stringify(withoutKorean(original));
    return { merged, strayEdits, ...v };
  };

  let run = await claude(loadPrompt('review-ko.md'), { timeout: 25 * 60_000 });
  let out = vetted();
  if (out.errors.length && run.sessionId) {
    log(`Korean review left ${out.errors.length} validation error(s); one repair round.`);
    run = await claude(fixPrompt(out.errors, 'Fix these in the Korean fields only.'), { resume: run.sessionId, timeout: 15 * 60_000 });
    out = vetted();
  }
  const review = readWorkJSON('ko-review.json') || {};
  const concerns = (Array.isArray(review.englishConcerns) ? review.englishConcerns : [])
    .filter((c) => typeof c === 'string' && c.trim()).slice(0, 8).map((c) => c.slice(0, 400));
  if (out.errors.length) {
    writeDigest(original);
    log(`Korean review discarded (${out.errors.length} validation error(s) after its edits); keeping the writer's Korean.`);
    return { result: res, lessons: [], concerns };
  }
  writeDigest(out.merged);
  const lessons = (Array.isArray(review.lessons) ? review.lessons : [])
    .filter((l) => l && typeof l.key === 'string' && typeof l.rule === 'string')
    .slice(0, 5)
    .map((l) => ({ key: l.key.slice(0, 48), rule: l.rule.slice(0, 240), before: String(l.before || '').slice(0, 160), after: String(l.after || '').slice(0, 160) }));
  log(`Korean review: ${countKoreanEdits(original, out.merged)} Korean field(s) revised, ${lessons.length} lesson(s) noted`
    + `${concerns.length ? `, ${concerns.length} possible issue(s) in the English flagged` : ''}${out.strayEdits ? '; edits outside the Korean fields were ignored' : ''}.`);
  return { result: { digest: out.merged, errors: [], warnings: out.warnings, stats: out.stats }, lessons, concerns };
}

/** The Korean editor's English concerns go to the fact-checker (same session when there is one: it has the sources). */
async function resolveConcerns(res, concerns, session) {
  const before = res.digest;
  const ask = `The Korean editor has now reviewed the digest (re-read ${digestFile}: it has changed) and flagged possible problems in the English:\n`
    + `${concerns.map((c) => `- ${c}`).join('\n')}\n\n`
    + 'Check each against the cited sources (open them again if needed) and the context files. Where a concern is right, fix the '
    + 'English, the matching Korean sentence (formal 합니다체; leave the rest of the Korean as the editor left it) and any nugget '
    + `that states the same fact. Where it is not, change nothing. Write ${work('concerns.json')} as {"fixed": <n>, "dismissed": <n>}, `
    + `re-run \`node ${VALIDATE} ${digestFile}\` until it prints VALID, then reply DONE.`;
  await claude(session ? ask : `${loadPrompt('fact-check.md')}\n\n${ask}`, { resume: session || undefined, timeout: 20 * 60_000 });
  const out = await check({ keepFrom: before });
  if (out.errors.length) {
    writeDigest(before);
    log(`English concerns: changes discarded (${out.errors.length} validation error(s)).`);
    return res;
  }
  writeDigest(out.digest);
  const r = readWorkJSON('concerns.json') || {};
  log(`English concerns: ${concerns.length} flagged, ${Number(r.fixed) || 0} fixed, ${Number(r.dismissed) || 0} dismissed.`);
  return out;
}

// ---- the writer -------------------------------------------------------------------------------------------------
const prompt = loadPrompt('generate.md');
let run = await claude(prompt, { timeout: WRITE_MIN * 60_000 });
let result = await check();
for (let round = 1; round <= 2 && result.errors.length; round++) {
  log(`Validation failed with ${result.errors.length} error(s); repair round ${round}.`);
  const fix = fixPrompt(result.errors);
  run = await claude(run.sessionId ? fix : `${prompt}\n\n${fix}`, { resume: run.sessionId || undefined, timeout: 20 * 60_000 });
  result = await check();
}
if (result.errors.length) {
  await failed(result.digest ? 'invalid' : 'claude',
    result.digest ? `digest still invalid after repairs (${result.errors.length} errors)` : 'Claude did not produce a digest');
}
const stats = result.stats || {};
log(`Valid digest: ${stats.enWords} EN words, ${stats.koHangul} KO syllables, max repeat ${stats.maxRepeat ?? 0}.`);

// ---- fact-check, Korean review, English concerns ----------------------------------------------------------------
let factSession = null;
if (!args['no-fact-check']) ({ result, session: factSession } = await factCheck(result));
let koLessons = [];
if (!args['no-ko-review']) {
  const review = await reviewKorean(result);
  result = review.result;
  koLessons = review.lessons;
  if (review.concerns.length && !args['no-fact-check']) result = await resolveConcerns(result, review.concerns, factSession);
}

if (args['no-publish']) {
  log(`--no-publish: left in ${workDir}`);
  process.exit(0);
}
const pub = publishDigest(store, result.digest, {
  generator: {
    tool: 'claude-code', model, effort, models: [...modelsUsed], at: new Date().toISOString(),
    factCheck: !args['no-fact-check'], koReview: !args['no-ko-review'],
  },
  stateUpdate: cleanStateUpdate(readWorkJSON('state-update.json')),
  factsUpdate: readWorkJSON('facts-update.json'),
  koLessons,
});
log(`Published ${date} as Day ${pub.day}.`);
if (!args.keep) fs.rmSync(workDir, { recursive: true, force: true });
