-- Consolidated initial schema for algo-trade-paper
-- All monetary values in paise (integer) to avoid float rounding errors

CREATE TABLE IF NOT EXISTS paper_accounts (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'paper',
  balance INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_statement_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  note TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_statement_account_created_at
  ON paper_statement_entries(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  instrument_key TEXT NOT NULL,
  direction TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  entry_price INTEGER NOT NULL,
  entry_value INTEGER NOT NULL,
  exit_price INTEGER,
  exit_value INTEGER,
  realized_pnl INTEGER,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_account_status
  ON paper_trades(account_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS client_state (
  user_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, state_key)
);