# Technical & Architectural Review — `app/client`

## 1. Executive Summary

`app/client` is a serverless, web-based algorithmic trading workstation for Indian equity and derivatives markets (NIFTY / BANKNIFTY). It pairs a **React 19 single-page application** running in the user's browser with a **Cloudflare Worker edge API proxy** and a **Cloudflare D1 (SQLite)** persistence engine (`algo-trade-paper`).

This review evaluates the client architecture, worker edge proxy, V5 strategy calculation engine, state synchronization, risk safeguards, performance, and test coverage.

---

## 2. Architecture & Design Evaluation

### 2.1 UI / Worker Separation of Concerns

- **UI Responsibilities (`src/`)**: Real-time tick ingestion, indicator calculation, strategy score evaluation, chart rendering, order trigger dispatching, and paper trading state rendering. `useStrategyBot` is owned by `AppContent`, above page switching, so navigation does not unmount position supervision.
- **Worker Edge Responsibilities (`worker/`)**: Forwarding REST requests to Upstox API v2/v3 without exposing raw broker tokens to frontend code unnecessarily, verifying Auth0 tokens, processing paper trade execution and history in D1 SQLite, and maintaining key-value `client_state` persistence.

```
┌─────────────────────────────────────────────────────────┐
│                     Browser UI                          │
│  [useStrategyBot] ──► [strategyEngine.ts] ──► [Score]   │
└────────────────────────────┬────────────────────────────┘
                             │ REST / Auth0 Bearer
                             ▼
┌─────────────────────────────────────────────────────────┐
│                 Cloudflare Worker Edge                  │
│  [/api/broker/*]   [/api/market/*]    [/api/paper/*]    │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
                 ┌───────────────────────┐
                 │ Cloudflare D1 SQLite  │
                 │  (client_state, trades│
                 └───────────────────────┘
```

---

## 3. Core Subsystems Review

### 3.1 State Synchronization & Dual Persistence (`clientState.ts` & `accounts.ts`)

- **Strengths**:
  - Dual-layer fallback mechanism: strategy configurations and broker accounts write to Worker D1 via `/api/client-state` and update `localStorage` as a fast local fallback.
  - Allows seamless survival of browser cache resets and cross-device configuration retrieval when logged in.
- **Areas for Vigilance**:
  - `localStorage` must be updated atomically alongside API puts to avoid state skew if network drops occur.

### 3.2 V5 Strategy & Risk Safeguards (`src/lib/strategyEngine.ts` & `useStrategyBot.ts`)

- **Scoring Engine**: Multi-factor scoring system weighing VWAP distance, Supertrend direction, EMA 9/21 alignment, RSI 14 oversold/overbought thresholds, Bollinger Band squeeze/breakout, Put-Call Ratio (PCR), Market Breadth (Advance/Decline), India VIX levels, and FII/DII net institutional flows.
- **Risk Management Controls**:
  - **Trailing Stop Loss**: Dynamically adjusts exit triggers based on peak favorable price.
  - **Hard Stop Banner (`hard-stop-banner.tsx`)**: Prominent risk-state display. A BOTH-direction hard stop blocks entries and drives active-position exit handling.
  - **Paper Trading Execution (`paperTrading.ts`)**: Simulates order placement with realistic slippage, fee deductions, and margin checks against D1 database records.
  - **Live Arming**: Every live Start requires an explicit session confirmation. Persisted live state can resume supervision only when an open position exists; it cannot auto-arm new entries.
  - **Stop Semantics**: Stop aborts the current request chain and preserves open positions rather than representing them as closed. Because manual Stop also pauses EOD and hard-stop evaluation, the strategy header keeps an explicit supervision-paused warning visible until Resume.
  - **Degraded Supervision**: Candle failure blocks entries but does not bypass EOD, hard-stop, or cached-signal exit checks for open positions.
  - **Exchange Contract Metadata**: Execution quantity uses `lot_size` from the selected Upstox option contract. Static values are current fallbacks only.

### 3.3 Worker Proxy & API Handling (`worker/upstoxProxy.ts` & `worker/index.ts`)

- **Public vs Authenticated Routes**:
  - Market data endpoints (`/api/market/*`) and OAuth token exchange (`/api/broker/upstox/token`) are public proxy routes to allow frictionless market scanning and OAuth callback handoffs.
  - Paper trading (`/api/paper/*`), client state (`/api/client-state`), and live order execution (`/api/order/place`) strictly enforce Auth0 JWT validation via `verifyAuth0Token()`.
  - Auth0 configuration is fail-closed: missing domain or audience bindings reject protected requests instead of assigning a development user.
  - Worker bindings and runtime types are generated into `worker-configuration.d.ts` from `wrangler.jsonc`.
  - Request throttling uses Cloudflare's native per-location rate-limit binding, avoiding isolate-local mutable maps and full-map cleanup work.

---

## 4. Performance & Reliability Assessment

- **Tick Log Memory Management (`src/lib/tickLog.ts`)**: Implements a bounded tick log queue to prevent DOM bloat and excessive re-renders during high-frequency volatility spikes.
- **Chart Data Sampling (`pnl-chart.tsx`, `simple-chart-widget.tsx`)**: Recharts series are bounded to prevent SVG rendering bottlenecks on mobile and lower-power desktop browsers.

---

## 5. Test Suite & Verification Matrix

`app/client` features an automated Vitest unit testing suite inside `src/lib/__tests__/`:

- `strategyEngine.test.ts` — Tests V5 signal generation, long/short scoring, and entry condition thresholds.
- `indicators.test.ts` — Verifies mathematical accuracy for EMA, VWAP, RSI, Supertrend, and Bollinger Bands.
- `multiIndex.test.ts` — Tests cross-index signal aggregation and multi-timeframe confirmation logic.
- `useStrategyBot.test.ts` — Tests live arming, persisted-live behavior, stop cancellation, and position retention.
- `useTradeExecution.test.ts` — Tests EOD exit behavior and explicit paper-trade reconciliation codes.
- `workerAuth.test.ts` — Tests fail-closed Worker authentication configuration.
- `bollingerSqueeze.test.ts` — Tests Bollinger Band bandwidth compression and volatility expansion triggers.
- `tickLog.test.ts` — Validates tick logging buffer limits and throttle timers.

---

## 6. Recommendations & Best Practices for Developers/AI

1. **Always run `yarn validate`** before committing PRs to ensure linting, formatting, typechecking, and unit tests pass cleanly; run `yarn build` for a production bundle check.
2. **Do not mutate private broker state directly**; always route state updates through `src/lib/clientState.ts` or `src/lib/accounts.ts`.
3. **Preserve paper trading isolation**: Ensure test orders never hit live Upstox endpoints unless explicitly configured in live mode.
4. **Regenerate Worker types** with `yarn cf-typegen` after changing bindings or the compatibility date.
