# Overall Knowledge Framework (OKF) — `app/client`

> **Document Type**: Centralized Operational & Domain Knowledge Reference
> **Target Audience**: AI Agents, System Architects, Developers

---

## 1. System Specifications & Operational Environment

- **Frontend Runtime**: Browser ESNext environment built with Vite 8 + React 19.
- **Backend Edge Runtime**: Cloudflare Workers with `nodejs_compat` compatibility flag enabled.
- **Database Engine**: Cloudflare D1 SQLite database (`algo-trade-paper`, ID: `5ab4a20e-8317-4c4e-958f-b0a824e9207c`).
- **Package Manager**: Yarn v1 (`yarn@1.22.22`).

---

## 2. Core Domain Schemas & Data Models

### 2.1 Strategy Configuration (`StrategyConfig`)

Defined in `src/lib/types.ts`:

```typescript
export interface StrategyConfig {
  underlyingMode: UnderlyingMode
  multiSymbolExecutionMode?: 'independent' | 'consensus' | 'best_signal'
  strongThreshold: number
  moderateThreshold: number
  strongGap: number
  moderateGap: number
  maxProfitPct: number
  maxLossPct: number
  maxTradesPerDay: number
  lastEntryTime: string
  pollingIntervalSec: number
  minConfidence: 'strong' | 'moderate'
  otmSkip: number
  executionMode: ExecutionMode
  tradeType: 'buying' | 'selling' | 'both'
  brentCrudeExtremeThreshold: number
  brentCrudeOverhangThreshold: number
  exitCooldownSec?: number
}
```

### 2.2 Client State DB Schema (`client_state` table in D1)

Defined in `migrations/0001_initial.sql` and `worker/clientState.ts`:

```sql
CREATE TABLE IF NOT EXISTS client_state (
  user_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, state_key)
);
```

Common `state_key` values:

- `strategyConfig` — Saved user strategy parameters.
- `brokerAccounts` — Saved broker OAuth session metadata.

### 2.3 Paper Trade Record Schema (`paper_trades` table in D1)

Defined in `migrations/0001_initial.sql` and `worker/paperTrading.ts`.
Monetary columns are stored as integer paise:

```sql
CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  instrument_key TEXT NOT NULL,
  direction TEXT NOT NULL,      -- 'CE' or 'PE'
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
```

---

## 3. V5 Strategy Scoring Matrix & Evaluation Logic

The V5 Strategy (`src/lib/strategyEngine.ts`) evaluates a composite score from **0 to 100** for both LONG and SHORT directions based on active indicator signals:

| Factor Module            | Max Contribution | Long Condition                   | Short Condition                     |
| :----------------------- | :--------------: | :------------------------------- | :---------------------------------- |
| **VWAP**                 |     +15 pts      | Price > VWAP & expanding slope   | Price < VWAP & contracting slope    |
| **Supertrend**           |     +15 pts      | Trend is GREEN                   | Trend is RED                        |
| **EMA Crossover**        |     +15 pts      | Fast EMA (9) > Slow EMA (21)     | Fast EMA (9) < Slow EMA (21)        |
| **RSI (14)**             |     +10 pts      | 45 < RSI < 70 (Bullish momentum) | 30 < RSI < 55 (Bearish momentum)    |
| **Bollinger Bands**      |     +10 pts      | Price upper band breakout        | Price lower band breakdown          |
| **PCR (Put-Call Ratio)** |     +10 pts      | PCR > 1.1 (Bullish sentiment)    | PCR < 0.8 (Bearish sentiment)       |
| **Market Breadth**       |     +10 pts      | Advance / Decline ratio > 1.5    | Advance / Decline ratio < 0.67      |
| **India VIX**            |     +10 pts      | VIX within optimal trading band  | VIX expanding/contracting alignment |
| **Institutional Flows**  |      +5 pts      | FII + DII net buyers             | FII + DII net sellers               |

---

## 4. Bot Execution State Machine

```
IDLE --Start--> RUNNING --entry--> ORDERED
  ^                |                  |
  |                +------Stop--------+
  +----------------------- STOPPED <--+
```

1. **IDLE**: Strategy bot is inactive. No market polling or trade evaluation occurs.
2. **RUNNING**: Bot actively polls quotes/intraday candles, computes indicator scores, checks entry/exit criteria, and manages trailing stop losses.
3. **ORDERED**: The loop remains active while one or more positions are open.
4. **STOPPED**: Polling is disabled. Open positions remain represented in state and must not be treated as closed. EOD and hard-stop evaluation are paused, so the persistent strategy header warns the user until supervision is resumed.

The bot hook is mounted in `AppContent`, not in the Strategies page. Live Start
requires an explicit session confirmation. On reload, live mode may resume
supervision of existing positions without enabling new entries. A candle outage
blocks entry evaluation but still permits degraded EOD, hard-stop, and cached
signal exit handling.

Execution lot size and expiry come from the selected Upstox option contract.
Calculated expiry dates and static lot maps are fallbacks only.

Worker request throttling is enforced through the generated
`REQUEST_RATE_LIMITER` Cloudflare binding. It replaces isolate-local counters
and applies a 200-request, 60-second limit per stable actor key and Cloudflare
location.

---

## 5. Worker Endpoint Summary & API Specifications

- **`GET /api/client-state?key=<KEY>`**: Fetches persisted state for Auth0 user ID.
- **`PUT /api/client-state`**: Saves key-value payload `{ key: string, value: any }` to D1.
- **`POST /api/market/quotes`**: Body `{ symbols: string[] }`. Proxies quote requests to Upstox.
- **`POST /api/market/option-chain`**: Body `{ instrumentKey: string, expiryDate: string }`. Fetches option chain.
- **`POST /api/paper/trades/enter`**: Executes paper trade entry and records open trade into `paper_trades` table.
- **`POST /api/paper/trades/exit`**: Closes open trade, computes realized PnL, updates `paper_accounts` balance.

Protected routes require Auth0. Missing `AUTH0_DOMAIN` or `AUTH0_AUDIENCE`
bindings fail closed with `401`; local development must configure them too.

---

## 6. Developer & Maintenance Workflows

### Running Test Suite

```bash
yarn test
```

### Running Type & Syntax Validation

```bash
yarn validate
```

### Applying D1 Database Migrations

```bash
# Local Dev D1
yarn wrangler d1 migrations apply algo-trade-paper --local

# Remote Hosted D1
yarn wrangler d1 migrations apply algo-trade-paper --remote
```
