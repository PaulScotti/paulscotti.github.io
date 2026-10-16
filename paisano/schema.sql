-- Paisano's log: every snack (an exercise, its sets, how it went), seed fed, hunt, planting and reset, in the order
-- the worker got them. Since v11 every set goes to failure, logged with feel 'hard'; since v14 a snack is one set, or
-- a set a side, with the reps expected.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,  -- made by the device, so an event sent twice is kept once
  at INTEGER NOT NULL,      -- when it happened, in ms
  kind TEXT NOT NULL,       -- snack, feed, hunt, plant or reset
  data TEXT NOT NULL        -- snack: {x, rounds: [{r,w}] or a side each, expect, feel, day, hour, prize?}; feed: {n}; hunt: {v,c,ok}; plant: {p}; reset: {}
);
