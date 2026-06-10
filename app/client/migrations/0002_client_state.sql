CREATE TABLE IF NOT EXISTS client_state (
  state_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
