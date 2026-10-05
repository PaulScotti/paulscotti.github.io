// Myna: Korean flashcards, said aloud. A card is asked one way, Korean or English first; after a moment
// to think its answer is said too, and it is marked correct or incorrect with → and ←, the buttons, or
// the volume keys in the Android app. Marking it before the answer comes says the answer, then moves on.

import config from './config.js';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8788' : 'https://myna.scottibrain.workers.dev';
const GAP = 4; // cards between meeting a word and being asked it, or between missing a card and its next asking
const android = window.MynaAndroid; // the Android app's bridge; a browser has none
const $ = id => document.getElementById(id);
const audio = new AudioContext();
const clips = new Map(); // "lang:text" → that line's mp3, fetched once
let password = localStorage.getItem('myna.password'); // typed once on each device
let day, levels, queue = [], done = 0, card = null, run = 0, shown = false, verdict = null, timer = 0, saving = false, sound = null, toasting = 0;

// The day turns at 4 am, so a late session counts for the day it began.
const today = () => new Date(Date.now() - 4 * 3600e3).toLocaleDateString('sv');

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

async function load() {
  day = today();
  $('plan').textContent = 'Getting today’s cards…';
  $('begin').hidden = true;
  const res = await (await api('/today', { day })).json();
  queue = res.cards.map(c => [Math.random(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  levels = res.levels;
  done = 0;
  for (const c of queue.slice(0, 2)) clip(c.ko, 'ko'), clip(c.en, 'en');
  desk();
}

function desk() {
  const fresh = queue.filter(c => c.fresh).length, due = queue.length - fresh;
  $('plan').textContent = queue.length ? `${[due && `${due} to review`, fresh && `${fresh} new word${fresh > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}.` : 'Done for today.';
  $('begin').hidden = !queue.length;
  const most = Math.max(...levels);
  $('levels').innerHTML = levels.map((n, l) => `<div style="--h:${n / most}"><span>${n}</span><i></i><b>${l}</b></div>`).join('')
    + '<figcaption>Words by level, from new to mastered</figcaption>';
}

// Where the app is: the desk, a session (#study), or adding words (#add). Back leaves each.
function route() {
  const studying = location.hash === '#study';
  if (!studying && card) { // left in the middle of a session
    silence();
    card = null;
    load();
  }
  $('lock').hidden = !!password;
  $('desk').hidden = studying || !password;
  $('study').hidden = !studying || !password;
  if (location.hash !== '#add') $('sheet').close();
  else if (!$('sheet').open) $('sheet').showModal();
  android?.keys(studying);
}

// A session.

function begin() {
  audio.resume();
  location.hash = 'study';
  next();
}

function next() {
  silence();
  card = queue.shift();
  if (!card) return history.back(), load();
  shown = false;
  verdict = null;
  const mine = run, [q, a] = card.fresh || card.front === 'ko' ? ['ko', 'en'] : ['en', 'ko'];
  $('front').textContent = card[q];
  $('front').lang = q;
  $('back').textContent = card[a];
  $('back').lang = a;
  $('base').textContent = card.ko === card.word ? '' : `${card.word} · ${card.gloss}`;
  $('tag').hidden = !card.fresh;
  $('grade').hidden = card.fresh;
  $('next').hidden = !card.fresh;
  $('card').classList.toggle('shown', card.fresh);
  for (const b of $('grade').children) b.classList.remove('on');
  $('left').textContent = `${queue.length + 1} left`;
  $('progress').style.width = `${done / (done + queue.length + 1) * 100}%`;
  for (const c of queue.slice(0, 2)) clip(c.ko, 'ko'), clip(c.en, 'en');
  if (card.fresh) say(mine, [[card.ko, 'ko'], [card.en, 'en'], [card.ko, 'ko']]);
  else say(mine, [[card[q], q]]).then(length => { if (mine === run) timer = setTimeout(reveal, length * config.think * 1000); });
}

function reveal() {
  if (shown) return;
  shown = true;
  silence();
  $('card').classList.add('shown');
  const mine = run, a = card.front === 'ko' ? 'en' : 'ko';
  say(mine, [[card[a], a]]).then(() => { if (mine === run && verdict !== null) answer(verdict); });
}

function press(good) {
  if (!card || saving) return;
  audio.resume();
  if (card.fresh) {
    queue.splice(GAP, 0, { ...card, fresh: false });
    done++;
    return next();
  }
  if (shown) return answer(good);
  verdict = good;
  $('grade').children[good ? 1 : 0].classList.add('on');
  reveal();
}

async function answer(good) {
  const answered = card;
  silence();
  saving = true;
  await api('/grade', { id: answered.id, good, day }).finally(() => { saving = false; });
  if (card !== answered) return; // the session was left while saving
  if (!good) queue.splice(GAP, 0, answered);
  done++;
  next();
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

// Adding words: they join today's session as new words.

$('add').onclick = () => { location.hash = 'add'; };
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
  queue.push(...cards);
  desk();
  toast([cards.length && `Added ${cards.map(c => c.word).join(', ')}.`, had.length && `Already had ${had.join(', ')}.`].filter(Boolean).join(' '));
};

// Keys: → correct, ← incorrect (the Android app turns its volume keys into these), Esc back to the desk.

addEventListener('keydown', e => {
  if (e.repeat || $('sheet').open) return;
  if (e.key === 'Escape' && location.hash === '#study') history.back();
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  if (location.hash === '#study') press(e.key === 'ArrowRight');
  else if (e.key === 'ArrowRight' && !$('desk').hidden && !$('begin').hidden) begin();
});
for (const b of $('grade').children) b.onclick = () => press(b.dataset.good === 'true');
$('next').onclick = () => press(true);
$('begin').onclick = begin;

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

// The Android app updates itself when a newer one is published; on Android in a browser, Myna offers the app.
$('update').hidden = !(android && android.version() < config.apk);
$('update').onclick = () => { $('update').textContent = 'Updating…'; android.update(); };
$('get').hidden = !!android || !/Android/.test(navigator.userAgent);

// A new day brings new cards, and whatever has changed in Myna since.
document.addEventListener('visibilitychange', () => { if (!document.hidden && day && today() !== day) location.reload(); });

history.replaceState(null, '', location.pathname);
addEventListener('hashchange', route);
route();
if (password) load();
