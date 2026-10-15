// node --test godwit/todo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, setKey, setPri, toggleCtx, setText, complete, next, quick, merge, remove, addChild } from './todo.js';

const WED = '2026-10-14', SAT = '2026-10-17';

test('a line is read into its parts and edits keep the other tokens where they were', () => {
  const line = '(A) 2026-10-06 Hand in the camera ready @Paul due:2026-10-12 l:30m notes:"Check the \\"final\\" PDF"';
  const t = parse(line);
  assert.deepEqual([t.pri, t.created, t.text, t.ctx, t.due, t.notes], ['A', '2026-10-06', 'Hand in the camera ready l:30m', ['Paul'], '2026-10-12', 'Check the "final" PDF']);
  assert.equal(setKey(line, 'due', '2026-10-20'), line.replace('2026-10-12', '2026-10-20'));
  assert.equal(setKey(setKey(line, 'notes', 'two\nlines'), 'notes', 'Check the "final" PDF'), line);
  assert.equal(setPri(toggleCtx(toggleCtx(line, 'personal'), 'Personal'), 'A'), line);
  assert.equal(toggleCtx(line, 'Personal'), line.replace('@Paul', '@Paul @Personal'));
  assert.equal(toggleCtx('2026-10-14 Call mom due:2026-10-15', 'Personal'), '2026-10-14 Call mom @Personal due:2026-10-15');
  assert.equal(setText(line, 'Hand in the camera-ready l:30m @paul'), '(A) 2026-10-06 Hand in the camera-ready l:30m @Paul due:2026-10-12 notes:"Check the \\"final\\" PDF"');
  assert.equal(setText('Pay rent due:2026-02-30 @Home', 'Pay the rent due:2026-03-01'), 'Pay the rent due:2026-03-01 @Home'); // only what was understood is kept
  assert.deepEqual([parse('Pay rent due:2026-02-30').due, parse('Pay rent due:2026-02-30').text], [null, 'Pay rent due:2026-02-30']); // not a date
  const done = parse('x 2026-07-21 2026-06-23 Age prediction @Chris');
  assert.deepEqual([done.done, done.doneDate, done.created, done.text], [true, '2026-07-21', '2026-06-23', 'Age prediction']);
});

test('done marks the steps too and unpins, and a repeat comes back after its missed days', () => {
  const lines = ['(A) 2026-10-08 5-min journaling due:2026-10-09 rec:+1b pin:2026-10-12 @Personal', '\t2026-10-08 Find the notebook @Personal', 'Other'];
  assert.equal(parse(lines[0]).pin, '2026-10-12');
  assert.deepEqual(complete(lines, 0, WED), [
    'x 2026-10-14 2026-10-08 5-min journaling due:2026-10-09 rec:+1b @Personal',
    '\tx 2026-10-14 2026-10-08 Find the notebook @Personal',
    '(A) 2026-10-14 5-min journaling due:2026-10-15 rec:+1b @Personal',
    'Other',
  ]);
  assert.equal(complete(['x 2026-10-14 2026-10-08 Laundry'], 0, WED)[0], '2026-10-08 Laundry');
  assert.equal(next(parse('Prep all hands due:2026-10-20 rec:+1w'), WED), '2026-10-27');  // done early: the next week
  assert.equal(next(parse('Prep all hands due:2026-09-28 rec:+1w'), WED), '2026-10-19');  // late: the next Monday to come
  assert.equal(next(parse('Water plants rec:3d'), WED), '2026-10-17');                   // from the day it's done
  assert.equal(next(parse('Korean due:2026-10-16 rec:1b'), '2026-10-16'), '2026-10-19');  // Friday to Monday
  assert.equal(next(parse('Rent due:2026-01-31 rec:+1m'), '2026-02-01'), '2026-02-28');
});

test('removing a task removes its subtasks, and a subtask goes after its siblings', () => {
  const lines = ['A', '\tA1', '\t\tA1a', 'B'];
  assert.deepEqual(remove(lines, 1), ['A', 'B']);
  assert.deepEqual(addChild(lines, 0, '2026-10-14 A2'), ['A', '\tA1', '\t\tA1a', '\t2026-10-14 A2', 'B']);
});

test('quick add reads a date or repeat said at the end, and nowhere else', () => {
  const add = (s, today = WED) => quick(s, today, ['Paul', 'Personal'], ['Paul']);
  assert.equal(add('Call mom tomorrow @personal'), '2026-10-14 Call mom @Personal due:2026-10-15');
  assert.equal(add('Reply to Alex by fri'), '2026-10-14 Reply to Alex @Paul due:2026-10-16');
  assert.equal(add('Dentist oct 20th'), '2026-10-14 Dentist @Paul due:2026-10-20');
  assert.equal(add('Renew passport 3 march'), '2026-10-14 Renew passport @Paul due:2027-03-03');
  assert.equal(add('Plan the trip in two weeks'), '2026-10-14 Plan the trip @Paul due:2026-10-28');
  assert.equal(add('Book review next week'), '2026-10-14 Book review @Paul due:2026-10-19');
  assert.equal(add('(B) Laundry this weekend'), '(B) 2026-10-14 Laundry @Paul due:2026-10-17');
  assert.equal(add('Pay rent monthly on the 1st'), '2026-10-14 Pay rent @Paul due:2026-11-01 rec:+1m');
  assert.equal(add('Journal every weekday', SAT), '2026-10-17 Journal @Paul due:2026-10-19 rec:+1b');
  assert.equal(add('Prep all hands every monday'), '2026-10-14 Prep all hands @Paul due:2026-10-19 rec:+1w');
  assert.equal(add('Back up photos every 2 months'), '2026-10-14 Back up photos @Paul due:2026-10-14 rec:+2m');
  assert.equal(add('May the best idea win in the morning'), '2026-10-14 May the best idea win in the morning @Paul');
  assert.equal(add('Tomorrow'), '2026-10-14 Tomorrow @Paul');
  assert.equal(add('Ship it due:2026-11-02 tomorrow'), '2026-10-14 Ship it due:2026-11-02 tomorrow @Paul');
});

test('merging two devices keeps both sides, and a lost edit never happens', () => {
  const base = 'Alpha due:2026-10-15\nBeta\nGamma\n';
  // Different tasks changed on each device.
  assert.equal(merge(base, 'x 2026-10-14 Alpha due:2026-10-15\nBeta\nGamma\n', 'Alpha due:2026-10-15\nBeta @Paul\nGamma\n'),
    'x 2026-10-14 Alpha due:2026-10-15\nBeta @Paul\nGamma\n');
  // Both added a task at the end, or made the same change.
  assert.equal(merge(base, base + 'Mine\n', base + 'Theirs\n'), base + 'Theirs\nMine\n');
  assert.equal(merge(base, base + 'Same\n', base + 'Same\n'), base + 'Same\n');
  // The same task changed two ways keeps both; changed on one device and deleted on the other keeps the change.
  assert.equal(merge(base, 'Alpha due:2026-10-16\nBeta\nGamma\n', 'Alpha due:2026-10-17\nBeta\nGamma\n'), 'Alpha due:2026-10-17\nAlpha due:2026-10-16\nBeta\nGamma\n');
  assert.equal(merge(base, 'Alpha due:2026-10-15\nBeta!\nGamma\n', 'Alpha due:2026-10-15\nGamma\n'), 'Alpha due:2026-10-15\nBeta!\nGamma\n');
  // A new device that added tasks before its first sync has no base: both lists are kept.
  assert.equal(merge('', 'Mine\n', base), base + 'Mine\n');
  // Undo is a merge too: it takes back one edit and keeps what changed since.
  const before = base, after = 'Alpha due:2026-10-15\nGamma\n', now = 'Alpha due:2026-10-15\nGamma @Personal\nDelta\n';
  assert.equal(merge(after, now, before), 'Alpha due:2026-10-15\nBeta\nGamma @Personal\nDelta\n');
});

test('random edits on two devices: every added line survives and every removed line stays gone', () => {
  let seed = 7;
  const rand = n => (seed = (seed * 16807) % 2147483647) % n;
  for (let round = 0; round < 300; round++) {
    const base = Array.from({ length: 1 + rand(30) }, (_, i) => `task ${round}.${i}`);
    const edit = (who) => {
      const a = [...base];
      for (let k = rand(6); k--; ) {
        const i = rand(a.length + 1), line = `${who} ${round}.${k}`;
        if (rand(3) === 0 && i < a.length) a.splice(i, 1); // delete
        else if (rand(2) && i < a.length) a[i] = line; // change
        else a.splice(i, 0, line); // add
      }
      return { a, added: a.filter(l => !base.includes(l)), removed: base.filter(l => !a.includes(l)) };
    };
    const mine = edit('mine'), theirs = edit('theirs');
    const out = merge(base.join('\n') + '\n', mine.a.join('\n') + '\n', theirs.a.join('\n') + '\n').split('\n').slice(0, -1);
    for (const l of [...mine.added, ...theirs.added]) assert.ok(out.includes(l), `lost ${l}`);
    for (const l of [...mine.removed, ...theirs.removed]) assert.ok(!out.includes(l), `kept ${l}`);
    assert.deepEqual(out.filter(l => base.includes(l)), base.filter(l => out.includes(l))); // kept tasks keep their order
  }
  // A changed line keeps its place next to a line the other device added below it.
  assert.equal(merge('L0\nL1\nL2\n', 'L0\nL1 changed\nL2\n', 'L0\nL1\nX\nL2\n'), 'L0\nL1 changed\nX\nL2\n');
});
