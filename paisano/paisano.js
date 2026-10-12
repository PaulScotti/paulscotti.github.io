// Paisano: two minutes of exercise whenever you like, about once an hour. A wheel picks the exercise, each slice
// sized by what it would add to the parts of the body today hasn't worked yet; the dose comes from what that exercise
// has learned about you; and every snack earns seeds for Paisano, a roadrunner, and brings a desert creature to its
// garden for it to stalk. All of it is worked out from one log of snacks, feedings, hunts and plantings, which the
// worker keeps.

import config from './config.js';
import { play } from './figure.js';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8789' : 'https://paisano.scottibrain.workers.dev';
const $ = id => document.getElementById(id);
const audio = new AudioContext();
const X = Object.fromEntries(config.exercises.map(x => [x.id, x]));
const C = Object.fromEntries(config.creatures.map(c => [c.id, c]));
const P = Object.fromEntries(config.plants.map(p => [p.id, p]));
const AREAS = Object.keys(config.areas);
const GROUND = 118; // the garden's ground line
const BIG = 1.7; // visitors are drawn larger than life beside Paisano, to be seen and tapped

// What an exercise knows of your strength is a belief: chances over a grid of log strengths around its first dose's,
// from about a quarter to four and a half times it (QUEST, Watson & Pelli 1983).
const GRID = Array.from({ length: 101 }, (_, i) => -1.5 + i * 0.03);
const mean = p => p.reduce((sum, v, i) => sum + v * GRID[i], 0);
const norm = p => { const total = p.reduce((a, b) => a + b); return p.map(v => v / total); };
// A belief widened by k grid steps, as strength may drift between snacks: each chance spread over its neighbors.
function blur(p, k) {
  const n = Math.ceil(3 * k), kernel = Array.from({ length: 2 * n + 1 }, (_, j) => Math.exp(-0.5 * ((j - n) / k) ** 2));
  return n ? p.map((_, i) => kernel.reduce((sum, v, j) => sum + v * (p[i + j - n] ?? 0), 0)) : p;
}
// The chances of each answer for a set that truly leaves m reps in reserve, when answers are off by config.noise reps
// (a normal spread, by its logistic approximation): 4 or more is easy, 1 to 3 good, none hard.
function likely(m) {
  const phi = z => 1 / (1 + Math.exp(-1.702 * z)), easy = phi((m - 3.5) / config.noise), hard = phi((0.5 - m) / config.noise);
  return { easy, good: 1 - easy - hard, hard };
}
// The load of a set: the share of bodyweight an exercise moves and its dumbbells. Reps to failure at a strength C:
// Epley's formula on that load, or for bodyweight exercises the strength itself.
const load = (x, w) => (x.share ?? 0) * config.body + (x.hold === 'pair' ? 2 : 1) * w;
const most = (x, C, w) => x.hold === 'none' ? C : 30 * (C / load(x, w) - 1);

let password = localStorage.getItem('paisano.password'); // typed once on each device
let log = [], since = 0, syncing = Promise.resolve(), loaded = false;
let pending = JSON.parse(localStorage.getItem('paisano.pending') || '[]'); // events not yet on the worker
// The day turns at 4 am, so a late snack counts for the day it began.
const dayOf = at => new Date(at - 4 * 3600e3).toLocaleDateString('sv');
const today = () => st.days[dayOf(Date.now())] || { snacks: [], sets: {}, seeds: 0 };
const done = sets => AREAS.filter(a => sets[a] >= config.sets).length;
const stageOf = food => config.stages.findLastIndex(([, k]) => food >= k);
const level = points => Math.floor((Math.sqrt(8 * points + 1) - 1) / 2); // level n at n(n + 1) / 2 points
const levels = () => Object.fromEntries(Object.keys(config.traits).map(t => [t, level(st.traits[t])]));
let st = replay(), snack = null, spun = null, toasting = 0;

// Everything Paisano knows, from the log in time order: each exercise's belief about your strength, each day's
// snacks, sets per area, seeds and rain; and Paisano's food, belly, traits, garden, field guide and visitor.
function replay() {
  const s = { ex: {}, days: {}, earned: 0, used: 0, food: 0, belly: 0, ate: 0, plants: {}, guide: {}, visits: {}, visitor: null };
  s.traits = Object.fromEntries(Object.keys(config.traits).map(t => [t, 0]));
  for (const x of config.exercises) {
    const [r, w] = x.start;
    s.ex[x.id] = { c0: Math.log(w ? load(x, w) * (1 + (r + config.reserve) / 30) : r + config.reserve), p: norm(GRID.map(g => Math.exp(-0.5 * (g / config.spread) ** 2))), last: 0, best: 0, steps: [] };
  }
  const eat = (n, at) => { // the belly digests a seed an hour
    s.belly = Math.max(0, s.belly - (at - s.ate) / 3600e3) + n;
    s.ate = at;
    s.food += n;
  };
  for (const e of [...log, ...pending].sort((a, b) => a.at - b.at)) {
    if (e.kind === 'feed') {
      eat(e.data.n, e.at);
      s.used += e.data.n;
      continue;
    }
    if (e.kind === 'plant') {
      s.plants[e.data.p] = 0; // rains since planting
      s.used += P[e.data.p].cost;
      continue;
    }
    if (e.kind === 'hunt') {
      const c = C[s.visits[e.data.v]];
      if (e.data.ok) {
        eat(c.size, e.at);
        for (const [t, n] of Object.entries(c.gain)) s.traits[t] += n;
        s.guide[c.id].caught++;
      }
      if (s.visitor?.id === e.data.v) s.visitor = null;
      continue;
    }
    const { x: id, w, r, feel } = e.data, x = X[id], m = s.ex[id];
    const d = s.days[dayOf(e.at)] ??= { snacks: [], sets: {}, seeds: 0 };
    const before = done(d.sets);
    for (const [a, k] of Object.entries(x.areas)) d.sets[a] = (d.sets[a] || 0) + config.minutes * k;
    // A new best: more than any snack of it before, not counting ones that were too hard to finish.
    const lift = x.hold === 'none' ? r : load(x, w) * (1 + r / 30), best = m.best > 0 && lift > m.best && feel !== 'hard';
    if (feel !== 'hard') m.best = Math.max(m.best, lift);
    const whole = before < AREAS.length && done(d.sets) === AREAS.length;
    const seeds = config.seeds.snack + (best ? config.seeds.best : 0) + (whole ? config.seeds.whole : 0);
    d.snacks.push({ ...e.data, at: e.at, seeds, best, whole });
    d.seeds += seeds;
    s.earned += seeds;
    if (whole) { // the whole body brings rain, and plants grow with it
      d.rain = e.at;
      for (const p in s.plants) s.plants[p]++;
    }
    // The visitor this snack brings: a creature out at this hour, at a plant that's grown, or out after today's rain,
    // drawn by its odds from the snack's id so every device draws the same; a new best or the whole body draws twice
    // and keeps the rarer. It stays until Paisano tries for it or the next snack.
    const hour = new Date(e.at).getHours(), time = Object.keys(config.times).find(t => hour >= config.times[t][0] && hour < config.times[t][1]);
    const pool = config.creatures.filter(c => c.times.includes(time) && (!c.plant || s.plants[c.plant] >= P[c.plant].rains) && (!c.rain || d.rain));
    const total = pool.reduce((sum, c) => sum + config.odds[c.odds], 0), draw = k => {
      let u = parseInt(e.id.replace(/-/g, '').slice(k, k + 8), 16) / 2 ** 32 * total;
      return pool.find(c => (u -= config.odds[c.odds]) < 0);
    };
    const c = !pool.length ? null : best || whole ? [draw(0), draw(20)].sort((p, q) => config.odds[p.odds] - config.odds[q.odds])[0] : draw(0);
    s.visitor = c && { id: e.id, c: c.id };
    if (c) {
      s.visits[e.id] = c.id;
      (s.guide[c.id] ??= { seen: 0, caught: 0 }).seen++;
    }
    // The belief widens with the days since this exercise's last snack, as strength may have moved, then each strength
    // is weighed by how likely it made the answer.
    const k = m.last && config.drift * Math.sqrt((e.at - m.last) / 864e5) / 0.03, prior = blur(m.p, k);
    m.p = norm(prior.map((v, i) => v * likely(most(x, Math.exp(m.c0 + GRID[i]), w) - r)[feel]));
    m.steps.push({ k, prior, post: m.p });
    m.last = e.at;
  }
  // Each exercise's mean log strength at every snack of it, knowing all the answers since (a forward-backward
  // smoother), so the guesses of its first few snacks don't set its trend.
  for (const m of Object.values(s.ex)) {
    m.trace = [];
    for (let t = m.steps.length - 1, g = m.p; t >= 0; t--) {
      const next = m.steps[t + 1];
      if (next) {
        const back = blur(g.map((v, i) => next.prior[i] && v / next.prior[i]), next.k);
        g = norm(m.steps[t].post.map((v, i) => v * back[i]));
      }
      m.trace.unshift(m.c0 + mean(g));
    }
  }
  return s;
}

// An exercise's next dose, aimed at the belief's mean strength as QUEST does: of the settings (none, for an exercise
// that moves the body) and rep counts that fit in its minute, at least 5 with dumbbells, the one most likely to leave 1
// to 3 reps in reserve; among near-equals, the one nearest the exercise's usual reps. Aimed at the middle of 1 to 3, an
// answer of 1 to 3 keeps the dose where it was.
function dose(x) {
  const m = st.ex[x.id], cap = Math.floor(config.work / (x.tempo * (x.sides ? 2 : 1))), body = x.hold === 'none';
  const strength = Math.exp(m.c0 + mean(m.p));
  let best = { u: -Infinity };
  for (const w of body ? [null] : x.share ? [0, ...config.weights] : config.weights) for (let r = body ? 1 : 5; r <= cap; r++) {
    const u = likely(most(x, strength, w) - r).good - (body ? 0 : 0.01 * Math.abs(r - x.reps));
    if (u > best.u) best = { w, r, u };
  }
  return { w: best.w, r: best.r };
}
const said = (x, { w, r }) => `${r} reps${w === null ? '' : w ? ` · ${w} lb${x.hold === 'pair' ? ' each' : ''}` : ` · no dumbbell${x.hold === 'pair' ? 's' : ''}`}`;

// The wheel's odds: each exercise not yet done today, by the sets it would add to areas still short of the day's
// sets. Once every area is done, the rest are equally likely.
function odds() {
  const t = today(), had = new Set(t.snacks.map(s => s.x));
  const left = config.exercises.filter(x => !had.has(x.id)), pool = left.length ? left : config.exercises;
  const useful = pool.map(x => [x, Object.entries(x.areas).reduce((g, [a, k]) => g + Math.min(config.minutes * k, Math.max(0, config.sets - (t.sets[a] || 0))), 0)]);
  return useful.some(([, g]) => g > 0) ? useful.filter(([, g]) => g > 0) : pool.map(x => [x, 1]);
}

// The wheel: it's drawn with today's odds, a winner is drawn by them, and the wheel spins to land on it.
function spin() {
  audio.resume();
  const chances = odds(), total = chances.reduce((s, [, g]) => s + g, 0);
  let r = Math.random() * total, won = 0;
  while (r > chances[won][1]) r -= chances[won++][1];
  const NS = 'http://www.w3.org/2000/svg', R = 100, at = a => `${R * Math.sin(a * Math.PI / 180)} ${-R * Math.cos(a * Math.PI / 180)}`;
  const slices = [];
  let from = 0;
  $('disc').replaceChildren();
  for (const [x, g] of chances) {
    const to = from + 360 * g / total, mid = (from + to) / 2, right = mid < 180;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', chances.length > 1 ? `M0 0 L${at(from)} A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)} Z` : `M0 ${-R} A${R} ${R} 0 1 1 0 ${R} A${R} ${R} 0 1 1 0 ${-R} Z`);
    const text = document.createElementNS(NS, 'text');
    text.textContent = x.name;
    text.setAttribute('transform', `rotate(${right ? mid - 90 : mid + 90})`);
    text.setAttribute('x', right ? R - 6 : -(R - 6));
    text.setAttribute('text-anchor', right ? 'end' : 'start');
    $('disc').append(path, text);
    slices.push({ x, from, to, path, text });
    from = to;
  }
  // Lands somewhere inside the winner's slice, after five or six turns.
  const win = slices[won], aim = win.from + (win.to - win.from) * (0.2 + 0.6 * Math.random());
  const turn = 360 * (5 + Math.floor(Math.random() * 2)) + 360 - aim, start = performance.now(), length = 4600;
  $('landed').textContent = '';
  location.hash = 'wheel';
  let under = -1;
  const frame = now => {
    if (spun !== frame) return; // left the wheel
    const t = Math.min((now - start) / length, 1), angle = turn * (1 - (1 - t) ** 4);
    $('disc').setAttribute('transform', `rotate(${angle})`);
    const top = ((360 - angle % 360) % 360), i = slices.findIndex(s => top >= s.from && top < s.to);
    if (i !== under && under !== -1) tone(1700, 0.025, { type: 'triangle', gain: 0.05 });
    under = i;
    if (t < 1) return requestAnimationFrame(frame);
    win.path.classList.add('won');
    win.text.classList.add('won');
    $('landed').textContent = win.x.name;
    [660, 990].forEach((f, k) => tone(f, 0.5, { at: k * 0.09, gain: 0.08 }));
    setTimeout(() => { if (spun === frame) begin(win.x); }, 1100);
  };
  spun = frame;
  requestAnimationFrame(frame);
}

// A snack: two minutes on the clock, a set on each minute, with the figure doing a rep over and over.
function begin(x) {
  const d = dose(x);
  snack = { x, ...d, start: Date.now(), set: 0, over: false, stop: play($('figure'), x) };
  const buddy = $('bird').cloneNode(true);
  for (const node of [buddy, ...buddy.querySelectorAll('[id]')]) node.removeAttribute('id');
  buddy.setAttribute('class', $('bird').classList.contains('hatched') ? 'bird hatched' : 'bird');
  buddy.setAttribute('transform', `translate(56 96) scale(${-pet.size} ${pet.size})`);
  $('buddy').replaceChildren(buddy);
  $('name').textContent = x.name;
  $('dose').textContent = said(x, d);
  $('cues').replaceChildren(...x.cues.map(c => Object.assign(document.createElement('li'), { textContent: c })));
  $('snack').classList.remove('over');
  navigator.wakeLock?.request('screen').then(lock => { snack ? snack.lock = lock : lock.release(); });
  location.replace('#snack');
  requestAnimationFrame(clock);
}

function clock() {
  if (!snack) return;
  const total = config.minutes * 60, t = (Date.now() - snack.start) / 1000, left = Math.ceil(Math.max(0, total - t));
  const set = Math.min(Math.floor(t / 60), config.minutes - 1);
  $('elapsed').style.strokeDashoffset = 1 - Math.min(t / total, 1);
  $('clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('phase').textContent = t < total ? `Set ${set + 1} of ${config.minutes}${snack.x.sides ? ' · left, then right' : ''}` : 'Done';
  if (set > snack.set) {
    snack.set = set;
    cheer();
    [880, 880].forEach((f, k) => tone(f, 0.25, { at: k * 0.22, gain: 0.1 }));
    navigator.vibrate?.([200, 120, 200]);
  }
  if (t >= total && !snack.over) {
    snack.over = true;
    cheer();
    $('snack').classList.add('over');
    [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.5, { at: k * 0.1, gain: 0.08 }));
    navigator.vibrate?.([300, 100, 300]);
  }
  requestAnimationFrame(clock);
}

const cheer = () => {
  const buddy = $('buddy').firstChild;
  buddy.classList.add('hop', 'proud');
  setTimeout(() => buddy.classList.remove('hop', 'proud'), 900);
};

function stop() {
  snack.stop();
  snack.lock?.release();
  snack = null;
}

// How it went: logged, and the next dose of it shown.
function finish(feel) {
  if (!snack) return; // a second tap before the screen closes
  const { x, w, r } = snack;
  stop();
  history.back();
  record('snack', { x: x.id, w, r, feel });
  const last = today().snacks.at(-1);
  const first = st.visitor && !Object.values(st.guide).some(g => g.caught) ? ' Tap the visitor in the garden to stalk it.' : '';
  toast(`+${last.seeds} seed${last.seeds > 1 ? 's' : ''}${last.best ? ' with a new best' : ''}${last.whole ? ', and that’s the whole body today: rain in the garden' : ''}. Next time ${said(x, dose(x))}.${first}`);
  hop();
  emote(last.whole ? '♥' : '!');
  if (last.whole) rain();
}

// The log, kept on the worker. Events wait in this device's storage until it has them, so none are lost offline.
function record(kind, data) {
  pending.push({ id: crypto.randomUUID(), at: Date.now(), kind, data });
  localStorage.setItem('paisano.pending', JSON.stringify(pending));
  st = replay();
  render();
  sync();
}

function sync() {
  const run = async () => {
    const sent = pending.slice();
    const got = await (await api('/sync', { since, events: sent })).json();
    pending = pending.filter(e => !sent.includes(e));
    localStorage.setItem('paisano.pending', JSON.stringify(pending));
    log.push(...got);
    since = got.at(-1)?.seq ?? since;
    loaded = true;
    st = replay();
    render();
  };
  syncing = syncing.then(run, run);
  return syncing;
}

async function api(path, body) {
  const res = await fetch(API + path, {
    method: 'POST', headers: { authorization: `Bearer ${password}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => { throw new Error('Paisano can’t reach its log right now; what you do here is kept and sent later.'); });
  if (res.status === 401) { // the password changed: this device asks for it again
    localStorage.removeItem('paisano.password');
    password = null;
    route();
  }
  if (!res.ok) throw new Error(await res.text());
  return res;
}

// Home: Paisano's garden, seeds and growth, today's body, and how long since the last snack.
function render() {
  const t = today(), n = t.snacks.length, areas = done(t.sets), seeds = st.earned - st.used;
  shade($('today'), a => (t.sets[a] || 0) / config.sets);
  $('tally').textContent = !n ? 'Nothing yet today' : `${areas === AREAS.length ? 'Whole body' : `${areas} of ${AREAS.length} areas`} · ${n} snack${n > 1 ? 's' : ''} today`;
  $('seeds').textContent = seeds;
  $('feed').disabled = !seeds;
  $('spin').disabled = !loaded;
  const i = stageOf(st.food), next = config.stages[i + 1];
  $('grown').style.width = `${next ? (st.food - config.stages[i][1]) / (next[1] - config.stages[i][1]) * 100 : 100}%`;
  $('toward').textContent = next ? `${next[1] - st.food} to ${next[0].toLowerCase()}` : '';
  $('plants').innerHTML = config.plants.filter(p => p.id in st.plants).map(p => `<use href="#${st.plants[p.id] >= p.rains ? `p-${p.id}` : 'sprout'}" x="${p.x}" y="${GROUND}"/>`).join('');
  $('puddle').classList.toggle('on', !!t.rain);
  visitor();
  tick();
  grow();
  if (!$('history').hidden) chronicle();
  if (!$('desert').hidden) desert();
}

const shade = (bodies, of) => {
  for (const path of bodies.querySelectorAll('.area')) path.style.setProperty('--x', Math.min(1, of(path.dataset.area)));
};

// What's in Paisano's belly now, in seeds: what it last had, less one an hour since.
const fullness = () => Math.max(0, st.belly - (Date.now() - st.ate) / 3600e3);

// What changes as time passes: how long since the last snack, whether Paisano is hungry, and where the sun is (it
// crosses the garden from 6 am to 8 pm, and is below the dunes at night).
function tick() {
  const t = today(), minutes = Math.round((Date.now() - (t.snacks.at(-1)?.at ?? 0)) / 6e4);
  $('since').textContent = !t.snacks.length ? '' : minutes < 1 ? 'Last one just now' : minutes < 60 ? `Last one ${minutes} minute${minutes > 1 ? 's' : ''} ago`
    : `Last one ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''} ago`;
  const stage = config.stages[stageOf(st.food)][0], hungry = st.food > 0 && !fullness();
  $('stage').textContent = hungry ? `Hungry ${stage.toLowerCase()}` : stage;
  $('bird').classList.toggle('hungry', hungry);
  const now = new Date(), day = (now.getHours() + now.getMinutes() / 60 - 6) / 14;
  $('sun').setAttribute('cx', 24 + 312 * day);
  $('sun').setAttribute('cy', 84 - 56 * Math.sin(Math.PI * day));
}

// History: every day as a square shaded by the areas it did, the last week's sets per area, and each exercise's strength.
function chronicle() {
  const days = Object.entries(st.days), snacks = days.reduce((s, [, d]) => s + d.snacks.length, 0);
  const whole = days.filter(([, d]) => done(d.sets) === AREAS.length).length;
  $('totals').textContent = snacks ? `${snacks} snack${snacks > 1 ? 's' : ''} on ${days.length} day${days.length > 1 ? 's' : ''}, ${whole} with the whole body done.`
    : 'Nothing logged yet.';
  // Eighteen weeks of days, Monday to Sunday, the newest week on the right.
  const now = new Date(dayOf(Date.now()) + 'T12:00'), monday = new Date(now - ((now.getDay() + 6) % 7) * 864e5);
  const cells = [];
  for (let week = 17; week >= 0; week--) {
    const first = new Date(monday - week * 7 * 864e5);
    const month = new Date(first - 0).getDate() <= 7 || week === 17 ? first.toLocaleDateString('en', { month: 'short' }) : '';
    cells.push(Object.assign(document.createElement('span'), { textContent: month }));
    for (let k = 0; k < 7; k++) {
      const date = new Date(first.getTime() + k * 864e5), key = date.toLocaleDateString('sv'), d = st.days[key];
      const button = document.createElement('button');
      const x = d ? done(d.sets) / AREAS.length : 0;
      button.style.setProperty('--x', x);
      button.dataset.x = x;
      button.hidden = date > now;
      button.title = `${date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}: ${d ? `${d.snacks.length} snack${d.snacks.length > 1 ? 's' : ''}, ${done(d.sets)} of ${AREAS.length} areas` : 'nothing'}`;
      button.onclick = () => {
        for (const b of $('calendar').querySelectorAll('.on')) b.classList.remove('on');
        button.classList.add('on');
        $('day').textContent = button.title + (d ? ` (${d.snacks.map(s => X[s.x].name).join(', ')})` : '');
      };
      cells.push(button);
    }
  }
  $('calendar').replaceChildren(...cells);
  $('day').textContent = '';
  const week = {};
  for (let k = 0; k < 7; k++) for (const [a, n] of Object.entries(st.days[dayOf(Date.now() - k * 864e5)]?.sets || {})) week[a] = (week[a] || 0) + n;
  const top = Math.max(20, ...Object.values(week));
  $('volume').style.setProperty('--ten', `${10 / top * 100}%`);
  $('volume').replaceChildren(...AREAS.flatMap(a => {
    const bar = document.createElement('i');
    bar.append(Object.assign(document.createElement('b'), { style: `width: ${(week[a] || 0) / top * 100}%` }));
    return [Object.assign(document.createElement('span'), { textContent: config.areas[a] }), bar, Object.assign(document.createElement('em'), { textContent: +(week[a] || 0).toFixed(1) })];
  }));
  // Each exercise's estimated strength after every snack of it, and how far it has come since the first. The lines share
  // one scale, at least a tenth of log strength (about 10%) tall, so a small wobble looks small.
  const span = Math.max(0.1, ...config.exercises.map(x => Math.max(...st.ex[x.id].trace) - Math.min(...st.ex[x.id].trace)));
  $('lifts').replaceChildren(...config.exercises.map(x => {
    const m = st.ex[x.id], li = document.createElement('li'), lo = Math.min(...m.trace), hi = Math.max(...m.trace);
    const C = Math.exp(m.trace.at(-1)), max = Math.round(x.hold === 'none' ? C : (C - (x.share ?? 0) * config.body) / (x.hold === 'pair' ? 2 : 1)); // a one-rep max on the dumbbells alone
    li.innerHTML = `<b></b><small></small><svg viewBox="0 0 84 28" preserveAspectRatio="none"><polyline points="${m.trace.map((c, k) => `${m.trace.length > 1 ? k / (m.trace.length - 1) * 84 : 42},${14 - (c - (lo + hi) / 2) / span * 24}`).join(' ')}"/></svg><em></em>`;
    li.querySelector('b').textContent = x.name;
    li.querySelector('small').textContent = m.trace.length ? `Next ${said(x, dose(x))} · ${x.hold === 'none' ? `most ≈ ${max} reps` : `1RM ≈ ${max} lb${x.hold === 'pair' ? ' each' : ''}`}` : `First ${said(x, dose(x))}`;
    const change = Math.round((Math.exp(m.trace.at(-1) - m.trace[0]) - 1) * 100);
    li.querySelector('em').textContent = m.trace.length > 1 ? `${change < 0 ? '−' : change > 0 ? '+' : ''}${Math.abs(change)}%` : '';
    return li;
  }));
}

// Where the app is: home, the wheel (#wheel), a snack (#snack), the desert (#desert) or history (#history). Back leaves
// each.
function route() {
  const hash = location.hash.slice(1);
  if (hash !== 'wheel') spun = null;
  if (hash !== 'snack' && snack) stop();
  if ((hash === 'wheel' && !spun) || (hash === 'snack' && !snack)) return history.replaceState(null, '', location.pathname), route();
  $('lock').hidden = !!password;
  $('home').hidden = !password;
  $('wheel').hidden = hash !== 'wheel';
  $('snack').hidden = hash !== 'snack';
  $('history').hidden = hash !== 'history' || !password;
  $('desert').hidden = hash !== 'desert' || !password;
  if (hash === 'history') chronicle();
  if (hash === 'desert') desert();
}

// The desert: Paisano's traits, the garden's plants, and the field guide of every creature, a silhouette and a hint
// until it visits and its fact once it's caught.
function desert() {
  const lv = levels(), seeds = st.earned - st.used, caught = config.creatures.filter(c => st.guide[c.id]?.caught).length;
  $('about').textContent = `Paisano is ${st.food ? `a ${config.stages[stageOf(st.food)][0].toLowerCase()}` : 'an egg'} with ${seeds} seed${seeds === 1 ? '' : 's'} in the sack, and has caught ${caught} of the ${config.creatures.length} creatures.`;
  $('traits').replaceChildren(...Object.entries(config.traits).flatMap(([t, name]) => {
    const n = lv[t], from = n * (n + 1) / 2, bar = document.createElement('i');
    bar.append(Object.assign(document.createElement('b'), { style: `width: ${(st.traits[t] - from) / (n + 1) * 100}%` }));
    return [Object.assign(document.createElement('span'), { textContent: name }), bar, Object.assign(document.createElement('em'), { textContent: n })];
  }));
  const row = (art, unknown) => {
    const li = document.createElement('li');
    li.innerHTML = `<svg${unknown ? ' class="unknown"' : ''}><use href="#${art}"/></svg><b></b><small></small><em></em>`;
    return li;
  };
  $('beds').replaceChildren(...config.plants.map(p => {
    const li = row(`p-${p.id}`), rains = st.plants[p.id], c = config.creatures.find(c => c.plant === p.id), brings = st.guide[c.id] ? `the ${c.name}` : 'its visitor';
    li.querySelector('b').textContent = p.name;
    li.querySelector('small').textContent = rains === undefined ? `Grows with ${p.rains} rain${p.rains > 1 ? 's' : ''}, then brings a visitor` : rains < p.rains ? `A sprout: ${rains} of ${p.rains} rain${p.rains > 1 ? 's' : ''}` : `Grown, and brings ${brings}`;
    if (rains === undefined) {
      const button = Object.assign(document.createElement('button'), { textContent: `Plant · ${p.cost}`, disabled: seeds < p.cost });
      button.onclick = () => { record('plant', { p: p.id }); toast(`Planted ${p.name.toLowerCase()}. It grows with each rain.`); };
      li.querySelector('em').replaceWith(button);
    }
    return li;
  }));
  const when = c => {
    const t = c.times.map(t => t + 's');
    return (t.length > 1 ? `${t.slice(0, -1).join(', ')} and ${t.at(-1)}` : t[0]).replace(/^./, m => m.toUpperCase());
  };
  $('guide').replaceChildren(...config.creatures.map(c => {
    const g = st.guide[c.id], li = row(`c-${c.id}`, !g);
    const needs = [c.size > stageOf(st.food) && `a ${config.stages[c.size][0].toLowerCase()}`, (c.nerve ?? 0) > lv.nerve && `Nerve ${c.nerve}`].filter(Boolean);
    li.querySelector('b').textContent = g ? c.name : 'Not yet seen';
    li.querySelector('small').textContent = g?.caught ? c.fact : `${when(c)}${c.plant ? `, at the ${P[c.plant].name.toLowerCase()}` : ''}${c.rain ? ', after rain' : ''} · ${c.odds}${needs.length ? ` · takes ${needs.join(' and ')}` : ''}`;
    li.querySelector('em').textContent = g?.caught ? `×${g.caught}` : g ? 'Seen' : '';
    return li;
  }));
  // Each drawing fits its box.
  for (const svg of $('desert').querySelectorAll('.rows svg')) {
    const b = svg.firstChild.getBBox();
    svg.setAttribute('viewBox', `${b.x - 1} ${b.y - 1} ${b.width + 2} ${b.height + 2}`);
  }
}

// Paisano, in its garden. It grows with each seed it eats, from a hatchling (0) to a roadrunner (1): legs, tail, crest
// and beak lengthen and its head gets smaller for its body. It wanders, pecks and looks about; it naps at night; and
// when its belly is empty its crest droops and it asks for a seed, or looks for one in the sand if the sack is empty.
const pet = { x: 200, face: 1, size: 1, busy: false, flying: 0, strewn: [] }; // flying: seeds tossed, not yet eaten

function grow() {
  const eaten = st.food - pet.flying, stages = config.stages, i = stageOf(eaten);
  $('bird').classList.toggle('hatched', i > 0);
  if (!i) return place();
  // Growth runs evenly through each stage from the hatchling's to the roadrunner's.
  const g = i === stages.length - 1 ? 1 : (i - 1 + (eaten - stages[i][1]) / (stages[i + 1][1] - stages[i][1])) / (stages.length - 2);
  const legs = 0.6 + 0.4 * g, drop = 11 * (1 - legs), head = 1.25 - 0.25 * g, crest = 0.35 + 0.65 * g;
  $('legs').setAttribute('transform', `scale(1 ${legs})`);
  $('trunk').setAttribute('transform', `translate(0 ${drop})`);
  $('torso').setAttribute('transform', `translate(0 -20) scale(${0.88 + 0.12 * g} ${0.92 + 0.08 * g}) translate(0 20)`);
  $('tail').setAttribute('transform', `translate(-9 -19) scale(${0.08 + 0.92 * g}) translate(9 19)`);
  $('head').setAttribute('transform', `translate(6 -27) scale(${head}) translate(-6 27)`);
  $('crest').setAttribute('transform', `translate(4 -45) scale(${crest}) translate(-4 45)`);
  $('beak').setAttribute('transform', `translate(19.5 -34.6) scale(${0.55 + 0.45 * g}) translate(-19.5 34.6)`);
  pet.size = 1.1 + 0.6 * g;
  pet.top = drop - 27 - (20.4 + 12 * crest) * head; // the top of its crest, where the emotion ball floats
  place();
}

// The emotion ball floats over its head, as a Chao's does, and turns into a sign of how it feels.
function place() {
  const hatched = $('bird').classList.contains('hatched');
  $('bird').setAttribute('transform', `translate(${pet.x} ${GROUND}) scale(${pet.face * pet.size} ${pet.size})`);
  $('mood').setAttribute('transform', `translate(${pet.x + (hatched ? pet.face * 4 * pet.size : 0)} ${GROUND + (hatched ? pet.top * pet.size - 8 : -38)})`);
}

function emote(sign) {
  const mood = $('mood');
  mood.querySelector('text').textContent = sign;
  mood.classList.remove('on');
  void mood.getBBox();
  mood.classList.add('on');
  clearTimeout(pet.calm);
  pet.calm = setTimeout(() => mood.classList.remove('on'), 1600);
}

const flash = (name, ms) => new Promise(resolve => {
  $('bird').classList.add(name);
  setTimeout(() => { $('bird').classList.remove(name); resolve(); }, ms);
});
const hop = () => flash('hop', 450);

// Walks to x, legs going, at a roadrunner's pace for its size (in garden units a millisecond), or faster on the hunt.
function walk(x, pace = 0.09) {
  pet.face = x < pet.x ? -1 : 1;
  $('bird').classList.add('walking');
  const from = pet.x, start = performance.now(), length = Math.abs(x - from) / pace;
  return new Promise(resolve => requestAnimationFrame(function step(now) {
    const t = Math.min((now - start) / length, 1);
    pet.x = from + (x - from) * t;
    place();
    if (t < 1) return requestAnimationFrame(step);
    $('bird').classList.remove('walking');
    resolve();
  }));
}

async function peck(times) {
  for (let k = 0; k < times; k++) {
    await flash('peck', 160);
    tone(2400, 0.02, { type: 'square', gain: 0.025 });
    await new Promise(r => setTimeout(r, 110));
  }
}

// A seed is tossed from the sack and Paisano goes to eat it; the first one hatches the egg. A full belly has no room.
function feed() {
  audio.resume();
  if (hunt || st.earned - st.used <= 0) return;
  if (st.food && fullness() > config.belly - 1) {
    emote('…');
    return toast(`Paisano is full. Room for another in ${Math.ceil((fullness() - config.belly + 1) * 60)} min.`);
  }
  pet.flying++;
  record('feed', { n: 1 });
  const seed = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  seed.setAttribute('d', 'M0 -2.6 C1.5 -2.6 2.2 -0.6 2.2 1 C2.2 2.8 1.3 3.4 0 3.4 S-2.2 2.8 -2.2 1 C-2.2 -0.6 -1.5 -2.6 0 -2.6 Z');
  $('strewn').append(seed);
  const hatched = $('bird').classList.contains('hatched');
  const x = hatched ? Math.max(90, Math.min(300, pet.x + (Math.random() - 0.5) * 140)) : pet.x + 16;
  const from = [330, 20], start = performance.now(), spin = 200 + Math.random() * 300;
  tone(420, 0.18, { to: 900, gain: 0.06 });
  requestAnimationFrame(function fly(now) {
    const t = Math.min((now - start) / 650, 1);
    seed.setAttribute('transform', `translate(${from[0] + (x - from[0]) * t} ${from[1] + (GROUND - 2 - from[1]) * t - 140 * t * (1 - t)}) rotate(${spin * t}) scale(0.9)`);
    if (t < 1) return requestAnimationFrame(fly);
    pet.strewn.push({ x, seed });
    if (!pet.busy) eat();
  });
}

async function eat() {
  pet.busy = true;
  while (pet.strewn.length) {
    const { x, seed } = pet.strewn.shift();
    if ($('bird').classList.contains('hatched')) {
      const reach = 34 * pet.size;
      await walk(x - (x < pet.x ? -reach : reach));
      pet.face = x < pet.x ? -1 : 1;
      place();
      await peck(2);
    } else {
      await flash('wobble', 900); // the egg rocks, and out comes Paisano
    }
    seed.remove();
    pet.flying--;
    grow();
    hop();
    emote('♥');
    tone(1900, 0.12, { to: 2900, gain: 0.05 });
    const food = st.food - pet.flying, stage = stageOf(food);
    if (stage > stageOf(food - 1)) toast(stage === 1 ? 'Paisano hatched.' : `Paisano is a ${config.stages[stage][0].toLowerCase()} now.`);
    await new Promise(r => setTimeout(r, 400));
  }
  pet.busy = false;
}

// What Paisano does when left to itself, every few seconds.
async function idle() {
  setTimeout(idle, 2500 + Math.random() * 3500);
  const hour = new Date().getHours(), night = hour >= 22 || hour < 6;
  $('bird').classList.toggle('asleep', night);
  if (pet.busy || hunt || !$('bird').classList.contains('hatched') || document.hidden) return;
  if (night) return Math.random() < 0.5 && emote('z');
  const hungry = !fullness(), r = Math.random();
  pet.busy = true;
  if (hungry && st.earned > st.used && r < 0.4) { // asks for a seed from the sack
    pet.face = 1;
    place();
    emote('!');
  } else if (hungry && r < 0.4) { // looks for one in the sand
    emote('?');
    await peck(3);
  } else if (st.visitor && r < 0.6) { // eyes the visitor
    pet.face = prey.x < pet.x ? -1 : 1;
    place();
    await flash('stalk', 1400);
  } else if (r < 0.45) await walk(90 + Math.random() * 200);
  else if (r < 0.7) await peck(1 + Math.floor(Math.random() * 3));
  else if (r < 0.85) await flash('tilt', 1300);
  else await flash('blink', 160);
  pet.busy = false;
  if (pet.strewn.length) eat();
}

// The visitor from the last snack: near its plant, or across the garden from Paisano, facing away until Paisano tries
// for it.
const prey = { id: null, x: 0, face: 1, fled: false };
let hunt = null;

function visitor() {
  const v = st.visitor;
  if (prey.id === (v?.id ?? null)) return;
  prey.id = v?.id ?? null;
  prey.fled = false;
  if (hunt) end();
  $('visitor').replaceChildren();
  if (!v) return;
  const c = C[v.c], plant = P[c.plant];
  prey.x = plant ? plant.x + (plant.x > 280 ? -30 : 30) : pet.x < 180 ? 270 + Math.random() * 40 : 80 + Math.random() * 30;
  prey.face = prey.x > pet.x ? 1 : -1;
  $('visitor').innerHTML = `<g class="critter"><circle class="hit" cy="-4" r="11"/><use href="#c-${c.id}"/></g><text class="alert">!</text><text class="label"></text>`;
  const top = $('visitor').firstChild.getBBox().y * BIG;
  $('visitor').querySelector('.alert').setAttribute('y', top - 5);
  $('visitor').querySelector('.label').setAttribute('y', top - 7);
  $('visitor').querySelector('.label').textContent = c.name;
  aim();
}
const aim = () => {
  $('visitor').setAttribute('transform', `translate(${prey.x} ${GROUND})`);
  $('visitor').firstChild.setAttribute('transform', `scale(${prey.face * BIG} ${BIG})`);
};

// Paisano stalks the visitor. Each tap is a step toward it, safe while it looks away, while it twitches just before
// it looks up, and for a moment after (longer with Stealth); a step while it's looking sends it running. Close enough,
// Paisano strikes. Steps are longer and quicker with Speed and size.
async function stalk() {
  const c = C[st.visitor.c], stage = stageOf(st.food);
  if (!stage) return toast('Paisano hasn’t hatched yet. Feed it a seed.');
  if (stage < c.size) return toast(`The ${c.name} is too big for Paisano until it’s a ${config.stages[c.size][0].toLowerCase()}.`);
  if (levels().nerve < (c.nerve ?? 0)) return toast(`Paisano hasn’t the nerve for the ${c.name} yet: it takes Nerve ${c.nerve}.`);
  const h = hunt = { c, looking: false, since: 0, moving: true, timer: 0, sound: null };
  $('visitor').classList.add('hunted');
  while (pet.busy) await new Promise(r => setTimeout(r, 100)); // whatever it's doing, it finishes first
  if (h !== hunt) return;
  pet.busy = true;
  if (Math.abs(prey.x - pet.x) < 120) await walk(prey.x + (prey.x > 180 ? -140 : 140)); // backs off to begin
  if (h !== hunt) return;
  pet.face = prey.x > pet.x ? 1 : -1;
  place();
  $('bird').classList.add('stalk');
  h.moving = false;
  toast('Creep up while it looks away: tap for each step.');
  look();
}

// It looks away for a while, twitches, then looks up at Paisano.
function look() {
  const c = hunt.c, [a, b] = c.busy, [p, q] = c.look ?? [1, 2], away = (a + (b - a) * Math.random()) * 1000, up = (p + (q - p) * Math.random()) * 1000;
  hunt.looking = false;
  prey.face = prey.x > pet.x ? 1 : -1;
  aim();
  $('visitor').classList.remove('looking');
  if (c.sound === 'buzz') hunt.sound = pulses(5200, away + 350, 45);
  hunt.timer = setTimeout(() => {
    $('visitor').classList.add('twitch');
    hunt.timer = setTimeout(() => {
      $('visitor').classList.replace('twitch', 'looking');
      hunt.looking = true;
      hunt.since = performance.now();
      prey.face = -prey.face;
      aim();
      if (c.sound === 'rattle') hunt.sound = pulses(2600, up, 16);
      hunt.timer = setTimeout(look, up);
    }, 350);
  }, away);
}

async function step() {
  const h = hunt;
  if (h.moving) return;
  if (h.looking && performance.now() - h.since > 150 + 60 * levels().stealth) return flee();
  h.moving = true;
  const reach = 30 * pet.size, gap = Math.abs(prey.x - pet.x) - reach, stride = (12 + 4 * levels().speed) * pet.size;
  await walk(pet.x + Math.sign(prey.x - pet.x) * Math.min(stride, gap), stride / 250);
  if (h !== hunt) return; // the visitor left mid-step
  h.moving = false;
  if (Math.abs(prey.x - pet.x) - reach < 1) pounce();
}

async function pounce() {
  const { c } = hunt, v = st.visitor.id, before = levels(), stage = stageOf(st.food), first = !st.guide[c.id].caught;
  end();
  pet.busy = true;
  await flash('peck', 220);
  tone(2400, 0.03, { type: 'square', gain: 0.04 });
  $('visitor').replaceChildren();
  record('hunt', { v, ok: true });
  hop();
  emote('♥');
  tone(1900, 0.12, { to: 2900, gain: 0.05 });
  const after = levels(), up = Object.keys(after).find(t => after[t] > before[t]), grown = stageOf(st.food);
  toast(`Paisano caught the ${c.name}${first ? ', new in the field guide' : ''}.${up ? ` ${config.traits[up]} is ${after[up]} now.` : ''}${grown > stage ? ` It’s a ${config.stages[grown][0].toLowerCase()} now.` : ''}`);
  pet.busy = false;
}

function flee() {
  const { c } = hunt, v = st.visitor.id, from = prey.x, start = performance.now();
  end();
  prey.fled = true;
  emote('?');
  toast(`The ${c.name} saw Paisano coming and got away.`);
  prey.face = prey.x > pet.x ? 1 : -1;
  requestAnimationFrame(function run(now) {
    const t = Math.min((now - start) / 450, 1);
    prey.x = from + (prey.face > 0 ? 400 - from : -40 - from) * t;
    aim();
    if (t < 1) return requestAnimationFrame(run);
    record('hunt', { v, ok: false });
  });
}

function end() {
  clearTimeout(hunt.timer);
  hunt.sound?.disconnect();
  hunt = null;
  pet.busy = false;
  $('bird').classList.remove('stalk');
  $('visitor').classList.remove('hunted', 'looking', 'twitch');
}

// Rain over the garden for a while, from the snack that finished the whole body.
function rain() {
  $('garden').parentNode.classList.add('raining');
  setTimeout(() => $('garden').parentNode.classList.remove('raining'), 9000);
}
$('rain').innerHTML = Array.from({ length: 40 }, (_, i) => `<line x1="${i * 9.5}" x2="${i * 9.5 - 2.5}" y1="-14" y2="-4" style="animation-delay: -${Math.random().toFixed(2)}s"/>`).join('');

// A tap in the garden: a step on the hunt, the start of one on the visitor, or a pat for Paisano.
$('garden').onclick = e => {
  audio.resume();
  if (hunt) return step();
  if (e.target.closest('#visitor') && !prey.fled) return stalk();
  if (!e.target.closest('#bird') || pet.busy) return;
  tone(1900, 0.12, { to: 2900, gain: 0.05 });
  emote('♥');
  flash($('bird').classList.contains('hatched') ? 'proud' : 'wobble', 900);
};
$('feed').onclick = feed;

// Sounds, made as they're played.
function tone(f, length, { type = 'sine', gain = 0.1, at = 0, to, out = audio.destination } = {}) {
  const t = audio.currentTime + at, o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + length);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + length + 0.02);
}

// A run of clicks, for a cicada's buzz or a rattle; disconnecting what it returns silences the rest.
function pulses(f, ms, every) {
  const out = audio.createGain();
  out.connect(audio.destination);
  for (let t = 0; t < ms; t += every) tone(f, 0.012, { type: 'square', gain: 0.025, at: t / 1000, out });
  return out;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidePopover();
  $('toast').showPopover();
  clearTimeout(toasting);
  toasting = setTimeout(() => $('toast').hidePopover(), 5000);
}
addEventListener('unhandledrejection', e => toast(e.reason.message));
addEventListener('error', e => toast(e.message));

// Each body is drawn by halves; the other half is its mirror.
for (const half of document.querySelectorAll('#today .half')) {
  const mirror = half.cloneNode(true);
  mirror.setAttribute('transform', 'matrix(-1 0 0 1 100 0)');
  half.after(mirror);
}

$('spin').onclick = spin;
for (const b of document.querySelectorAll('.feel button')) b.onclick = () => finish(b.dataset.feel);
for (const x of document.querySelectorAll('.x')) x.onclick = () => history.back();
addEventListener('keydown', e => {
  if (e.key === 'Escape' && location.hash) history.back();
  if (e.key === ' ' && hunt && !location.hash) { e.preventDefault(); step(); }
});
$('lock').onsubmit = e => {
  e.preventDefault();
  password = new FormData(e.target).get('password');
  localStorage.setItem('paisano.password', password);
  e.target.reset();
  route();
  sync();
};
$('version').textContent = `v${config.version}`;

// Opening Paisano or coming back to it: a newer version is fetched past the browser's cache, which can hold the old
// files for ten minutes, and opened; otherwise what other devices logged comes in.
async function fresh() {
  const text = await (await fetch('config.js', { cache: 'reload' })).text();
  const live = (await import(URL.createObjectURL(new Blob([text], { type: 'text/javascript' })))).default;
  if (live.version !== config.version) {
    await Promise.all(['./', 'paisano.js', 'figure.js', 'paisano.css'].map(file => fetch(file, { cache: 'reload' })));
    location.reload();
  } else if (password) sync();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) fresh(); });
setInterval(tick, 30e3);

history.replaceState(null, '', location.pathname);
addEventListener('hashchange', route);
route();
render();
idle();
if (password) fresh();
