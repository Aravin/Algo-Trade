/// <reference types="@cloudflare/workers-types" />

export interface PaperTradeEnv {
  PAPER_TRADING_DB: D1Database
  AUTH0_DOMAIN?: string
  AUTH0_AUDIENCE?: string
}

export type Env = PaperTradeEnv

export interface PaperAccountRow {
  id: string
  mode: string
  balance: number
  currency: string
  updated_at: string
}

export interface PaperStatementRow {
  id: string
  entry_type: string
  amount: number
  balance_before: number
  balance_after: number
  note: string | null
  metadata_json: string | null
  created_at: string
}

export interface PaperTradeRow {
  id: string
  account_id: string
  status: string
  instrument_key: string
  direction: string
  quantity: number
  entry_price: number
  entry_value: number
  exit_price: number | null
  exit_value: number | null
  realized_pnl: number | null
  opened_at: string
  closed_at: string | null
  metadata_json: string | null
}

export interface UpstoxTokenRequest {
  code: string
  apiKey: string
  apiSecret: string
  redirectUri: string
}
