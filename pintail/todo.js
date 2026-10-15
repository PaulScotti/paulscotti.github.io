// Pintail's todo.txt: reading and editing lines, dates, repeats, quick-add phrases and three-way merges.
// No DOM here, so `node --test` can check it.

// A task is one line: [tabs][x DONE ][(A) ][CREATED ]words @contexts key:value. Each leading tab nests it one level
// under the task above. Metadata holds dates, repeats, notes and stable identities; unknown tokens stay words.
export function parse(line) {
  const tabs = line.match(/^\t*/)[0].length;
  let rest = line.slice(tabs).trim(), m;
  const t = { line, depth: tabs, done: false, doneDate: null, pri: null, created: null, text: '', ctx: [], due: null, rec: null, notes: null, uid: null, rid: null, anchor: null, prev: null, conflict: null, meta: [] };
  if ((m = rest.match(/^x\s+/))) { t.done = true; rest = rest.slice(m[0].length); }
  if (t.done && (m = rest.match(DAY)) && real(m[1])) { t.doneDate = m[1]; rest = rest.slice(m[0].length); }
  if ((m = rest.match(/^\(([A-Z])\)\s+/))) { t.pri = m[1]; rest = rest.slice(m[0].length); }
  if ((m = rest.match(DAY)) && real(m[1])) { t.created = m[1]; rest = rest.slice(m[0].length); }
  t.tokens = tokens(rest).filter(tok => keyValue(tok)?.[0] !== 'pin'); // discard retired metadata
  const words = [];
  for (const tok of t.tokens) {
    const kv = keyValue(tok);
    if (tok.length > 1 && tok[0] === '@') t.ctx.push(tok.slice(1));
    else if (kv?.[0] === 'due' && real(kv[1]) && !t.due) t.due = kv[1];
    else if (kv?.[0] === 'rec' && REC.test(kv[1]) && !t.rec) t.rec = kv[1];
    else if (kv?.[0] === 'notes' && t.notes === null) t.notes = kv[1];
    else if (kv && IDENTITY.includes(kv[0]) && !t[kv[0]]) t[kv[0]] = kv[1];
    else { words.push(tok); continue; }
    t.meta.push(tok); // what was understood, kept when the words change
  }
  t.text = words.join(' ');
  return t;
}

const DAY = /^(\d{4}-\d\d-\d\d)(?:\s+|$)/;
const real = d => /^\d{4}-\d\d-\d\d$/.test(d) && iso(date(d)) === d; // a calendar date: not 2026-02-30, which stays words
const REC = /^\+?([1-9]\d*)([dbwmy])$/; // days, business days (Mon-Fri), weeks, months, years; + keeps the schedule
const IDENTITY = ['uid', 'rid', 'anchor', 'prev', 'conflict'];
const KEYS = ['due', 'rec', 'notes', ...IDENTITY];
export const split = s => (s || '').replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
export const join = lines => lines.length ? lines.join('\n') + '\n' : '';
const tokens = s => s.match(/[A-Za-z][\w-]*:"(?:[^"\\]|\\.)*"(?=\s|$)|\S+/g) || [];
const keyValue = tok => {
  const m = tok.match(/^([A-Za-z][\w-]*):(.+)$/);
  if (!m) return null;
  const quoted = m[2].length > 1 && m[2][0] === '"' && m[2].at(-1) === '"';
  return [m[1], quoted ? m[2].slice(1, -1).replace(/\\([\\"n])/g, (_, c) => c === 'n' ? '\n' : c) : m[2]];
};
const token = (key, value) => /[\s"\\]/.test(value) ? `${key}:"${value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\n')}"` : `${key}:${value}`;
const build = t => '\t'.repeat(t.depth) + [t.done && 'x', t.done && t.doneDate, !t.done && t.pri && `(${t.pri})`, t.created, ...t.tokens].filter(Boolean).join(' ');
const write = t => build({ ...t, tokens: [...tokens(t.text), ...t.ctx.map(c => '@' + c), ...KEYS.filter(k => t[k]).map(k => token(k, t[k]))] });

// New tasks get IDs once. Copying a raw line creates a separate task, including a separate routine.
export function prepare(lines) {
  const seen = new Set();
  return lines.filter(line => line.trim()).map(line => {
    let t = parse(line);
    line = build(t);
    if (!t.uid || seen.has(t.uid)) {
      const copied = !!t.uid;
      line = setKey(line, 'uid', crypto.randomUUID());
      if (copied) for (const k of ['rid', 'prev', 'conflict']) line = setKey(line, k, null);
      t = parse(line);
    }
    seen.add(t.uid);
    if (t.rec && !t.rid) line = setKey(line, 'rid', t.uid);
    if (t.rec?.startsWith('+') && /[my]$/.test(t.rec) && t.due && !t.anchor) line = setKey(line, 'anchor', t.due.slice(5));
    return line;
  });
}
// Existing files receive the same IDs on every device. The reference also matches pending edits from older apps.
export async function identify(text, reference = '') {
  const lines = split(text), refs = split(reference), inherited = new Map();
  const plain = line => { const t = parse(line); return build({ ...t, tokens: t.tokens.filter(tok => !IDENTITY.includes(keyValue(tok)?.[0])) }); };
  if (refs.length) {
    const matches = kept(refs.map(plain), lines.map(plain));
    let oi = 0, ai = 0;
    for (let i = 0; i <= refs.length; i++) if (i === refs.length || matches[i] >= 0) {
      const j = i === refs.length ? lines.length : matches[i];
      if (i - oi === j - ai) for (let k = 0; k < i - oi; k++) inherited.set(ai + k, parse(refs[oi + k]));
      if (i < refs.length) inherited.set(j, parse(refs[i]));
      oi = i + 1; ai = j + 1;
    }
  }
  const stack = [], counts = new Map(), series = new Map();
  const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  for (let i = 0; i < lines.length; i++) {
    let t = parse(lines[i]);
    while (stack.length && stack.at(-1).depth >= t.depth) stack.pop();
    const parent = stack.at(-1)?.uid || '', signature = parent + '\n' + plain(lines[i]);
    counts.set(signature, (counts.get(signature) || 0) + 1);
    if (!t.uid) {
      const old = inherited.get(i);
      for (const k of IDENTITY) if (old?.[k] && !t[k]) lines[i] = setKey(lines[i], k, old[k]);
      if (!old?.uid) lines[i] = setKey(lines[i], 'uid', await hash(signature + '\n' + counts.get(signature)));
      t = parse(lines[i]);
    }
    if (t.rec && !t.rid) {
      const signature = parent + '\n' + routine(t);
      if (!series.has(signature)) series.set(signature, await hash(signature));
      lines[i] = setKey(lines[i], 'rid', series.get(signature));
    }
    stack.push(t);
  }
  // Recover the original day from available routine history before a short month clamps it.
  const anchors = new Map();
  for (const line of lines) { const t = parse(line); if (t.rid && t.due && (!anchors.has(t.rid) || t.due < anchors.get(t.rid))) anchors.set(t.rid, t.due); }
  return join(prepare(lines.map(line => {
    const t = parse(line);
    return t.rec?.startsWith('+') && /[my]$/.test(t.rec) && !t.anchor && anchors.has(t.rid) ? setKey(line, 'anchor', anchors.get(t.rid).slice(5)) : line;
  })));
}

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
  while (end < lines.length && (!lines[end].trim() || parse(lines[end]).depth > depth)) end++;
  return end;
}
// Done marks the task and its open subtasks. A repeating task gets its next one right after it, dated by next().
export function complete(lines, i, today) {
  const t = parse(lines[i]), end = subtree(lines, i), out = [...lines];
  if (t.done) {
    const pending = t.rec ? lines.findIndex((line, j) => j !== i && !parse(line).done && parse(line).rid === t.rid) : -1;
    if (pending >= 0) {
      // Reopen the occurrence with the current checklist and any edits made since it was completed.
      const old = new Map(lines.slice(i, end).map(line => [parse(line).uid, parse(line)]));
      const block = lines.slice(pending, subtree(lines, pending)).map((line, j) => {
        const s = parse(line), previous = old.get(s.prev);
        return write({ ...s, depth: t.depth + s.depth - parse(lines[pending]).depth, uid: previous?.uid || s.uid,
          prev: previous?.prev || null, created: previous?.created || s.created, due: j === 0 ? t.due : s.due,
          done: j === 0 ? false : s.done, doneDate: j === 0 ? null : s.doneDate });
      });
      return lines.flatMap((line, j) => j === i ? block : j > i && j < end || j >= pending && j < subtree(lines, pending) ? [] : [line]);
    }
    out[i] = build({ ...t, done: false, doneDate: null });
    return out;
  }
  const successors = [];
  for (let j = i; j < end; j++) {
    const s = parse(out[j]);
    if (!s.done && out[j].trim()) out[j] = write({ ...s, done: true, doneDate: today });
    if (s.rec && !s.done) {
      const due = next(s, today), stop = subtree(lines, j);
      const templates = new Map();
      for (let k = j + 1; k < stop; k++) {
        const child = parse(lines[k]), previous = templates.get(child.rid);
        if (child.rec && (!previous || previous.done || !child.done)) templates.set(child.rid, child);
      }
      for (let k = j; k < stop; k++) {
        const child = parse(lines[k]), rid = child.rid || child.uid;
        if (k > j && child.rec && templates.get(child.rid).uid !== child.uid) { k = subtree(lines, k) - 1; continue; }
        successors.push(write({ ...child, done: false, doneDate: null, created: today, rid,
          uid: (k === j ? rid : (s.rid || s.uid) + '/' + rid) + '/' + due, prev: child.uid, due: k === j ? due : child.rec ? next(child, today) : child.due }));
      }
      // The repeating parent's next checklist already contains its repeating descendants.
      for (let k = j + 1; k < stop; k++) { const child = parse(out[k]); if (!child.done) out[k] = write({ ...child, done: true, doneDate: today }); }
      j = stop - 1;
    }
  }
  out.splice(end, 0, ...successors);
  return out;
}
// A missed day or week is skipped rather than owed: the next date of a + schedule is the first one after today.
export function next(t, today) {
  const strict = t.rec[0] === '+';
  const anchor = strict ? t.anchor || t.due?.slice(5) : null;
  let d = step(strict && t.due ? t.due : today, t.rec, anchor);
  while (strict && d <= today) d = step(d, t.rec, anchor);
  return d;
}
export const remove = (lines, i) => [...lines.slice(0, i), ...lines.slice(subtree(lines, i))];
export function addChild(lines, i, line) {
  const end = subtree(lines, i);
  return [...lines.slice(0, end), '\t'.repeat(parse(lines[i]).depth + 1) + line, ...lines.slice(end)];
}
// A routine keeps its history even when its words, categories or frequency change.
export const routine = t => t.rid || t.tokens.filter(tok => !['due', 'notes', ...IDENTITY].includes(keyValue(tok)?.[0])).join(' ').toLowerCase();

// Dates are YYYY-MM-DD strings in local time.
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const date = s => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export function addDays(s, n) { const d = date(s); d.setDate(d.getDate() + n); return iso(d); }
export function addMonths(s, n) { // Jan 31 + 1 month is Feb 28
  const d = date(s), last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return iso(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last)));
}
export function step(s, rec, anchor = null) {
  const [, n, unit] = rec.match(REC);
  if (unit === 'd') return addDays(s, +n);
  if (unit === 'w') return addDays(s, 7 * n);
  if (unit === 'm' || unit === 'y') {
    const moved = date(addMonths(s, unit === 'm' ? +n : 12 * n));
    const month = unit === 'y' && anchor ? +anchor.slice(0, 2) - 1 : moved.getMonth(), day = anchor ? +anchor.slice(3) : +s.slice(8);
    return iso(new Date(moved.getFullYear(), month, Math.min(day, new Date(moved.getFullYear(), month + 1, 0).getDate())));
  }
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
  for (let y = +today.slice(0, 4); y <= +today.slice(0, 4) + 4; y++) {
    const d = iso(new Date(y, month, day));
    if (+d.slice(5, 7) === month + 1 && +d.slice(8) === day && d >= today) return d;
  }
  return null;
}
const PHRASES = [
  [`every (other|\\d+|${Object.keys(NUMBER).join('|')}) (day|week|month|year)s?`, (m, today) => ({ rec: `+${m[1] === 'other' ? 2 : NUMBER[m[1]] || m[1]}${m[2][0]}`, due: today })],
  [`(?:every (day|weekday|workday|week|month|year)|(daily|weekdays|weekly|biweekly|fortnightly|monthly|yearly|annually))(?: on the (\\d{1,2})(?:st|nd|rd|th)?)?`, (m, today) => {
    const word = m[1] || m[2], rec = { day: '+1d', daily: '+1d', weekday: '+1b', workday: '+1b', weekdays: '+1b', week: '+1w', weekly: '+1w', biweekly: '+2w', fortnightly: '+2w', month: '+1m', monthly: '+1m', year: '+1y', yearly: '+1y', annually: '+1y' }[word];
    const y = +today.slice(0, 4), mo = +today.slice(5, 7) - 1, d = m[3] && inMonth(y, mo, +m[3]);
    if (m[3]) return !rec.endsWith('m') || +m[3] < 1 || +m[3] > 31 ? null : { rec: '+1m', due: d >= today ? d : inMonth(y, mo + 1, +m[3]), anchor: `${today.slice(5, 7)}-${m[3].padStart(2, '0')}` };
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
  [`(next|this) ${WEEKDAY}`, (m, today) => ({ due: m[1] === 'next' ? addDays(today, 7 - (weekday(today) + 6) % 7 + (dayIndex(m[2]) + 6) % 7) : onOrAfter(today, dayIndex(m[2])) })],
  [WEEKDAY, (m, today) => ({ due: onOrAfter(today, dayIndex(m[1])) })],
  [`${MONTH}\\.? (\\d{1,2})(?:st|nd|rd|th)?`, (m, today) => ({ due: inYear(today, monthIndex(m[1]), +m[2]) })],
  [`(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH}`, (m, today) => ({ due: inYear(today, monthIndex(m[2]), +m[1]) })],
  ['(\\d{4}-\\d\\d-\\d\\d)', m => ({ due: m[1] })],
].map(([re, f]) => [new RegExp(`(?:^|\\s)(?:(?:by|on|due|starting|from)\\s+)?(?:${re})$`, 'i'), f]);

// Returns what the words say: { words, due, rec } with the phrase cut from the words, or null when there's no phrase.
function when(words, today) {
  for (const [re, f] of PHRASES) {
    const m = words.match(re);
    if (!m || m.index === 0) continue;
    const said = f(m.map(s => s?.toLowerCase()), today);
    return said && real(said.due) && (!said.rec || REC.test(said.rec)) ? { words: words.slice(0, m.index), ...said } : null;
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
  let words = all.slice(0, end).join(' '), due = null, rec = null, anchor = null;
  const typed = parse(all.join(' ')), said = read && !typed.due && !typed.rec && when(words, today);
  if (said) ({ words, due = null, rec = null, anchor = null } = said);
  const t = parse([pri && `(${pri[1]})`, today, words.trim(), ...tail].filter(Boolean).join(' '));
  let line = t.line;
  if (!t.ctx.length) line = [line, ...fallback.map(c => '@' + c)].join(' ');
  if (due && !t.due) line = setKey(line, 'due', due);
  if (rec && !t.rec) line = setKey(line, 'rec', rec);
  if (anchor) line = setKey(line, 'anchor', anchor);
  return line;
}

// Merge fields by task ID, then rebuild the hierarchy. Undo only reverses fields that have not changed again.
export function merge(base, mine, theirs, { undo = false } = {}) {
  if (mine === theirs || theirs === base) return { text: mine, conflicts: 0 };
  if (mine === base) return { text: theirs, conflicts: 0 };
  const read = text => {
    const result = new Map(), stack = [];
    for (const line of split(text)) {
      const t = parse(line);
      if (!t.uid || result.has(t.uid)) throw new Error('Each task needs a unique uid before merging.');
      while (stack.length && stack.at(-1).depth >= t.depth) stack.pop();
      t.parent = stack.at(-1)?.uid || null;
      result.set(t.uid, t); stack.push(t);
    }
    return result;
  };
  const [o, m, t] = [base, mine, theirs].map(read), out = new Map(), forks = [];
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const fields = ['done', 'doneDate', 'pri', 'created', 'text', 'parent', ...KEYS.filter(k => k !== 'uid')];
  const unchanged = (a, b) => fields.every(k => equal(a[k], b[k])) && equal(a.ctx, b.ctx);
  let conflicts = 0;
  for (const uid of new Set([...t.keys(), ...m.keys(), ...o.keys()])) {
    const a = m.get(uid), b = t.get(uid), before = o.get(uid);
    if (!a && !b) continue;
    if (!a || !b) {
      const kept = a || b;
      if (before && unchanged(before, kept)) continue;
      // Undoing an insertion must preserve a task another device subsequently edited.
      if (undo && !a && before) continue;
      out.set(uid, { ...kept, conflict: before && !undo ? uid : kept.conflict });
      if (before) conflicts++;
      continue;
    }
    const merged = { ...b }, alternate = { ...b };
    let conflict = false;
    for (const k of fields) {
      const av = a[k], bv = b[k], ov = (before || (a.prev === b.prev && o.get(a.prev)))?.[k] ?? null;
      const both = !equal(av, bv) && !equal(av, ov) && !equal(bv, ov);
      merged[k] = equal(bv, ov) || equal(av, bv) || both && undo ? av : bv;
      alternate[k] = both ? av : merged[k];
      conflict ||= both;
    }
    // Category additions and removals commute, including differences in capitalization.
    const old = new Set((before?.ctx || []).map(c => c.toLowerCase()));
    merged.ctx = [...new Map([...b.ctx, ...a.ctx].filter(c => !old.has(c.toLowerCase()) || a.ctx.some(x => x.toLowerCase() === c.toLowerCase()) && b.ctx.some(x => x.toLowerCase() === c.toLowerCase())).map(c => [c.toLowerCase(), c])).values()];
    alternate.ctx = merged.ctx;
    if (conflict) {
      conflicts++;
      if (!undo) { merged.conflict = uid; forks.push({ ...alternate, uid: crypto.randomUUID(), conflict: uid }); }
    }
    out.set(uid, merged);
  }
  // A child edited while its parent was deleted retains the parent as context.
  for (const task of out.values()) {
    let parent = task.parent;
    while (parent && !out.has(parent)) {
      const restored = m.get(parent) || t.get(parent) || o.get(parent);
      out.set(parent, { ...restored, conflict: parent }); conflicts++;
      parent = restored.parent;
    }
  }
  const originalOrder = [...o.keys()].join(), mineOrder = [...m.keys()].filter(id => o.has(id)).join();
  const order = [...(mineOrder !== originalOrder ? m : t).keys()];
  let at = 0;
  for (const uid of [...t.keys(), ...m.keys()]) {
    const existing = order.indexOf(uid);
    if (existing < 0) order.splice(at, 0, uid);
    at = order.indexOf(uid) + 1;
  }
  for (const uid of out.keys()) if (!order.includes(uid)) order.push(uid);
  // Conflicting copies include their steps; a task's children never silently switch parents.
  const descendants = new Map();
  for (const uid of order) if (out.has(uid)) {
    const parent = out.get(uid).parent;
    if (!descendants.has(parent)) descendants.set(parent, []);
    descendants.get(parent).push(uid);
  }
  for (const fork of forks) {
    const source = fork.conflict;
    out.set(fork.uid, fork); order.splice(order.indexOf(source) + 1, 0, fork.uid);
    const copyChildren = (parent, target, seen = new Set()) => {
      if (seen.has(parent)) return;
      seen.add(parent);
      for (const uid of descendants.get(parent) || []) {
        const copy = { ...out.get(uid), uid: crypto.randomUUID(), parent: target };
        out.set(copy.uid, copy); order.push(copy.uid); copyChildren(uid, copy.uid, seen);
      }
    };
    copyChildren(source, fork.uid);
  }
  // Two valid moves can form a cycle together. Keep both tasks visible for review.
  for (const task of out.values()) {
    const seen = new Set([task.uid]);
    for (let parent = task.parent; parent; parent = out.get(parent).parent) {
      if (seen.has(parent)) { task.parent = null; task.conflict = task.uid; conflicts++; break; }
      seen.add(parent);
    }
  }
  const children = new Map();
  for (const uid of order) if (out.has(uid)) {
    const parent = out.get(uid).parent;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(uid);
  }
  const lines = [], visited = new Set();
  const append = (uid, depth) => {
    if (visited.has(uid)) throw new Error('Conflicting task moves form a loop. Review todo.txt.');
    visited.add(uid); lines.push(write({ ...out.get(uid), depth }));
    for (const child of children.get(uid) || []) append(child, depth + 1);
  };
  for (const uid of children.get(null) || []) append(uid, 0);
  if (visited.size !== out.size) throw new Error('Conflicting task moves form a loop. Review todo.txt.');
  return { text: join(lines), conflicts };
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
