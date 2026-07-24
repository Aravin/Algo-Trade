// V4 Technical Indicators — pure TypeScript, ported from testapp/src/upstox/lib/

import type {
  Candle,
  SignalType,
  MomentumType,
  TrendType,
  VolatilityLevel,
  OptionData,
  IndicatorsResult,
  BollingerSqueezeMetrics,
} from './types'
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
function calcEMACrossover(
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
  if (fastEMA > slowEMA) return 'Buy'
  if (fastEMA < slowEMA) return 'Sell'
  return 'Hold'
}

// ─── ADX(14) — trend strength + direction ────────────────────────────────────
function calcADX(candles: Candle[], period = 14): SignalType {
  if (candles.length < period * 2) return 'Hold'
  const recent = candles.slice(-(period * 2))
  const pdms = new Array<number>(recent.length).fill(0)
  const ndms = new Array<number>(recent.length).fill(0)
  const trs = new Array<number>(recent.length).fill(0)
  for (let i = 1; i < recent.length; i++) {
    const upMove = recent[i][2] - recent[i - 1][2]
    const downMove = recent[i - 1][3] - recent[i][3]
    pdms[i] = upMove > downMove && upMove > 0 ? upMove : 0
    ndms[i] = downMove > upMove && downMove > 0 ? downMove : 0
    trs[i] = trueRange(recent[i], recent[i - 1][4])
  }
  const smoothedPdm = computeEMAArray(pdms, period)
  const smoothedNdm = computeEMAArray(ndms, period)
  const smoothedTr = computeEMAArray(trs, period)
  const plusDi = smoothedPdm.map((p, i) => {
    const t = smoothedTr[i]
    return t > 0 ? (p / t) * 100 : 0
  })
  const minusDi = smoothedNdm.map((n, i) => {
    const t = smoothedTr[i]
    return t > 0 ? (n / t) * 100 : 0
  })
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
function calcRSI(
  candles: Candle[],
  period = 14,
  overbought = 70,
  oversold = 30,
): { value: number; signal: MomentumType } {
  if (candles.length <= period) return { value: 50, signal: 'Hold' }
  const closes = candles.map((c) => c[4])
  // Seed with simple average of first period changes
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) avgGain += diff
    else avgLoss -= diff
  }
  avgGain /= period
  avgLoss /= period
  // Wilder's smoothing: EMA factor = 1/period
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff >= 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }
  if (avgLoss === 0) return { value: 100, signal: 'Overbought' }
  const rs = avgGain / avgLoss
  const value = parseFloat((100 - 100 / (1 + rs)).toFixed(2))
  const signal: MomentumType =
    value >= overbought ? 'Overbought' : value <= oversold ? 'Oversold' : 'Hold'
  return { value, signal }
}

// ─── Stochastic(14) ──────────────────────────────────────────────────────────
function calcStochastic(
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
  const k = parseFloat((kValues[kValues.length - 1] ?? 50).toFixed(2))
  const d = parseFloat(
    (kValues.reduce((s, v) => s + v, 0) / kValues.length).toFixed(2),
  )
  let signal: SignalType = 'Hold'
  if (k > d && k < 20) signal = 'Buy'
  else if (k < d && k > 80) signal = 'Sell'
  return { k, d, signal }
}

// ─── Bollinger Bands(20) — breakout mode ─────────────────────────────────────
function calcBollingerBands(
  candles: Candle[],
  period = 20,
  mode: 'breakout' | 'reversion' = 'breakout',
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
  if (mode === 'breakout') {
    if (currentPrice > upper) signal = 'Buy'
    else if (currentPrice < lower) signal = 'Sell'
  } else {
    if (currentPrice > upper) signal = 'Sell'
    else if (currentPrice < lower) signal = 'Buy'
  }
  const trend: TrendType =
    currentPrice > middle ? 'Up' : currentPrice < middle ? 'Down' : 'Neutral'
  return { upper, middle, lower, signal, trend }
}

// ─── ATR(14) ─────────────────────────────────────────────────────────────────
function trueRange(c: Candle, prevClose: number): number {
  return Math.max(
    c[2] - c[3],
    Math.abs(c[2] - prevClose),
    Math.abs(c[3] - prevClose),
  )
}

function calcATR(
  candles: Candle[],
  period = 14,
): { value: number; level: VolatilityLevel } {
  if (candles.length < period + 1) return { value: 0, level: 'Low' }
  const recent = candles.slice(-(period + 1))
  let trSum = 0
  for (let i = 1; i < recent.length; i++) {
    trSum += trueRange(recent[i], recent[i - 1][4])
  }
  const atr = parseFloat((trSum / period).toFixed(2))
  const spot = candles[candles.length - 1][4]
  const pct = spot > 0 ? atr / spot : 0
  const level: VolatilityLevel =
    pct >= 0.003 ? 'High' : pct <= 0.001 ? 'Low' : 'Neutral'
  return { value: atr, level }
}

// ─── OI PCR from live option chain ───────────────────────────────────────────
function calcOiPCR(optionChain: OptionData[]): {
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

// ─── ADX Raw Numeric Value ───────────────────────────────────────────────────
export function calcADXRaw(
  candles: Candle[],
  period = 14,
): { adx: number; plusDi: number; minusDi: number } {
  if (candles.length < period + 1) return { adx: 0, plusDi: 0, minusDi: 0 }
  const recent = candles.slice(-Math.min(candles.length, period * 2))
  const pdms = new Array<number>(recent.length).fill(0)
  const ndms = new Array<number>(recent.length).fill(0)
  const trs = new Array<number>(recent.length).fill(0)
  for (let i = 1; i < recent.length; i++) {
    const upMove = recent[i][2] - recent[i - 1][2]
    const downMove = recent[i - 1][3] - recent[i][3]
    pdms[i] = upMove > downMove && upMove > 0 ? upMove : 0
    ndms[i] = downMove > upMove && downMove > 0 ? downMove : 0
    trs[i] = trueRange(recent[i], recent[i - 1][4])
  }
  const smoothedPdm = computeEMAArray(pdms, period)
  const smoothedNdm = computeEMAArray(ndms, period)
  const smoothedTr = computeEMAArray(trs, period)
  const plusDi = smoothedPdm.map((p, i) => {
    const t = smoothedTr[i]
    return t > 0 ? (p / t) * 100 : 0
  })
  const minusDi = smoothedNdm.map((n, i) => {
    const t = smoothedTr[i]
    return t > 0 ? (n / t) * 100 : 0
  })
  const dxs = plusDi.map((p, i) => {
    const n = minusDi[i]
    const div = p + n
    return div !== 0 ? (Math.abs(p - n) / div) * 100 : 0
  })
  const adxArr = computeEMAArray(dxs, period)
  const adx = adxArr[adxArr.length - 1] ?? 0
  const plusLast = plusDi[plusDi.length - 1] ?? 0
  const minusLast = minusDi[minusDi.length - 1] ?? 0
  return { adx, plusDi: plusLast, minusDi: minusLast }
}

// ─── Bollinger Volatility Squeeze Evaluator ─────────────────────────────────
export function calcBollingerSqueezeMetrics(
  candles: Candle[],
  squeezeThresholdPct = 1.2,
  minSqueezeCandles = 3,
  adxMinThreshold = 20,
): BollingerSqueezeMetrics {
  if (candles.length < 20) {
    return {
      isSqueezing: false,
      bandwidthPct: 0,
      squeezeThresholdPct: 0,
      squeezeCandleCount: 0,
      breakoutDirection: 'NONE',
      adxValue: 0,
    }
  }

  const latestSpot = candles[candles.length - 1][4]
  const bb = calcBollingerBands(candles)
  const atr = calcATR(candles)

  const bandwidthPct =
    bb.middle > 0
      ? parseFloat((((bb.upper - bb.lower) / bb.middle) * 100).toFixed(3))
      : 0
  const atrPct = latestSpot > 0 ? (atr.value / latestSpot) * 100 : 0
  const thresholdPct = parseFloat((squeezeThresholdPct * atrPct).toFixed(3))

  // Calculate squeeze count over recent candles window (up to last 10 candles)
  let squeezeCandleCount = 0
  const checkCount = Math.min(10, candles.length - 20 + 1)
  for (let i = 0; i < checkCount; i++) {
    const subCandles = candles.slice(0, candles.length - i)
    if (subCandles.length < 20) break
    const subSpot = subCandles[subCandles.length - 1][4]
    const subBB = calcBollingerBands(subCandles)
    const subATR = calcATR(subCandles)
    const subBwPct =
      subBB.middle > 0 ? ((subBB.upper - subBB.lower) / subBB.middle) * 100 : 0
    const subAtrPct = subSpot > 0 ? (subATR.value / subSpot) * 100 : 0
    const subThresholdPct = squeezeThresholdPct * subAtrPct

    if (subBwPct <= subThresholdPct || subBwPct <= 0.8) {
      squeezeCandleCount++
    } else {
      break
    }
  }

  const isSqueezing = squeezeCandleCount >= minSqueezeCandles
  const adxInfo = calcADXRaw(candles)

  let breakoutDirection: 'CE' | 'PE' | 'NONE' = 'NONE'
  // Breakout triggers if candle closes outside band and either recently squeezed or currently squeezing
  const wasSqueezingRecently = isSqueezing || squeezeCandleCount >= 1
  if (wasSqueezingRecently && adxInfo.adx >= adxMinThreshold) {
    if (latestSpot > bb.upper && adxInfo.plusDi > adxInfo.minusDi) {
      breakoutDirection = 'CE'
    } else if (latestSpot < bb.lower && adxInfo.minusDi > adxInfo.plusDi) {
      breakoutDirection = 'PE'
    }
  }

  return {
    isSqueezing,
    bandwidthPct,
    squeezeThresholdPct: thresholdPct,
    squeezeCandleCount,
    breakoutDirection,
    adxValue: parseFloat(adxInfo.adx.toFixed(1)),
  }
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
