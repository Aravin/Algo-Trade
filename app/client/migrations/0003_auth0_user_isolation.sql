-- Migrate client_state table to support user_id partitioning
CREATE TABLE IF NOT EXISTS client_state_new (
  user_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, state_key)
);

-- Drop the old table and rename the new one
DROP TABLE IF EXISTS client_state;
ALTER TABLE client_state_new RENAME TO client_state;
