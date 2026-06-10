// V4 Technical Indicators — pure TypeScript, ported from testapp/src/upstox/lib/

// Candle: [timestamp, open, high, low, close, volume, oi?]
export type Candle = [
  string,
  number,
  number,
  number,
  number,
  number,
  (number | undefined)?,
]

export type SignalType = 'Buy' | 'Sell' | 'Hold'
export type MomentumType = 'Overbought' | 'Oversold' | 'Hold'
export type TrendType = 'Up' | 'Down' | 'Neutral'
export type VolatilityLevel = 'High' | 'Low' | 'Neutral'

export interface OptionGreeks {
  iv: number // implied volatility (annualised %, e.g. 15.5 means 15.5%)
  delta: number
  theta: number
  vega: number
  gamma: number
}

export interface OptionData {
  expiry: string
  strike_price: number
  underlying_spot_price: number
  call_options: {
    instrument_key: string
    market_data: { ltp: number; volume: number; oi: number }
    option_greeks?: OptionGreeks
  }
  put_options: {
    instrument_key: string
    market_data: { ltp: number; volume: number; oi: number }
    option_greeks?: OptionGreeks
  }
}

export interface IndicatorsResult {
  ema: SignalType
  adx: SignalType
  rsi: { value: number; signal: MomentumType }
  stochastic: { k: number; d: number; signal: SignalType }
  bollinger: {
    upper: number
    middle: number
    lower: number
    signal: SignalType
    trend: TrendType
  }
  atr: { value: number; level: VolatilityLevel }
  pcr: SignalType
  pcrValue: number
}

// ─── EMA helpers ─────────────────────────────────────────────────────────────
function updateEMA(prev: number, price: number, k: number): number {
  return price * k + prev * (1 - k)
}

function computeEMAArray(values: number[], period: number): number[] {
  if (values.length === 0) return []
  const k = 2 / (period + 1)
  const result: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    result.push(updateEMA(result[i - 1], values[i], k))
  }
  return result
}

// ─── EMA Crossover — fast 10, slow 42 ────────────────────────────────────────
// ADX fix: original testapp had +DI > -DI = Sell (inverted). Fixed here.
export function calcEMACrossover(
  candles: Candle[],
  fastPeriod = 10,
  slowPeriod = 42,
): SignalType {
  if (candles.length < slowPeriod + 1) return 'Hold'
  const closes = candles.map((c) => c[4])
  const fastK = 2 / (fastPeriod + 1)
  const slowK = 2 / (slowPeriod + 1)
  let fastEMA = closes[0]
  let slowEMA = closes[0]
  for (let i = 1; i < closes.length; i++) {
    fastEMA = updateEMA(fastEMA, closes[i], fastK)
    slowEMA = updateEMA(slowEMA, closes[i], slowK)
  }
  // Previous tick
  const prevFast = updateEMA(fastEMA, closes[closes.length - 2], fastK)
  const prevSlow = updateEMA(slowEMA, closes[closes.length - 2], slowK)
  if (fastEMA > slowEMA && prevFast <= prevSlow) return 'Buy'
  if (fastEMA < slowEMA && prevFast >= prevSlow) return 'Sell'
  return 'Hold'
}

// ─── ADX(14) — trend strength + direction ────────────────────────────────────
export function calcADX(candles: Candle[], period = 14): SignalType {
  if (candles.length < period) return 'Hold'
  const recent = candles.slice(-period)
  const pdms = new Array<number>(recent.length).fill(0)
  const ndms = new Array<number>(recent.length).fill(0)
  for (let i = 1; i < recent.length; i++) {
    const upMove = recent[i][2] - recent[i - 1][2]
    const downMove = recent[i - 1][3] - recent[i][3]
    pdms[i] = upMove > downMove && upMove > 0 ? upMove : 0
    ndms[i] = downMove > upMove && downMove > 0 ? downMove : 0
  }
  const plusDi = computeEMAArray(pdms, period)
  const minusDi = computeEMAArray(ndms, period)
  const dxs = plusDi.map((p, i) => {
    const n = minusDi[i]
    const div = p + n
    return div !== 0 ? (Math.abs(p - n) / div) * 100 : 0
  })
  const adxArr = computeEMAArray(dxs, period)
  const adx = adxArr[adxArr.length - 1] ?? 0
  if (adx < 25) return 'Hold'
  // Fixed polarity: +DI > -DI = uptrend = Buy
  const plusLast = plusDi[plusDi.length - 1] ?? 0
  const minusLast = minusDi[minusDi.length - 1] ?? 0
  return plusLast > minusLast ? 'Buy' : 'Sell'
}

// ─── RSI(14) ─────────────────────────────────────────────────────────────────
export function calcRSI(
  candles: Candle[],
  period = 14,
  overbought = 70,
  oversold = 30,
): { value: number; signal: MomentumType } {
  if (candles.length <= period) return { value: 50, signal: 'Hold' }
  const recent = candles.slice(-(period + 1))
  let gains = 0
  let losses = 0
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i][4] - recent[i - 1][4]
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return { value: 100, signal: 'Overbought' }
  const rs = avgGain / avgLoss
  const value = parseFloat((100 - 100 / (1 + rs)).toFixed(2))
  const signal: MomentumType =
    value >= overbought ? 'Overbought' : value <= oversold ? 'Oversold' : 'Hold'
  return { value, signal }
}

// ─── Stochastic(14) ──────────────────────────────────────────────────────────
export function calcStochastic(
  candles: Candle[],
  period = 14,
  smoothing = 3,
): { k: number; d: number; signal: SignalType } {
  const needed = period + smoothing - 1
  if (candles.length < needed) return { k: 50, d: 50, signal: 'Hold' }
  const recent = candles.slice(-needed)
  const kValues: number[] = []
  for (let i = period - 1; i < recent.length; i++) {
    const window = recent.slice(i - period + 1, i + 1)
    const high = Math.max(...window.map((c) => c[2]))
    const low = Math.min(...window.map((c) => c[3]))
    const close = recent[i][4]
    kValues.push(high === low ? 50 : ((close - low) / (high - low)) * 100)
  }
  const dValues = computeEMAArray(kValues, smoothing)
  const k = parseFloat((kValues[kValues.length - 1] ?? 50).toFixed(2))
  const d = parseFloat((dValues[dValues.length - 1] ?? 50).toFixed(2))
  let signal: SignalType = 'Hold'
  if (k < d && k < 20) signal = 'Buy'
  else if (k > d && k > 80) signal = 'Sell'
  return { k, d, signal }
}

// ─── Bollinger Bands(20) — breakout mode ─────────────────────────────────────
export function calcBollingerBands(
  candles: Candle[],
  period = 20,
): {
  upper: number
  middle: number
  lower: number
  signal: SignalType
  trend: TrendType
} {
  if (candles.length < period) {
    const last = candles[candles.length - 1]?.[4] ?? 0
    return {
      upper: last,
      middle: last,
      lower: last,
      signal: 'Hold',
      trend: 'Neutral',
    }
  }
  const recent = candles.slice(-period)
  const closes = recent.map((c) => c[4])
  const sma = closes.reduce((s, p) => s + p, 0) / period
  const stdDev = Math.sqrt(
    closes.reduce((s, p) => s + Math.pow(p - sma, 2), 0) / period,
  )
  const upper = parseFloat((sma + 2 * stdDev).toFixed(2))
  const lower = parseFloat((sma - 2 * stdDev).toFixed(2))
  const middle = parseFloat(sma.toFixed(2))
  const currentPrice = candles[candles.length - 1][4]
  let signal: SignalType = 'Hold'
  if (currentPrice > upper) signal = 'Buy'
  else if (currentPrice < lower) signal = 'Sell'
  const trend: TrendType =
    currentPrice > middle ? 'Up' : currentPrice < middle ? 'Down' : 'Neutral'
  return { upper, middle, lower, signal, trend }
}

// ─── ATR(14) ─────────────────────────────────────────────────────────────────
function trueRange(c: Candle): number {
  return Math.max(c[2] - c[3], Math.abs(c[4] - c[1]))
}

export function calcATR(
  candles: Candle[],
  period = 14,
): { value: number; level: VolatilityLevel } {
  if (candles.length < period) return { value: 0, level: 'Low' }
  const recent = candles.slice(-period)
  const atr = parseFloat(
    (recent.map(trueRange).reduce((s, t) => s + t, 0) / period).toFixed(2),
  )
  const spot = candles[candles.length - 1][4]
  const pct = spot > 0 ? atr / spot : 0
  const level: VolatilityLevel =
    pct >= 0.003 ? 'High' : pct <= 0.001 ? 'Low' : 'Neutral'
  return { value: atr, level }
}

// ─── OI PCR from live option chain ───────────────────────────────────────────
export function calcOiPCR(optionChain: OptionData[]): {
  signal: SignalType
  value: number
} {
  let totalPutOI = 0
  let totalCallOI = 0
  for (const o of optionChain) {
    totalPutOI += o.put_options.market_data.oi ?? 0
    totalCallOI += o.call_options.market_data.oi ?? 0
  }
  if (totalCallOI === 0) return { signal: 'Hold', value: 0 }
  const pcr = parseFloat((totalPutOI / totalCallOI).toFixed(3))
  // PCR > 1.0: more puts = put writers active = support = bullish
  const signal: SignalType = pcr >= 1.0 ? 'Buy' : pcr <= 0.7 ? 'Sell' : 'Hold'
  return { signal, value: pcr }
}

// ─── Next working Thursday (Nifty weekly expiry) ──────────────────────────────
const NSE_HOLIDAYS = [
  '2025-02-26',
  '2025-03-14',
  '2025-03-31',
  '2025-04-10',
  '2025-04-14',
  '2025-04-18',
  '2025-05-01',
  '2025-08-15',
  '2025-10-02',
  '2025-10-21',
  '2025-11-05',
  '2025-12-25',
  '2026-01-26',
  '2026-03-02',
  '2026-03-19',
  '2026-03-20',
  '2026-03-30',
  '2026-04-02',
  '2026-04-06',
  '2026-04-14',
  '2026-06-29',
  '2026-08-15',
  '2026-10-02',
  '2026-12-25',
]

function padTwo(n: number) {
  return n.toString().padStart(2, '0')
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${padTwo(d.getMonth() + 1)}-${padTwo(d.getDate())}`
}

export function getNextWorkingThursday(from = new Date()): string {
  const d = new Date(from)
  const day = d.getDay()
  const daysUntil = day <= 4 ? 4 - day : 11 - day
  d.setDate(d.getDate() + daysUntil)
  while (NSE_HOLIDAYS.includes(fmtDate(d))) d.setDate(d.getDate() + 7)
  return fmtDate(d)
}

// ─── OTM Strike picker ───────────────────────────────────────────────────────
export function getOtmStrike(
  optionChain: OptionData[],
  direction: 'CE' | 'PE',
  skip = 3,
): OptionData | null {
  if (!optionChain.length) return null
  const spot = optionChain[0].underlying_spot_price
  if (direction === 'CE') {
    const otm = optionChain.filter(
      (o) => o.strike_price > spot && o.call_options.market_data.ltp > 0,
    )
    return otm[skip] ?? otm[otm.length - 1] ?? null
  }
  const otm = optionChain
    .filter((o) => o.strike_price < spot && o.put_options.market_data.ltp > 0)
    .reverse()
  return otm[skip] ?? otm[otm.length - 1] ?? null
}

// ─── Compute all indicators at once ──────────────────────────────────────────
export function computeAllIndicators(
  candles: Candle[],
  optionChain: OptionData[] = [],
): IndicatorsResult {
  const pcrResult = optionChain.length
    ? calcOiPCR(optionChain)
    : { signal: 'Hold' as SignalType, value: 0 }
  return {
    ema: calcEMACrossover(candles),
    adx: calcADX(candles),
    rsi: calcRSI(candles),
    stochastic: calcStochastic(candles),
    bollinger: calcBollingerBands(candles),
    atr: calcATR(candles),
    pcr: pcrResult.signal,
    pcrValue: pcrResult.value,
  }
}
