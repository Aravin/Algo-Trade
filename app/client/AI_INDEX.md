# Fast Lookup Index (AI_INDEX.md) — `app/client`

> **Purpose**: Enables instant, high-speed file and symbol lookup for AI Coding Assistants, Subagents, and Developers working within `app/client`.

---

## 1. Fast Lookup: Features & Modules to File Paths

| Feature / Domain             | Description                                                     | Relative File Path                                                                                                                           |
| :--------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **V5 Strategy Engine**       | Strategy score evaluation, signal calculation, entry/exit rules | [`src/lib/strategyEngine.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/strategyEngine.ts)             |
| **Bot Controller Hook**      | Main real-time trading loop, market data polling, state sync    | [`src/hooks/useStrategyBot.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/hooks/useStrategyBot.ts)         |
| **Worker Router**            | Cloudflare Worker edge router & API route handlers              | [`worker/index.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/index.ts)                                 |
| **Upstox API Proxy**         | Upstox market data, quotes, option chains, news, FII/DII proxy  | [`worker/upstoxProxy.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/upstoxProxy.ts)                     |
| **Paper Trading DB Engine**  | D1 SQLite paper account ledger, trade enter/exit processing     | [`worker/paperTrading.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/paperTrading.ts)                   |
| **Client State Persistence** | D1 `client_state` table reader & writer (worker edge)           | [`worker/clientState.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/clientState.ts)                     |
| **Client State Sync (UI)**   | Storage bridge (Worker API + localStorage sync)                 | [`src/lib/clientState.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/clientState.ts)                   |
| **Technical Indicators**     | EMA, VWAP, Supertrend, RSI, Bollinger Bands calculators         | [`src/lib/indicators.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/indicators.ts)                     |
| **Synthetic Option Chains**  | Option strike selector & synthetic option pricing engine        | [`src/lib/syntheticCalculators.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/syntheticCalculators.ts) |
| **VRD Signals**              | Volatility regimes & directional sentiment signals              | [`src/lib/vrdSignals.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/vrdSignals.ts)                     |
| **Market REST Service**      | Frontend data fetchers for market quotes, candles, option chain | [`src/lib/marketService.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/marketService.ts)               |
| **Global Types**             | TypeScript interfaces for strategy configs, quotes, positions   | [`src/lib/types.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/types.ts)                               |
| **Tick Log Manager**         | Memory-bounded, throttled tick logger                           | [`src/lib/tickLog.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/tickLog.ts)                           |
| **Auth0 JWT Verifier**       | Auth0 token verification logic in Cloudflare Worker             | [`worker/auth.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/auth.ts)                                   |
| **Global Market Scraper**    | Yahoo Finance / Global index scraper in Worker                  | [`worker/globalIndices.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/worker/globalIndices.ts)                 |

---

## 2. Fast Lookup: UI Components Matrix

| Component Name                | Description                                             | Relative File Path                                                                                                                                                                                 |
| :---------------------------- | :------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`BotControls`**             | Bot Start/Stop/Pause buttons & status indicator         | [`src/components/dashboard/strategy/bot-controls.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/bot-controls.tsx)                 |
| **`StrategyConfigComponent`** | Strategy parameters editor & indicators toggle switches | [`src/components/dashboard/strategy/strategy-config.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/strategy-config.tsx)           |
| **`ScorePanel`**              | Real-time sentiment score breakdown matrix              | [`src/components/dashboard/strategy/score-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/score-panel.tsx)                   |
| **`ThresholdOptimizer`**      | Dynamic score threshold backtesting widget              | [`src/components/dashboard/strategy/threshold-optimizer.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/threshold-optimizer.tsx)   |
| **`MarketSetupPanel`**        | Core market price, VWAP, PCR & VIX status panel         | [`src/components/dashboard/strategy/market-setup-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/market-setup-panel.tsx)     |
| **`IndicatorsPanel`**         | Technical indicators breakdown panel                    | [`src/components/dashboard/strategy/indicators-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/indicators-panel.tsx)         |
| **`BreadthPanel`**            | Market advance/decline breadth panel                    | [`src/components/dashboard/strategy/breadth-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/breadth-panel.tsx)               |
| **`GlobalMarketsPanel`**      | S&P500, Nasdaq, Nikkei global markets panel             | [`src/components/dashboard/strategy/global-markets-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/global-markets-panel.tsx) |
| **`NewsAlertsPanel`**         | Real-time market news & economic alerts panel           | [`src/components/dashboard/strategy/news-alerts-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/news-alerts-panel.tsx)       |
| **`LogPanel`**                | Real-time tick & bot decision console log               | [`src/components/dashboard/strategy/log-panel.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/log-panel.tsx)                       |
| **`HardStopBanner`**          | Emergency daily loss / risk hard stop banner            | [`src/components/dashboard/strategy/hard-stop-banner.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/strategy/hard-stop-banner.tsx)         |
| **`ActiveTrades`**            | Live/Paper open positions table & closing triggers      | [`src/components/dashboard/active-trades.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/active-trades.tsx)                                 |
| **`PnlChart`**                | Real-time PnL trajectory chart                          | [`src/components/dashboard/pnl-chart.tsx`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/components/dashboard/pnl-chart.tsx)                                         |

---

## 3. Fast Lookup: Database Migrations & Schemas

| Migration File           | Description                                       | Relative File Path                                                                                                                               |
| :----------------------- | :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_paper_trading.sql` | `paper_accounts` & `paper_trades` SQLite tables   | [`migrations/0001_paper_trading.sql`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/migrations/0001_paper_trading.sql) |
| `0002_client_state.sql`  | `client_state` key-value persistent storage table | [`migrations/0002_client_state.sql`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/migrations/0002_client_state.sql)   |

---

## 4. Fast Lookup: Automated Test Suites

| Test Suite File            | Module Tested                                 | Relative File Path                                                                                                                                                 |
| :------------------------- | :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strategyEngine.test.ts`   | V5 Strategy score matrix & entry signals      | [`src/lib/__tests__/strategyEngine.test.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/__tests__/strategyEngine.test.ts)     |
| `indicators.test.ts`       | EMA, VWAP, Supertrend, RSI, BB formulas       | [`src/lib/__tests__/indicators.test.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/__tests__/indicators.test.ts)             |
| `multiIndex.test.ts`       | Cross-index confirmation logic                | [`src/lib/__tests__/multiIndex.test.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/__tests__/multiIndex.test.ts)             |
| `bollingerSqueeze.test.ts` | Bollinger Band squeeze & volatility expansion | [`src/lib/__tests__/bollingerSqueeze.test.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/__tests__/bollingerSqueeze.test.ts) |
| `tickLog.test.ts`          | Tick log buffer limits & throttler            | [`src/lib/__tests__/tickLog.test.ts`](file:///Users/aravind_appadurai/personal-projects/Algo-Trade/app/client/src/lib/__tests__/tickLog.test.ts)                   |
