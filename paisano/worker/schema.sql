-- Paisano's log: every snack (an exercise, its dose, how it felt) and every seed fed, in the order the worker got them.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,  -- made by the device, so an event sent twice is kept once
  at INTEGER NOT NULL,      -- when it happened, in ms
  kind TEXT NOT NULL,       -- snack or feed
  data TEXT NOT NULL        -- snack: {x, w, r, feel}; feed: {n}
);
