// Pintail's todo.txt: reading and editing lines, dates, repeats, quick-add phrases and three-way merges.
// No DOM here, so `node --test` can check it.

// A task is one line: [tabs][x DONE ][(A) ][CREATED ]words @contexts key:value. Each leading tab nests it one level
// under the task above. Of the key:values, Pintail reads due:, rec:, notes: and pin: (the day it was pinned), and
// keeps every other token as words.
export function parse(line) {
  const tabs = line.match(/^\t*/)[0].length;
  let rest = line.slice(tabs).trim(), m;
  const t = { line, depth: tabs, done: false, doneDate: null, pri: null, created: null, text: '', ctx: [], due: null, rec: null, notes: null, pin: null, meta: [] };
  if ((m = rest.match(/^x\s+/))) { t.done = true; rest = rest.slice(m[0].length); }
  if (t.done && (m = rest.match(DAY)) && real(m[1])) { t.doneDate = m[1]; rest = rest.slice(m[0].length); }
  if ((m = rest.match(/^\(([A-Z])\)\s+/))) { t.pri = m[1]; rest = rest.slice(m[0].length); }
  if ((m = rest.match(DAY)) && real(m[1])) { t.created = m[1]; rest = rest.slice(m[0].length); }
  t.tokens = tokens(rest);
  const words = [];
  for (const tok of t.tokens) {
    const kv = keyValue(tok);
    if (tok.length > 1 && tok[0] === '@') t.ctx.push(tok.slice(1));
    else if (kv?.[0] === 'due' && real(kv[1]) && !t.due) t.due = kv[1];
    else if (kv?.[0] === 'rec' && REC.test(kv[1]) && !t.rec) t.rec = kv[1];
    else if (kv?.[0] === 'notes' && t.notes === null) t.notes = kv[1];
    else if (kv?.[0] === 'pin' && !t.pin) t.pin = kv[1];
    else { words.push(tok); continue; }
    t.meta.push(tok); // what was understood, kept when the words change
  }
  t.text = words.join(' ');
  return t;
}

const DAY = /^(\d{4}-\d\d-\d\d)(?:\s+|$)/;
const real = d => /^\d{4}-\d\d-\d\d$/.test(d) && iso(date(d)) === d; // a calendar date: not 2026-02-30, which stays words
const REC = /^\+?([1-9]\d*)([dbwmy])$/; // days, business days (Mon-Fri), weeks, months, years; + keeps the schedule
const tokens = s => s.match(/[A-Za-z][\w-]*:"(?:[^"\\]|\\.)*"(?=\s|$)|\S+/g) || [];
const keyValue = tok => {
  const m = tok.match(/^([A-Za-z][\w-]*):(.+)$/);
  if (!m) return null;
  const quoted = m[2].length > 1 && m[2][0] === '"' && m[2].at(-1) === '"';
  return [m[1], quoted ? m[2].slice(1, -1).replace(/\\([\\"n])/g, (_, c) => c === 'n' ? '\n' : c) : m[2]];
};
const token = (key, value) => /[\s"\\]/.test(value) ? `${key}:"${value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\n')}"` : `${key}:${value}`;
const build = t => '\t'.repeat(t.depth) + [t.done && 'x', t.done && t.doneDate, !t.done && t.pri && `(${t.pri})`, t.created, ...t.tokens].filter(Boolean).join(' ');

// Edits to one line. Tokens keep their places, so a changed date or context touches nothing else.
export const setPri = (line, pri) => build({ ...parse(line), pri });
export function setKey(line, key, value) { // in place of the first such token, or at the end; no value removes it
  const t = parse(line), at = t.tokens.findIndex(tok => keyValue(tok)?.[0] === key);
  t.tokens = t.tokens.filter(tok => keyValue(tok)?.[0] !== key);
  if (value) t.tokens.splice(at >= 0 ? at : t.tokens.length, 0, token(key, value));
  return build(t);
}
export function toggleCtx(line, name) { // a new context goes after the others, or before the key:values
  const t = parse(line), has = tok => tok.toLowerCase() === '@' + name.toLowerCase();
  if (t.tokens.some(has)) t.tokens = t.tokens.filter(tok => !has(tok));
  else {
    const last = t.tokens.findLastIndex(tok => tok[0] === '@' && tok.length > 1), kv = t.tokens.findIndex(keyValue);
    t.tokens.splice(last >= 0 ? last + 1 : kv >= 0 ? kv : t.tokens.length, 0, '@' + name);
  }
  return build(t);
}
// New words go first; the contexts and key:values that were understood stay after them in their order.
export function setText(line, text) {
  const t = parse(line);
  return build({ ...t, tokens: [...tokens(text).filter(tok => !t.meta.some(m => m.toLowerCase() === tok.toLowerCase())), ...t.meta] });
}

// Edits to the whole list, as an array of lines. A task's subtree is it and the deeper lines right below it.
export function subtree(lines, i) {
  const depth = parse(lines[i]).depth;
  let end = i + 1;
  while (end < lines.length && lines[end].trim() && parse(lines[end]).depth > depth) end++;
  return end;
}
// Done marks the task and its open subtasks, and unpins them. A repeating task gets its next one right after it,
// dated by next() and not pinned.
export function complete(lines, i, today) {
  const t = parse(lines[i]), end = subtree(lines, i), out = [...lines], unpinned = s => s.tokens.filter(tok => keyValue(tok)?.[0] !== 'pin');
  if (t.done) { out[i] = build({ ...t, done: false, doneDate: null }); return out; }
  for (let j = i; j < end; j++) {
    const s = parse(out[j]);
    if (!s.done && out[j].trim()) out[j] = build({ ...s, done: true, doneDate: today, tokens: unpinned(s) });
  }
  if (t.rec) out.splice(end, 0, setKey(build({ ...t, created: today, tokens: unpinned(t) }), 'due', next(t, today)));
  return out;
}
// A missed day or week is skipped rather than owed: the next date of a + schedule is the first one after today.
export function next(t, today) {
  const strict = t.rec[0] === '+';
  let d = step(strict && t.due ? t.due : today, t.rec);
  while (strict && d <= today) d = step(d, t.rec);
  return d;
}
export const remove = (lines, i) => [...lines.slice(0, i), ...lines.slice(subtree(lines, i))];
export function addChild(lines, i, line) {
  const end = subtree(lines, i);
  return [...lines.slice(0, end), '\t'.repeat(parse(lines[i]).depth + 1) + line, ...lines.slice(end)];
}
// Completed copies of a repeating task share its words, contexts and repeat, so they make its history.
export const routine = t => t.tokens.filter(tok => !['due', 'notes', 'pin'].includes(keyValue(tok)?.[0])).join(' ').toLowerCase();

// Dates are YYYY-MM-DD strings in local time.
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const date = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export function addDays(s, n) { const d = date(s); d.setDate(d.getDate() + n); return iso(d); }
export function addMonths(s, n) { // Jan 31 + 1 month is Feb 28
  const d = date(s), last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return iso(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last)));
}
export function step(s, rec) {
  const [, n, unit] = rec.match(REC);
  if (unit === 'd') return addDays(s, +n);
  if (unit === 'w') return addDays(s, 7 * n);
  if (unit === 'm') return addMonths(s, +n);
  if (unit === 'y') return addMonths(s, 12 * n);
  for (let left = +n; left; ) if (![0, 6].includes(date(s = addDays(s, 1)).getDay())) left--;
  return s;
}
export const weekday = s => date(s).getDay();
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function repeatLabel(t) {
  const [, n, unit] = t.rec.match(REC), names = { d: 'day', b: 'weekday', w: 'week', m: 'month', y: 'year' };
  const every = n === '1' ? names[unit] : `${n} ${names[unit]}s`;
  if (t.rec[0] !== '+') return `${n === '1' ? 'A' : ''} ${every} after done`.trim();
  if (n === '1' && unit === 'w' && t.due) return 'Every ' + DAYS[weekday(t.due)];
  return 'Every ' + every;
}

// Quick add: a date or repeat said at the end of the words becomes due: and rec:, so "Call mom tomorrow @Personal"
// is due tomorrow. Only the end is read, which keeps words like "sun" or "may" inside a title from turning into dates.
const WEEKDAY = '(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)';
const MONTH = '(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)';
const NUMBER = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const dayIndex = w => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(w.slice(0, 3));
const monthIndex = w => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(w.slice(0, 3));
const onOrAfter = (today, day) => addDays(today, (day - weekday(today) + 7) % 7);
const inMonth = (y, month, day) => iso(new Date(y, month, Math.min(day, new Date(y, month + 1, 0).getDate())));
function inYear(today, month, day) { // the next such date, this year or next
  const y = +today.slice(0, 4), d = inMonth(y, month, day);
  return d >= today ? d : inMonth(y + 1, month, day);
}
const PHRASES = [
  [`every (other|\\d+|${Object.keys(NUMBER).join('|')}) (day|week|month|year)s?`, (m, today) => ({ rec: `+${m[1] === 'other' ? 2 : NUMBER[m[1]] || m[1]}${m[2][0]}`, due: today })],
  [`(?:every (day|weekday|workday|week|month|year)|(daily|weekdays|weekly|biweekly|fortnightly|monthly|yearly|annually))(?: on the (\\d{1,2})(?:st|nd|rd|th)?)?`, (m, today) => {
    const word = m[1] || m[2], rec = { day: '+1d', daily: '+1d', weekday: '+1b', workday: '+1b', weekdays: '+1b', week: '+1w', weekly: '+1w', biweekly: '+2w', fortnightly: '+2w', month: '+1m', monthly: '+1m', year: '+1y', yearly: '+1y', annually: '+1y' }[word];
    const y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1, d = m[3] && inMonth(y, mo, +m[3]);
    if (m[3]) return { rec: '+1m', due: d >= today ? d : inMonth(y, mo + 1, +m[3]) };
    return { rec, due: rec === '+1b' && [0, 6].includes(weekday(today)) ? step(today, '+1b') : today };
  }],
  [`every ${WEEKDAY}`, (m, today) => ({ rec: '+1w', due: onOrAfter(today, dayIndex(m[1])) })],
  ['today|tonight', (m, today) => ({ due: today })],
  ['tomorrow|tmrw|tmr', (m, today) => ({ due: addDays(today, 1) })],
  ['next week', (m, today) => ({ due: addDays(onOrAfter(today, 1), weekday(today) === 1 ? 7 : 0) })],
  ['next month', (m, today) => ({ due: addMonths(today.slice(0, 8) + '01', 1) })],
  ['(?:this )?weekend', (m, today) => ({ due: weekday(today) === 0 ? today : onOrAfter(today, 6) })],
  ['(?:end of (?:the )?month|eom)', (m, today) => ({ due: addDays(addMonths(today.slice(0, 8) + '01', 1), -1) })],
  [`in (\\d+|${Object.keys(NUMBER).join('|')}) (day|week|month|year)s?`, (m, today) => {
    const n = +(NUMBER[m[1]] || m[1]);
    return { due: m[2] === 'day' ? addDays(today, n) : m[2] === 'week' ? addDays(today, 7 * n) : addMonths(today, m[2] === 'month' ? n : 12 * n) };
  }],
  [WEEKDAY, (m, today) => ({ due: onOrAfter(today, dayIndex(m[1])) })],
  [`${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?`, (m, today) => ({ due: inYear(today, monthIndex(m[1]), +m[2]) })],
  [`(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH}`, (m, today) => ({ due: inYear(today, monthIndex(m[2]), +m[1]) })],
  ['(\\d{4}-\\d\\d-\\d\\d)', m => ({ due: m[1] })],
].map(([re, f]) => [new RegExp(`(?:^|\\s)(?:(?:by|on|due|starting|from)\\s+)?(?:${re})$`, 'i'), f]);

// Returns what the words say: { words, due, rec } with the phrase cut from the words, or null when there's no phrase.
function when(words, today) {
  for (const [re, f] of PHRASES) {
    const m = words.match(re), said = m?.index > 0 && f(m.map(s => s?.toLowerCase()), today);
    if (said && real(said.due)) return { words: words.slice(0, m.index), ...said };
  }
  return null;
}
// A typed task becomes a line: today as its created date, the phrase at the end read as dates, contexts spelled as
// they already are elsewhere, and the given contexts when it names none.
export function quick(input, today, known = [], fallback = [], read = true) {
  const pri = input.match(/^\s*\(([A-Z])\)\s+/), all = tokens(pri ? input.slice(pri[0].length) : input).map(tok => {
    const same = tok[0] === '@' && known.find(k => k.toLowerCase() === tok.slice(1).toLowerCase());
    return same ? '@' + same : tok;
  });
  let end = all.length;
  while (end > 0 && (all[end - 1][0] === '@' || keyValue(all[end - 1]))) end--;
  const tail = all.slice(end);
  let words = all.slice(0, end).join(' '), due = null, rec = null;
  const typed = parse(all.join(' ')), said = read && !typed.due && !typed.rec && when(words, today);
  if (said) ({ words, due = null, rec = null } = said);
  const t = parse([pri && `(${pri[1]})`, today, words.trim(), ...tail].filter(Boolean).join(' '));
  let line = t.line;
  if (!t.ctx.length) line = [line, ...fallback.map(c => '@' + c)].join(' ');
  if (due && !t.due) line = setKey(line, 'due', due);
  if (rec && !t.rec) line = setKey(line, 'rec', rec);
  return line;
}

// Three-way merge of two edited copies of the same base text, line by line. A base line stays when both copies kept
// it; every line a copy added goes in after the last base line it kept above it, theirs before mine. An edited line
// counts as removed and added, so an edit beats a delete, and a task changed two ways keeps both versions: a
// duplicate is easy to delete, a lost task is not.
export function merge(base, mine, theirs) {
  const split = s => s ? s.replace(/\n$/, '').split('\n') : [];
  const o = split(base), sides = [theirs, mine].map(text => {
    const a = split(text), m = kept(o, a), from = new Array(a.length).fill(-1), added = o.map(() => []);
    m.forEach((j, i) => { if (j >= 0) from[j] = i; });
    added.push([]);
    for (let j = 0, gap = 0; j < a.length; j++) from[j] >= 0 ? gap = from[j] + 1 : added[gap].push(a[j]);
    return { m, added };
  });
  const out = [];
  for (let i = 0; i <= o.length; i++) {
    const [t, me] = sides.map(side => side.added[i]);
    out.push(...t, ...me.filter(l => !t.includes(l)));
    if (i < o.length && sides.every(side => side.m[i] >= 0)) out.push(o[i]);
  }
  return out.length ? out.join('\n') + '\n' : '';
}
// For each line of o, its index in a when it survives into a (a longest common subsequence), else -1.
function kept(o, a) {
  const m = new Array(o.length).fill(-1);
  let s = 0, e = 0;
  while (s < o.length && s < a.length && o[s] === a[s]) m[s] = s++;
  while (e < o.length - s && e < a.length - s && o[o.length - 1 - e] === a[a.length - 1 - e]) { m[o.length - 1 - e] = a.length - 1 - e; e++; }
  const O = o.slice(s, o.length - e), A = a.slice(s, a.length - e), L = Array.from({ length: O.length + 1 }, () => new Uint16Array(A.length + 1));
  for (let i = O.length - 1; i >= 0; i--) for (let j = A.length - 1; j >= 0; j--) L[i][j] = O[i] === A[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  for (let i = 0, j = 0; i < O.length && j < A.length; ) {
    if (O[i] === A[j]) m[s + i++] = s + j++;
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return m;
}
