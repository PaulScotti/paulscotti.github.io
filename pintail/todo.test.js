// node --test pintail/todo.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, setKey, setPri, toggleCtx, setText, complete, next, quick, merge, remove, addChild, prepare, identify, split, join, routine } from './todo.js';

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
  assert.equal(add('Pay rent monthly on the 1st'), '2026-10-14 Pay rent @Paul due:2026-11-01 rec:+1m anchor:10-01');
  assert.equal(add('Journal every weekday', SAT), '2026-10-17 Journal @Paul due:2026-10-19 rec:+1b');
  assert.equal(add('Prep all hands every monday'), '2026-10-14 Prep all hands @Paul due:2026-10-19 rec:+1w');
  assert.equal(add('Back up photos every 2 months'), '2026-10-14 Back up photos @Paul due:2026-10-14 rec:+2m');
  assert.equal(add('May the best idea win in the morning'), '2026-10-14 May the best idea win in the morning @Paul');
  assert.equal(add('Tomorrow'), '2026-10-14 Tomorrow @Paul');
  assert.equal(add('Ship it due:2026-11-02 tomorrow'), '2026-10-14 Ship it due:2026-11-02 tomorrow @Paul');
});

test('legacy identities are stable across devices and survive a pending old-app edit', async () => {
  const raw = 'Parent\n\tReview\nOther\n\tReview\n';
  const a = await identify(raw), b = await identify(raw);
  assert.equal(a, b);
  assert.equal(new Set(split(a).map(l => parse(l).uid)).size, 4);
  const edited = await identify(raw.replace('Parent', 'Renamed'), a);
  assert.equal(parse(split(a)[0]).uid, parse(split(edited)[0]).uid);
  assert.equal(await identify(a), a);
  const history = split(await identify('x 2026-10-14 Walk rec:+1d\nWalk rec:+1d\n')).map(parse);
  assert.equal(history[0].rid, history[1].rid);
  assert.equal(split('Parent\n\n\tStep\n').length, 2);
});

test('independent checklists and identical task titles keep their own identities and parents', () => {
  const a = join(prepare(['Project A', '\tReview'])), b = join(prepare(['Project B', '\tReview']));
  const out = split(merge('', a, b).text).map(parse);
  assert.equal(out.length, 4);
  for (let i = 0; i < 4; i += 2) assert.deepEqual([out[i].depth, out[i + 1].depth, out[i + 1].text], [0, 1, 'Review']);
  assert.equal(split(merge('', join(prepare(['Same'])), join(prepare(['Same']))).text).length, 2);
});

test('field merges and undo keep newer edits, and conflicting titles retain complete checklists', () => {
  const base = join(prepare(['Alpha due:2026-10-15', '\tStep', '\t\tDetail', 'Beta']));
  const mine = base.replace('Alpha', 'Renamed'), theirs = base.replace('due:2026-10-15', 'due:2026-10-16');
  const merged = merge(base, mine, theirs);
  assert.equal(merged.conflicts, 0);
  assert.deepEqual([parse(split(merged.text)[0]).text, parse(split(merged.text)[0]).due], ['Renamed', '2026-10-16']);
  const undone = merge(theirs, merged.text, base, { undo: true });
  assert.deepEqual([parse(split(undone.text)[0]).text, parse(split(undone.text)[0]).due], ['Renamed', '2026-10-15']);
  const newer = theirs.replace('2026-10-16', '2026-10-17');
  assert.equal(parse(split(merge(theirs, newer, base, { undo: true }).text)[0]).due, '2026-10-17');
  const conflict = merge(base, mine, base.replace('Alpha', 'Another title'));
  assert.equal(conflict.conflicts, 1);
  const rows = split(conflict.text).map(parse);
  assert.deepEqual(rows.map(t => t.depth), [0, 1, 2, 0, 1, 2, 0]);
  assert.deepEqual(rows.filter(t => t.depth === 0).map(t => t.text), ['Another title', 'Renamed', 'Beta']);
  assert.equal(new Set(rows.map(t => t.uid)).size, rows.length);
  assert.ok(rows[0].conflict && rows[3].conflict);
  const deleted = join(split(base).slice(3));
  assert.equal(split(merge(base, deleted, base).text).length, 1);
  const childEdit = base.replace('Detail', 'Edited detail');
  assert.ok(merge(base, deleted, childEdit).text.includes('Edited detail'));
  const inserted = base + join(prepare(['New']));
  assert.ok(merge(inserted, inserted.replace('New', 'New edited elsewhere'), base, { undo: true }).text.includes('New edited elsewhere'));
});

test('routine completion carries a checklist and reopening keeps edits without duplicate active copies', () => {
  const lines = prepare(['(A) 2026-10-08 Journal due:2026-10-09 rec:+1b pin:2026-10-12 @Personal', '\tFind the notebook', 'Other']);
  let done = complete(lines, 0, WED);
  assert.deepEqual(done.map(l => [parse(l).text, parse(l).done, parse(l).depth]), [
    ['Journal', true, 0], ['Find the notebook', true, 1], ['Journal', false, 0], ['Find the notebook', false, 1], ['Other', false, 0],
  ]);
  assert.equal(parse(done[2]).due, '2026-10-15');
  assert.equal(parse(done[2]).pin, null);
  assert.equal(routine(parse(done[0])), routine(parse(setText(done[2], 'New name'))));
  done[3] = setKey(done[3], 'notes', 'Keep these edits');
  const reopened = complete(done, 0, WED);
  assert.equal(reopened.length, 3);
  assert.equal(parse(reopened[0]).uid, parse(lines[0]).uid);
  assert.equal(parse(reopened[1]).notes, 'Keep these edits');
  assert.equal(parse(reopened[0]).done, false);
  assert.equal(new Set(done.map(l => parse(l).uid)).size, done.length);
  const concurrent = merge(join(lines), join(done), join(complete(lines, 0, WED)));
  assert.equal(split(concurrent.text).length, done.length);
});

test('recurring steps remain usable when their parent completes', () => {
  let lines = prepare(['Parent rec:+1w due:2026-10-14', '\tChild rec:+1d due:2026-10-14', '\t\tDetail']);
  lines = complete(lines, 1, WED);
  lines = complete(lines, 0, WED);
  const active = lines.map(parse).filter(t => !t.done);
  assert.deepEqual(active.map(t => t.text), ['Parent', 'Child', 'Detail']);
  assert.equal(new Set(lines.map(l => parse(l).uid)).size, lines.length);
  const oneOff = prepare(['One-off parent', '\tRepeat rec:+1d due:2026-10-14']);
  assert.equal(complete(oneOff, 0, WED).map(parse).filter(t => !t.done && t.rec).length, 1);
});

test('strict recurrence retains month-end and leap-day anchors while missed days are skipped', () => {
  const month = prepare(['Rent due:2026-01-31 rec:+1m'])[0];
  const feb = setKey(month, 'due', next(parse(month), '2026-02-01'));
  assert.equal(parse(feb).due, '2026-02-28');
  assert.equal(next(parse(feb), '2026-02-28'), '2026-03-31');
  const leap = prepare(['Anniversary due:2024-02-29 rec:+1y'])[0];
  assert.equal(next(parse(setKey(leap, 'due', '2027-02-28')), '2027-02-28'), '2028-02-29');
  assert.equal(next(parse('Weekly due:2026-09-28 rec:+1w'), WED), '2026-10-19');
  assert.equal(next(parse('Water rec:3d'), WED), '2026-10-17');
  assert.equal(next(parse('Korean due:2026-10-16 rec:1b'), '2026-10-16'), '2026-10-19');
});

test('quick dates reject impossible dates and zero intervals, and consume next Friday in full', () => {
  for (const phrase of ['feb 30', 'apr 31', 'every 0 days', 'monthly on the 0th', 'monthly on the 32nd']) {
    const t = parse(quick('Task ' + phrase, WED));
    assert.equal(t.due, null, phrase);
    assert.equal(t.rec, null, phrase);
    assert.equal(t.text, 'Task ' + phrase);
  }
  const t = parse(quick('Call Sam next friday', WED));
  assert.deepEqual([t.text, t.due], ['Call Sam', '2026-10-23']);
  assert.equal(parse(quick('Birthday feb 29', WED)).due, '2028-02-29');
  const month = parse(prepare([quick('Rent monthly on the 31st', '2026-02-01')])[0]);
  assert.equal(month.due, '2026-02-28');
  assert.equal(next(month, '2026-02-28'), '2026-03-31');
});

test('random independent edits preserve task identities, additions and deletion intent', () => {
  let seed = 7;
  const rand = n => (seed = (seed * 16807) % 2147483647) % n;
  for (let round = 0; round < 300; round++) {
    const base = prepare(Array.from({ length: 1 + rand(30) }, (_, i) => `Task ${i}`));
    const change = () => base.flatMap(l => rand(4) === 0 ? [] : [setKey(l, 'notes', String(rand(100)))]).concat(prepare(['Same', 'Same']));
    const a = change(), b = change(), out = split(merge(join(base), join(a), join(b)).text).map(parse);
    for (const l of [...a.slice(-2), ...b.slice(-2)]) assert.ok(out.some(t => t.uid === parse(l).uid));
    assert.equal(new Set(out.map(t => t.uid)).size, out.length);
    for (const l of base) if (![...a, ...b].some(x => parse(x).uid === parse(l).uid)) assert.ok(!out.some(t => t.uid === parse(l).uid));
  }
});
