# Strategy Page — Build Plan & V3 vs V4 Analysis

## Table of Contents
1. [V3 vs V4 — Pros & Cons](#v3-vs-v4--pros--cons)
2. [Decision: Combined Approach](#decision-combined-approach)
3. [Build Plan](#build-plan)
4. [File Map](#file-map)
5. [Verification Checklist](#verification-checklist)

---

## V3 vs V4 — Pros & Cons

### V3 — Macro Sentiment Strategy

> **Logic:** Scrape global indices (MoneyControl) + Nifty AD ratio (NiftyTrader) + PCR (NiftyTrader) → map to buy/sell/hold

| # | Pro | Detail |
|---|-----|--------|
| 1 | **No broker token needed for signal** | Global & Nifty sentiment comes from free public APIs. Works even without an Upstox connection. |
| 2 | **Low noise** | Uses aggregated data (50 stocks, 8 global indices) so it ignores minute-level noise. |
| 3 | **Macro-aligned** | Captures international market context — pre-market global mood correctly sets the direction for Nifty. |
| 4 | **PCR as crowd-sentiment filter** | OI-based PCR effectively shows whether the crowd is buying puts or calls — good contra-indicator at extremes. |
| 5 | **Already battle-tested** | The mapping tables (`globalNiftyMapping`, `marketStrategyMapping`) exist in `app/core/` and have been iterated over multiple versions. |
| 6 | **Simple to reason about** | The decision tree is human-readable. Easy to audit and explain why a trade was/wasn't taken. |

| # | Con | Detail |
|---|-----|--------|
| 1 | **Coarse resolution** | AD ratio and global indices update slowly (minutes to hours). Can miss intraday momentum shifts. |
| 2 | **External scraping dependency** | Relies on MoneyControl and NiftyTrader APIs that have no official SLA — can break without notice. |
| 3 | **No price-action confirmation** | A bullish global + bullish Nifty AD reading can still be wrong if the actual Nifty price is in a bearish intraday trend. |
| 4 | **PCR source mismatch** | V3 PCR comes from `niftytrader.in`, not from Upstox option chain. Can differ from actual OI at current broker. |
| 5 | **Binary global sentiment** | Only 3 levels (bullish/bearish/neutral) lose granularity — a SGX Nifty slightly positive day maps the same as a DOW +2% day. |
| 6 | **No volatility filter** | No ATR or VIX gate — it can signal a trade on a low-volatility day where spreads make options expensive relative to expected move. |

---

### V4 — Technical Indicator Strategy

> **Logic:** Fetch Nifty 1-min OHLC candles (Upstox) + option chain → calculate EMA crossover, ADX, RSI, Stochastic, Bollinger Bands, ATR, PCR → all must align for entry

| # | Pro | Detail |
|---|-----|--------|
| 1 | **Price-action grounded** | Every signal is computed from actual Nifty price data — reflects real-time market movement. |
| 2 | **Multi-indicator confirmation** | Requires EMA + ADX + PCR + Bollinger to agree before entry — high specificity, fewer false signals. |
| 3 | **Built-in volatility gate** | ATR level is calculated; low-volatility days naturally reduce signal convergence. |
| 4 | **Precise exit conditions** | Exit triggers when any reversal indicator fires — much tighter than V3's sentiment-flip approach. |
| 5 | **OI-based PCR from live option chain** | Uses actual Upstox option chain OI, not a third-party scrape — more accurate to broker reality. |
| 6 | **RSI & Stochastic guard overbought/oversold** | Prevents chasing entries at price extremes — important for options where premium decay accelerates. |
| 7 | **Scalable to other indices** | The indicator functions are pure and symbol-agnostic — can run on BankNifty, MidCap etc. with one param change. |

| # | Con | Detail |
|---|-----|--------|
| 1 | **Requires valid Upstox token** | Intraday candles and option chain both need a market-data or trading access token. No token = no signal. |
| 2 | **All-or-nothing entry condition** | Requiring all 4 indicators to agree means very few entry signals per day. Can sit idle for hours. |
| 3 | **No macro context** | A perfectly aligned V4 Buy signal during a global market crash still places a CE buy — no global filter. |
| 4 | **1-min candle lag** | Indicator values are computed on the last completed candle, not tick data. Signals can lag real-time price by up to 60s. |
| 5 | **Bollinger Band logic is inverted** | Current implementation in `bollinger-bands.ts` signals Buy when price is *above* upper band (breakout) — for options, this is debatable vs mean-reversion logic. Needs review. |
| 6 | **ADX +DI/-DI interpretation** | In `average-direction-index.ts`, a strong uptrend (`+DI > -DI`) returns `Signal.Sell` — this is counter-intuitive and was likely written for directional index puts. Must be verified against actual trade intent. |
| 7 | **No news/event guard** | Budget days, Fed announcements, RBI meetings — no mechanism to pause during scheduled high-volatility events. |

---

## Decision: Combined Approach

Run **both in parallel**. Use agreement as a confidence multiplier, disagreement as a no-trade gate.

```
Combined Signal Logic
─────────────────────────────────────────────────
V3 signal   V4 signal   → Result          Confidence
─────────────────────────────────────────────────
buy         Buy         → BUY CE          strong
sell        Sell        → BUY PE          strong
buy         Hold        → BUY CE          moderate
sell        Hold        → BUY PE          moderate
hold        Buy/Sell    → HOLD            weak (skip)
buy         Sell        → NO TRADE        none
sell        Buy         → NO TRADE        none
hold        Hold        → NO TRADE        none
─────────────────────────────────────────────────
```

**Trade only on `strong` or `moderate` confidence.**  
Configurable: user can restrict to `strong` only via `StrategyConfig`.

### Benefits of combining
- V3 provides macro direction; V4 confirms with price-action
- V3 prevents V4 from trading CE during a global bearish day
- V4 prevents V3 from entering when Nifty intraday momentum is flat (Hold)
- Disagreement (buy vs Sell) = market is split = safest to sit out

---

## Build Plan

### Phase 1 — Worker Routes
**File:** `app/client/worker/index.ts`  
Add 6 new handlers:

| Route | Method | Handler | Source API |
|-------|--------|---------|-----------|
| `/api/market/candles/intraday` | POST | `handleIntradayCandles` | Upstox `GET /v2/historical-candle/intraday/{key}/{interval}` |
| `/api/market/option-chain` | POST | `handleOptionChain` | Upstox `GET /v3/option/chain?instrument_key=...&expiry_date=...` |
| `/api/order/place` | POST | `handlePlaceOrder` | Upstox `POST /v2/order/place` (MARKET, product I, DAY) |
| `/api/order/list` | POST | `handleOrderList` | Upstox `GET /v2/order/details` |
| `/api/market/global-sentiment` | GET | `handleGlobalSentiment` | MoneyControl priceapi |
| `/api/market/nifty-sentiment` | GET | `handleNiftySentiment` | NiftyTrader nifty50-data |

Reference files: `testapp/src/upstox/controllers/`, `app/core/src/cron.ts`

---

### Phase 2 — Client Libraries
**Parallel with Phase 1**

#### `app/client/src/lib/indicators.ts` (NEW)
Port pure functions from `testapp/src/upstox/lib/`. Input: `Candle[]` = `[timestamp, open, high, low, close, volume]`.

| Function | Source file | Output |
|----------|-------------|--------|
| `calcEMACrossover(candles, fast=42, slow=10)` | `moving-average.ts` | `'Buy'│'Sell'│'Hold'` |
| `calcADX(candles, period=14)` | `average-direction-index.ts` | `'Buy'│'Sell'│'Hold'` |
| `calcRSI(candles, period=14)` | `rsi.ts` | `{ value: number, signal: 'Overbought'│'Oversold'│'Hold' }` |
| `calcStochastic(candles, period=14, smoothing=3)` | `stochastic-oscillator.ts` | `{ k, d, signal }` |
| `calcBollingerBands(candles, period=20)` | `bollinger-bands.ts` | `{ upper, middle, lower, signal, trend }` |
| `calcATR(candles, period=14)` | `average-true-range.ts` | `{ value, level: 'High'│'Low'│'Neutral' }` |
| `calcOiPCR(optionChain)` | `put-call-ratio.ts` | `'Buy'│'Sell'│'Hold'` |
| `getNextThursday()` | `calculations/next-thursday.ts` | `string` (YYYY-MM-DD) |
| `getOtmStrike(optionChain, signal, skip=3)` | `calculations/get-otm-details.ts` | `OptionData` |

> **Note:** Review ADX signal polarity (see V4 Con #6 above) before use in production.

#### `app/client/src/lib/v3Sentiment.ts` (NEW)
Port from `app/core/src/cron.ts` + `app/core/src/shared/getMarketSentiment.ts`

| Function | Output |
|----------|--------|
| `evaluateGlobalSentiment(mcData)` | `'bullish'│'bearish'│'neutral'` |
| `evaluateNiftySentiment(niftyData)` | `'very bullish'│'bullish'│'neutral'│'bearish'│'very bearish'` |
| `evaluatePCR(pcr: number)` | `'buy'│'sell'│'neutral'│'overbought'│'oversold'` |
| `getV3Signal(global, nifty, pcr)` | `'buy'│'sell'│'hold'` |

Includes full `globalNiftyMapping` and `marketStrategyMapping` tables.

#### `app/client/src/lib/strategyEngine.ts` (NEW)
| Function | Logic source | Output |
|----------|-------------|--------|
| `getV4Signal(indicators)` | `event.ts executeTradeLogic()` | `'Buy'│'Sell'│'Hold'` |
| `shouldExit(entrySignal, currentIndicators)` | `event.ts service_entered handler` | `boolean` |
| `getCombinedSignal(v3, v4)` | Combined table above | `{ signal, confidence }` |

#### `app/client/src/lib/strategyConfig.ts` (NEW)
```ts
interface StrategyConfig {
  otmSkip: number            // default 3
  maxProfitPct: number       // default 10
  maxLossPct: number         // default 5
  maxTradesPerDay: number    // default 3
  pollingIntervalSec: number // default 60
  minConfidence: 'strong' | 'moderate' // default 'moderate'
}
```
Backed by `localStorage` key `algo-trade:strategy-config`.

---

### Phase 3 — Bot State Hook
**File:** `app/client/src/hooks/useStrategyBot.ts` (NEW)

State machine:
```
IDLE → (start) → RUNNING → (signal + confirmation) → ORDERED → (exit trigger) → RUNNING
                                                                               ↘ (max trades) → STOPPED
```

Each tick (default 60s):
1. `POST /api/market/candles/intraday` → `calcEMA`, `calcADX`, `calcRSI`, `calcStochastic`, `calcBollingerBands`, `calcATR`
2. `POST /api/market/option-chain` → `calcOiPCR`
3. `GET /api/market/global-sentiment` + `GET /api/market/nifty-sentiment` → `getV3Signal`
4. `getCombinedSignal(v3, v4)` → decide entry/exit
5. If RUNNING + signal → `POST /api/order/place` → ORDERED
6. If ORDERED → `shouldExit()` → `POST /api/order/place` (exit) → RUNNING / STOPPED

Exposes: `{ state, position, lastSignals, indicators, start, stop, error }`

Position persisted to `localStorage` key `algo-trade:bot-state`.

---

### Phase 4 — UI Components
**Folder:** `app/client/src/components/dashboard/strategy/`

| Component | What it shows |
|-----------|--------------|
| `market-sentiment-panel.tsx` | Global / Nifty / PCR badges + last-refreshed + manual Refresh |
| `indicators-panel.tsx` | 6 indicator cards (EMA, ADX, RSI, Stochastic, BB, ATR), color coded |
| `signal-panel.tsx` | V3 badge + V4 badge + combined signal prominently + confidence level |
| `bot-controls.tsx` | State dot, Start/Stop, active position card with unrealised P&L, next-tick countdown |
| `strategy-config.tsx` | Config form (OTM skip, profit %, loss %, max trades, interval, min confidence) |

**Page layout** `app/client/src/pages/strategies.tsx`:
```
┌─────────────────────────────────────┐
│  Market Sentiment Panel (V3)        │
├─────────────────────────────────────┤
│  Indicators Panel (V4)              │
├───────────────────┬─────────────────┤
│  Signal Panel     │  Bot Controls   │
│  (col-span 2)     │  (col-span 1)   │
├─────────────────────────────────────┤
│  Strategy Config                    │
└─────────────────────────────────────┘
```

---

### Phase 5 — Wiring
**File:** `app/client/src/App.tsx`
- Replace `case 'strategies': return <Placeholder title="Strategies" />` with `return <StrategiesPage />`

---

## File Map

### Reference (port logic from — do not modify)
| File | What to port |
|------|-------------|
| `testapp/src/upstox/event.ts` | `calculateSignals()`, `executeTradeLogic()`, exit conditions |
| `testapp/src/upstox/lib/moving-average.ts` | EMA |
| `testapp/src/upstox/lib/average-direction-index.ts` | ADX |
| `testapp/src/upstox/lib/rsi.ts` | RSI |
| `testapp/src/upstox/lib/stochastic-oscillator.ts` | Stochastic |
| `testapp/src/upstox/lib/bollinger-bands.ts` | Bollinger Bands |
| `testapp/src/upstox/lib/average-true-range.ts` | ATR |
| `testapp/src/upstox/lib/put-call-ratio.ts` | OI PCR |
| `testapp/src/upstox/lib/calculations/get-otm-details.ts` | OTM strike picker |
| `testapp/src/upstox/lib/calculations/next-thursday.ts` | Expiry date |
| `testapp/src/upstox/controllers/intraday-data.ts` | Upstox intraday URL pattern |
| `testapp/src/upstox/controllers/option-chain.ts` | Upstox option chain URL pattern |
| `testapp/src/upstox/controllers/order.ts` | Upstox order placement payload |
| `app/core/src/cron.ts` | V3 data fetch + evaluation |
| `app/core/src/shared/getMarketSentiment.ts` | globalNiftyMapping, marketStrategyMapping |

### Modify
| File | Change |
|------|--------|
| `app/client/worker/index.ts` | Add 6 route handlers |
| `app/client/src/App.tsx` | Wire StrategiesPage |

### Create (new files)
- `app/client/src/lib/indicators.ts`
- `app/client/src/lib/v3Sentiment.ts`
- `app/client/src/lib/strategyEngine.ts`
- `app/client/src/lib/strategyConfig.ts`
- `app/client/src/hooks/useStrategyBot.ts`
- `app/client/src/pages/strategies.tsx`
- `app/client/src/components/dashboard/strategy/market-sentiment-panel.tsx`
- `app/client/src/components/dashboard/strategy/indicators-panel.tsx`
- `app/client/src/components/dashboard/strategy/signal-panel.tsx`
- `app/client/src/components/dashboard/strategy/bot-controls.tsx`
- `app/client/src/components/dashboard/strategy/strategy-config.tsx`

---

## Verification Checklist

- [ ] `GET /api/market/global-sentiment` returns MoneyControl data without a token
- [ ] `GET /api/market/nifty-sentiment` returns NiftyTrader nifty50 data
- [ ] `POST /api/market/candles/intraday` with valid Upstox token returns candle array `[timestamp, o, h, l, c, v][]`
- [ ] `POST /api/market/option-chain` with valid token + expiry date returns OI-populated chain
- [ ] `calcRSI` on mock candles from `testapp/src/upstox/mocks/intraday.mock.ts` returns expected value
- [ ] `getCombinedSignal('buy', 'Buy')` → `{ signal: 'BUY_CE', confidence: 'strong' }`
- [ ] `getCombinedSignal('buy', 'Sell')` → `{ signal: 'NO_TRADE', confidence: 'none' }`
- [ ] Bot starts → polling fires every N seconds, signals populate in UI
- [ ] RUNNING + strong BUY_CE → `/api/order/place` called with correct `instrumentKey`, state moves to ORDERED
- [ ] ORDERED + exit condition met → exit order placed, state returns to RUNNING
- [ ] Max trades reached → state moves to STOPPED, Start button disabled for the day

---

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Bot runtime | Browser (tab open) | No server infra needed. Future: Cloudflare Scheduled Worker. |
| Candle source | Upstox `/v2/historical-candle/intraday` | Best data quality; requires market-data token |
| Trend indicator | EMA crossover + ADX (not MACD) | MACD not in V4 lib; EMA + ADX covers same trend + strength |
| Entry condition | All 4 indicators agree | Reduces false signals; trades are rare but higher confidence |
| OTM skip | 3 legs (configurable) | Balances premium vs risk; based on V4 original `getOtmDetails()` |
| Order type | MARKET, product I, validity DAY | Guarantees fill; no limit order management needed |
| Min confidence | `moderate` by default | Allows single-indicator confirmation; restrict to `strong` in config |

## Exclusions (out of scope for now)
- Cloudflare Scheduled Workers
- Multi-account parallel trading
- Backtesting / paper trading mode
- MACD histogram
- VIX filter
- Fibonacci retracement stop-loss
