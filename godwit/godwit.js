// Godwit: Paul's todo.txt in three horizons, Soon (dated), Later (undated) and Routines (repeating), plus Done.
// The whole list is one todo.txt, kept on each device and synced with the worker, merging edits line by line.
import { parse, setPri, setKey, toggleCtx, setText, complete, remove, addChild, quick, merge, next, routine, repeatLabel, iso, addDays, weekday, DAYS, MONTHS } from './todo.js';

const $ = id => document.getElementById(id);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API = (LOCAL ? 'http://localhost:8790' : 'https://godwit.scottibrain.workers.dev') + '/todo.txt';
const MINE = ['Paul', 'Personal']; // the categories a new device starts filtered to

let password = localStorage.getItem('godwit.password'); // typed once on each device
let view = localStorage.getItem('godwit.view') || 'soon';
let picked = JSON.parse(localStorage.getItem('godwit.filter') || JSON.stringify(MINE));
let query = null, literal = false, today = iso(new Date()), tasks = [], names = [], editing = null;
const undos = [];

// The list on this device, and the copy the worker last had (`base`). They differ while edits wait to sync.
const text = () => localStorage.getItem('godwit.text');
const base = () => JSON.parse(localStorage.getItem('godwit.base'));
const keep = s => localStorage.setItem('godwit.text', s);
const split = s => s ? s.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n') : [];
const join = lines => lines.length ? lines.join('\n') + '\n' : '';

// Every change is made to the lines as they are at that moment, so nothing from another tab or a sync is lost.
function edit(f, note) {
  const before = text(), after = join(f(split(before)));
  if (after === before) return;
  keep(after);
  if (undos.push({ before, after }) > 20) undos.shift(); // each holds two copies of the list
  if (note) toast(note, true);
  render();
  sync();
}
// Undo takes back one edit by merging it out, keeping whatever changed since.
function undo() {
  const u = undos.pop();
  if (!u) return;
  keep(merge(u.after, text(), u.before));
  toast('Undone');
  render();
  sync();
}
// A task is found by its line: where it was, or wherever that exact line is now.
const find = (i, line) => { const lines = split(text()); return lines[i] === line ? i : lines.indexOf(line); };
function act(i, line, f, note) {
  const at = find(i, line);
  if (at < 0) return toast('That task just changed on another device.');
  edit(lines => f(lines, at), note);
}

// Sync: send local edits with the version they were made from. If the worker has moved on, it sends its text back,
// which is merged with the edits here and sent again. One sync at a time across tabs.
let syncing = Promise.resolve();
function sync() {
  if (!password) return syncing;
  const run = () => navigator.locks.request('godwit-sync', exchange).then(() => status(''), e => {
    status(e.message ? 'Not synced' : 'Offline');
    if (e.message) toast(e.message);
  });
  return syncing = syncing.then(run);
}
async function exchange() {
  for (;;) {
    const b = base(), mine = text(), auth = { authorization: `Bearer ${password}` }, put = b && mine !== b.text;
    const res = await fetch(API, put
      ? { method: 'PUT', headers: { ...auth, 'if-match': `"${b.v}"`, 'content-type': 'text/plain; charset=utf-8' }, body: mine }
      : { headers: b ? { ...auth, 'if-none-match': `"${b.v}"` } : auth, cache: 'no-store' }).catch(() => null);
    if (!res) throw new Error(); // offline: the edits wait here
    if (res.status === 401) return lock();
    if (res.status === 304) return;
    const v = +res.headers.get('etag').slice(1, -1);
    if (res.status === 204) {
      localStorage.setItem('godwit.base', JSON.stringify({ v, text: mine }));
      if (text() === mine) return;
      continue;
    }
    if (res.status !== 200 && res.status !== 412) throw new Error(await res.text());
    const theirs = await res.text(), now = text();
    keep(merge(b ? b.text : '', now ?? '', theirs)); // a new device's first edits merge in too
    localStorage.setItem('godwit.base', JSON.stringify({ v, text: theirs }));
    render();
    if (text() === theirs) return;
  }
}
function status(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}
function lock() {
  localStorage.removeItem('godwit.password');
  password = null;
  route();
}

// Labels for dates.
const short = d => `${MONTHS[+d.slice(5, 7) - 1].slice(0, 3)} ${+d.slice(8)}`;
const month = d => MONTHS[+d.slice(5, 7) - 1] + (d.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + d.slice(0, 4));
const dayName = d => d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : d > today && d <= addDays(today, 6) ? DAYS[weekday(d)] : short(d);
const soonGroup = d => d < today ? 'Overdue' : d <= addDays(today, 6) ? dayName(d) : (d.slice(0, 7) === today.slice(0, 7) ? 'Later in ' : '') + month(d);
const doneGroup = d => !d ? 'Some time' : d === today ? 'Today' : d === addDays(today, -1) ? 'Yesterday' : d > addDays(today, -7) ? DAYS[weekday(d)] : month(d);
function age(d) {
  const n = Math.round((new Date(today) - new Date(d)) / 864e5);
  return n < 1 ? 'new' : n < 14 ? n + 'd' : n < 60 ? Math.round(n / 7) + 'w' : n < 700 ? Math.round(n / 30.4) + 'mo' : Math.round(n / 365) + 'y';
}
const RANK = p => p === 'W' || p === 'P' ? 5 : p === 'D' ? 4 : 'ABC'.includes(p || '-') ? 'ABC'.indexOf(p) : 3;
const LATER = ['Priority A', 'Priority B', 'Priority C', 'Unprioritized', 'Deprioritized', 'Waiting'];

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const linked = s => s.split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]'])/).map((part, k) => {
  const shown = part.replace(/^https?:\/\/(www\.)?/, '');
  return k % 2 ? `<a href="${esc(part)}" target="_blank" rel="noopener">${esc(shown.length > 34 ? shown.slice(0, 32) + '…' : shown)}</a>` : esc(part);
}).join('');

// One task row. Categories already chosen in the filter aren't repeated on every row.
function row(t, { depth = 0, label = '', late = false, extra = '', up = depth === 0 && t.up } = {}) {
  const words = t.text.split(' '), length = words.find(w => /^l:\d/.test(w));
  const ctx = t.ctx.filter(c => !picked.some(p => p.toLowerCase() === c.toLowerCase()));
  const meta = [...ctx, t.rec && repeatLabel(t), length?.slice(2), up && '↳ ' + up.text].filter(Boolean);
  return `<div class="task${t.done ? ' done' : ''}" data-i="${t.i}" style="--depth:${depth}">
    <button class="check p${t.done ? 'x' : t.pri || ''}" aria-label="${t.done ? 'Not done' : 'Done'}"></button>
    <div class="body"><span class="title">${linked(words.filter(w => w !== length).join(' ') || t.line.trim())}</span>${meta.length ? `<span class="meta">${esc(meta.join(' · '))}</span>` : ''}${t.notes ? `<span class="note">${linked(t.notes.split('\n')[0])}</span>` : ''}${extra}</div>
    ${label ? `<span class="when${late ? ' late' : ''}">${esc(label)}</span>` : ''}
  </div>`;
}
const groups = (items, label) => items.reduce((out, x) => {
  const l = label(x);
  if (out.at(-1)?.[0] !== l) out.push([l, []]);
  out.at(-1)[1].push(x);
  return out;
}, []);
const list = (gs, rows, empty) => gs.length ? gs.map(([l, xs]) => `<div class="group"><h3>${l}</h3>${xs.map(rows).join('')}</div>`).join('') : `<p class="empty">${empty}</p>`;

function render() {
  const raw = text();
  document.body.dataset.view = view;
  document.body.classList.toggle('finding', query !== null);
  for (const b of $('views').children) b.classList.toggle('on', b.dataset.view === view);
  if (raw === null) return;
  today = iso(new Date());
  tasks = split(raw).map((line, i) => line.trim() && Object.assign(parse(line), { i, kids: [], up: null })).filter(Boolean);
  const stack = [];
  for (const t of tasks) {
    while (stack.length && stack.at(-1).depth >= t.depth) stack.pop();
    t.up = stack.at(-1) || null;
    t.up?.kids.push(t);
    stack.push(t);
  }
  const counts = new Map();
  for (const t of tasks) for (const c of t.ctx) {
    const k = counts.get(c.toLowerCase()) || { name: c, n: 0, all: 0 };
    k.n += !t.done;
    k.all++;
    counts.set(c.toLowerCase(), k);
  }
  const ranked = [...counts.values()].sort((a, b) => b.all - a.all || a.name.localeCompare(b.name)); // most used first, steady as tasks get done
  names = ranked.map(k => k.name);
  const chips = ranked.filter(k => k.n || picked.some(p => p.toLowerCase() === k.name.toLowerCase()));
  $('chips').innerHTML = `<button class="${picked.length ? '' : 'on'}" data-ctx="">All</button>` + chips.map(k =>
    `<button class="${picked.some(p => p.toLowerCase() === k.name.toLowerCase()) ? 'on' : ''}" data-ctx="${esc(k.name)}">${esc(k.name)}<small>${k.n}</small></button>`).join('');

  const shown = t => !picked.length || t.ctx.some(c => picked.some(p => p.toLowerCase() === c.toLowerCase()));
  const open = t => !t.done;
  const tree = t => [t, ...t.kids.filter(open).flatMap(tree)];
  const tops = tasks.filter(t => open(t) && !(t.up && open(t.up))).map(t => ({ t, members: tree(t) })).filter(x => x.members.some(shown));
  for (const x of tops) x.due = x.members.map(m => m.due).filter(Boolean).sort()[0] || null;
  const order = (a, b) => RANK(a.t.pri) - RANK(b.t.pri) || a.t.i - b.t.i;
  const rows = (x, label) => x.members.map(m => row(m, { depth: m.depth - x.t.depth, ...label(m) })).join('');
  const header = (l, d) => l === dayName(d) && !l.includes(' ') ? `${l} <small>${l === 'Today' || l === 'Tomorrow' ? DAYS[weekday(d)].slice(0, 3) + ', ' : ''}${short(d)}</small>` : l;

  const soon = tops.filter(x => x.due).sort((a, b) => a.due.localeCompare(b.due) || order(a, b));
  $('soon').lastChild.innerHTML = list(groups(soon, x => header(soonGroup(x.due), x.due)), x => rows(x, m => {
    const g = soonGroup(x.due);
    return { label: !m.due || g === dayName(m.due) ? '' : m.due < today ? short(m.due) : dayName(m.due), late: m.due < today };
  }), 'Nothing dated. A date said at the end of a task, like “tomorrow” or “fri”, puts it here.');

  const later = tops.filter(x => !x.due).sort((a, b) => RANK(a.t.pri) - RANK(b.t.pri) || (b.t.created || '').localeCompare(a.t.created || '') || b.t.i - a.t.i);
  $('later').lastChild.innerHTML = list(groups(later, x => LATER[RANK(x.t.pri)]), x => rows(x, m => ({ label: m === x.t && m.created ? age(m.created) : '' })), 'Nothing undated.');

  const history = new Map();
  for (const t of tasks) if (t.done && t.rec && t.doneDate) history.set(routine(t), (history.get(routine(t)) || new Set()).add(t.doneDate));
  const routines = tasks.filter(t => open(t) && t.rec && shown(t)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.i - b.i);
  $('routines').lastChild.innerHTML = routines.length ? routines.map(t => row(t, {
    label: t.due ? (t.due < today ? short(t.due) : dayName(t.due)) : '', late: t.due < today, extra: strip(t, history.get(routine(t)) || new Set()),
  })).join('') : '<p class="empty">Nothing repeats. Say how often at the end of a task, like “every weekday” or “every monday”.</p>';

  const done = tasks.filter(t => t.done && shown(t)).sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || '') || b.i - a.i);
  $('done').lastChild.innerHTML = list(groups(done, t => doneGroup(t.doneDate)), t => row(t, { label: t.doneDate && doneGroup(t.doneDate) === month(t.doneDate) ? short(t.doneDate) : '' }), 'Nothing done yet.');

  if (query !== null) {
    const q = query.toLowerCase(), hit = t => [t.text, t.notes || '', ...t.ctx].join(' ').toLowerCase().includes(q);
    const found = q ? tasks.filter(hit).sort((a, b) => a.done - b.done || (a.done ? (b.doneDate || '').localeCompare(a.doneDate || '') : (a.due || '9999').localeCompare(b.due || '9999'))) : [];
    $('found').lastChild.innerHTML = q ? list(groups(found, t => t.done ? 'Done' : 'Open'), t => row(t, { label: t.done ? t.doneDate && short(t.doneDate) : t.due ? dayName(t.due) : '', late: !t.done && t.due < today }), 'No tasks match.') : '';
  }
  if (editing && $('sheet').open) fill();
}

// How steady a routine has been: one mark per day for the last two weeks (per week or month for slower ones),
// filled when it was done then.
function strip(t, dates) {
  const unit = t.rec.slice(-1), cells = [];
  if (unit === 'd' || unit === 'b') for (let k = 13; k >= 0; k--) {
    const d = addDays(today, -k);
    cells.push(`<i class="${dates.has(d) ? 'on' : unit === 'b' && [0, 6].includes(weekday(d)) ? 'off' : ''}"></i>`);
  }
  else if (unit === 'w') for (let k = 11, monday = addDays(today, -((weekday(today) + 6) % 7)); k >= 0; k--) {
    const from = addDays(monday, -7 * k), to = addDays(from, 6);
    cells.push(`<i class="${[...dates].some(d => d >= from && d <= to) ? 'on' : ''}"></i>`);
  }
  else for (let k = 11; k >= 0; k--) {
    const d = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1 - k, 1), m = iso(d).slice(0, 7);
    cells.push(`<i class="${[...dates].some(x => x.startsWith(m)) ? 'on' : ''}"></i>`);
  }
  return `<span class="strip" aria-label="Done ${dates.size} times">${cells.join('')}</span>`;
}

// The task sheet: everything about one task, changed in place.
function open(i) {
  editing = { i, line: split(text())[i] };
  if (!$('sheet').open) $('sheet').showModal();
  $('sheet').focus(); // not the first button, which would show a ring
  fill();
}
function change(f, note) { // the sheet follows the task's new line, so it's set before the list redraws
  const at = find(editing.i, editing.line);
  if (at < 0) return $('sheet').close(), toast('That task just changed on another device.');
  const line = f(editing.line);
  editing = { i: at, line };
  edit(lines => { lines[at] = line; return lines; }, note);
}
const chip = (label, on, data) => `<button type="button" class="${on ? 'on' : ''}" ${data}>${esc(label)}</button>`;
function fill() {
  const at = find(editing.i, editing.line);
  if (at < 0) return $('sheet').close();
  const t = tasks.find(x => x.i === at), soonest = ['Today', 'Tomorrow', 'Next week'];
  const dates = { Today: today, Tomorrow: addDays(today, 1), 'Next week': addDays(today, 7 - (weekday(today) + 6) % 7) };
  $('sheet-check').className = `check p${t.done ? 'x' : t.pri || ''}`;
  if (document.activeElement !== $('title')) $('title').value = t.text;
  if (document.activeElement !== $('notes')) $('notes').value = t.notes || '';
  for (const area of [$('title'), $('notes')]) { area.style.height = ''; area.style.height = area.scrollHeight + 'px'; }
  $('parent').hidden = !t.up;
  $('parent').innerHTML = t.up ? `Step of <button type="button" data-i="${t.up.i}">${esc(t.up.text)}</button>` : '';
  $('dates').innerHTML = soonest.map(l => chip(l, t.due === dates[l], `data-due="${dates[l]}"`)).join('')
    + `<label class="${t.due && !soonest.some(l => dates[l] === t.due) ? 'on' : ''}"><span>${t.due && !soonest.some(l => dates[l] === t.due) ? esc(dayName(t.due) + (t.due < today || t.due > addDays(today, 6) ? '' : ', ' + short(t.due))) : 'Pick'}</span><input type="date" value="${t.due || ''}" aria-label="Pick a date"></label>`
    + (t.due ? chip('None', false, 'data-due=""') : '') + (t.rec && t.due ? chip('Skip', false, 'data-skip') : '');
  const repeats = { None: '', Daily: '+1d', Weekdays: '+1b', Weekly: '+1w', Monthly: '+1m', Yearly: '+1y' };
  $('repeats').innerHTML = Object.entries(repeats).map(([l, r]) => chip(l, (t.rec || '') === r, `data-rec="${r}"`)).join('')
    + (t.rec && !Object.values(repeats).includes(t.rec) ? chip(repeatLabel(t), true, `data-rec="${t.rec}"`) : '');
  $('pris').innerHTML = ['A', 'B', 'C', 'D'].map(p => chip(p, t.pri === p, `data-pri="${p}"`)).join('') + chip('Waiting', t.pri === 'W' || t.pri === 'P', 'data-pri="W"') + chip('None', !t.pri, 'data-pri=""');
  const all = [...new Set([...names, ...t.ctx])];
  $('tags').innerHTML = all.map(c => chip(c, t.ctx.some(x => x.toLowerCase() === c.toLowerCase()), `data-ctx="${esc(c)}"`)).join('') + '<input id="new-tag" placeholder="New" aria-label="New category" enterkeyhint="done">';
  $('kids').innerHTML = t.kids.map(k => row(k, { up: null, label: k.due ? k.due < today ? short(k.due) : dayName(k.due) : '', late: !k.done && k.due < today })).join('');
  $('stamp').textContent = [t.created && 'Added ' + short(t.created) + (t.created.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + t.created.slice(0, 4)), t.doneDate && 'done ' + short(t.doneDate)].filter(Boolean).join(', ');
}
function commit() { // the title and notes are saved when they lose focus, on Enter, and when the sheet closes
  if (!editing) return;
  const t = parse(editing.line), title = $('title').value.replace(/\s+/g, ' ').trim(), notes = $('notes').value.trim();
  if (title && title !== t.text) change(line => setText(line, title));
  if (notes !== (t.notes || '')) change(line => setKey(line, 'notes', notes || null));
}

// Quick add: what will be added shows under the box as it's typed, and a date read from the words can be undone.
const fallback = () => picked.slice(0, 1);
function hint() {
  const value = $('add').task.value, at = value.match(/(?:^|\s)@([\w-]*)$/);
  if (!value.trim()) return $('hint').hidden = true;
  if (at) {
    const matches = names.filter(n => n.toLowerCase().startsWith(at[1].toLowerCase())).slice(0, 6);
    $('hint').innerHTML = matches.map(n => `<button type="button" data-complete="${esc(n)}">@${esc(n)}</button>`).join('');
    return $('hint').hidden = !matches.length;
  }
  const line = quick(value, today, names, fallback(), !literal), t = parse(line), read = line !== quick(value, today, names, fallback(), false);
  const parts = [t.pri && 'Priority ' + t.pri, t.due && (t.due < today ? short(t.due) : dayName(t.due) + (t.due > addDays(today, 6) ? '' : ', ' + short(t.due))), t.rec && repeatLabel(t), ...t.ctx];
  $('hint').innerHTML = parts.filter(Boolean).map(p => `<span>${esc(p)}</span>`).join('') + (read ? '<button type="button" data-literal aria-label="Keep the words as written">Keep words</button>' : '');
  $('hint').hidden = false;
}

function toast(message, undoable = false) {
  const el = $('toast');
  el.firstChild.textContent = message;
  el.lastChild.hidden = !undoable;
  if (!el.matches(':popover-open')) el.showPopover();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.hidePopover(), undoable ? 6000 : 2500);
}

function route() {
  $('lock').hidden = !!password;
  $('app').hidden = !password;
  if (password) render();
}

// Events
$('lock').onsubmit = e => {
  e.preventDefault();
  password = new FormData(e.target).get('password');
  localStorage.setItem('godwit.password', password);
  e.target.reset();
  route();
  sync();
};
$('views').onclick = e => {
  const v = e.target.closest('button')?.dataset.view;
  if (!v) return;
  view = v === view && v === 'done' && matchMedia('(min-width: 760px)').matches ? 'soon' : v;
  localStorage.setItem('godwit.view', view);
  render();
  scrollTo(0, 0);
};
$('chips').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  const c = b.dataset.ctx;
  picked = !c ? [] : picked.some(p => p.toLowerCase() === c.toLowerCase()) ? picked.filter(p => p.toLowerCase() !== c.toLowerCase()) : [...picked, c];
  localStorage.setItem('godwit.filter', JSON.stringify(picked));
  render();
  hint();
};
$('board').onclick = e => {
  const el = e.target.closest('.task');
  if (!el || e.target.closest('a')) return;
  const t = tasks.find(x => x.i === +el.dataset.i);
  if (e.target.closest('.check')) {
    const name = t.text.length > 40 ? t.text.slice(0, 38) + '…' : t.text;
    act(t.i, t.line, (lines, at) => complete(lines, at, today), t.done ? `Not done: ${name}` : t.rec ? `Done. Next: ${dayName(next(t, today))}` : `Done: ${name}`);
  } else open(t.i);
};
$('add').onsubmit = e => {
  e.preventDefault();
  const value = $('add').task.value.trim();
  if (!value) return;
  const line = quick(value, today, names, fallback(), !literal), t = parse(line);
  edit(lines => [...lines, line], `Added to ${t.rec ? 'Routines' : t.due ? 'Soon, ' + dayName(t.due) : 'Later'}`);
  $('add').task.value = '';
  literal = false;
  hint();
};
$('add').task.oninput = () => { literal = false; hint(); };
$('add').task.onkeydown = e => { if (e.key === 'Escape') { e.target.value = ''; e.target.blur(); hint(); } };
$('hint').onclick = e => {
  const b = e.target.closest('button'), input = $('add').task;
  if (!b) return;
  if (b.dataset.literal !== undefined) literal = true;
  else input.value = input.value.replace(/@[\w-]*$/, '@' + b.dataset.complete + ' ');
  input.focus();
  hint();
};
$('find').onclick = () => {
  query = query === null ? '' : null;
  $('search').hidden = query === null;
  $('chips').hidden = query !== null;
  $('search').firstChild.value = '';
  if (query !== null) $('search').firstChild.focus();
  render();
};
$('search').firstChild.oninput = e => { query = e.target.value; render(); };
$('search').firstChild.onkeydown = e => { if (e.key === 'Escape') $('find').onclick(); };
$('search').lastChild.onclick = () => $('find').onclick();
let opened = ''; // the text as the editor showed it, so changes synced in meanwhile are merged, not overwritten
$('raw').onclick = () => {
  $('file').value = opened = text() ?? '';
  $('text').showModal();
};
$('save').onclick = () => {
  edit(lines => split(merge(opened, $('file').value, join(lines))), 'Saved todo.txt');
  $('text').close();
};
$('toast').lastChild.onclick = () => { undo(); $('toast').hidePopover(); };
$('status').onclick = sync;

// In the sheet
$('sheet').addEventListener('close', () => { commit(); editing = null; });
$('sheet').onclick = e => {
  if (e.target === $('sheet')) return $('sheet').close(); // a tap outside
  const step = e.target.closest('#kids .task'), b = e.target.closest('button');
  if (step) { // a step: its circle completes it, its words open it
    const k = tasks.find(x => x.i === +step.dataset.i);
    if (b) act(k.i, k.line, (lines, at) => complete(lines, at, today));
    else { commit(); open(k.i); }
    return;
  }
  if (!b || !editing) return;
  const d = b.dataset;
  if (b.id === 'sheet-check') {
    const t = parse(editing.line);
    if (t.done) return change(line => complete([line], 0, today)[0], 'Not done');
    act(editing.i, editing.line, (lines, at) => complete(lines, at, today), t.rec ? `Done. Next: ${dayName(next(t, today))}` : 'Done');
    $('sheet').close();
  } else if (b.id === 'delete') {
    act(editing.i, editing.line, remove, 'Deleted');
    $('sheet').close();
  } else if ('i' in d) { commit(); open(+d.i); }
  else if ('due' in d) change(line => setKey(line, 'due', d.due || null));
  else if ('skip' in d) change(line => setKey(line, 'due', next(parse(line), today)), 'Skipped to ' + dayName(next(parse(editing.line), today)));
  else if ('rec' in d) change(line => d.rec && !parse(line).due ? setKey(setKey(line, 'rec', d.rec), 'due', today) : setKey(line, 'rec', d.rec || null));
  else if ('pri' in d) change(line => setPri(line, d.pri || null));
  else if ('ctx' in d) change(line => toggleCtx(line, d.ctx));
};
$('sheet').onchange = e => {
  if (e.target.type === 'date') change(line => setKey(line, 'due', e.target.value || null));
  else if (e.target.id === 'title' || e.target.id === 'notes') commit();
};
$('sheet').oninput = e => { if (e.target.tagName === 'TEXTAREA') { e.target.style.height = ''; e.target.style.height = e.target.scrollHeight + 'px'; } };
$('title').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } };
$('sheet').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'new-tag' && e.target.value.trim()) { e.preventDefault(); change(line => toggleCtx(line, e.target.value.trim().replace(/^@/, '').replace(/\s+/g, ''))); }
  if (e.target.id === 'kid' && e.target.value.trim()) {
    e.preventDefault();
    const line = quick(e.target.value.trim(), today, names, parse(editing.line).ctx);
    act(editing.i, editing.line, (lines, at) => addChild(lines, at, line));
    e.target.value = '';
  }
});

addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') || document.querySelector('dialog[open]') || e.metaKey && e.key !== 'z' || e.ctrlKey && e.key !== 'z' || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); $('add').task.focus(); }
  else if (e.key === '/') { e.preventDefault(); if (query === null) $('find').onclick(); else $('search').firstChild.focus(); }
  else if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); sync(); } });
addEventListener('online', sync);
addEventListener('storage', e => { if (e.key === 'godwit.text') render(); });
setInterval(() => {
  if (document.hidden) return;
  if (iso(new Date()) !== today) render(); // past midnight
  sync();
}, 30e3);

// Opened from the home screen's "Add task", or with text shared from another app.
const params = new URLSearchParams(location.search);
if (params.has('add') || params.has('text') || params.has('title') || params.has('url')) {
  $('add').task.value = ['title', 'text', 'url'].map(k => params.get(k)).filter(Boolean).join(' ');
  history.replaceState(null, '', location.pathname);
  requestAnimationFrame(() => { $('add').task.focus(); hint(); });
}
route();
sync();

// Production opens offline after one visit. Local development always loads the current files.
if ('serviceWorker' in navigator && !LOCAL) {
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = () => {
      if (!reg.waiting) return;
      $('update').hidden = false;
      $('update').onclick = () => { updating = true; reg.waiting.postMessage('activate'); };
    };
    offer();
    reg.addEventListener('updatefound', () => reg.installing.addEventListener('statechange', offer));
    reg.update();
  });
}
