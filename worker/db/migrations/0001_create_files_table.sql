-- Migration number: 0001 	 2024-07-22_12-00-00.sql

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  expires_at INTEGER,
  one_time_view INTEGER DEFAULT 0,
  passphrase_hash TEXT,
  created_at INTEGER NOT NULL
);
