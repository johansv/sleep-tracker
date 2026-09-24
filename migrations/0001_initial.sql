PRAGMA foreign_keys = ON;
CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO households (id, name) VALUES ('local-household', 'My household');
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 60),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  night_date TEXT NOT NULL CHECK(length(night_date) = 10),
  bedtime_local TEXT,
  wake_time_local TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(profile_id, night_date),
  CHECK(bedtime_local IS NOT NULL OR wake_time_local IS NOT NULL),
  CHECK(wake_time_local IS NULL OR substr(wake_time_local,1,10) = night_date),
  CHECK(bedtime_local IS NULL OR wake_time_local IS NULL OR wake_time_local > bedtime_local)
);
CREATE INDEX profiles_household ON profiles(household_id);
