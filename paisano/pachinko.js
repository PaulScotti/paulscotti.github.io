// The pachinko board, shared by the drawing and its test: a new layout of pegs for each seed, a launcher at the top,
// five 68-unit pockets along the bottom, and fixed-timestep physics so a shot lands the same at every refresh rate.
export const dividers = [78, 146, 214, 282];
export const dt = 1 / 120;
const BALL = 6;

// A shot from the launcher: angle in radians from straight down, power from 0 to 1.
export const launch = (angle, power) => {
  const speed = 140 + 460 * power;
  return { x: 180, y: 30, vx: speed * Math.sin(angle), vy: speed * Math.cos(angle), slot: null, hits: [] };
};

// One of a few patterns, with the odd bumper and, when there's a seed to win, a seed low on the board. Pegs keep more
// than a ball's width apart, from each other, the walls and the pockets, so a ball can always pass between them.
export function layout(seed, prize) {
  const rand = () => { // mulberry32, so neighbouring seeds still make unrelated boards
    let t = seed = (seed + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
  const pegs = [], spots = [], kind = Math.floor(rand() * 4);
  const add = (x, y, r, more) => {
    if (x >= 26 + r && x <= 334 - r && y >= 84 && y <= 284 && pegs.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + r + 2 * BALL + 4))
      pegs.push({ x, y, r, e: r > 4 ? 0.85 : 0.58, ...more });
  };
  if (prize) add(60 + rand() * 240, 210 + rand() * 66, 6, { seed: true });
  if (kind === 0) { // staggered rows, with gaps
    const dx = 30 + rand() * 12, dy = 28 + rand() * 8;
    for (let y = 88, row = 0; y < 284; y += dy, row++) for (let x = 28 + (row % 2) * dx / 2; x < 334; x += dx) if (rand() > 0.12) spots.push([x, y]);
  } else if (kind === 1) { // rings, mirrored
    for (let k = 4 + Math.floor(rand() * 3); k--; ) {
      const cx = 50 + rand() * 130, cy = 110 + rand() * 150, r = 18 + rand() * 30, n = Math.round(2 * Math.PI * r / 26);
      for (let i = 0; i < n; i++) {
        const x = cx + r * Math.cos(2 * Math.PI * i / n), y = cy + r * Math.sin(2 * Math.PI * i / n);
        spots.push([x, y], [360 - x, y]);
      }
    }
  } else if (kind === 2) { // waves, or chevrons
    const amp = 10 + rand() * 18, len = 40 + rand() * 50, phase = rand() * 6, v = rand() < 0.5;
    for (let y = 92; y < 284; y += 34) for (let x = 28; x < 334; x += 26)
      spots.push([x, y + (v ? (Math.abs(x - 180) - 80) * amp / 80 : amp * Math.sin(x / len + phase + y / 60))]);
  } else for (let i = 0; i < 200; i++) { // a scatter, mirrored
    const x = 28 + rand() * 152, y = 88 + rand() * 196;
    spots.push([x, y], [360 - x, y]);
  }
  // Mirrored boards get pegs down the middle, so no lane runs clear, a unit off it, so no straight shot balances on one.
  if (kind % 2) for (let y = 110; y < 284; y += 44) spots.push([181, y]);
  for (const [x, y] of spots) add(x, y, rand() < 0.07 ? 8 : 4);
  return pegs;
}

// Moves the ball one step, off pegs, walls and pocket dividers, and notes each peg it touches in ball.hits. The seed
// is caught only when the ball rolls over it, and doesn't turn it. Returns how hard it struck.
export function step(ball, pegs) {
  ball.vy += 520 * dt;
  ball.vx *= Math.exp(-0.35 * dt);
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  let impact = 0;
  const walls = dividers.map(x => ({ x, y: Math.max(312, Math.min(354, ball.y)), r: 3, e: 0.58 }));
  for (const [i, peg] of [...pegs, ...walls].entries()) {
    const dx = ball.x - peg.x, dy = ball.y - peg.y, distance = Math.hypot(dx, dy), reach = peg.seed ? peg.r : peg.r + BALL;
    if (distance >= reach) continue;
    if (i < pegs.length && !ball.hits.includes(i)) ball.hits.push(i);
    if (peg.seed) continue;
    const nx = dx / distance, ny = dy / distance, speed = ball.vx * nx + ball.vy * ny;
    ball.x = peg.x + nx * reach;
    ball.y = peg.y + ny * reach;
    if (speed < 0) {
      ball.vx -= (1 + peg.e) * speed * nx;
      ball.vy -= (1 + peg.e) * speed * ny;
      impact = Math.max(impact, -speed);
    }
  }
  if (ball.x < 16) { ball.x = 16; ball.vx = Math.abs(ball.vx) * 0.58; }
  if (ball.x > 344) { ball.x = 344; ball.vx = -Math.abs(ball.vx) * 0.58; }
  if (ball.y < 8) { ball.y = 8; ball.vy = Math.abs(ball.vy) * 0.58; }
  if (ball.y >= 348) {
    ball.y = 348;
    ball.slot = Math.floor((ball.x - 10) / 68);
  }
  return impact;
}
