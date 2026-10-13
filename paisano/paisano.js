// Two minutes of exercise, a pachinko board to choose it, and a roadrunner to keep you company.
// Workouts, rewards and the garden are replayed from the same synced event log.

import config from './config.js?v=12';
import { pegs, dividers, dt, step as bounce } from './pachinko.js?v=12';

const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://localhost:8789' : 'https://paisano.scottibrain.workers.dev';
const $ = id => document.getElementById(id);
const audio = new AudioContext();
const X = Object.fromEntries(config.exercises.map(x => [x.id, x]));
const C = Object.fromEntries(config.creatures.map(c => [c.id, c]));
const P = Object.fromEntries(config.plants.map(p => [p.id, p]));
const AREAS = Object.keys(config.areas);
const GROUND = 118; // the garden's ground line
const BIG = 1.7; // visitors are drawn larger than life beside Paisano, to be seen and tapped

let password = localStorage.getItem('paisano.password'); // typed once on each device
// Confirmed events are cached; each unsent event has its own key so two tabs cannot overwrite each other's work.
const cached = localStorage.getItem('paisano.log');
let log = JSON.parse(cached || '[]'), syncing = Promise.resolve(), loaded = cached !== null;
for (const e of JSON.parse(localStorage.getItem('paisano.pending') || '[]')) localStorage.setItem('paisano.outbox.' + e.id, JSON.stringify(e));
localStorage.removeItem('paisano.pending');
const outbox = () => Object.keys(localStorage).filter(k => k.startsWith('paisano.outbox.')).map(k => JSON.parse(localStorage.getItem(k)));
let pending = outbox();
// Use calendar hours, rather than subtracting elapsed hours across a daylight-saving change.
const dayOf = at => { const d = new Date(at); d.setHours(d.getHours() - 4); return d.toLocaleDateString('sv'); };
const today = () => st.days[dayOf(Date.now())] || { snacks: [], sets: {}, seeds: 0 };
const done = sets => AREAS.filter(a => sets[a] >= config.sets).length;
const stageOf = food => config.stages.findLastIndex(([, k]) => food >= k);
const level = points => Math.floor((Math.sqrt(8 * points + 1) - 1) / 2); // level n at n(n + 1) / 2 points
const levels = () => Object.fromEntries(Object.keys(config.traits).map(t => [t, level(st.traits[t])]));
let st = replay(), snack = null, board = null, toasting = 0, renderedDay = dayOf(Date.now());

// Everything Paisano knows, from the log in time order since the last reset: each exercise's recorded work, each
// day's snacks, sets per area, seeds and rain; and Paisano's food, belly, traits, garden, field guide and visitor.
function replay() {
  const s = { ex: {}, days: {}, earned: 0, used: 0, food: 0, belly: 0, ate: 0, plants: {}, guide: {}, visits: {}, visitor: null };
  s.traits = Object.fromEntries(Object.keys(config.traits).map(t => [t, 0]));
  for (const x of config.exercises) s.ex[x.id] = { best: 0, sessions: [] };
  const hunted = new Set();
  const eat = (n, at) => { // the belly digests a seed an hour
    s.belly = Math.max(0, s.belly - (at - s.ate) / 3600e3) + n;
    s.ate = at;
    s.food += n;
  };
  const events = [...new Map([...log, ...pending].map(e => [e.id, e])).values()].sort((a, b) => a.at - b.at);
  for (const e of events.slice(events.findLastIndex(e => e.kind === 'reset') + 1)) {
    if (e.kind === 'feed') {
      if (s.earned - s.used < e.data.n) continue; // another device spent these seeds first
      eat(e.data.n, e.at);
      s.used += e.data.n;
      continue;
    }
    if (e.kind === 'plant') {
      if (e.data.p in s.plants || s.earned - s.used < P[e.data.p].cost) continue;
      s.plants[e.data.p] = 0; // rains since planting
      s.used += P[e.data.p].cost;
      continue;
    }
    if (e.kind === 'hunt') {
      if (hunted.has(e.data.v)) continue;
      hunted.add(e.data.v);
      const c = C[e.data.c ?? s.visits[e.data.v]];
      if (e.data.ok) {
        eat(c.size, e.at);
        for (const [t, n] of Object.entries(c.gain)) s.traits[t] += n;
        (s.guide[c.id] ??= { seen: 0, caught: 0 }).caught++;
      }
      if (s.visitor?.id === e.data.v) s.visitor = null;
      continue;
    }
    const { x: id, w, r, feel, rounds } = e.data, x = X[id], m = s.ex[id];
    const d = s.days[e.data.day ?? dayOf(e.at)] ??= { snacks: [], sets: {}, seeds: 0 };
    const before = done(d.sets);
    const count = rounds ? rounds.filter(v => v.r > 0).length / (x.sides ? 2 : 1) : 2;
    for (const [a, k] of Object.entries(x.areas)) d.sets[a] = (d.sets[a] || 0) + count * k;
    // Old entries stored targets only. Reproduce their earned seeds without calling them measured performance.
    const lift = rounds ? 0 : x.hold === 'none' ? r : ((x.share ?? 0) * config.body + (x.hold === 'pair' ? 2 : 1) * w) * (1 + r / 30);
    const best = !rounds && m.best > 0 && lift > m.best && feel !== 'hard';
    if (!rounds && feel !== 'hard') m.best = Math.max(m.best, lift);
    const whole = before < AREAS.length && done(d.sets) === AREAS.length;
    const watered = rounds ? !d.rain && d.snacks.length + 1 >= config.rainAt : whole;
    const seeds = rounds ? config.seeds.snack + (watered ? config.seeds.day : 0) + (e.data.prize === 'seed' ? config.seeds.pachinko : 0)
      : config.seeds.snack + (best ? config.seeds.best : 0) + (whole ? config.seeds.whole : 0);
    const entry = { ...e.data, id: e.id, at: e.at, seeds, best, whole, watered };
    d.snacks.push(entry);
    m.sessions.push(entry);
    d.seeds += seeds;
    s.earned += seeds;
    if (watered) {
      d.rain = e.at;
      for (const p in s.plants) s.plants[p]++;
    }
    // The visitor this snack brings: a creature out at this hour, at a plant that's grown, or out after today's rain,
    // drawn by its odds from the snack's id so every device draws the same; the rain bonus draws twice
    // and keeps the rarer. It stays until Paisano tries for it or the next snack.
    const hour = e.data.hour ?? new Date(e.at).getHours(), time = Object.keys(config.times).find(t => hour >= config.times[t][0] && hour < config.times[t][1]);
    const pool = config.creatures.filter(c => c.times.includes(time) && (!c.plant || s.plants[c.plant] >= P[c.plant].rains) && (!c.rain || d.rain));
    const total = pool.reduce((sum, c) => sum + config.odds[c.odds], 0), draw = k => {
      let u = parseInt(e.id.replace(/-/g, '').slice(k, k + 8), 16) / 2 ** 32 * total;
      return pool.find(c => (u -= config.odds[c.odds]) < 0);
    };
    const c = !pool.length ? null : best || watered ? [draw(0), draw(20)].sort((p, q) => config.odds[p.odds] - config.odds[q.odds])[0] : draw(0);
    s.visitor = c && { id: e.id, c: c.id };
    if (c) {
      s.visits[e.id] = c.id;
      (s.guide[c.id] ??= { seen: 0, caught: 0 }).seen++;
    }
  }
  return s;
}

// The weight to use and the reps to expect at it, from the last confirmed sets: the same weight while the first set
// lands in the rep range, else the nearest weight expected to bring it back (never heavier after discomfort). Reps at
// another weight come from Epley's formula on the load: the dumbbells and any share of bodyweight.
function dose(x, weight) {
  const low = config.reps[0], high = Math.min(config.reps[1], Math.floor(config.work / x.tempo));
  const last = st.ex[x.id].sessions.filter(s => s.rounds).at(-1), prior = st.ex[x.id].sessions.at(-1);
  const sets = last ? last.rounds.filter(v => v.r > 0) : [prior ? { r: prior.r, w: prior.w } : { r: x.start[0], w: x.start[1] ?? null }];
  const load = v => (x.share ?? 0) * config.body + (x.hold === 'pair' ? 2 : 1) * v;
  const at = (v, w) => w === null ? v.r : Math.max(1, Math.round(30 * (load(v.w) * (1 + v.r / 30) / load(w) - 1)));
  const weights = x.share ? [0, ...config.weights] : config.weights, [first] = sets;
  const w = weight !== undefined ? weight : x.hold === 'none' ? null
    : first.r > high && last?.feel !== 'pain' ? weights.find(v => v > first.w && at(first, v) <= high) ?? weights.at(-1)
    : first.r < low ? weights.findLast(v => v < first.w && at(first, v) >= low) ?? weights[0]
    : first.w;
  const [r, then] = sets.map(v => at(v, w));
  return { w, r, then };
}
const said = (x, { w, r, then }) => `${w === null ? '' : `${w ? `${w} lb${x.hold === 'pair' ? ' each' : ''}` : `no dumbbell${x.hold === 'pair' ? 's' : ''}`} · `}expect about ${r} reps${x.sides ? ' a side' : ''}${then && then !== r && !x.sides ? `, then ${then}` : ''}`;

// Coverage affects which five exercises appear. Only the ball's landing chooses between them.
function pachinko() {
  const t = today(), had = new Set(t.snacks.map(s => s.x));
  const choices = config.exercises.map(x => {
    const gain = Object.entries(x.areas).reduce((g, [a, k]) => g + Math.min((x.sides ? 1 : config.minutes) * k, Math.max(0, config.sets - (t.sets[a] || 0))), 0);
    return [x, -Math.log(1 - Math.random()) / ((had.has(x.id) ? 0.2 : 1) * (1 + gain))];
  }).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([x]) => x);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  board = { choices, prize: { x: 44 + 68 * Math.floor(Math.random() * 5), y: 197 }, ball: null };
  $('pegs').innerHTML = pegs.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3"/>`).join('');
  $('dividers').innerHTML = dividers.map(x => `<path d="M${x} 312V354"/>`).join('');
  $('pockets').replaceChildren(...choices.map(x => Object.assign(document.createElement('span'), { textContent: x.name })));
  $('prize').setAttribute('transform', `translate(${board.prize.x} ${board.prize.y})`);
  $('prize').classList.remove('caught');
  $('aim').value = 180;
  $('aim').disabled = $('drop').disabled = false;
  $('aim').oninput();
  $('marble').setAttribute('cy', 26);
  $('drop').textContent = 'Drop ball';
  $('landed').textContent = '';
  $('prize-note').textContent = `Catch the seed for +${config.seeds.pachinko} when you log your snack.`;
  $('pachinko').classList.remove('dropped');
  location.hash = 'pachinko';
}

function drop() {
  const current = board;
  if (current.ball) {
    if (current.ball.slot !== null) {
      $('drop').disabled = true;
      begin(current.choices[current.ball.slot], null, current.ball.prize);
    }
    return;
  }
  audio.resume();
  const ball = current.ball = { x: +$('aim').value, y: 26, vx: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4), vy: 0, slot: null };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('aim').disabled = $('drop').disabled = true;
  $('drop').textContent = 'Dropping…';
  $('pachinko').classList.add('dropped');
  let previous = performance.now(), carry = 0, lastTone = 0;
  const frame = now => {
    if (board !== current) return;
    carry += Math.min((now - previous) / 1000, 0.05);
    previous = now;
    let impact = 0;
    while ((reduced || carry >= dt) && ball.slot === null) {
      impact = Math.max(impact, bounce(ball, current.prize));
      carry -= dt;
    }
    $('marble').setAttribute('cx', ball.x);
    $('marble').setAttribute('cy', ball.y);
    if (ball.prize && !$('prize').classList.contains('caught')) {
      $('prize').classList.add('caught');
      $('prize-note').textContent = `Seed caught · +${config.seeds.pachinko} when you log your snack.`;
    }
    if (!reduced && impact > 45 && now - lastTone > 65) {
      tone(1000 + ball.y * 2, 0.025, { type: 'triangle', gain: 0.025 });
      lastTone = now;
    }
    if (ball.slot === null) { current.frame = requestAnimationFrame(frame); return; }
    $('pockets').children[ball.slot].classList.add('won');
    $('landed').textContent = current.choices[ball.slot].name;
    if (!ball.prize) $('prize-note').textContent = 'No bonus this time.';
    $('drop').textContent = 'Do this exercise';
    $('drop').disabled = false;
    $('drop').focus({ preventScroll: true });
    [660, 990].forEach((f, k) => tone(f, 0.3, { at: k * 0.09, gain: 0.05 }));
  };
  current.frame = requestAnimationFrame(frame);
}

// Eight illustrated poses travel out and back, with a short pause at each end.
function play(x) {
  const bodyweight = x.share && snack.w === 0, sprite = $('figure').firstElementChild;
  $('cues').replaceChildren(...x.cues.map((c, i) => Object.assign(document.createElement('li'), {
    textContent: bodyweight && i === 0 ? x.bodyCue : c,
  })));
  sprite.src = `./assets/exercises/${x.id}${bodyweight ? '-body' : ''}.webp`;
  sprite.onerror = () => { throw new Error(`Could not load the ${x.name} demonstration.`); };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  sprite.style.transform = reduced ? 'translate(-75%, -50%)' : 'translate(0, 0)';
  if (reduced) return () => {};
  const animation = sprite.animate([0, 0, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 0].map(i => ({
    transform: `translate(${-(i % 4) * 25}%, ${-Math.floor(i / 4) * 50}%)`,
    easing: 'steps(1, end)',
  })), { duration: x.tempo * 1000, iterations: Infinity });
  return () => animation.cancel();
}

// Preparation, work and confirmation share one persisted session. Leaving it pauses rather than discarding it.
function begin(x, saved = null, prize) {
  snack = saved || { id: crypto.randomUUID(), x: x.id, ...dose(x), start: null, elapsed: 0, review: false, prize };
  $('name').textContent = x.name;
  $('snack-prize').hidden = snack.prize !== 'seed';
  $('snack-prize').textContent = `Pachinko seed · +${config.seeds.pachinko} when you log this snack`;
  $('dose').textContent = said(x, snack);
  $('plan').textContent = `${x.sides ? 'Each minute, one side' : 'Each minute'}: as many reps as you can, to failure with good form. Then rest until the chime.`;
  $('target-weight').replaceChildren(...(x.share ? [0, ...config.weights] : config.weights).map(w => new Option(`${w} lb${x.hold === 'pair' ? ' each' : ''}`, w)));
  $('target-weight').value = snack.w;
  $('weight-label').hidden = x.hold === 'none';
  $('swap').replaceChildren(new Option('Choose another exercise', ''), ...config.exercises.filter(v => v.id !== x.id).map(v => new Option(v.name, v.id)));
  const buddy = $('bird').cloneNode(true);
  for (const node of [buddy, ...buddy.querySelectorAll('[id]')]) node.removeAttribute('id');
  buddy.removeAttribute('tabindex');
  buddy.removeAttribute('role');
  buddy.setAttribute('class', $('bird').classList.contains('hatched') ? 'bird hatched' : 'bird');
  buddy.setAttribute('transform', `translate(56 96) scale(${-pet.scale} ${pet.scale})`);
  $('buddy').replaceChildren(buddy);
  snack.stop = play(x);
  $('snack').classList.toggle('over', snack.review);
  $('setup').hidden = snack.start !== null || snack.elapsed > 0 || snack.review;
  $('controls').hidden = !$('setup').hidden || snack.review;
  $('pause').textContent = snack.start === null ? 'Resume' : 'Pause';
  $('result').hidden = !snack.review;
  if (snack.review) review();
  saveSession();
  location.hash = 'snack';
  $('snack').scrollTop = 0;
  $('name').focus();
  snack.frame = requestAnimationFrame(clock);
  stayAwake();
}

async function stayAwake() {
  if (!navigator.wakeLock || !snack || snack.start === null || document.hidden || (snack.lock && !snack.lock.released)) return;
  const current = snack, lock = await navigator.wakeLock.request('screen');
  if (snack === current && snack.start !== null && !document.hidden) snack.lock = lock;
  else lock.release();
}

function saveSession() {
  const { stop, lock, frame, ...data } = snack;
  sessionStorage.setItem('paisano.snack', JSON.stringify(data));
}

function clock() {
  if (!snack) return;
  const t = snack.elapsed + (snack.start === null ? 0 : Date.now() - snack.start), total = config.minutes * 60000;
  const left = Math.ceil(Math.max(0, total - t) / 1000), set = Math.min(Math.floor(t / 60000), config.minutes - 1);
  $('elapsed').style.strokeDashoffset = 1 - Math.min(t / total, 1);
  $('clock').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  $('phase').textContent = snack.review ? 'Confirm your sets' : snack.start === null ? t ? 'Paused' : 'Get ready' : X[snack.x].sides ? `${set ? 'Right' : 'Left'} side` : `Set ${set + 1} of ${config.minutes}`;
  $('figure').classList.toggle('right', !!set && X[snack.x].sides);
  if (t >= total && !snack.review) {
    [523, 659, 784].forEach((f, k) => tone(f, 0.3, { at: k * 0.1, gain: 0.08 }));
    review(true);
  } else if (snack.start !== null && set !== snack.set) {
    if (snack.set !== undefined) { tone(880, 0.3); navigator.vibrate?.([200, 120, 200]); }
    snack.set = set;
  }
  snack.frame = requestAnimationFrame(clock);
}

function review(completed = false) {
  snack.at ??= completed && snack.start !== null ? snack.start + Math.max(0, config.minutes * 60000 - snack.elapsed) : Date.now();
  snack.day ??= dayOf(snack.at);
  snack.hour ??= new Date(snack.at).getHours();
  snack.elapsed += snack.start === null ? 0 : Date.now() - snack.start;
  snack.start = null;
  snack.review = true;
  snack.lock?.release();
  snack.stop();
  const x = X[snack.x];
  // Sets whose minute began start at the target, to be confirmed; the rest start at zero.
  snack.rounds ??= Array.from({ length: config.minutes }, (_, i) => ({ r: completed || i < Math.ceil(snack.elapsed / 60000) ? i ? snack.then ?? snack.r : snack.r : 0, w: snack.w }));
  $('setup').hidden = $('controls').hidden = true;
  $('result').hidden = false;
  $('snack').classList.add('over');
  $('actual').replaceChildren(...snack.rounds.map((v, i) => {
    const row = document.createElement('div');
    row.innerHTML = `<span>${x.sides ? i ? 'Right' : 'Left' : `Set ${i + 1}`}</span><label>Reps<input type="number" min="0" max="99" step="1" inputmode="numeric" required aria-label="${x.sides ? i ? 'Right' : 'Left' : `Set ${i + 1}`} reps"></label>`;
    const reps = row.querySelector('input');
    reps.value = v.r;
    reps.oninput = () => { v.r = reps.valueAsNumber; saveSession(); };
    if (x.hold !== 'none') {
      const label = document.createElement('label');
      label.textContent = x.hold === 'pair' ? 'lb each' : 'lb';
      const weight = label.appendChild(document.createElement('select'));
      weight.setAttribute('aria-label', `${x.sides ? i ? 'Right' : 'Left' : `Set ${i + 1}`} weight`);
      weight.replaceChildren(...(x.share ? [0, ...config.weights] : config.weights).map(w => new Option(w, w)));
      weight.value = v.w;
      weight.onchange = () => { v.w = +weight.value; saveSession(); };
      row.append(label);
    }
    return row;
  }));
  saveSession();
}

function stop() {
  snack.elapsed += snack.start === null ? 0 : Date.now() - snack.start;
  snack.start = null;
  saveSession();
  cancelAnimationFrame(snack.frame);
  snack.stop();
  snack.lock?.release();
  snack = null;
}

function finish(feel) {
  if (!snack) return; // the first tap already saved this session
  if (!$('result').reportValidity()) return;
  if (!snack.rounds.some(v => v.r > 0)) return toast('Enter the reps you did, or discard this snack.');
  const { x: id, rounds, id: eventId, at, day, hour, prize } = snack, x = X[id];
  record('snack', { x: id, rounds, feel, day, hour, prize }, eventId, at);
  stop();
  sessionStorage.removeItem('paisano.snack');
  location.hash = '';
  const last = st.ex[id].sessions.find(s => s.id === eventId);
  toast(`+${last.seeds} seed${last.seeds > 1 ? 's' : ''}.${last.watered ? ' Three snacks bring rain.' : ''} Next time: ${said(x, dose(x))}.`);
  hop();
  emote(last.watered ? '♥' : '!');
  if (last.watered && day === dayOf(Date.now())) rain();
}

// The log, kept on the worker. Events wait in this device's storage until it has them, so none are lost offline.
function record(kind, data, id = crypto.randomUUID(), at = Date.now()) {
  localStorage.setItem('paisano.outbox.' + id, JSON.stringify({ id, at, kind, data }));
  pending = outbox();
  st = replay();
  render();
  sync();
}

function sync() {
  const run = () => navigator.locks.request('paisano-sync', async () => {
    log = JSON.parse(localStorage.getItem('paisano.log') || '[]');
    do {
      // Workouts must arrive before their hunts, even when the outbox spans several batches.
      const sent = outbox().sort((a, b) => (b.kind === 'snack') - (a.kind === 'snack') || a.at - b.at).slice(0, 40), since = log.at(-1)?.seq ?? 0;
      const got = await (await api('/sync', { since, events: sent })).json();
      log = [...new Map([...log, ...got].map(e => [e.id, e])).values()].sort((a, b) => a.seq - b.seq);
      // Persist the response before removing the outbox. Replay deduplicates a crash between these writes.
      localStorage.setItem('paisano.log', JSON.stringify(log));
      for (const e of sent) localStorage.removeItem('paisano.outbox.' + e.id);
      pending = outbox();
    } while (pending.length);
    loaded = true;
    st = replay();
    render();
    $('sync').hidden = true; // shown only when something is waiting
  });
  syncing = syncing.then(run, run);
  syncing.catch(e => {
    $('sync').textContent = loaded ? 'Saved on this device · Retry sync' : 'Could not load log · Retry';
    $('sync').hidden = false;
    toast(e.message);
  });
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
  const t = today(), n = t.snacks.length, areas = Object.values(t.sets).filter(n => n > 0).length, seeds = st.earned - st.used;
  shade($('today'), a => (t.sets[a] || 0) / config.sets);
  $('tally').textContent = !n ? 'Nothing yet today' : `${areas} area${areas === 1 ? '' : 's'} worked · ${n} snack${n > 1 ? 's' : ''} today`;
  $('seeds').textContent = seeds;
  $('feed').disabled = !loaded || seeds <= 0;
  $('choose').disabled = !loaded;
  $('choose').textContent = sessionStorage.getItem('paisano.snack') ? 'Resume snack' : 'Choose a snack';
  renderedDay = dayOf(Date.now());
  const i = stageOf(st.food), next = config.stages[i + 1];
  $('grown').style.width = `${next ? (st.food - config.stages[i][1]) / (next[1] - config.stages[i][1]) * 100 : 100}%`;
  $('toward').textContent = next ? `${next[1] - st.food} to ${next[0].toLowerCase()}` : '';
  $('plants').innerHTML = config.plants.filter(p => p.id in st.plants).map(p => `<use href="#${st.plants[p.id] >= p.rains ? `p-${p.id}` : 'sprout'}" x="${p.x}" y="${GROUND}"/>`).join('');
  const friends = config.friends.slice(0, Object.keys(st.plants).length);
  if ($('friends').childElementCount !== friends.length) {
    goodbye();
    $('friends').innerHTML = friends.map((f, i) => `<g class="friend" data-friend="${f.id}" transform="translate(${f.x} ${f.y})" style="--friend-row: ${-i * 64}px">
      <title>${f.name} · ${f.kind}</title><ellipse class="shadow" rx="15" ry="2"/>
      <g class="friend-motion"><foreignObject class="friend-art" x="-32" y="-59" width="64" height="64"><div xmlns="http://www.w3.org/1999/xhtml" class="friend-frames"></div></foreignObject></g>
      <rect class="pet-hit" x="-25" y="-44" width="50" height="48" rx="12" role="button" tabindex="0" aria-label="${f.action}"/>
    </g>`).join('');
  }
  $('company').textContent = friends.length ? `${friends.length} friend${friends.length === 1 ? '' : 's'} visiting` : 'Plant to invite friends';
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

// What changes as time passes: how long since the last snack and how many more bring rain, whether Paisano is hungry,
// and where the sun is (it crosses the garden from 6 am to 8 pm, and is below the dunes at night).
function tick() {
  if (renderedDay !== dayOf(Date.now())) return render();
  const t = today(), minutes = Math.round((Date.now() - (t.snacks.at(-1)?.at ?? 0)) / 6e4), more = config.rainAt - t.snacks.length;
  const last = !t.snacks.length ? '' : minutes < 1 ? 'Last one just now' : minutes < 60 ? `Last one ${minutes} minute${minutes > 1 ? 's' : ''} ago`
    : `Last one ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''} ago`;
  $('since').textContent = [last, t.rain ? 'It rained today' : `${more} more snack${more > 1 ? 's' : ''} for rain`].filter(Boolean).join(' · ');
  const stage = config.stages[stageOf(st.food)][0], hungry = st.food > 0 && !fullness();
  $('stage').textContent = hungry ? `Hungry ${stage.toLowerCase()}` : stage;
  const now = new Date(), day = (now.getHours() + now.getMinutes() / 60 - 6) / 14;
  $('sun').setAttribute('cx', 24 + 312 * day);
  $('sun').setAttribute('cy', 84 - 56 * Math.sin(Math.PI * day));
}

// History: daily coverage, weekly sets, and observed reps and weights.
function chronicle() {
  const selected = $('calendar').querySelector('.on')?.dataset.day, focused = document.activeElement.dataset.day;
  const days = Object.entries(st.days), snacks = days.reduce((s, [, d]) => s + d.snacks.length, 0);
  $('totals').textContent = snacks ? `${snacks} snack${snacks > 1 ? 's' : ''} on ${days.length} day${days.length > 1 ? 's' : ''}.`
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
      const x = d ? AREAS.reduce((sum, a) => sum + Math.min(config.sets, d.sets[a] || 0), 0) / (config.sets * AREAS.length) : 0;
      button.style.setProperty('--x', x);
      button.dataset.x = x;
      button.dataset.day = key;
      button.classList.toggle('on', key === selected);
      button.hidden = date > now;
      button.title = `${date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}: ${d ? `${d.snacks.length} snack${d.snacks.length > 1 ? 's' : ''}, ${Object.values(d.sets).filter(n => n > 0).length} areas worked` : 'nothing'}`;
      button.setAttribute('aria-label', button.title);
      button.onclick = () => {
        for (const b of $('calendar').querySelectorAll('.on')) b.classList.remove('on');
        button.classList.add('on');
        $('day').textContent = button.title + (d ? ` (${d.snacks.map(s => `${X[s.x].name}: ${s.rounds ? s.rounds.map(v => v.r ? `${v.r} reps${v.w === null ? '' : ` at ${v.w} lb${X[s.x].hold === 'pair' ? ' each' : ''}`}` : 'skipped').join(' / ') : 'target only (older entry)'}`).join('; ')})` : '');
      };
      cells.push(button);
    }
  }
  $('calendar').replaceChildren(...cells);
  if (!selected) $('calendar').scrollLeft = $('calendar').scrollWidth;
  $('day').textContent = '';
  $('calendar').querySelector('.on')?.click();
  if (focused) $('calendar').querySelector(`[data-day="${focused}"]`)?.focus({ preventScroll: true });
  const week = {};
  for (let k = 0; k < 7; k++) {
    const date = new Date(now);
    date.setDate(date.getDate() - k);
    for (const [a, n] of Object.entries(st.days[date.toLocaleDateString('sv')]?.sets || {})) week[a] = (week[a] || 0) + n;
  }
  const top = Math.max(20, ...Object.values(week));
  $('volume').replaceChildren(...AREAS.flatMap(a => {
    const bar = document.createElement('i');
    bar.append(Object.assign(document.createElement('b'), { style: `width: ${(week[a] || 0) / top * 100}%` }));
    return [Object.assign(document.createElement('span'), { textContent: config.areas[a] }), bar, Object.assign(document.createElement('em'), { textContent: +(week[a] || 0).toFixed(1) })];
  }));
  // Show observed work with separate units. Reps and pounds do not combine into a claimed strength score.
  $('lifts').replaceChildren(...config.exercises.map(x => {
    const sessions = st.ex[x.id].sessions.filter(s => s.rounds), li = document.createElement('li'), last = sessions.at(-1);
    li.innerHTML = '<b></b><small></small><svg viewBox="0 0 84 28" preserveAspectRatio="none" aria-hidden="true"><polyline/></svg>';
    li.querySelector('b').textContent = x.name;
    li.querySelector('small').textContent = last ? `Last ${last.rounds.map(v => v.r ? `${v.r}${v.w === null ? '' : ` × ${v.w} lb`}` : 'skipped').join(' / ')} · Next: ${said(x, dose(x))}` : `${st.ex[x.id].sessions.length ? 'Next' : 'First'}: ${said(x, dose(x))}`;
    const values = sessions.map(s => {
      const completed = s.rounds.filter(v => v.r > 0);
      return x.hold === 'none' ? Math.min(...completed.map(v => v.r)) : Math.max(...completed.map(v => v.w));
    });
    const top = Math.max(x.hold === 'none' ? config.reps[1] : 1, ...values);
    li.querySelector('polyline').setAttribute('points', values.map((v, i) => `${values.length > 1 ? i / (values.length - 1) * 84 : 42},${26 - v / top * 24}`).join(' '));
    return li;
  }));
}

// Back leaves each screen. A running drop is cancelled; a workout is saved for later.
function route() {
  const hash = location.hash.slice(1);
  if (!password && hash) { history.replaceState(null, '', location.pathname); return route(); }
  if (hunt && (!password || hash)) end();
  if (!password || hash) goodbye();
  if (hash !== 'pachinko' && board) { cancelAnimationFrame(board.frame); board = null; }
  if (hash !== 'snack' && snack) stop();
  if ((hash === 'pachinko' && !board) || (hash === 'snack' && !snack)) return history.replaceState(null, '', location.pathname), route();
  $('lock').hidden = !!password;
  $('home').hidden = !password;
  $('home').inert = ['pachinko', 'snack', 'history', 'desert', 'settings'].includes(hash);
  if (!hash && password) { render(); $('choose').focus({ preventScroll: true }); }
  $('pachinko').hidden = hash !== 'pachinko';
  $('snack').hidden = hash !== 'snack';
  $('history').hidden = hash !== 'history' || !password;
  $('desert').hidden = hash !== 'desert' || !password;
  $('settings').hidden = hash !== 'settings' || !password;
  if (hash === 'pachinko') { $('pachinko').scrollTop = 0; $('aim').focus({ preventScroll: true }); }
  if (hash === 'snack') $('name').focus({ preventScroll: true });
  if (hash === 'history') { chronicle(); $('history').querySelector('.x').focus(); }
  if (hash === 'desert') { desert(); $('desert').querySelector('.x').focus(); }
  if (hash === 'settings') $('settings').querySelector('.x').focus();
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
      button.setAttribute('aria-label', `Plant ${p.name.toLowerCase()} for ${p.cost} seeds`);
      button.onclick = () => {
        const before = Object.keys(st.plants).length;
        record('plant', { p: p.id });
        if (Object.keys(st.plants).length > before) toast(`Planted ${p.name.toLowerCase()}. ${config.friends[before].name} is visiting!`);
      };
      li.querySelector('em').replaceWith(button);
    }
    return li;
  }));
  const variety = Object.keys(st.plants).length;
  $('friends-note').textContent = `${variety} of ${config.plants.length} plant varieties. ${variety === config.plants.length ? 'All your friends are here.' : 'Each new variety invites another friend, even as a sprout.'} Tap a friend in the garden to play.`;
  $('friend-guide').replaceChildren(...config.friends.map((f, i) => {
    const li = row('', i >= variety), svg = li.querySelector('svg');
    svg.classList.add('friend-portrait');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<foreignObject width="64" height="64"><div xmlns="http://www.w3.org/1999/xhtml" class="friend-frames" style="--friend-row: ${-i * 64}px"></div></foreignObject>`;
    li.querySelector('b').textContent = `${f.name} · ${f.kind}`;
    li.querySelector('small').textContent = i < variety ? f.habit : `Visits with ${i + 1} plant ${i ? 'varieties' : 'variety'}`;
    li.querySelector('em').textContent = i < variety ? 'Here' : '';
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
  for (const svg of $('desert').querySelectorAll('.rows svg:not(.friend-portrait)')) {
    const b = svg.firstChild.getBBox();
    svg.setAttribute('viewBox', `${b.x - 1} ${b.y - 1} ${b.width + 2} ${b.height + 2}`);
  }
}

// A new sprite row at each growth stage; scale grows continuously between stages.
const pet = { x: 200, face: 1, size: 1, scale: 1, busy: false, flying: 0, strewn: [] }; // flying: seeds tossed, not yet eaten
let company = null;

// Visits are derived from the garden. Playing is cosmetic, so it needs no new saved events or currency.
function greet(id, quiet = false) {
  if (hunt || location.hash || document.hidden) return;
  goodbye();
  const f = config.friends.find(f => f.id === id), node = $('friends').querySelector(`[data-friend="${id}"]`);
  const together = !pet.busy;
  if (together) {
    pet.busy = true;
    pet.face = f.x < pet.x ? -1 : 1;
    place();
    $('bird').classList.add(`with-${id}`);
    emote(id === 'quail' ? '♪' : id === 'tortoise' ? '?' : id === 'fox' ? 'z' : '♥');
  }
  node.style.setProperty('--face', f.x < pet.x ? 1 : -1);
  node.classList.add('playing');
  const sound = audio.createGain();
  sound.connect(audio.destination);
  company = { node, id, sound, together, timer: setTimeout(goodbye, 3600) };
  if (quiet) return;
  toast(f.greeting);
  if (id === 'quail') {
    for (const at of [0, 0.2, 0.4, 1.6, 1.8]) tone(at < 1 ? 1400 : 1900, 0.13, { to: at < 1 ? 2100 : 2500, at, gain: 0.025, out: sound });
  } else if (id === 'rabbit') {
    for (const at of [0.4, 1.4, 2.4]) tone(320, 0.12, { to: 600, at, gain: 0.03, out: sound });
  } else if (id === 'tortoise') tone(600, 0.2, { to: 1100, at: 2.1, gain: 0.025, out: sound });
  else tone(500, 0.7, { to: 220, gain: 0.02, out: sound });
}

function goodbye() {
  if (!company) return;
  clearTimeout(company.timer);
  company.sound.disconnect();
  company.node.classList.remove('playing');
  if (company.together) {
    $('bird').classList.remove(`with-${company.id}`);
    pet.busy = false;
  }
  company = null;
  if (!pet.busy && pet.strewn.length) eat();
}

function grow() {
  const eaten = Math.max(0, st.food - pet.flying), stages = config.stages, i = stageOf(eaten);
  $('bird').classList.toggle('hatched', i > 0);
  if (!i) { pet.size = pet.scale = 1; return place(); }
  const g = i === stages.length - 1 ? 1 : (i - 1 + (eaten - stages[i][1]) / (stages[i + 1][1] - stages[i][1])) / (stages.length - 2);
  $('bird').style.setProperty('--row', `${-(i - 1) * 96}px`);
  pet.size = 1.1 + 0.6 * g; // growth controls hunting stride and reach
  pet.scale = 0.75 + 0.5 * g; // the artwork has its own proportions
  pet.top = [-63, -67.5, -70.875, -71.25][i - 1];
  place();
}

// The emotion ball floats over its head, as a Chao's does, and turns into a sign of how it feels.
function place() {
  const hatched = $('bird').classList.contains('hatched');
  $('bird').setAttribute('transform', `translate(${pet.x} ${GROUND}) scale(${pet.face * pet.scale} ${pet.scale})`);
  $('mood').setAttribute('transform', `translate(${pet.x + (hatched ? pet.face * 4 * pet.scale : 0)} ${GROUND + (hatched ? pet.top * pet.scale - 8 : -38)})`);
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
  const seed = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  seed.setAttribute('href', '#grain');
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
      const reach = 22 * pet.scale; // the feeding sprite's beak, measured from its feet
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
    const food = Math.max(0, st.food - pet.flying), stage = stageOf(food);
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
  if (pet.busy || company || hunt || !$('bird').classList.contains('hatched') || document.hidden || location.hash || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (night) return Math.random() < 0.5 && emote('z');
  const hungry = !fullness(), r = Math.random();
  const friends = [...$('friends').children];
  if (friends.length && r < 0.25) return greet(friends[Math.floor(Math.random() * friends.length)].dataset.friend, true);
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
  $('visitor').setAttribute('aria-label', v ? `Hunt ${C[v.c].name}` : 'No visitor');
  $('visitor').setAttribute('tabindex', v ? '0' : '-1');
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
  goodbye();
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
  record('hunt', { v, c: c.id, ok: true });
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
    record('hunt', { v, c: c.id, ok: false });
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

// Three snacks bring a little rain to the garden.
function rain() {
  $('garden').parentNode.classList.add('raining');
  setTimeout(() => $('garden').parentNode.classList.remove('raining'), 9000);
}
$('rain').innerHTML = Array.from({ length: 40 }, (_, i) => `<line x1="${i * 9.5}" x2="${i * 9.5 - 2.5}" y1="-14" y2="-4" style="animation-delay: -${Math.random().toFixed(2)}s"/>`).join('');

// A tap in the garden: a step on the hunt, the start of one on the visitor, or a pat for Paisano.
$('garden').onclick = e => {
  audio.resume();
  const friend = e.target.closest('[data-friend]');
  if (friend) return greet(friend.dataset.friend);
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

$('choose').onclick = () => {
  audio.resume();
  const saved = sessionStorage.getItem('paisano.snack');
  saved ? begin(X[JSON.parse(saved).x], JSON.parse(saved)) : pachinko();
};
$('aim').oninput = () => {
  const x = +$('aim').value;
  $('marble').setAttribute('cx', x);
  $('aim-line').setAttribute('d', `M${x} 37V58`);
  $('aim').setAttribute('aria-valuetext', `Above ${board.choices[Math.floor((x - 10) / 68)].name}`);
};
$('board').onpointerdown = e => {
  if (board.ball) return;
  const move = e => {
    const rect = $('board').getBoundingClientRect();
    $('aim').value = Math.max(16, Math.min(344, (e.clientX - rect.left) / rect.width * 360));
    $('aim').oninput();
  };
  move(e);
  $('board').setPointerCapture(e.pointerId);
  $('board').onpointermove = move;
};
$('board').onlostpointercapture = () => { $('board').onpointermove = null; };
$('drop').onclick = drop;
// Another weight changes the reps to expect, and at 0 lb the bodyweight demonstration.
$('setup').oninput = () => {
  const x = X[snack.x], w = x.hold === 'none' ? null : +$('target-weight').value;
  if (snack.w === w) return;
  Object.assign(snack, dose(x, w));
  snack.stop();
  snack.stop = play(x);
  $('dose').textContent = said(x, snack);
  saveSession();
};
$('setup').onsubmit = e => {
  e.preventDefault();
  $('setup').oninput();
  snack.start = Date.now();
  snack.stop();
  snack.stop = play(X[snack.x]);
  $('setup').hidden = true;
  $('controls').hidden = false;
  $('pause').textContent = 'Pause';
  audio.resume();
  saveSession();
  stayAwake();
};
$('pause').onclick = () => {
  if (snack.start === null) { audio.resume(); snack.start = Date.now(); $('pause').textContent = 'Pause'; stayAwake(); }
  else { snack.elapsed += Date.now() - snack.start; snack.start = null; $('pause').textContent = 'Resume'; snack.lock?.release(); }
  saveSession();
};
$('finish-early').onclick = () => review();
$('swap').onchange = () => { const x = X[$('swap').value], prize = snack.prize; stop(); begin(x, null, prize); };
$('discard').onclick = () => { stop(); sessionStorage.removeItem('paisano.snack'); location.hash = ''; };
$('result').onsubmit = e => { e.preventDefault(); finish(e.submitter.dataset.feel); };
$('result').onkeydown = e => { if (e.key === 'Enter' && e.target.matches('input, select')) { e.preventDefault(); $('result').querySelector('[data-feel=hard]').focus(); } };
$('sync').onclick = () => sync();
// A reset is an event like any other, so every device starts over from it; the log before it stays in D1.
$('reset').onclick = () => $('confirm-reset').showModal();
$('confirm-reset').querySelector('[value=reset]').onclick = () => {
  if (snack) stop();
  sessionStorage.removeItem('paisano.snack');
  record('reset', {});
  location.hash = '';
  toast('Progress reset. Paisano is an egg again.');
};
for (const x of document.querySelectorAll('.x')) x.onclick = () => { location.hash = ''; };
for (const id of ['bird', 'visitor']) $(id).onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); $(id).dispatchEvent(new MouseEvent('click', { bubbles: true })); } };
$('friends').onkeydown = e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
};

addEventListener('keydown', e => {
  if (e.key === 'Escape' && location.hash) location.hash = '';
  else if (e.key === 'Escape' && hunt) end();
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
$('sync').hidden = loaded; // until the log first loads

// Sync on reconnect and tab return. Never replace a running workout with an automatic reload.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) goodbye();
  if (document.hidden && hunt) end();
  if (!document.hidden && password) { sync(); stayAwake(); }
});
addEventListener('online', () => { if (password) sync(); });
addEventListener('storage', e => {
  if (e.key === 'paisano.log' || e.key?.startsWith('paisano.outbox.')) {
    log = JSON.parse(localStorage.getItem('paisano.log') || '[]');
    pending = outbox();
    loaded = localStorage.getItem('paisano.log') !== null;
    st = replay();
    render();
  }
});
setInterval(tick, 30e3);

history.replaceState(null, '', location.pathname);
addEventListener('hashchange', route);
route();
render();
idle();
const saved = sessionStorage.getItem('paisano.snack');
if (saved && password) {
  const data = JSON.parse(saved);
  if ([...log, ...pending].some(e => e.id === data.id)) sessionStorage.removeItem('paisano.snack');
  else begin(X[data.x], data);
}
if (password) sync();

// Production can open offline after one visit. Local development always loads the current files.
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updating) location.reload(); });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = () => {
      if (!reg.waiting) return;
      $('update').hidden = false;
      $('update').onclick = () => { if (snack) stop(); updating = true; reg.waiting.postMessage('activate'); };
    };
    offer();
    reg.addEventListener('updatefound', () => reg.installing.addEventListener('statechange', offer));
    reg.update();
  });
}
