-- Paisano's log: every snack (an exercise, its dose, how it felt), seed fed, hunt and planting, in the order the worker
-- got them.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,  -- made by the device, so an event sent twice is kept once
  at INTEGER NOT NULL,      -- when it happened, in ms
  kind TEXT NOT NULL,       -- snack, feed, hunt or plant
  data TEXT NOT NULL        -- snack: {x, w, r, feel}; feed: {n}; hunt: {v (the snack), ok}; plant: {p}
);
