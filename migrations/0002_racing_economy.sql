-- Racing v2 server-side economy: append-only ledger, garage v4, run validation,
-- leaderboard. ADDITIVE ONLY: no existing table or column is altered or dropped,
-- so an old Worker keeps working against a migrated database and a rollback is a
-- code rollback alone.
--
-- NOT APPLIED to the remote database. Apply locally with:
--   npx wrangler d1 migrations apply sat-act-practice-db --local
-- Applying to --remote is a deliberate, separate decision (see the plan's
-- "Deployment steps"), because the first deploy that reads these tables must land
-- after they exist.

-- Garage v4. The server owns `cash` and the owned-item lists inside `data`;
-- `data.prefs` holds last-writer-by-field preferences the client may set freely.
-- `revision` is the optimistic-concurrency guard every economy write takes.
CREATE TABLE IF NOT EXISTS racing_garage (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 4,
  cash INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  handle TEXT,
  -- 0 until the one-time legacy v3 import runs; afterwards the client's own cash
  -- figure is never trusted again.
  legacy_imported INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Leaderboard handles are public, so they must be unique. Partial index: rows
-- without a handle yet do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS racing_garage_handle ON racing_garage(handle) WHERE handle IS NOT NULL;

-- Append-only transaction ledger. (user_id, op_id) is the primary key, which is
-- what makes every economy operation idempotent: replaying an operation id hits
-- the constraint, and the stored `result` is returned again unchanged.
CREATE TABLE IF NOT EXISTS racing_ledger (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  op_id TEXT NOT NULL,
  kind TEXT NOT NULL,              -- purchase | reward | migration | run-debit | convert
  item_id TEXT,
  amount INTEGER NOT NULL,         -- signed: negative debits, positive credits
  balance_after INTEGER NOT NULL,
  result TEXT NOT NULL,            -- the JSON response this operation produced
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, op_id)
);
CREATE INDEX IF NOT EXISTS racing_ledger_user_created ON racing_ledger(user_id, created_at);

-- Short-lived run nonces. A ranked submission must present one, it is bound to
-- the challenge/track/car/physics it was issued for, and it is single-use.
CREATE TABLE IF NOT EXISTS racing_nonces (
  nonce_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_date TEXT NOT NULL,
  track_id TEXT NOT NULL,
  car_id TEXT NOT NULL,
  physics_version INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS racing_nonces_user ON racing_nonces(user_id, created_at);

-- Accepted and flagged runs. Flagged runs are stored (so abuse is auditable) but
-- withheld from every leaderboard query.
CREATE TABLE IF NOT EXISTS racing_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  challenge_date TEXT NOT NULL,
  track_id TEXT NOT NULL,
  car_id TEXT NOT NULL,
  physics_version INTEGER NOT NULL,
  ticks INTEGER NOT NULL,
  score INTEGER NOT NULL,
  distance_m INTEGER NOT NULL DEFAULT 0,
  top_kph INTEGER NOT NULL DEFAULT 0,
  evidence_hash TEXT NOT NULL,
  evidence_bytes INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  flags TEXT NOT NULL DEFAULT '[]'
);
-- Re-submitting byte-identical replay evidence is the cheapest possible cheat.
-- The database refuses it rather than the application remembering to check.
CREATE UNIQUE INDEX IF NOT EXISTS racing_runs_evidence ON racing_runs(user_id, evidence_hash);
CREATE INDEX IF NOT EXISTS racing_runs_board ON racing_runs(challenge_date, track_id, flagged, score DESC);
CREATE INDEX IF NOT EXISTS racing_runs_user ON racing_runs(user_id, created_at DESC);

-- Per-user, per-endpoint fixed-window rate limiting.
CREATE TABLE IF NOT EXISTS racing_rate (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  win INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (user_id, bucket, win)
);
