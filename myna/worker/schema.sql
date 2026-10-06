-- Myna's deck. A card is a word or phrase; s and d are its FSRS stability (in days) and difficulty,
-- empty until it is first answered. Days are Paul's local dates, which turn at 4 am.
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  ko TEXT NOT NULL UNIQUE,   -- the word or phrase in its plain form
  en TEXT NOT NULL,          -- what it means
  ask_ko TEXT, ask_en TEXT,  -- how it is asked next, a form that suits its level; empty while being written
  intro TEXT,                -- the day it is shown as new: the first, or the latest if never answered; empty in the pool
  s REAL, d REAL,
  last TEXT,                 -- the day it was last answered
  due TEXT,                  -- the day it is next asked
  level INTEGER NOT NULL DEFAULT 0
);

-- Every answer, as it was asked (empty when another device's answer had the card being rewritten).
CREATE TABLE IF NOT EXISTS answers (
  card INTEGER NOT NULL,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  good INTEGER NOT NULL,
  ko TEXT,
  en TEXT
);
