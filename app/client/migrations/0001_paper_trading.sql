CREATE TABLE IF NOT EXISTS paper_accounts (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'paper',
  balance REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_statement_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  amount REAL NOT NULL,
  balance_before REAL NOT NULL,
  balance_after REAL NOT NULL,
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
  entry_price REAL NOT NULL,
  entry_value REAL NOT NULL,
  exit_price REAL,
  exit_value REAL,
  realized_pnl REAL,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (account_id) REFERENCES paper_accounts(id)
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_account_status
  ON paper_trades(account_id, status, opened_at DESC);