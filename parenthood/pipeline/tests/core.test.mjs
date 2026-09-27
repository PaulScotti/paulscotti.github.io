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

function minimalDigest(overrides = {}) {
  const para = 'Evidence sentence with a number, 42 percent, and a citation [1]. '.repeat(12);
  const ko = '근거가 있는 문장입니다. 숫자와 인용이 들어 있습니다 [1]. '.repeat(40);
  const edition = (lang) => ({
    title: lang === 'en' ? 'A test title' : '시험 제목',
    dek: lang === 'en' ? 'A short dek.' : '짧은 소개입니다.',
    takeaway: lang === 'en' ? 'One clear sentence to remember.' : '기억할 한 문장입니다.',
    sections: [
      { heading: lang === 'en' ? 'One' : '하나', body: lang === 'en' ? para : ko },
      { heading: lang === 'en' ? 'Two' : '둘', body: lang === 'en' ? para : ko },
    ],
    nugget: { text: lang === 'en' ? 'An expert idea.' : '전문가의 생각입니다.', who: 'Dr. Test', source: 1 },
    forUs: lang === 'en' ? para : ko,
    talk: lang === 'en' ? 'What do you think?' : '어떻게 생각하시나요?',
    askDoctor: [],
  });
  return {
    schema: 1, date: '2026-10-01', unit: 'body.choline', track: 'body', depth: 'core', buildsOn: [], addresses: [],
    en: edition('en'), ko: edition('ko'), figures: [],
    sources: [1, 2, 3].map((i) => ({ title: `S${i}`, publisher: 'P', year: 2024, url: `https://example.org/${i}`, type: 'study' })),
    glossary: [{ en: 'a', ko: '가' }, { en: 'b', ko: '나' }],
    nuggets: ['Choline needs rise in pregnancy.', 'Eggs are a rich choline source.', 'Many prenatals lack choline.', 'An RCT linked higher choline to faster infant processing.'],
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
  const repeat = minimalDigest({ nuggets: [nuggets[0].text, 'x one', 'y two', 'z three'] });
  const ledger = [{ date: '2026-09-27', day: 1, unit: 'conceive.fertile-window', track: 'conceive', nuggets: nuggets.map((n) => n.text), title: 'T', takeaway: 'T' }];
  assert.ok(validateDigest(repeat, { ledger }).errors.some((e) => /possible repeat of Day 1/.test(e)));
  const sameUnit = minimalDigest({ unit: 'conceive.fertile-window', track: 'conceive' });
  assert.ok(validateDigest(sameUnit, { ledger }).errors.some((e) => /already covered/.test(e)));
});
