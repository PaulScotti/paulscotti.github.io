// Korean-edition guards: 합니다체 endings, numbers and citations kept per section, known mistranslations, the merge
// that applies the Korean review, and the Korean strings in the site and email templates.
// Run: npm test (inside parenthood/pipeline)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { koEnding, registerProblems, enNumbers, koNumbers, missingNumbers, checkKorean, mergeKorean, withoutKorean, countKoreanEdits } from '../lib/korean.mjs';
import { PIPELINE_DIR, SITE_DIR } from '../lib/env.mjs';

test('sentence endings: 합니다체 passes, 해요체 and 해라체 do not', () => {
  const cases = {
    '임신은 배란일까지의 6일 동안만 가능합니다 [1].': 'formal',
    '같은 검사실의 결과끼리 비교해야 합니까?': 'formal',
    '오타가 없는지 확인한 뒤 다시 입력해 주십시오.': 'formal',
    '‘곧’이 아니라 ‘바로 지금’이라는 신호입니다.”': 'formal',
    'LH 테스트는 8일째부터 시작하는 것이 좋습니다(가장 짧은 주기 23일 기준).': 'formal',
    '다시 입력해 주세요.': 'haeyo',
    '이 기기에서는 누가 읽나요?': 'haeyo',
    'LH 테스트는 8일째부터 시작하세요 (가장 짧은 주기 23일 기준).': 'haeyo',
    '그게 핵심이죠.': 'haeyo',
    '정자는 5일까지 산다.': 'plain',
    '약 6%뿐.': 'other',
    '용어 정리': 'fragment',
  };
  for (const [s, kind] of Object.entries(cases)) assert.equal(koEnding(s), kind, s);
  assert.deepEqual(registerProblems('첫 문장입니다. 둘째 문장이에요.\n- 셋째 항목입니다 [2].').map((p) => p.kind), ['haeyo']);
});

test('numbers: the Korean must keep every significant number, reading 만 and skipping US units', () => {
  assert.deepEqual([...enNumbers('Across 600,000+ cycles, 6% of 221 women; day 8; 98.6°F; 5 lb; 1.5 million; 0.18 days')].sort((a, b) => a - b),
    [0.18, 6, 221, 600000, 1500000]);
  assert.ok(koNumbers('60만 개 이상의 주기').has(600000));
  assert.ok(koNumbers('1만 2,000명').has(12000));
  assert.deepEqual(missingNumbers('about 33% around ovulation, 1,681 cycles', '약 33%, 1681개 주기'), []);
  assert.deepEqual(missingNumbers('each extra 10 ng/mL tracked with 12% lower risk', '10ng/mL 높을 때마다 위험이 13% 낮았습니다'), [12]);
});

// A structurally valid pair of editions to exercise checkKorean on.
function pair(enBody, koBody, extra = {}) {
  return {
    en: { title: 'T', takeaway: 'One sentence [1].', forUs: 'For you [2].', sections: [{ heading: 'H', body: enBody }] },
    ko: { title: '제목', takeaway: '한 문장입니다 [1].', forUs: '두 분께 드리는 말씀입니다 [2].', sections: [{ heading: '소제목', body: koBody }] },
    figures: [],
    glossary: [],
    ...extra,
  };
}
function run(d) {
  const errors = [];
  const warnings = [];
  checkKorean(d, { err: (p, m) => errors.push(`${p}: ${m}`), warn: (p, m) => warnings.push(`${p}: ${m}`) });
  return { errors, warnings };
}

test('checkKorean catches the mistakes found in the first two digests', () => {
  const good = run(pair('It suggests supplements, citing fewer small-for-age babies; doses ranged from 600 to 5,000 IU a day [2].',
    '부당경량아(임신 주수에 비해 작은 아기) 위험을 낮출 가능성 때문에 보충을 제안하며, 용량은 하루 600~5,000IU였습니다 [2].'));
  assert.deepEqual(good.errors, []);

  const sga = run(pair('It cites fewer small-for-age babies [2].', '저체중아 위험을 낮출 가능성 때문입니다 [2].'));
  assert.ok(sga.errors.some((e) => /부당경량아/.test(e)));

  const score = run(pair('A level in the low 30s [1].', '비타민 D 30점대 초반입니다 [1].'));
  assert.ok(score.errors.some((e) => /점대/.test(e)));

  const fish = run(pair('Only a few foods: fatty fish, egg yolks [1].', '등푸른생선, 달걀노른자 등 몇 가지뿐입니다 [1].'));
  assert.ok(fish.warnings.some((w) => /등푸른생선/.test(w)));

  const register = run(pair('Check for typos [1].', '오타를 확인하고 다시 입력해 주세요 [1].'));
  assert.ok(register.errors.some((e) => /해요체/.test(e)));

  const cites = run(pair('Fact one [1]. Fact two [3].', '첫째 사실입니다 [1]. 둘째 사실입니다.'));
  assert.ok(cites.errors.some((e) => /citations missing/.test(e) && /\[3\]/.test(e)));

  const numbers = run(pair('Odds rose to 33% [1].', '확률이 크게 올랐습니다 [1].'));
  assert.ok(numbers.errors.some((e) => /numbers in the English are missing from the Korean: 33/.test(e)));
});

test('mergeKorean takes only Korean fields from the review', () => {
  const original = {
    ...pair('Fact [1].', '사실입니다 [1].'),
    figures: [{ id: 'f1', type: 'widget', widget: 'fertile-window', caption: { en: 'Slide it.', ko: '막대를 움직이세요.' } }],
    glossary: [{ en: 'fertile window', ko: '가임기', noteEn: 'Six days.', noteKo: '6일입니다.' }],
    nuggets: ['Fact.'],
  };
  original.ko.sections[0].figure = 'f1';
  original.en.sections[0].figure = 'f1';
  const reviewed = structuredClone(original);
  reviewed.ko.sections[0].body = '고친 문장입니다 [1].';
  reviewed.ko.sections[0].figure = 'zzz'; // structure is not the reviewer's to change
  reviewed.figures[0].caption.ko = '슬라이더를 움직여 보십시오.';
  reviewed.glossary[0].noteKo = '배란일까지의 6일입니다.';
  reviewed.en.sections[0].body = 'The reviewer rewrote the English.';
  reviewed.nuggets = [];
  const merged = mergeKorean(original, reviewed);
  assert.equal(merged.ko.sections[0].body, '고친 문장입니다 [1].');
  assert.equal(merged.ko.sections[0].figure, 'f1');
  assert.equal(merged.figures[0].caption.ko, '슬라이더를 움직여 보십시오.');
  assert.equal(merged.glossary[0].noteKo, '배란일까지의 6일입니다.');
  assert.equal(merged.en.sections[0].body, 'Fact [1].');
  assert.deepEqual(merged.nuggets, ['Fact.']);
  assert.deepEqual(withoutKorean(merged), withoutKorean(original));
  assert.equal(countKoreanEdits(original, merged), 3);
});

// Every Korean sentence the site and emails show must be 합니다체 too.
function hangulLiterals(source) {
  const out = [];
  for (const m of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
    const s = (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, 'X').replace(/<[^>]+>/g, '');
    if (/[가-힣]/.test(s)) out.push(s);
  }
  return out;
}

test('Korean strings in the site and email templates are 합니다체', () => {
  const files = ['js/i18n.js', 'js/figures.js', 'js/app.js', 'js/digest.js'].map((f) => path.join(SITE_DIR, f))
    .concat(path.join(PIPELINE_DIR, 'send-email.mjs'));
  const problems = [];
  for (const f of files) {
    for (const s of hangulLiterals(fs.readFileSync(f, 'utf8'))) {
      for (const p of registerProblems(s)) problems.push(`${path.basename(f)}: ${p.kind}: ${p.sentence}`);
    }
  }
  assert.deepEqual(problems, []);
});
