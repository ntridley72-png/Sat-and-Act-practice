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
