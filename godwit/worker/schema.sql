-- Godwit's todo.txt, one row per saved version. The newest row is the list; older ones are there to go back to.
CREATE TABLE IF NOT EXISTS versions (
  v INTEGER PRIMARY KEY AUTOINCREMENT,  -- the version, sent as the ETag
  at INTEGER NOT NULL,                  -- when it was saved, in ms
  text TEXT NOT NULL                    -- the whole todo.txt
);
