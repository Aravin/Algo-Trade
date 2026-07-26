-- Migrate client_state table to support user_id partitioning
-- Preserves existing data by copying it under a default user_id

CREATE TABLE IF NOT EXISTS client_state_new (
  user_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, state_key)
);

-- Copy existing data into the new table with a placeholder user_id,
-- so no data is lost during migration
INSERT OR IGNORE INTO client_state_new (user_id, state_key, value_json, updated_at)
  SELECT 'legacy-user', state_key, value_json, updated_at
  FROM client_state;

-- Drop the old table only after data has been copied
DROP TABLE IF EXISTS client_state;

-- Rename the new table to take the place of the old one
ALTER TABLE client_state_new RENAME TO client_state;
