import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dt, step } from './pachinko.js';

test('every drop settles, every pocket is reachable, and aiming changes the outcome', () => {
  const landings = Array.from({ length: 5 }, () => Array(5).fill(0));
  let caught = 0;
  for (let x = 16; x <= 344; x += 0.5) {
    for (const vx of [-8, -6, -4, 4, 6, 8]) {
      const ball = { x, y: 26, vx, vy: 0, slot: null };
      for (let tick = 0; tick < 10 / dt && ball.slot === null; tick++) {
        step(ball, { x: 180, y: 197 });
        assert(ball.x >= 16 && ball.x <= 344 && Number.isFinite(ball.y));
      }
      assert.notEqual(ball.slot, null, `Ball stuck at drop ${x}, velocity ${vx}`);
      assert(ball.slot >= 0 && ball.slot < 5);
      landings[Math.min(4, Math.floor((x - 16) / 328 * 5))][ball.slot]++;
      caught += !!ball.prize;
    }
  }
  assert(landings.every(row => row.every(n => n > 0)), 'A pocket cannot be reached');
  const mean = row => row.reduce((sum, n, i) => sum + n * i, 0) / row.reduce((a, b) => a + b);
  assert(mean(landings[4]) - mean(landings[0]) > 2, 'Drop position has too little influence');
  assert(caught > 0 && caught < 3942, 'The prize must be catchable and missable');
});
