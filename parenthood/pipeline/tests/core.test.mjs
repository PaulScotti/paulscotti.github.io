// Unit tests for the pieces that guard content quality: dates, similarity (no-repeat), and validation.
// Run: npm test (inside parenthood/pipeline)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSimilarityIndex, countWords, countHangul, plain } from '../lib/text.mjs';
import { validateDigest } from '../lib/validate-core.mjs';
import { ptWallTimeToEpoch, todayPT, gestation, addDays, ageOn } from '../lib/dates.mjs';
import { rankCandidates, phaseWeight } from '../pull-context.mjs';
import { loadCurriculum } from '../lib/env.mjs';

const nuggets = [
  { text: 'Sperm can survive up to about 5 days in fertile cervical mucus, while the egg survives about 12-24 hours after ovulation.', day: 1, date: '2026-09-27' },
  { text: 'Only about 30% of women have their entire fertile window within cycle days 10-17.', day: 1, date: '2026-09-27' },
  { text: 'Daily ejaculation keeps normal sperm counts normal, whereas abstinence longer than about 5 days can lower sperm counts.', day: 1, date: '2026-09-27' },
];

test('similarity flags a reworded repeat and passes a new fact', () => {
  const best = buildSimilarityIndex(nuggets);
  const reworded = best('The egg lives only 12-24 hours after ovulation, but sperm can survive up to five days in fertile mucus.');
  const fresh = best('Choline intake of 450 mg per day is recommended during pregnancy, and most prenatal vitamins contain far less.');
  assert.ok(reworded.score >= 0.48, `reworded repeat scored ${reworded.score}`);
  assert.equal(reworded.match.day, 1);
  assert.ok(fresh.score < 0.3, `new fact scored ${fresh.score}`);
});

test('text helpers', () => {
  assert.equal(plain('**Bold** and [link](https://x.y) [2, 3].'), 'Bold and link .');
  assert.equal(countWords('Six days [1], not fourteen.'), 4);
  assert.equal(countHangul('가임기 6일'), 4);
});

test('Pacific-time helpers handle DST', () => {
  const summer = new Date(ptWallTimeToEpoch('2026-07-01', 21, 30)).toISOString();
  const winter = new Date(ptWallTimeToEpoch('2026-12-01', 21, 30)).toISOString();
  assert.equal(summer, '2026-07-02T04:30:00.000Z');
  assert.equal(winter, '2026-12-02T05:30:00.000Z');
  assert.equal(todayPT(new Date('2026-09-28T06:59:00Z')), '2026-09-27');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.deepEqual(ageOn('1986-12', '2026-09-27'), { years: 39, months: 9 });
  const g = gestation({ lmp: '2026-08-30' }, '2026-09-27');
  assert.equal(g.weeks, 4);
  assert.equal(g.due, '2027-06-06');
});

test('planner avoids repeating yesterday\'s track and follows the stage', () => {
  const curriculum = loadCurriculum();
  const ledger = [{ date: '2026-09-27', day: 1, unit: 'conceive.fertile-window', track: 'conceive' }];
  const { candidates } = rankCandidates({ curriculum, ledger, date: '2026-09-28', nowPhase: 'preconception' });
  assert.ok(candidates.length > 5);
  assert.notEqual(candidates[0].track, 'conceive');
  assert.ok(!candidates.some((c) => c.id === 'conceive.fertile-window'));
  assert.ok(phaseWeight('pregnancy-1', 'preconception') < phaseWeight('preconception', 'preconception'));
  const preg = rankCandidates({ curriculum, ledger, date: '2026-09-28', nowPhase: 'pregnancy-1' }).candidates;
  assert.ok(preg.slice(0, 5).some((c) => c.phase === 'pregnancy-1'));
});

// Deterministic filler with no repeated words, so the within-digest repetition check has nothing to flag.
const SYL = ['ba', 'ko', 'ri', 'me', 'tu', 'sa', 'ne', 'lo', 'vi', 'da', 'pu', 'ge'];
const word = (n) => SYL[n % 12] + SYL[Math.floor(n / 12) % 12] + SYL[Math.floor(n / 144) % 12];
const enSentence = (i) => {
  const w = Array.from({ length: 9 }, (_, k) => word(i * 9 + k));
  return `${w[0][0].toUpperCase()}${w[0].slice(1)} ${w.slice(1).join(' ')} [${(i % 3) + 1}].`;
};
const HANGUL = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호';
const koSentence = (i) => {
  const chunk = (k) => HANGUL[(i * 7 + k) % HANGUL.length] + HANGUL[(i * 11 + k * 3) % HANGUL.length] + HANGUL[(i * 5 + k * 7) % HANGUL.length];
  return `${Array.from({ length: 8 }, (_, k) => chunk(k)).join(' ')}입니다 [${(i % 3) + 1}].`;
};

function minimalDigest(overrides = {}) {
  const edition = (lang) => ({
    title: lang === 'en' ? 'A test title' : '시험 제목',
    takeaway: lang === 'en' ? 'One clear sentence to remember.' : '기억할 한 문장입니다.',
    sections: [0, 1, 2, 3].map((i) => ({
      heading: lang === 'en' ? `Heading ${i}` : `제목 ${i}`,
      body: Array.from({ length: 13 }, (_, k) => (lang === 'en' ? enSentence(i * 13 + k) : koSentence(i * 13 + k))).join(' '),
    })),
    forUs: lang === 'en' ? 'Your prenatal lists 265 mg, so an egg a day would close most of the gap [3].' : '두 분의 산전 영양제에는 265mg이 들어 있어 달걀 하나를 더하면 대부분 채울 수 있습니다 [3].',
  });
  return {
    schema: 2, date: '2026-10-01', unit: 'body.choline', track: 'body', depth: 'core', buildsOn: [], addresses: [],
    en: edition('en'), ko: edition('ko'), figures: [],
    sources: [1, 2, 3].map((i) => ({ title: `S${i}`, publisher: 'P', year: 2024, url: `https://example.org/${i}`, type: 'study' })),
    glossary: [{ en: 'a', ko: '가' }, { en: 'b', ko: '나' }],
    nuggets: ['Choline needs rise to 450 mg a day in pregnancy.', 'Two eggs supply roughly 300 mg of choline.', 'Most prenatal vitamins contain little choline.',
      'A feeding trial linked 930 mg daily to faster infant processing.', 'Estrogen-driven choline synthesis varies with a common gene variant.', 'The adult upper limit is 3.5 grams a day.'],
    keywords: ['choline'],
    ...overrides,
  };
}

test('validator accepts a well-formed digest and rejects common failures', () => {
  const ok = validateDigest(minimalDigest(), { ledger: [] });
  assert.deepEqual(ok.errors, []);
  const noKo = validateDigest(minimalDigest({ ko: undefined }), { ledger: [] });
  assert.ok(noKo.errors.some((e) => e.startsWith('ko')));
  const html = minimalDigest();
  html.en.sections[0].body += ' <script>alert(1)</script>';
  assert.ok(validateDigest(html, { ledger: [] }).errors.some((e) => /HTML/.test(e)));
  const badCite = minimalDigest();
  badCite.en.forUs += ' [9]';
  assert.ok(validateDigest(badCite, { ledger: [] }).errors.some((e) => /citation \[9\]/.test(e)));
  const repeat = minimalDigest({ nuggets: [nuggets[0].text, 'x one', 'y two', 'z three', 'w four', 'v five'] });
  const ledger = [{ date: '2026-09-27', day: 1, unit: 'conceive.fertile-window', track: 'conceive', nuggets: nuggets.map((n) => n.text), title: 'T', takeaway: 'T' }];
  assert.ok(validateDigest(repeat, { ledger }).errors.some((e) => /possible repeat of Day 1/.test(e)));
  const sameUnit = minimalDigest({ unit: 'conceive.fertile-window', track: 'conceive' });
  assert.ok(validateDigest(sameUnit, { ledger }).errors.some((e) => /already covered/.test(e)));
});

test('retired fields and within-digest repetition are rejected', () => {
  const quote = minimalDigest();
  quote.en.nugget = { text: 'A quote', who: 'Someone', source: 1 };
  quote.en.talk = 'What do you think?';
  const errs = validateDigest(quote, { ledger: [] }).errors;
  assert.ok(errs.some((e) => /en\.nugget: no longer used/.test(e)));
  assert.ok(errs.some((e) => /en\.talk: no longer used/.test(e)));
  const echo = minimalDigest();
  echo.en.forUs = `${echo.en.sections[1].body.split('. ')[2]}.`;
  assert.ok(validateDigest(echo, { ledger: [] }).errors.some((e) => /restates an earlier point/.test(e)));
});

test('the emailed question: validated, never two days in a row, shown only to whom it is for', async () => {
  const { renderEmail } = await import('../send-email.mjs');
  const { mergeKorean } = await import('../lib/korean.mjs');
  const ask = { to: 'yoolim', en: 'When did your last period start?', ko: '지난 생리가 시작된 날짜를 알려 주시겠습니까?' };
  assert.deepEqual(validateDigest(minimalDigest({ ask }), { ledger: [] }).errors, []);

  const errs = (a, ledger = []) => validateDigest(minimalDigest({ ask: a }), { ledger }).errors;
  assert.ok(errs({ ...ask, en: 'Tell us your last period date.' }).some((e) => /ask\.en: must be a question/.test(e)));
  assert.ok(errs({ ...ask, to: 'doctor' }).some((e) => /ask\.to/.test(e)));
  assert.ok(errs({ ...ask, ko: '지난 생리가 언제 시작됐는지 알려 주실래요?' }).some((e) => /ask\.ko: 해요체/.test(e)));
  const yesterday = [{ date: '2026-09-30', day: 3, unit: 'x.y', track: 'body', nuggets: [], ask: { to: 'paul', en: 'When is the appointment?' } }];
  assert.ok(errs(ask, yesterday).some((e) => /never ask two days in a row/.test(e)));

  const digest = { ...minimalDigest({ ask }), day: 4 };
  const ko = renderEmail({ digest, lang: 'ko', link: 'https://x', name: '유이', who: 'yoolim' });
  const en = renderEmail({ digest, lang: 'en', link: 'https://x', name: 'Paul', who: 'paul' });
  assert.ok(ko.html.includes('지난 생리가 시작된 날짜를 알려 주시겠습니까?') && ko.text.includes('여쭙고 싶은 점'));
  assert.ok(!en.html.includes('A quick question') && !en.text.includes('last period'));
  const both = renderEmail({ digest: { ...digest, ask: { ...ask, to: 'both' } }, lang: 'en', link: 'https://x', name: 'Paul', who: 'paul' });
  assert.ok(both.html.includes('When did your last period start?'));
  assert.ok(!renderEmail({ digest: minimalDigest(), lang: 'en', link: 'https://x', who: 'paul' }).html.includes('A quick question'));

  const reviewed = { ...digest, ask: { ...ask, ko: '지난 생리 시작일을 알려 주시겠습니까?', en: 'changed' } };
  const merged = mergeKorean(digest, reviewed);
  assert.equal(merged.ask.ko, '지난 생리 시작일을 알려 주시겠습니까?');
  assert.equal(merged.ask.en, ask.en);
});

test('a reported period start gives the cycle day while trying, and is ignored once stale', async () => {
  const { currentPhase } = await import('../pull-context.mjs');
  assert.equal(currentPhase({ stage: 'ttc', lmp: '2026-09-22' }, '2026-09-29').cycleDay, 8);
  assert.equal(currentPhase({ stage: 'ttc', lmp: '2026-07-01' }, '2026-09-29').cycleDay, undefined);
  assert.equal(currentPhase({ stage: 'ttc' }, '2026-09-29').phase, 'preconception');
  assert.equal(currentPhase({ stage: 'pregnant', lmp: '2026-09-22' }, '2026-11-17').phase, 'pregnancy-1');
});

test('a failed generation is remembered with its fix, for the 8:30pm alert', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { recordFailure, failureNote } = await import('../lib/alert.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-status-'));
  assert.equal(failureNote(dir, '2026-09-29'), '');
  recordFailure(dir, '2026-09-29', 'claude-token');
  assert.match(failureNote(dir, '2026-09-29'), /setup\.mjs --claude/);
  assert.equal(failureNote(dir, '2026-09-30'), '');
  fs.rmSync(dir, { recursive: true, force: true });
});
