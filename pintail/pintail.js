// Pintail: Soon (dated), Later (undated), Routines (repeating) and Done.
// One todo.txt, kept on each device and synced with the worker, merging fields by task identity.
import { parse, prepare, identify, split, join, setPri, setKey, toggleCtx, setText, complete, remove, addChild, quick, merge, next, routine, repeatLabel, iso, addDays, weekday, DAYS, MONTHS } from './todo.js';

const $ = id => document.getElementById(id);
const desktop = matchMedia('(min-width: 760px)');
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API = (LOCAL ? 'http://localhost:8790' : 'https://pintail.scottibrain.workers.dev') + '/todo.txt';

let password = localStorage.getItem('password'); // typed once on each device, and shared with ebis, myna and paisano
let view = localStorage.getItem('pintail.view') || 'soon';
let picked = JSON.parse(localStorage.getItem('pintail.filter') || '[]');
let query = null, literal = false, today = iso(new Date()), tasks = [], names = [], editing = null, opened = '', fileDraft = '', selectedVersion = '';
const undos = JSON.parse(sessionStorage.getItem('pintail.undo') || '[]');
let saveTimer;

// The list on this device, and the copy the worker last had (`base`). They differ while edits wait to sync.
const text = () => localStorage.getItem('pintail.text');
const base = () => JSON.parse(localStorage.getItem('pintail.base'));
const keep = s => localStorage.setItem('pintail.text', s);

// Every change is made to the lines as they are at that moment, so nothing from another tab or a sync is lost.
function edit(f, note, group = null) {
  const before = text() || '', after = join(prepare(f(split(before))));
  if (after === before) return;
  keep(after);
  const previous = undos.at(-1), now = Date.now();
  if (group && previous?.group === group && previous.after === before && now - previous.at < 1500) { previous.after = after; previous.at = now; }
  else if (undos.push({ before, after, group, at: now }) > 20) undos.shift();
  sessionStorage.setItem('pintail.undo', JSON.stringify(undos));
  if (note) toast(note, true);
  clearTimeout(saveTimer);
  saveTimer = null;
  if (group) {
    for (const b of document.querySelectorAll('[data-undo]')) b.hidden = false;
    saveTimer = setTimeout(() => { saveTimer = null; render(); sync(); }, 500);
  } else { render(true); sync(); }
}
function undo() {
  const u = undos.pop();
  if (!u) return;
  const result = merge(u.after, text(), u.before, { undo: true });
  keep(join(prepare(split(result.text))));
  sessionStorage.setItem('pintail.undo', JSON.stringify(undos));
  toast(result.conflicts ? 'Undone. Newer edits kept.' : 'Undone');
  render(true);
  sync();
}
const find = (i, line) => { const uid = parse(line).uid; return split(text()).findIndex(l => parse(l).uid === uid); };
function act(i, line, f, note) {
  const at = find(i, line);
  if (at < 0) return toast('That task was deleted on another device.');
  edit(lines => f(lines, at), note);
}

// Sync: send local edits with the version they were made from. If the worker has moved on, it sends its text back,
// which is merged with the edits here and sent again. One sync at a time across tabs, and one more queued behind it.
let syncing = null, again = false;
function sync() {
  if (!password) return;
  if (syncing) return void (again = true);
  syncing = navigator.locks.request('pintail-sync', exchange).then(() => status(''), e => {
    status(e.message ? 'Not synced' : 'Offline');
    if (e.message) toast(e.message);
  }).finally(() => {
    syncing = null;
    if (again) { again = false; sync(); }
  });
}
async function exchange() {
  for (;;) {
    const b = base(), mine = text(), auth = { authorization: `Bearer ${password}` }, put = b && mine !== b.text;
    const res = await fetch(API, {
      signal: AbortSignal.timeout(20e3), // a stalled connection counts as offline and is tried again later
      ...put ? { method: 'PUT', headers: { ...auth, 'if-match': `"${b.v}"`, 'content-type': 'text/plain; charset=utf-8' }, body: mine }
        : { headers: b ? { ...auth, 'if-none-match': `"${b.v}"` } : auth, cache: 'no-store' },
    }).catch(() => null);
    if (!res) throw new Error(); // offline: the edits wait here
    if (res.status === 401) return lock();
    if (res.status === 304) return;
    if (![200, 204, 412].includes(res.status)) throw new Error(await res.text());
    const v = +res.headers.get('etag').match(/\d+/)[0]; // Cloudflare sends it as W/"7" when it compresses
    if (res.status === 204) {
      localStorage.setItem('pintail.base', JSON.stringify({ v, text: mine }));
      if (text() === mine) return;
      continue;
    }
    const theirs = await identify(await res.text(), b?.text || ''), now = text();
    const result = merge(b?.text || '', now || '', theirs);
    keep(result.text);
    if (editing && result.conflicts) {
      const previous = parse(editing.line), fields = ['text', 'notes', 'due', 'rec', 'pri'];
      const score = t => fields.filter(k => t[k] === previous[k]).length;
      const candidates = split(result.text).map(parse).filter(t => t.uid === previous.uid || t.conflict === previous.uid);
      candidates.sort((a, b) => score(b) - score(a));
      if (candidates.length) editing.line = candidates[0].line;
    }
    if (result.conflicts) toast('Both versions kept. Search “conflict” to review.');
    localStorage.setItem('pintail.base', JSON.stringify({ v, text: theirs }));
    render();
    if (text() === theirs) return;
  }
}
function status(message) {
  $('status').textContent = message;
  $('status').hidden = !message;
}
function lock() {
  localStorage.removeItem('password');
  password = null;
  route();
}

// Labels for dates.
const short = d => `${MONTHS[+d.slice(5, 7) - 1].slice(0, 3)} ${+d.slice(8)}`;
const month = d => MONTHS[+d.slice(5, 7) - 1] + (d.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + d.slice(0, 4));
const near = d => d > today && d <= addDays(today, 6);
const dayName = d => d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : near(d) ? DAYS[weekday(d)] : short(d);
const long = d => dayName(d) + (near(d) ? ', ' + short(d) : '');
const ago = d => d === today ? 'today' : d === addDays(today, -1) ? 'yesterday' : d > addDays(today, -7) ? DAYS[weekday(d)] : short(d);
const soonGroup = d => d < today ? 'Overdue' : d <= addDays(today, 6) ? dayName(d) : (d.slice(0, 7) === today.slice(0, 7) ? 'Later in ' : '') + month(d);
const doneGroup = d => !d ? 'Some time' : d > addDays(today, -7) ? ago(d).replace(/^./, c => c.toUpperCase()) : month(d);
function age(d) {
  const n = Math.round((new Date(today) - new Date(d)) / 864e5);
  return n < 1 ? 'new' : n < 14 ? n + 'd' : n < 60 ? Math.round(n / 7) + 'w' : n < 700 ? Math.round(n / 30.4) + 'mo' : Math.round(n / 365) + 'y';
}
const RANK = p => ['A', 'B', 'C'].includes(p) ? 'ABC'.indexOf(p) : 3;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const linked = s => s.split(/(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)\]'])/).map((part, k) => {
  const shown = part.replace(/^https?:\/\/(www\.)?/, '');
  return k % 2 ? `<a href="${esc(part)}" target="_blank" rel="noopener">${esc(shown.length > 34 ? shown.slice(0, 32) + '…' : shown)}</a>` : esc(part);
}).join('');

// A category's name gives it the same feather colour in every view and on every device.
function categoryColor(name) {
  let hash = 2166136261;
  for (const c of name.toLowerCase()) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
  return `var(--${['teal', 'sage', 'blue', 'ochre', 'plum', 'clay'][(hash >>> 0) % 6]})`;
}
const category = name => `<span class="category" style="--category:${categoryColor(name)}">${esc(name)}</span>`;

// The first category colours the title; only conflicts and a detached step's parent need an extra label.
function row(t, { depth = 0, label = '', late = false, extra = '', up = depth === 0 && t.up } = {}) {
  const meta = [t.conflict && 'Conflict: review both versions', up && esc('↳ ' + up.text)].filter(Boolean);
  return `<div class="task${depth ? ' step' : ''}${t.done ? ' done' : ''}" data-i="${t.i}" data-uid="${esc(t.uid)}" style="--depth:${depth};--category:${t.ctx.length ? categoryColor(t.ctx[0]) : 'var(--ink)'}" tabindex="0">
    <button class="check p${t.done ? 'x' : t.pri || ''}" aria-label="${t.done ? 'Reopen' : 'Complete'} ${esc(t.text)}${!t.done && t.pri ? ', priority ' + t.pri : ''}" aria-pressed="${t.done}" title="${t.done ? 'Reopen' : t.pri ? 'Priority ' + t.pri : 'Complete'}" tabindex="-1"><span aria-hidden="true">${!t.done && t.pri || ''}</span></button>
    <div class="body"><span class="title" title="${esc(t.ctx.join(' · '))}">${linked(t.text || t.line.trim())}</span>${meta.length ? `<span class="meta">${meta.join(' · ')}</span>` : ''}${t.notes ? `<span class="note">${linked(t.notes.split('\n')[0])}</span>` : ''}${extra}</div>
    ${label ? `<span class="when${late ? ' late' : ''}">${esc(label)}</span>` : ''}
  </div>`;
}
const groups = (items, label) => items.reduce((out, x) => {
  const l = label(x);
  if (out.at(-1)?.[0] !== l) out.push([l, []]);
  out.at(-1)[1].push(x);
  return out;
}, []);
const list = (gs, rows, empty, head = l => l) => gs.length ? gs.map(([l, xs]) => `<div class="group"><h3>${head(l, xs)}</h3>${xs.map(rows).join('')}</div>`).join('') : `<p class="empty">${empty}</p>`;

// Measure only visible rows. The DOM changes synchronously, so keyboard actions keep their place.
const motion = matchMedia('(prefers-reduced-motion: reduce)');
function rowRects() {
  const result = new Map();
  for (const el of document.querySelectorAll('#board .task')) {
    const rect = el.getBoundingClientRect();
    if (rect.width && rect.bottom > 0 && rect.top < innerHeight && getComputedStyle(el).visibility !== 'hidden') result.set(el.closest('section').id + ':' + el.dataset.uid, { el, rect });
  }
  return result;
}
function render(animate = false) {
  const before = animate && !motion.matches && !document.querySelector('dialog[open]') ? rowRects() : null;
  const raw = text(), focused = document.activeElement.closest('#board .task, #finished-list button'), was = focused?.dataset.uid, section = focused?.closest('section');
  for (const b of document.querySelectorAll('[data-undo]')) b.hidden = !undos.length;
  document.body.dataset.view = view;
  document.body.classList.toggle('finding', query !== null);
  for (const b of $('views').children) {
    const on = b.dataset.view === view || b.dataset.view === 'soon' && view !== 'done' && desktop.matches;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
  }
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

  const finished = tasks.filter(t => t.done && t.doneDate === today);
  $('finished').hidden = !finished.length;
  $('finished-count').textContent = finished.length;
  patch('finished-list', finished.map(t => `<button data-i="${t.i}" data-uid="${esc(t.uid)}" title="${esc(t.text)}" style="--category:${t.ctx.length ? categoryColor(t.ctx[0]) : 'var(--ink-2)'}"><span aria-hidden="true">✓</span><span>${esc(t.text)}</span></button>`).join(''));

  // The categories are the @contexts, most used first, which keeps their order steady as tasks get done.
  const counts = new Map();
  for (const t of tasks) for (const c of t.ctx) {
    const k = counts.get(c.toLowerCase()) || { name: c, n: 0, all: 0 };
    k.n += !t.done;
    k.all++;
    counts.set(c.toLowerCase(), k);
  }
  const ranked = [...counts.values()].sort((a, b) => b.all - a.all || a.name.localeCompare(b.name));
  names = ranked.map(k => k.name);
  const chips = ranked.filter(k => k.n || picked.some(p => same(p, k.name)));
  $('chips').hidden = query !== null || !chips.length;
  patch('chips', `<button class="${picked.length ? '' : 'on'}" data-ctx="" aria-pressed="${!picked.length}">All</button>` + chips.map(k => {
    const on = picked.some(p => same(p, k.name));
    return `<button class="${on ? 'on' : ''}" data-ctx="${esc(k.name)}" style="--category:${categoryColor(k.name)}" aria-pressed="${on}">${esc(k.name)}<small>${k.n}</small></button>`;
  }).join(''));

  const shown = t => !picked.length || t.ctx.some(c => picked.some(p => same(p, c)));
  const open = t => !t.done;
  const tree = t => [t, ...t.kids.filter(open).flatMap(tree)];

  const tops = tasks.filter(t => open(t) && !(t.up && open(t.up))).map(t => ({ t, members: tree(t) })).filter(x => x.members.some(shown));
  for (const x of tops) x.due = x.members.map(m => m.due).filter(Boolean).sort()[0] || null;
  const rows = (x, label) => x.members.map(m => row(m, { depth: m.depth - x.t.depth, ...label(m) })).join('');

  const soon = tops.filter(x => x.due).sort((a, b) => a.due.localeCompare(b.due) || RANK(a.t.pri) - RANK(b.t.pri) || a.t.i - b.t.i);
  const movable = tasks.filter(t => !t.done && !t.rec && t.due && t.due < today && tops.some(x => x.members.includes(t)));
  patch('soon-list', list(groups(soon, x => soonGroup(x.due)), x => rows(x, m => {
    const g = soonGroup(x.due);
    return { label: !m.due || g === dayName(m.due) ? '' : dayName(m.due), late: m.due < today };
  }), 'Nothing scheduled. Add a task with a day, like “Call Sam fri”.', (l, xs) =>
    l === 'Overdue' ? `${l}${movable.length ? `<button class="move" data-move>Move ${movable.length} to today</button>` : ''}` : near(xs[0].due) || xs[0].due === today ? `${l} <small>${short(xs[0].due)}</small>` : l));

  $('soon-count').textContent = soon.reduce((n, x) => n + x.members.length, 0);

  // Later: what has no day, by category, the most important and then the newest first.
  const group = x => x.t.ctx.find(c => !picked.length || picked.some(p => same(p, c))) || '';
  const placed = c => c ? names.findIndex(n => same(n, c)) : names.length;
  const later = tops.filter(x => !x.due).sort((a, b) => placed(group(a)) - placed(group(b)) || RANK(a.t.pri) - RANK(b.t.pri) || (b.t.created || '').localeCompare(a.t.created || '') || b.t.i - a.t.i);
  patch('later-list', list(groups(later, x => names[placed(group(x))] || 'No category'), x => rows(x, m => ({ label: m === x.t && m.created ? age(m.created) : '' })),
    'No undated tasks. Leave off the date to keep a task here.', (l, xs) => group(xs[0]) ? category(l) : esc(l)));

  $('later-count').textContent = later.reduce((n, x) => n + x.members.length, 0);
  const history = new Map();
  for (const t of tasks) if (t.done && t.rec && t.doneDate) history.set(routine(t), (history.get(routine(t)) || new Set()).add(t.doneDate));
  const routines = tasks.filter(t => open(t) && t.rec && shown(t)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.i - b.i);
  $('routine-toggle').textContent = `Routines · ${routines.length}`;
  $('routine-toggle').setAttribute('aria-expanded', localStorage.getItem('pintail.routines') === 'open');
  $('routines').classList.toggle('collapsed', localStorage.getItem('pintail.routines') !== 'open');
  patch('routines-list', routines.length ? routines.map(t => row(t, {
    label: t.due ? dayName(t.due) : '', late: t.due < today, extra: strip(t, history.get(routine(t)) || new Set()),
  })).join('') : '<p class="empty">No routines yet. Try “Journal every weekday” or “Water plants every 3 days”.</p>');

  const done = tasks.filter(t => t.done && shown(t)).sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || '') || b.i - a.i);
  patch('done-list', list(groups(done, t => doneGroup(t.doneDate)), t => row(t, { label: t.doneDate && doneGroup(t.doneDate) === month(t.doneDate) ? short(t.doneDate) : '' }), 'Nothing done yet.'));

  $('done-count').textContent = done.length;

  if (query !== null) {
    const q = query.toLowerCase(), hit = t => [t.text, t.notes || '', t.conflict ? 'conflict' : '', ...t.ctx].join(' ').toLowerCase().includes(q);
    const found = q ? tasks.filter(hit).sort((a, b) => a.done - b.done || (a.done ? (b.doneDate || '').localeCompare(a.doneDate || '') : (a.due || '9999').localeCompare(b.due || '9999'))) : [];
    patch('found-list', q ? list(groups(found, t => t.done ? 'Done' : 'Open'), t => row(t, { label: t.done ? t.doneDate && short(t.doneDate) : t.due ? dayName(t.due) : '', late: !t.done && t.due < today }), 'No tasks match.') : '');
  }
  if (editing && $('sheet').open) fill();
  // Redrawing replaces the rows, so the task that had the keyboard's focus gets it back.
  if (was && section) [...section.querySelectorAll('[data-uid]')].find(el => el.dataset.uid === was && el.offsetParent)?.focus({ preventScroll: true });
  if (before) {
    const after = rowRects(), timing = { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' };
    for (const [id, { el, rect }] of after) {
      const old = before.get(id)?.rect;
      if (!old) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], timing);
      else if (Math.abs(old.top - rect.top) > 1 || Math.abs(old.left - rect.left) > 1) el.animate([{ transform: `translate(${old.left - rect.left}px, ${old.top - rect.top}px)` }, { transform: 'none' }], timing);
    }
    const done = new Set(tasks.filter(t => t.done).map(t => t.uid));
    for (const [id, { el, rect }] of before) if (!after.has(id) && !el.isConnected) {
      const ghost = el.cloneNode(true);
      ghost.classList.add('task-ghost'); ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
      if (done.has(el.dataset.uid)) { ghost.classList.add('done'); ghost.querySelector('.check').classList.add('px'); }
      Object.assign(ghost.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' });
      document.body.append(ghost);
      ghost.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(8px)' }], { duration: 160, fill: 'forwards' }).finished.then(() => ghost.remove());
    }
  }
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
    const m = iso(new Date(+today.slice(0, 4), +today.slice(5, 7) - 1 - k, 1)).slice(0, 7);
    cells.push(`<i class="${[...dates].some(d => d.startsWith(m)) ? 'on' : ''}"></i>`);
  }
  const period = unit === 'd' || unit === 'b' ? '14 days' : unit === 'w' ? '12 weeks' : '12 months';
  return `<span class="strip" role="img" aria-label="Last ${period}; ${dates.size} completion days in all" title="Last ${period}; ${dates.size} completion days in all">${cells.join('')}<small>${period}</small></span>`;
}

// The task sheet: everything about one task, changed in place.
function open(i) {
  $('new-tag').value = $('kid').value = '';
  editing = { i, line: split(text())[i] };
  if (!$('sheet').open) $('sheet').showModal();
  $('sheet').querySelector('.head').focus({ preventScroll: true });
  fill();
}
function change(f, note, group) { // the sheet follows the task's new line, so it's set before the list redraws
  const at = find(editing.i, editing.line);
  if (at < 0) return $('sheet').close(), toast('That task just changed on another device.');
  const line = f(split(text())[at]);
  editing = { i: at, line };
  edit(lines => { lines[at] = line; return lines; }, note, group);
}
const chip = (label, on, data) => `<button type="button" class="${on ? 'on' : ''}" aria-pressed="${on}" ${data}>${esc(label)}</button>`;
function patch(id, html) { if ($(id).innerHTML !== html) $(id).innerHTML = html; }
function fill() {
  const at = find(editing.i, editing.line);
  if (at < 0) return $('sheet').close();
  const t = tasks.find(x => x.i === at), soonest = ['Today', 'Tomorrow', 'Next week'];
  const dates = { Today: today, Tomorrow: addDays(today, 1), 'Next week': addDays(today, 7 - (weekday(today) + 6) % 7) };
  const other = t.due && !soonest.some(l => dates[l] === t.due);
  editing = { i: at, line: t.line };
  $('resolve').hidden = !t.conflict;
  $('sheet-check').setAttribute('aria-label', (t.done ? 'Reopen ' : 'Complete ') + t.text);
  $('sheet-check').setAttribute('aria-pressed', t.done);
  $('sheet-check').className = `check p${t.done ? 'x' : t.pri || ''}`;
  $('sheet-check').textContent = !t.done && t.pri || '';
  if (document.activeElement !== $('title')) $('title').value = t.text;
  if (document.activeElement !== $('notes')) $('notes').value = t.notes || '';
  for (const area of [$('title'), $('notes')]) { area.style.height = ''; area.style.height = area.scrollHeight + 'px'; }
  $('parent').hidden = !t.up;
  patch('parent', t.up ? `Step of <button type="button" data-i="${t.up.i}">${esc(t.up.text)}</button>` : '');
  patch('dates', soonest.map(l => chip(l, t.due === dates[l], `data-due="${dates[l]}"`)).join('')
    + `<label class="${other ? 'on' : ''}"><span>${other ? esc(long(t.due)) : 'Pick'}</span><input type="date" value="${t.due || ''}" aria-label="Pick a date"></label>`
    + (t.due ? chip('None', false, 'data-due=""') : '') + (t.rec && t.due ? chip('Skip', false, 'data-skip') : ''));
  const repeats = { None: '', Daily: '+1d', Weekdays: '+1b', Weekly: '+1w', Monthly: '+1m', Yearly: '+1y' };
  patch('repeats', Object.entries(repeats).map(([l, r]) => chip(l, (t.rec || '') === r, `data-rec="${r}"`)).join('')
    + (t.rec && !Object.values(repeats).includes(t.rec) ? chip(repeatLabel(t), true, `data-rec="${t.rec}"`) : ''));
  patch('pris', ['A', 'B', 'C'].map(p => chip(p, t.pri === p, `data-pri="${p}"`)).join('') + chip('None', !['A', 'B', 'C'].includes(t.pri), 'data-pri=""'));
  patch('tags', [...new Set([...names, ...t.ctx])].map(c => chip(c, t.ctx.some(x => same(x, c)), `data-ctx="${esc(c)}" style="--category:${categoryColor(c)}"`)).join(''));
  patch('kids', t.kids.map(k => row(k, { up: null, label: k.due ? dayName(k.due) : '', late: !k.done && k.due < today })).join(''));
  $('stamp').textContent = [t.created && 'Added ' + short(t.created) + (t.created.slice(0, 4) === today.slice(0, 4) ? '' : ' ' + t.created.slice(0, 4)), t.doneDate && 'done ' + short(t.doneDate)].filter(Boolean).join(', ');
}
function commit() {
  if (!editing) return;
  const t = parse(editing.line), title = $('title').value.replace(/\s+/g, ' ').trim(), notes = $('notes').value;
  if (title && title !== t.text) change(line => setText(line, title), null, t.uid + ':title');
  if (notes !== (t.notes || '')) change(line => setKey(line, 'notes', notes), null, t.uid + ':notes');
}
const setDue = (line, due) => setKey(setKey(line, 'due', due), 'anchor', due && parse(line).rec ? due.slice(5) : null);

// Quick add: what will be added shows under the box as it's typed, and a date read from the words can be undone.
const fallback = () => picked.slice(0, 1);
function hint() {
  const value = $('add').task.value, at = value.match(/(?:^|\s)@([\w-]*)$/);
  $('capture').disabled = !value.trim();
  if (!value.trim()) return $('hint').hidden = true;
  if (at) {
    const matches = names.filter(n => n.toLowerCase().startsWith(at[1].toLowerCase())).slice(0, 6);
    $('hint').innerHTML = matches.map(n => `<button type="button" class="category" data-complete="${esc(n)}" style="--category:${categoryColor(n)}">@${esc(n)}</button>`).join('');
    return $('hint').hidden = !matches.length;
  }
  const line = quick(value, today, names, fallback(), !literal), t = parse(line), read = line !== quick(value, today, names, fallback(), false);
  const parts = [read && t.text, t.pri && 'Priority ' + t.pri, t.due && long(t.due), t.rec && repeatLabel(t)];
  $('hint').innerHTML = parts.filter(Boolean).map(p => `<span>${esc(p)}</span>`).join('') + t.ctx.map(category).join('') + (read ? '<button type="button" data-literal aria-label="Keep the words as written">Keep words</button>' : '');
  $('hint').hidden = false;
}

function toast(message, undoable = false, uid = null) {
  const el = $('toast');
  el.querySelector('span').textContent = message;
  $('toast-undo').hidden = !undoable;
  $('toast-open').hidden = !uid;
  $('toast-open').onclick = () => { const at = split(text()).findIndex(l => parse(l).uid === uid); if (at >= 0) open(at); el.hidePopover(); };
  if (!el.matches(':popover-open')) el.showPopover();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.hidePopover(), undoable || uid ? 6000 : 3000);
}

function route() {
  $('lock').hidden = !!password;
  $('app').hidden = !password;
  if (password) render();
}

// Events
$('lock').onsubmit = e => {
  e.preventDefault();
  password = new FormData(e.target).get('password').trim(); // a phone keyboard may add a space after the word
  localStorage.setItem('password', password);
  e.target.reset();
  route();
  sync();
};
$('views').onclick = e => {
  const v = e.target.closest('button')?.dataset.view;
  if (!v) return;
  view = v === view && v === 'done' && desktop.matches ? 'soon' : v;
  localStorage.setItem('pintail.view', view);
  render(true);
  scrollTo(0, 0);
};
$('chips').onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  const c = b.dataset.ctx;
  picked = !c ? [] : picked.some(p => same(p, c)) ? picked.filter(p => !same(p, c)) : [...picked, c];
  localStorage.setItem('pintail.filter', JSON.stringify(picked));
  render(true);
  hint();
};
$('app').addEventListener('click', e => { // task rows and Move to today
  if (e.target.closest('[data-move]')) {
    const late = new Set([...document.querySelectorAll('#soon .task')].map(row => tasks.find(x => x.i === +row.dataset.i)).filter(t => !t.rec && t.due && t.due < today).map(t => t.line));
    return edit(lines => lines.map(l => late.has(l) ? setKey(l, 'due', today) : l), `Moved ${late.size} to today`);
  }
  const el = e.target.closest('#board .task, #finished-list button');
  if (!el || e.target.closest('a')) return;
  const t = tasks.find(x => x.i === +el.dataset.i);
  if (!e.target.closest('.check')) return open(t.i);
  const name = t.text.length > 40 ? t.text.slice(0, 38) + '…' : t.text;
  act(t.i, t.line, (lines, at) => complete(lines, at, today), t.done ? `Not done: ${name}` : t.rec ? `Done. Next: ${dayName(next(t, today))}` : `Done: ${name}`);
});
$('add').onsubmit = e => {
  e.preventDefault();
  const value = $('add').task.value.trim();
  if (!value) return;
  const line = prepare([quick(value, today, names, fallback(), !literal)])[0], t = parse(line);
  edit(lines => [...lines, line], 'Added to ' + (t.rec ? 'Routines' : t.due ? 'Soon, ' + dayName(t.due) : 'Later'));
  toast('Added to ' + (t.rec ? 'Routines' : t.due ? 'Soon, ' + dayName(t.due) : 'Later'), true, t.uid);
  $('add').task.value = '';
  literal = false;
  hint();
};
// Pasting several lines, from notes or a message, adds each as its own task; list bullets are dropped.
$('add').task.onpaste = e => {
  const lines = e.clipboardData.getData('text').split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?/, '').trim()).filter(Boolean);
  if (lines.length < 2) return;
  e.preventDefault();
  edit(all => [...all, ...lines.map(l => quick(l, today, names, fallback()))], `Added ${lines.length} tasks`);
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
  $('search').firstChild.value = '';
  if (query !== null) $('search').firstChild.focus();
  render(true);
};
$('search').firstChild.oninput = e => { query = e.target.value; render(); };
$('search').firstChild.onkeydown = e => { if (e.key === 'Escape') $('find').onclick(); };
$('search').lastChild.onclick = () => $('find').onclick();
// The whole todo.txt by hand. Saving merges with whatever synced in while it was open, rather than overwriting it.
$('raw').onclick = () => {
  $('file').value = fileDraft = opened = text() ?? '';
  selectedVersion = '';
  $('versions').innerHTML = '<option value="">Current version</option>';
  $('save').textContent = 'Save';
  $('text').showModal();
  loadVersions();
};
async function loadVersions(before = '') {
  const res = await fetch(API.replace('/todo.txt', '/versions') + (before ? '?before=' + before : ''), { headers: { authorization: `Bearer ${password}` }, cache: 'no-store' }).catch(() => null);
  if (!res) return toast('Offline. Previous versions need a connection.');
  if (!res.ok) return toast(await res.text());
  const versions = await res.json();
  $('versions').querySelector('[data-older]')?.remove();
  for (const v of versions) $('versions').add(new Option(`v${v.v} · ${new Date(v.at).toLocaleString()}`, v.v));
  if (versions.length === 100) {
    const option = new Option('Older versions…', 'older:' + versions.at(-1).v);
    option.dataset.older = ''; $('versions').add(option);
  }
}
$('versions').onchange = async () => {
  const v = $('versions').value;
  if (v.startsWith('older:')) { await loadVersions(v.slice(6)); $('versions').value = selectedVersion; return; }
  if (!v) { $('file').value = fileDraft; selectedVersion = ''; $('save').textContent = 'Save'; return; }
  const res = await fetch(API + '?version=' + v, { headers: { authorization: `Bearer ${password}` }, cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) { $('versions').value = selectedVersion; return toast(res ? await res.text() : 'Offline. That version could not be loaded.'); }
  const content = await res.text();
  if ($('versions').value !== v) return;
  selectedVersion = v;
  $('file').value = content;
  $('save').textContent = 'Restore';
};
$('download').onclick = () => {
  const url = URL.createObjectURL(new Blob([$('file').value], { type: 'text/plain;charset=utf-8' })), link = document.createElement('a');
  link.href = url; link.download = `pintail-${today}.txt`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('save').onclick = async () => {
  $('save').disabled = true;
  const edited = await identify($('file').value, opened), result = merge(opened, edited, text() || '');
  edit(() => split(result.text), result.conflicts ? 'Saved. Both conflicting versions kept.' : $('save').textContent === 'Restore' ? 'Restored previous version' : 'Saved todo.txt');
  $('save').disabled = false;
  $('text').close();
};
$('file').oninput = () => { if (!selectedVersion) fileDraft = $('file').value; };
$('file').onkeydown = e => {
  if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertText', false, '\t'); } // a tab makes a step
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('save').click();
};
for (const b of document.querySelectorAll('[data-undo]')) b.onclick = () => { undo(); $('toast').hidePopover(); };
$('routine-toggle').onclick = () => { localStorage.setItem('pintail.routines', $('routines').classList.contains('collapsed') ? 'open' : 'closed'); render(); };
$('help-open').onclick = () => $('help').showModal();
$('status').onclick = sync;

// In the sheet
$('sheet').addEventListener('close', () => { editing = null; if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; render(); sync(); } });
$('sheet').onclick = e => {
  const step = e.target.closest('#kids .task'), b = e.target.closest('button');
  if (step) { // a step: its circle completes it, its words open it
    const k = tasks.find(x => x.i === +step.dataset.i);
    if (b) act(k.i, k.line, (lines, at) => complete(lines, at, today));
    else open(k.i);
    return;
  }
  if (!b || !editing) return;
  const d = b.dataset;
  if (b.id === 'sheet-check') {
    const t = parse(editing.line);
    act(editing.i, editing.line, (lines, at) => complete(lines, at, today), t.done ? 'Reopened' : t.rec ? `Done. Next: ${dayName(next(t, today))}` : 'Done');
    $('sheet').close();
  } else if (b.id === 'delete') {
    act(editing.i, editing.line, remove, 'Deleted');
    $('sheet').close();
  } else if ('i' in d) open(+d.i);
  else if ('due' in d) change(line => setDue(line, d.due));
  else if ('skip' in d) change(line => setKey(line, 'due', next(parse(line), today)), 'Skipped to ' + dayName(next(parse(editing.line), today)));
  else if ('rec' in d) change(line => { const due = parse(line).due || today; return setDue(setKey(line, 'rec', d.rec), d.rec ? due : parse(line).due); });
  else if (b.id === 'resolve') change(line => setKey(line, 'conflict', null), 'Marked reviewed');
  else if ('pri' in d) change(line => setPri(line, d.pri || null));
  else if ('ctx' in d) change(line => toggleCtx(line, d.ctx));
};
$('sheet').onchange = e => {
  if (e.target.type === 'date') change(line => setDue(line, e.target.value));
};
$('sheet').oninput = e => { if (e.target.tagName === 'TEXTAREA') { e.target.style.height = ''; e.target.style.height = e.target.scrollHeight + 'px'; if (!e.isComposing) commit(); } };
$('sheet').addEventListener('compositionend', commit);
$('sheet').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return; // Enter that finishes a Korean or other IME word isn't a submit
  const value = e.target.value?.trim();
  if (e.target.id === 'title') { e.preventDefault(); e.target.blur(); }
  if (e.target.id === 'new-tag' && value) { e.preventDefault(); e.target.value = ''; change(line => toggleCtx(line, value.replace(/^@/, '').replace(/\s+/g, ''))); }
  if (e.target.id === 'kid' && value) {
    e.preventDefault();
    const line = quick(value, today, names, parse(editing.line).ctx);
    act(editing.i, editing.line, (lines, at) => addChild(lines, at, line));
    e.target.value = '';
  }
});

// On a laptop: n adds, / searches, j and k (or the arrows) move between tasks, Enter opens one, x marks it done,
// and Cmd or Ctrl+Z undoes.
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') || e.isComposing) return;
  if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); return undo(); }
  if (document.querySelector('dialog[open]') || e.metaKey && e.key !== 'z' || e.ctrlKey && e.key !== 'z' || e.altKey) return;
  const rows = () => [...document.querySelectorAll('#board .task')].filter(el => el.offsetParent && getComputedStyle(el).visibility !== 'hidden');
  const row = e.target.closest('.task'), at = rows().indexOf(row), task = row && tasks.find(x => x.i === +row.dataset.i);
  if (e.key === 'j' || e.key === 'k' || row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const all = rows();
    all[at < 0 ? 0 : Math.max(0, Math.min(all.length - 1, at + (e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
  } else if (task && e.key === 'Enter') open(task.i);
  else if (task && e.key === 'x') {
    const section = row.closest('section'), index = [...section.querySelectorAll('.task')].indexOf(row);
    row.querySelector('.check').click();
    const remaining = [...section.querySelectorAll('.task')].filter(el => el.offsetParent);
    remaining[Math.min(index, remaining.length - 1)]?.focus({ preventScroll: true });
  } // the task that took its place
  else if (e.key === '?') $('help').showModal();
  else if (e.key === 'n') { e.preventDefault(); $('add').task.focus(); }
  else if (e.key === '/') { e.preventDefault(); if (query === null) $('find').onclick(); else $('search').firstChild.focus(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); sync(); } });
addEventListener('online', sync);
addEventListener('storage', e => { if (e.key === 'pintail.text') render(); });
setInterval(() => {
  if (document.hidden) return;
  if (iso(new Date()) !== today) render(); // past midnight
  sync();
}, 30e3);

const sizes = new ResizeObserver(entries => {
  for (const { target } of entries) document.documentElement.style.setProperty('--' + target.id + '-height', target.getBoundingClientRect().height + 'px');
});
for (const id of ['add', 'masthead']) sizes.observe($(id));
desktop.addEventListener('change', () => render());

// Migrate cached files once, under the same lock as sync. Legacy devices derive the same task IDs.
await navigator.locks.request('pintail-sync', async () => {
  const b = base(), before = text();
  const canonical = b ? await identify(b.text) : '';
  const local = before === null ? null : await identify(before, canonical);
  if (text() !== before) throw new Error('Another tab edited Pintail during the update. Reload to finish.');
  if (b) localStorage.setItem('pintail.base', JSON.stringify({ v: b.v, text: canonical }));
  if (local !== null) keep(local);
});
route();
sync();
// Opened with text or a link shared from another app.
const params = new URLSearchParams(location.search);
if (params.size) {
  $('add').task.value = ['title', 'text', 'url'].map(k => params.get(k)).filter(Boolean).join(' ');
  history.replaceState(null, '', location.pathname);
  $('add').task.focus();
  hint();
}

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
