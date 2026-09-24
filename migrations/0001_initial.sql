-- Sleep Tracker V1 schema.
-- Sleep endpoints are local wall-clock values (YYYY-MM-DDTHH:MM) with no zone/offset.
-- created_at/updated_at are technical machine timestamps and carry no sleep semantics.

CREATE TABLE households (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL REFERENCES households (id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  color TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX profiles_household_idx ON profiles (household_id);

CREATE TABLE sleep_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles (id) ON DELETE RESTRICT,
  night_date TEXT NOT NULL CHECK (night_date LIKE '____-__-__'),
  bedtime_local TEXT CHECK (
    bedtime_local IS NULL
    OR bedtime_local LIKE '____-__-__T__:__'
  ),
  wake_time_local TEXT CHECK (
    wake_time_local IS NULL
    OR wake_time_local LIKE '____-__-__T__:__'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (bedtime_local IS NOT NULL OR wake_time_local IS NOT NULL),
  CHECK (wake_time_local IS NULL OR substr(wake_time_local, 1, 10) = night_date),
  CHECK (bedtime_local IS NULL OR wake_time_local IS NULL OR bedtime_local < wake_time_local),
  UNIQUE (profile_id, night_date)
);

-- V1 has a single household and no login UI; the row is the future authorization boundary.
INSERT INTO households (id, name, created_at, updated_at)
VALUES ('hh_default', 'Household', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
