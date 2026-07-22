# Overall Knowledge Framework (OKF) — `app/client`

> **Document Type**: Centralized Operational & Domain Knowledge Reference
> **Target Audience**: AI Agents, System Architects, Developers

---

## 1. System Specifications & Operational Environment

- **Frontend Runtime**: Browser ESNext environment built with Vite 8 + React 19.
- **Backend Edge Runtime**: Cloudflare Workers with `nodejs_compat` compatibility flag enabled.
- **Database Engine**: Cloudflare D1 SQLite database (`algo-trade-paper`, ID: `dc8d72f3-11ee-4ff9-8f24-3c9b5f3b5c33`).
- **Package Manager**: Yarn v1 (`yarn@1.22.22`).

---

## 2. Core Domain Schemas & Data Models

### 2.1 Strategy Configuration (`StrategyConfig`)

Defined in `src/lib/types.ts`:

```typescript
export interface StrategyConfig {
  id: string
  name: string
  symbol: string // e.g. "NSE_INDEX|Nifty 50", "NSE_INDEX|Nifty Bank"
  tradeType: 'LONG' | 'SHORT' | 'BOTH'
  maxLossPerDay: number // Emergency Hard Stop limit in INR
  targetProfitPerDay: number // Daily profit target in INR
  orderQuantity: number // Fixed lot or quantity
  timeframe: string // e.g. "1m", "5m", "15m"

  // Indicator Weights & Thresholds
  minScoreToTrade: number // e.g. 65 (out of 100)
  trailingSlPct: number // Trailing stop loss percentage
  targetPct: number // Fixed profit target percentage
  stopLossPct: number // Fixed stop loss percentage

  // Strategy Modules Enable Switches
  useVwap: boolean
  useSupertrend: boolean
  useEmaCrossover: boolean
  useRsi: boolean
  useBollingerBands: boolean
  usePcr: boolean
  useMarketBreadth: boolean
  useVix: boolean
  useInstitutionalFlows: boolean
}
```

### 2.2 Client State DB Schema (`client_state` table in D1)

Defined in `migrations/0002_client_state.sql` and `worker/clientState.ts`:

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

- `strategy_config` — Saved user strategy parameters.
- `broker_accounts` — Saved broker OAuth session metadata.
- `active_strategy_ids` — List of currently running strategy IDs.

### 2.3 Paper Trade Record Schema (`paper_trades` table in D1)

Defined in `migrations/0001_paper_trading.sql` and `worker/paperTrading.ts`:

```sql
CREATE TABLE IF NOT EXISTS paper_trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  instrument_token TEXT NOT NULL,
  side TEXT NOT NULL,          -- 'BUY' or 'SELL'
  quantity INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  status TEXT NOT NULL,         -- 'OPEN', 'CLOSED', 'CANCELLED'
  pnl REAL,
  entry_time TEXT NOT NULL,
  exit_time TEXT,
  exit_reason TEXT              -- 'TARGET', 'STOP_LOSS', 'TRAILING_SL', 'HARD_STOP', 'MANUAL'
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
               ┌──────────┐
               │   IDLE   │
               └────┬─────┘
                    │ User clicks "Start Bot"
                    ▼
               ┌──────────┐
               │ RUNNING  │◄───────┐
               └────┬─────┘        │ User clicks "Resume"
                    │              │
      User clicks   ├──────────────┼──────────────┐
       "Pause"      │              │              │ Daily loss >= maxLossPerDay
                    ▼              │              ▼
               ┌──────────┐        │        ┌──────────┐
               │  PAUSED  ├────────┘        │ HARD_STOP│
               └──────────┘                 └──────────┘
```

1. **IDLE**: Strategy bot is inactive. No market polling or trade evaluation occurs.
2. **RUNNING**: Bot actively polls quotes/intraday candles, computes indicator scores, checks entry/exit criteria, and manages trailing stop losses.
3. **PAUSED**: Bot halts order placement but maintains position tracking.
4. **HARD_STOP**: Bot triggers daily max loss or hard stop condition. Orders are cancelled, open positions liquidated, and execution locked.

---

## 5. Worker Endpoint Summary & API Specifications

- **`GET /api/client-state?key=<KEY>`**: Fetches persisted state for Auth0 user ID.
- **`PUT /api/client-state`**: Saves key-value payload `{ key: string, value: any }` to D1.
- **`POST /api/market/quotes`**: Body `{ symbols: string[] }`. Proxies quote requests to Upstox.
- **`POST /api/market/option-chain`**: Body `{ instrumentKey: string, expiryDate: string }`. Fetches option chain.
- **`POST /api/paper/trades/enter`**: Executes paper trade entry and records open trade into `paper_trades` table.
- **`POST /api/paper/trades/exit`**: Closes open trade, computes realized PnL, updates `paper_accounts` balance.

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
