-- Everything small that ebis syncs is a record: a book's details, a reading position,
-- a highlight, the open tabs. seq orders changes so each device can ask for what's new.
CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS records_seq ON records (seq);
