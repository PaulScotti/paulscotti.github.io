import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dt, launch, layout, step } from './pachinko.js';

test('on every board each shot settles, every pocket can be reached, aim matters, and the seed can be hit or missed without turning the ball', () => {
  const left = [], right = [];
  for (let seed = 1; seed <= 40; seed++) {
    const pegs = layout(seed, true), reached = new Set();
    let seeded = 0, shots = 0;
    for (let degrees = -80; degrees <= 80; degrees += 5) {
      for (const power of [0, 0.35, 0.7, 1]) {
        const ball = launch(degrees * Math.PI / 180, power);
        for (let tick = 0; tick < 12 / dt && ball.slot === null; tick++) {
          step(ball, pegs);
          assert(ball.x >= 16 && ball.x <= 344 && ball.y >= 8 && Number.isFinite(ball.y));
        }
        assert.notEqual(ball.slot, null, `Ball stuck on board ${seed}, ${degrees}°, power ${power}`);
        assert(ball.slot >= 0 && ball.slot < 5);
        reached.add(ball.slot);
        if (ball.hits.some(i => pegs[i].seed)) {
          const bare = launch(degrees * Math.PI / 180, power), others = pegs.filter(p => !p.seed);
          while (bare.slot === null) step(bare, others);
          assert.equal(bare.x, ball.x, `The seed turned the ball on board ${seed}`);
          seeded++;
        }
        shots++;
        if (Math.abs(degrees) >= 60) (degrees < 0 ? left : right).push(ball.slot);
      }
    }
    assert.equal(reached.size, 5, `Board ${seed} cannot reach every pocket`);
    assert(seeded > 0 && seeded < shots, `Board ${seed}'s seed must be catchable and missable`);
  }
  const mean = xs => xs.reduce((a, b) => a + b) / xs.length;
  assert(mean(right) - mean(left) > 1.5, 'Aim has too little influence');
});
