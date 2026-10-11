// Planning, feedback, lasting facts, Korean house rules, the richer email and failure alerts.
// Run: npm test (inside parenthood/pipeline)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rankCandidates, nowQuota, phaseWeight, feedbackByTrack, koLessonsContext } from '../pull-context.mjs';
import { cleanFactsUpdate, mergeFacts, mergeKoRules } from '../publish.mjs';
import { feedbackLink, parseFeedback } from '../lib/feedback.mjs';
import { recordFailure, failureNote } from '../lib/alert.mjs';
import { renderEmail } from '../send-email.mjs';
import { loadCurriculum } from '../lib/env.mjs';

const curriculum = loadCurriculum();
const entry = (day, unit) => {
  const u = curriculum.units.find((x) => x.id === unit);
  return { day, date: `2026-03-${String(day).padStart(2, '0')}`, unit, track: u?.track || unit.split('.')[0] };
};

test('while behind on "now" topics, the planner puts them first', () => {
  // A week of mostly later-stage topics: only 2 of 7 were about trying to conceive.
  const ledger = [entry(1, 'conceive.fertile-window'), entry(2, 'parenting.bilingual'), entry(3, 'life.childcare'),
    entry(4, 'us.intimacy-ttc'), entry(5, 'life.registry'), entry(6, 'baby.car-seat-no-car'), entry(7, 'life.first-year-costs')];
  const q = nowQuota({ ledger, units: curriculum.units, nowPhase: 'preconception' });
  assert.equal(q.nowLast7, 2);
  assert.equal(q.behind, true);
  assert.ok(q.priorityNowLeft.includes('conceive.semen-analysis'));
  const { candidates } = rankCandidates({ curriculum, ledger, date: '2026-03-08', nowPhase: 'preconception' });
  assert.ok(candidates.slice(0, 5).every((c) => c.phase === 'preconception'), candidates.slice(0, 5).map((c) => c.id).join(', '));
  // Baby and birth topics are far off while trying.
  assert.ok(phaseWeight('newborn', 'preconception') < 0.3);
  assert.ok(phaseWeight('pregnancy-1', 'preconception') > phaseWeight('newborn', 'preconception') * 2);
});

test('priority topics for now come before lower-priority ones of the same stage', () => {
  // On quota (5 of 7 "now"), but priority-1 topics remain: they still lead.
  const ledger = [entry(1, 'conceive.fertile-window'), entry(2, 'pregnancy.choosing-hospital'), entry(3, 'parenting.bilingual'),
    entry(4, 'us.intimacy-ttc'), entry(5, 'pregnancy.choosing-care'), entry(6, 'life.insurance'), entry(7, 'body.prenatal-audit')];
  const { candidates, quota } = rankCandidates({ curriculum, ledger, date: '2026-03-08', nowPhase: 'preconception' });
  assert.equal(quota.behind, false);
  const top = candidates.slice(0, 4);
  assert.ok(top.every((c) => c.pri === 1 && c.phase === 'preconception'), top.map((c) => c.id).join(', '));
});

test('a topic tied to an upcoming date and their feedback move up the list', () => {
  const ledger = [entry(1, 'conceive.fertile-window')];
  const base = rankCandidates({ curriculum, ledger, date: '2026-03-02', nowPhase: 'preconception' }).candidates;
  const withTrip = rankCandidates({
    curriculum, ledger, date: '2026-03-02', nowPhase: 'preconception',
    upcoming: [{ from: '2026-03-12', what: 'Scouting trip (housing)', startsInDays: 10, ongoing: false }],
  }).candidates;
  const score = (list, id) => list.find((c) => c.id === id)?.score ?? -1;
  assert.ok(score(withTrip, 'life.city-scorecard') > score(base, 'life.city-scorecard') + 0.2);
  const liked = rankCandidates({ curriculum, ledger, date: '2026-03-02', nowPhase: 'preconception', feedbackByTrack: { body: 3 } }).candidates;
  assert.ok(score(liked, 'body.medication-review') > score(base, 'body.medication-review'));
  assert.deepEqual(feedbackByTrack([{ track: 'body', vote: 1, date: '2026-03-01' }, { track: 'body', vote: -1, date: '2025-01-01' }], '2026-03-02'), { body: 1 });
});

test('one-tap feedback links round-trip through the inbox parser', () => {
  const href = feedbackLink('us+digest@gmail.com', 14, -1, 'ko');
  assert.match(href, /^mailto:us\+digest@gmail\.com\?subject=Feedback%20Day%2014%3A%20less%20like%20this&body=/);
  const subject = decodeURIComponent(href.match(/subject=([^&]+)/)[1]);
  const body = decodeURIComponent(href.match(/body=(.+)$/)[1]);
  assert.deepEqual(parseFeedback(`Re: ${subject}`, body), { day: 14, vote: -1, comment: '' });
  assert.deepEqual(parseFeedback(subject, `${body}Too basic for us.`), { day: 14, vote: -1, comment: 'Too basic for us.' });
  assert.equal(parseFeedback('Re: Day 14 · Vitamin D', 'thanks'), null);
});

test('lasting facts are validated, replaced when they change, and removable', () => {
  assert.equal(cleanFactsUpdate({ set: { 'Bad Key!': 'x' } }), null);
  const u1 = cleanFactsUpdate({ set: { 'move.city': 'Moving to Seattle on Dec 5.', 'insurance.plan': 'PPO via Paul.' } });
  let facts = mergeFacts({}, u1, '2026-10-20');
  facts = mergeFacts(facts, cleanFactsUpdate({ set: { 'move.city': 'Staying in Oakland.' }, remove: ['insurance.plan'] }), '2026-11-02');
  assert.deepEqual(facts, { 'move.city': { value: 'Staying in Oakland.', date: '2026-11-02' } });
});

test('Korean lessons are counted by key; recurring ones become house rules', () => {
  const lesson = (key) => ({ key, rule: `rule ${key}`, before: 'a', after: 'b' });
  let rules = mergeKoRules({}, [lesson('haeyo-ending'), lesson('sga-term')], '2026-10-01');
  rules = mergeKoRules(rules, [lesson('haeyo-ending')], '2026-10-02');
  assert.equal(rules['haeyo-ending'].count, 2);
  const ctx = koLessonsContext({ koRules: rules, koLessons: [{ type: 'old' }] });
  assert.deepEqual(ctx.houseRules.map((r) => r.key), ['haeyo-ending']);
  assert.deepEqual(ctx.recent.map((r) => r.key), ['sga-term']);
  assert.equal(ctx.older.length, 1);
});

test('the email carries the note for the two of them and feedback links', () => {
  const digest = {
    date: '2026-10-11', day: 15,
    en: { title: 'T', takeaway: 'One line [1].', forUs: 'For you **two** [2].' },
    ko: { title: '제목', takeaway: '한 줄입니다 [1].', forUs: '두 분께 드리는 말씀입니다 [2].' },
  };
  const en = renderEmail({ digest, lang: 'en', link: 'https://x', name: 'Paul', who: 'paul', replyTo: 'us+digest@gmail.com' });
  assert.ok(en.html.includes('For the two of you') && en.html.includes('For you two'));
  assert.ok(en.html.includes('Feedback%20Day%2015%3A%20more%20like%20this') && en.text.includes('Less like this'));
  const ko = renderEmail({ digest, lang: 'ko', link: 'https://x', name: '유이', who: 'yoolim', replyTo: 'us+digest@gmail.com' });
  assert.ok(ko.html.includes('두 분을 위해') && ko.html.includes('이런 내용 더 보기'));
  assert.ok(!renderEmail({ digest, lang: 'en', link: 'https://x', who: 'paul' }).html.includes('mailto:'));
});

test('failures are counted per day, and the 8:30pm alert says why with the run log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-status-'));
  assert.equal(recordFailure(dir, '2026-10-11', 'invalid', { runUrl: 'https://github.com/x/y/actions/runs/1' }), 1);
  assert.equal(recordFailure(dir, '2026-10-11', 'invalid'), 2);
  const note = failureNote(dir, '2026-10-11');
  assert.match(note, /failing its checks/);
  assert.equal(failureNote(dir, '2026-10-12'), '');
  recordFailure(dir, '2026-10-12', 'crash', { runUrl: 'https://github.com/x/y/actions/runs/2' });
  assert.match(failureNote(dir, '2026-10-12'), /Run log: https:\/\/github\.com\/x\/y\/actions\/runs\/2/);
  fs.rmSync(dir, { recursive: true, force: true });
});
