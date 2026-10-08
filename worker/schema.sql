-- Already applied to the sat-act-practice-db database. Kept here to recreate it if needed:
--   npx wrangler d1 execute sat-act-practice-db --remote --file=worker/schema.sql
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at INTEGER NOT NULL, failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS resets_user ON password_resets(user_id, created_at);

CREATE TABLE IF NOT EXISTS ai_usage (ip TEXT NOT NULL, win INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, win));

CREATE TABLE IF NOT EXISTS help_history (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  question_id TEXT,
  question_version TEXT,
  question_snapshot TEXT,
  test_type TEXT,
  section TEXT,
  domain TEXT,
  skill TEXT,
  attempt_id TEXT,
  category TEXT NOT NULL,
  request_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  usage_json TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS help_history_user_created ON help_history(user_id, created_at DESC);

-- Additive migration: preserves existing users, progress, games and tutor data.
CREATE TABLE IF NOT EXISTS analytics_events (
  project TEXT NOT NULL,
  id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  properties TEXT NOT NULL,
  PRIMARY KEY (project, id)
);
CREATE INDEX IF NOT EXISTS analytics_project_received ON analytics_events(project, received_at);
CREATE INDEX IF NOT EXISTS analytics_received ON analytics_events(received_at);

CREATE TABLE IF NOT EXISTS analytics_budget (
  project TEXT NOT NULL,
  day TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (project, day)
);
CREATE INDEX IF NOT EXISTS analytics_budget_day ON analytics_budget(day);
