// Board coordinates are shared by the drawing and physics. Five 68-unit pockets.
export const pegs = Array.from({ length: 7 }, (_, row) =>
  Array.from({ length: row % 2 ? 9 : 10 }, (_, col) => ({ x: 27 + col * 34 + row % 2 * 17, y: 78 + row * 34 }))
).flat();
export const dividers = [78, 146, 214, 282];
export const dt = 1 / 120;

// A fixed timestep keeps collisions and the landing identical at every display refresh rate.
export function step(ball, prize) {
  ball.vy += 520 * dt;
  ball.vx *= Math.exp(-0.35 * dt);
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  let impact = 0;
  for (const peg of [...pegs, ...dividers.map(x => ({ x, y: Math.max(312, Math.min(354, ball.y)) }))]) {
    const dx = ball.x - peg.x, dy = ball.y - peg.y, distance = Math.hypot(dx, dy);
    if (distance >= 9) continue;
    const nx = dx / distance, ny = dy / distance, speed = ball.vx * nx + ball.vy * ny;
    ball.x = peg.x + nx * 9;
    ball.y = peg.y + ny * 9;
    if (speed < 0) {
      ball.vx -= 1.58 * speed * nx;
      ball.vy -= 1.58 * speed * ny;
      impact = Math.max(impact, -speed);
    }
  }
  if (ball.x < 16) { ball.x = 16; ball.vx = Math.abs(ball.vx) * 0.58; }
  if (ball.x > 344) { ball.x = 344; ball.vx = -Math.abs(ball.vx) * 0.58; }
  if (Math.hypot(ball.x - prize.x, ball.y - prize.y) < 23) ball.prize = 'seed';
  if (ball.y >= 348) {
    ball.y = 348;
    ball.slot = Math.floor((ball.x - 10) / 68);
  }
  return impact;
}
