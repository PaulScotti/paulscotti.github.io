-- Shared state for paulscotti.com/seattle.
-- Base listings live in seattle/places.json; this database holds what visitors change.

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS notes_place ON notes (place_id);

-- One row per place: a JSON object of edited fields (status, tour time, rent, ...),
-- or a whole new place when visitors add one (data.added = true).
CREATE TABLE IF NOT EXISTS place_edits (
  place_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);

-- Every write, so any edit or deletion can be undone by hand.
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  place_id TEXT,
  payload TEXT NOT NULL
);
