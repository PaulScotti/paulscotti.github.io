// Myna: Korean flashcards, said aloud. A session first shows its new words, stepped through with ← and →, then
// asks each card one way, Korean or English first. The answer comes after a moment to think, or at once on any
// key, and then the card is marked: → correct, ← incorrect. In the Android app the volume keys do the same.

import config from './config.js';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8788' : 'https://myna.scottibrain.workers.dev';
const GAP = 4; // cards between missing a card and its next asking; new words are first asked among this many reviews
const GRACE = 600; // ms after an answer comes by itself in which a key still only meant "show it"
const android = window.MynaAndroid; // the Android app's bridge; a browser has none
const $ = id => document.getElementById(id);
const audio = new AudioContext();
const clips = new Map(); // "lang:text" → that line's mp3, fetched once
let password = localStorage.getItem('myna.password'); // typed once on each device
let day, levels, words = [], queue = [], at = 0, card = null, run = 0, shown = false, grace = 0, timer = 0, saving = false, sound = null, toasting = 0;
let tally; // the session so far: when it began, its new words, and each card's first answer and its level before and after

// The day turns at 4 am, so a late session counts for the day it began.
const today = () => new Date(Date.now() - 4 * 3600e3).toLocaleDateString('sv');
const shuffle = list => list.map(c => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);

async function api(path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { authorization: `Bearer ${password}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (res.status === 401) { // the password changed: this device asks for it again
    localStorage.removeItem('myna.password');
    password = null;
    route();
  }
  if (!res.ok) throw new Error(await res.text());
  return res;
}

// Today's session, or with early, the next one. New words are first asked among the first few reviews.
async function load(early) {
  day = today();
  $('plan').textContent = early ? 'Getting the next session…' : 'Getting today’s cards…';
  $('begin').hidden = $('early').hidden = true;
  const res = await (await api('/today', { day, early })).json();
  words = res.cards.filter(c => c.fresh);
  const due = shuffle(res.cards.filter(c => !c.fresh));
  queue = [...shuffle([...words.map(c => ({ ...c, fresh: false })), ...due.slice(0, GAP)]), ...due.slice(GAP)];
  levels = res.levels;
  soon([...words, ...queue]);
  desk();
}

function desk() {
  const fresh = words.length, due = queue.length - fresh;
  $('plan').textContent = queue.length ? `${[due && `${due} to review`, fresh && `${fresh} new word${fresh > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}.` : 'Done for today.';
  $('begin').hidden = !queue.length;
  $('early').hidden = !!queue.length;
  const most = Math.max(...levels);
  $('levels').innerHTML = levels.map((n, l) => `<div style="--h:${n / most}"><span>${n}</span><i></i><b>${l}</b></div>`).join('')
    + '<figcaption>Words by level, from new to mastered</figcaption>';
}

// Where the app is: the desk, a session (#study), every word (#words), or adding words (#add). Back leaves each.
function route() {
  const hash = location.hash, studying = hash === '#study';
  if (!studying && !$('study').hidden) { // back from a session, finished or not
    silence();
    card = null;
    load();
  }
  if (hash === '#words' && $('deck').hidden) deck();
  $('lock').hidden = !!password;
  $('desk').hidden = studying || !password;
  $('study').hidden = !studying || !password;
  $('deck').hidden = hash !== '#words' || !password;
  if (hash !== '#add') $('sheet').close();
  else if (!$('sheet').open) $('sheet').showModal();
  android?.keys(studying);
}

// A session.

function begin() {
  audio.resume();
  location.hash = 'study';
  tally = { start: Date.now(), met: words, cards: new Map() };
  $('session').hidden = false;
  $('summary').hidden = true;
  at = 0;
  if (words.length) meet();
  else next();
}

// The new words, one at a time: Korean, English, Korean again.
function meet() {
  silence();
  card = words[at];
  show(['ko', 'en'], words.length > 1 ? `New word · ${at + 1} of ${words.length}` : 'New word', 'meet', at, words.length - at + queue.length);
  soon([...words.slice(at + 1), ...queue]);
  say(run, [[card.ko, 'ko'], [card.en, 'en'], [card.ko, 'ko']]);
}

function next() {
  silence();
  card = queue.shift();
  if (!card) return summary();
  const mine = run, [q] = show(card.front === 'ko' ? ['ko', 'en'] : ['en', 'ko'], '', 'ask', words.length + tally.cards.size, queue.length + 1);
  soon(queue);
  say(mine, [[card[q], q]]).then(length => { if (mine === run) timer = setTimeout(reveal, (config.think.seconds + length * config.think.times) * 1000, true); });
}

// Fills in the card, its controls and the progress so far; returns the card's two sides in the order asked.
function show([q, a], tag, controls, done, left) {
  $('front').textContent = card[q];
  $('front').lang = q;
  $('back').textContent = card[a];
  $('back').lang = a;
  $('base').textContent = card.ko === card.word ? '' : `${card.word} · ${card.gloss}`;
  $('tag').textContent = tag;
  shown = controls === 'meet';
  $('card').classList.toggle('shown', shown);
  for (const id of ['meet', 'ask', 'grade']) $(id).hidden = id !== controls;
  $('left').textContent = `${left} left`;
  $('progress').style.width = `${done / (done + left) * 100}%`;
  return [q, a];
}

function reveal(auto) {
  if (shown) return;
  shown = true;
  grace = auto ? performance.now() + GRACE : 0;
  silence();
  $('card').classList.add('shown');
  $('ask').hidden = true;
  $('grade').hidden = false;
  const a = card.front === 'ko' ? 'en' : 'ko';
  say(run, [[card[a], a]]);
}

function press(good) {
  if (!card || saving) return;
  audio.resume();
  if (card.fresh) { // stepping through the new words; past the last one, the cards begin
    at = Math.max(at + (good ? 1 : -1), 0);
    return at < words.length ? meet() : next();
  }
  if (!shown) return reveal();
  if (performance.now() < grace) return;
  answer(good);
}

async function answer(good) {
  const answered = card;
  silence();
  saving = true;
  const res = await api('/grade', { id: answered.id, good, day }).finally(() => { saving = false; });
  const { level } = await res.json();
  if (card !== answered) return; // the session was left while saving
  tally.cards.set(answered.id, { good, from: answered.level, ...tally.cards.get(answered.id), to: level });
  if (!good) queue.splice(GAP, 0, answered);
  next();
}

function summary() {
  const cards = [...tally.cards.values()], right = cards.filter(c => c.good).length;
  const minutes = Math.max(1, Math.round((Date.now() - tally.start) / 6e4));
  const up = cards.filter(c => c.to > c.from).length, mastered = cards.filter(c => c.to === 9).length;
  $('stats').textContent = `${minutes} minute${minutes > 1 ? 's' : ''} · ${cards.length} card${cards.length > 1 ? 's' : ''} · ${Math.round(right / cards.length * 100)}% right the first time`;
  $('climbed').textContent = up ? `${up} went up a level${mastered ? `, and ${mastered} ${mastered > 1 ? 'are' : 'is'} now mastered` : ''}.` : '';
  $('learned').hidden = !tally.met.length;
  $('met').replaceChildren(list(tally.met.map(c => [c.word, c.gloss])));
  $('session').hidden = true;
  $('summary').hidden = false;
}

// Every word in the deck, by level.
async function deck() {
  $('count').textContent = '';
  $('by-level').replaceChildren();
  const all = await (await api('/words', {})).json();
  $('count').textContent = `${all.length} word${all.length === 1 ? '' : 's'}`;
  $('by-level').replaceChildren(...Array.from({ length: 10 }, (_, l) => all.filter(w => w.level === l)).flatMap((these, l) => {
    if (!these.length) return [];
    const heading = document.createElement('h3');
    heading.append(`Level ${l}${l === 0 ? ', not yet met' : l === 9 ? ', mastered' : ''}`, Object.assign(document.createElement('span'), { textContent: these.length }));
    return [heading, list(these.map(w => [w.ko, w.en]))];
  }));
}

// Words as a list, Korean then English.
function list(pairs) {
  const ul = document.createElement('ul');
  ul.className = 'list';
  ul.append(...pairs.map(([ko, en]) => {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { lang: 'ko', textContent: ko }), en);
    return li;
  }));
  return ul;
}

// Says each [text, lang] in turn, resolving with the last one's length in seconds. A newer turn
// (see silence) ends this one.
async function say(mine, lines) {
  let length = 0;
  for (const [text, lang] of lines) {
    const buffer = await audio.decodeAudioData((await clip(text, lang)).slice(0));
    if (mine !== run) return;
    sound = audio.createBufferSource();
    sound.buffer = buffer;
    sound.connect(audio.destination);
    sound.start();
    length = buffer.duration;
    await new Promise(resolve => { sound.onended = resolve; });
  }
  return length;
}

function silence() {
  run++;
  sound?.stop();
  clearTimeout(timer);
}

function clip(text, lang) {
  const key = `${lang}:${text}`;
  if (!clips.has(key)) clips.set(key, api('/speak', { text, lang }).then(res => res.arrayBuffer()));
  return clips.get(key);
}

// The next two cards' lines are fetched ahead, so they play at once.
const soon = cards => { for (const c of cards.slice(0, 2)) clip(c.ko, 'ko'), clip(c.en, 'en'); };

// Adding words: they join today's session as new words.

$('add').onclick = () => { location.hash = 'add'; };
$('browse').onclick = () => { location.hash = 'words'; };
for (const x of document.querySelectorAll('.x')) x.onclick = () => history.back();
$('sheet').onclose = () => { if (location.hash === '#add') history.back(); };
$('words').onsubmit = async e => {
  e.preventDefault();
  const form = e.target, button = form.querySelector('button');
  form.inert = true;
  button.textContent = 'Adding…';
  const res = await api('/add', { text: form.text.value, day }).finally(() => { form.inert = false; button.textContent = 'Add'; });
  const { cards, had } = await res.json();
  form.reset();
  $('sheet').close();
  load();
  toast([cards.length && `Added ${cards.map(c => c.word).join(', ')}.`, had.length && `Already had ${had.join(', ')}.`].filter(Boolean).join(' '));
};

// Keys: → and ← (the Android app turns its volume keys into these), Esc back to the desk.

addEventListener('keydown', e => {
  if (e.repeat || $('sheet').open) return;
  if (e.key === 'Escape' && location.hash) history.back();
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  if (location.hash === '#study') {
    if (!$('summary').hidden) history.back();
    else press(e.key === 'ArrowRight');
  } else if (!location.hash && e.key === 'ArrowRight' && !$('desk').hidden && !$('begin').hidden) begin();
});
for (const b of document.querySelectorAll('.controls button')) b.onclick = () => press(b.dataset.good === 'true');
$('begin').onclick = begin;
$('early').onclick = async () => {
  await load(true);
  if (queue.length) begin();
};
$('home').onclick = () => history.back();

$('lock').onsubmit = e => {
  e.preventDefault();
  password = new FormData(e.target).get('password');
  localStorage.setItem('myna.password', password);
  e.target.reset();
  route();
  load();
};

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidePopover();
  $('toast').showPopover(); // shown again, so it lands above an open sheet
  clearTimeout(toasting);
  toasting = setTimeout(() => $('toast').hidePopover(), 4000);
}
addEventListener('unhandledrejection', e => toast(e.reason.message));
addEventListener('error', e => toast(e.message));

$('version').textContent = `v${config.version}`;

// The Android app updates itself when a newer one is published; on Android in a browser, Myna offers the app.
$('update').hidden = !(android && android.version() < config.apk);
$('update').onclick = () => { $('update').textContent = 'Updating…'; android.update(); };
$('get').hidden = !!android || !/Android/.test(navigator.userAgent);

// Opening Myna or coming back to it: a newer version is fetched past the browser's cache, which can hold the old
// files for ten minutes, and opened; a new day brings its cards.
async function fresh() {
  const text = await (await fetch('config.js', { cache: 'reload' })).text();
  const live = (await import(URL.createObjectURL(new Blob([text], { type: 'text/javascript' })))).default;
  if (live.version !== config.version) {
    await Promise.all(['./', 'myna.js', 'myna.css'].map(file => fetch(file, { cache: 'reload' })));
    location.reload();
  } else if (day && today() !== day) location.reload();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) fresh(); });

history.replaceState(null, '', location.pathname);
addEventListener('hashchange', route);
route();
if (password) load();
fresh();
