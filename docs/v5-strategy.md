# V5 Strategy — Nifty Options Automation

V5 is a fully browser-based automated trading system for Nifty weekly options. It combines three signal layers — macro sentiment (V3), technical indicators (V4), and institutional data (VRD Nation) — into a unified 5-layer scoring engine that places and exits orders via Upstox with no human intervention.

---

## Architecture

```
Browser Tab (React + Vite)
│
├─ useStrategyBot.ts          ← State machine, 60s polling loop
│   ├─ fetchMarket()          ← Candles + Option Chain + V3 signals
│   └─ fetchVrd()             ← 8 VRD Nation data points
│
├─ strategyEngine.ts          ← 5-layer scoring → FinalSignal
│   ├─ scoreBullish()         ← BUY CE score (max ~26 pts)
│   └─ scoreBearish()         ← BUY PE score (mirror)
│
├─ Cloudflare Worker          ← CORS proxy for all external APIs
│   ├─ Upstox API             ← Candles, option chain, place/exit orders
│   ├─ MoneyControl API       ← Global indices technical ratings
│   ├─ NiftyTrader API        ← Nifty50 A/D data
│   └─ VRD Nation (scrape)    ← 8 pages of institutional data
│
└─ UI (strategies page)
    ├─ MarketSetupPanel        ← VIX, FII %, Nifty PE, MMI
    ├─ InstitutionalPanel      ← MMI gauge, FII scores
    ├─ BreadthPanel            ← A/D ratio, PCR zone, Straddle IV
    ├─ IndicatorsPanel         ← 6 V4 indicator cards
    ├─ ScorePanel              ← Bull/bear score bars + final signal
    ├─ BotControls             ← Start/Stop, position card, countdown
    └─ StrategyConfig          ← Config form with localStorage
```

---

## Signal Layers

### Layer 0 — Hard Stops (blocks trading entirely)
| Condition | Reason |
|-----------|--------|
| VIX > 25 | Extreme volatility, options too expensive |
| VIX < 10 | No volatility, options have no premium |

> **Note:** Nifty PE is a synthetic proxy (computed from indicators, not real NSE PE) and now penalises the score via `scoreNiftyPE()` instead of triggering a hard block.

### Layer 1 — V3 Macro Sentiment (4 pts)
Combines three free data sources into a single `buy / sell / hold` signal:
- **Global indices** (MoneyControl): technical ratings for Dow, Nikkei, Hang Seng, Shanghai, FTSE, KOSPI, CAC, SGX Nifty, Brent, USD/INR — scores ≤ −8 = contrarian bullish, ≥ 8 = bearish
- **Nifty A/D** (NiftyTrader): advance count ≥ 39 = very bullish … < 13 = very bearish
- **PCR zone** (NiftyTrader): PCR > 1.0 and < 1.6 = buy, ≥ 1.6 = overbought, < 0.7 = sell

### Layer 2 — V4 Technical Indicators (8 pts composite)
All computed from **1-minute Upstox intraday candles** (oldest-first, `slice(-period)` for recency):

| Indicator | Parameters | Bullish Condition | Score |
|-----------|-----------|-------------------|-------|
| EMA Crossover | fast=10, slow=42 | EMA10 > EMA42 | 3 pts |
| ADX | period=14 | +DI > −DI and ADX > 25 | (composite) |
| RSI | period=14 | 30–50 zone (recovering) | 2 pts |
| Stochastic | K=14, smooth=3 | K/D < 20, crossing up | (composite) |
| Bollinger Bands | period=20 | Price above upper band (breakout) | (composite) |
| ATR | period=14 | Normal/High level | −2 pts if Low |
| OI PCR | option chain | PCR ≥ 1.0 = buy, ≤ 0.7 = sell | via V3 |

**Composite V4 signal** (used in scoring):
- All 4 main indicators agree → `Buy` or `Sell`
- 3 of 4 agree → relaxed `Buy` or `Sell`
- Otherwise → `Hold`

### Layer 3 — Institutional Sentiment (Upstox + Synthetic)
All institutional signals are sourced from the **Upstox API** directly or computed
synthetically from live candle/option-chain data. VRD Nation scraping has been retired.

| Signal | Source | Scoring |
|--------|--------|---------|
| **MMI** (Market Mood Index) | Synthetic: VIX×0.4 + RSI×0.3 + PCR×0.3 | Extreme Fear < 30 → contrarian +3; Extreme Greed > 70 → −3 |
| **A/D Ratio** | Upstox breadth API | Breadth thrust ≥ 2.0 → +3; Weakness < 0.5 → −3 |
| **FII Long/Short %** | Upstox FII futures data | Short ≥ 80% → contrarian bull +3; Short 60–79% → momentum bear +2 |
| **FII Net Positioning** | Upstox FII futures data | Net long > +50k → +1 bull; Net short < −50k → +1 bear; ≥15 consecutive short days → +1 bull |
| **Nifty PE** | Synthetic: RSI/BB/VIX/A-D/PCR composite | < 18 undervalued → +2 CE bias; > 28 overvalued → −2 CE penalty (scoring only, not hard stop) |
| **Straddle IV** | Upstox option chain ATM Greeks vs VIX | > 30% above VIX avg → prefer sell (−1); below avg → buy cheap (+1) |
| **VIX** | Upstox market data | > 25 or < 10 → hard stop; ≥ 18 → prefer sell |

### Layer 4 — Confluence Gate
Final signal only fires when:
- Score gap between bull and bear ≥ 3 (moderate) or ≥ 6 (strong)
- Minimum score ≥ configurable thresholds (default: strong=16, moderate=10)
- Before `lastEntryTime` (default 14:30 IST)
- Trades today < `maxTradesPerDay` (default 3)

---

## Scoring Table (max ~26 pts per direction)

| Layer | Indicator | Max pts (bullish) | Max pts (bearish) |
|-------|-----------|:-----------------:|:-----------------:|
| V3 | Macro sentiment | 4 | 4 |
| V4 | Price action composite | 5 | 5 |
| V4 | EMA Crossover | 3 | 3 |
| V4 | RSI | 2 | 2 |
| L2 | MMI | 3 | 3 |
| L3 | A/D Ratio | 3 | 3 |
| L2 | FII Long/Short | 3 (contrarian) | 2 (momentum) |
| L2 | FII Positioning | 1 | 1 |
| L2 | Nifty PE | 2 | 2 |
| L3 | Straddle IV | 1 | 1 |
| **Total** | | **~27** | **~26** |

---

## Order Execution

- **Broker**: Upstox (via Bearer token from existing account)
- **Instrument**: Nifty weekly options (nearest expiry Thursday)
- **Strike selection**: OTM by `otmSkip` strikes (default: 3 strikes OTM)
- **Order type**: MARKET, product `I` (intraday), validity DAY
- **Lot size**: 25 (Nifty standard)
- **Position size**: Full (25 qty) on strong signal, half on moderate

## Exit Logic
Exits are checked on every tick (60s):
1. Profit ≥ `maxProfitPct` % (default 10%)
2. Loss ≥ `maxLossPct` % (default 5%)
3. V4 composite signal reverses direction
4. V3 macro signal reverses direction
5. Breadth flip: A/D ratio drops below 0.8 (CE) or above 1.5 (PE)

---

## State Machine

```
IDLE ──start()──► RUNNING ──signal+order──► ORDERED ──exit condition──► RUNNING
  ▲                  │                          │
  └──────stop()──────┘             maxTrades/time ──► STOPPED
```

State and active position are persisted to `localStorage` — the bot resumes polling automatically on page reload.

---

## Configuration (all editable in UI)

| Key | Default | Description |
|-----|---------|-------------|
| `strongThreshold` | 16 | Min score for strong signal |
| `moderateThreshold` | 10 | Min score for moderate signal |
| `maxProfitPct` | 10 | Exit when option gains this % |
| `maxLossPct` | 5 | Exit when option loses this % |
| `maxTradesPerDay` | 3 | Hard cap on trades per day |
| `lastEntryTime` | 14:30 | No new entries after this IST time |
| `pollingIntervalSec` | 60 | How often to re-score (seconds) |
| `minConfidence` | moderate | Minimum confidence to enter |
| `otmSkip` | 3 | Strikes OTM from ATM |

---

## Files

| File | Purpose |
|------|---------|
| `app/client/src/lib/indicators.ts` | All V4 technical indicator functions |
| `app/client/src/lib/v3Sentiment.ts` | V3 macro sentiment logic |
| `app/client/src/lib/vrdSignals.ts` | VRD Nation scoring functions |
| `app/client/src/lib/strategyConfig.ts` | Config interface + localStorage |
| `app/client/src/lib/strategyEngine.ts` | 5-layer scoring engine |
| `app/client/src/hooks/useStrategyBot.ts` | Bot state machine React hook |
| `app/client/src/pages/strategies.tsx` | Strategies page layout |
| `app/client/src/components/dashboard/strategy/` | 8 UI panel components |
| `app/client/worker/index.ts` | Cloudflare Worker CORS proxy (13 new routes) |

---

## Known Limitations

- VRD Nation scraping depends on their SSR HTML structure — may break on site redesign
- Upstox MARKET orders during low-liquidity windows (pre-open, post 3:25) may get poor fills
- Bot runs only while browser tab is open; no background execution
- Position P&L in the UI is estimated from entry price only (no live LTP feed yet)
