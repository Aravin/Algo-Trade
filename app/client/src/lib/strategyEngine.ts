import type { IndicatorsResult, SignalType } from './indicators'
import type { V3OrderType } from './v3Sentiment'
import type { VrdData } from './vrdSignals'
import {
  scoreMMI,
  scoreADRatio,
  scoreFiiLongShort,
  scoreFiiPositioning,
  scoreNiftyPE,
  scoreVix,
  scoreStraddleIV,
} from './vrdSignals'
import type { StrategyConfig } from './strategyConfig'

export interface ScoreBreakdown {
  layer: string
  indicator: string
  condition: string
  points: number
  max: number
}

export interface ScoreResult {
  score: number
  max: number
  breakdown: ScoreBreakdown[]
}

export interface FinalSignal {
  signal: 'BUY_CE' | 'BUY_PE' | 'WAIT' | 'NO_TRADE'
  confidence: 'strong' | 'moderate' | 'weak' | 'none'
  positionSize: 'full' | 'half' | 'none'
  v3: V3OrderType
  v4: SignalType
  bullScore: number
  bearScore: number
  scoreMax: number
}

export interface AllSignalData {
  v3: V3OrderType
  indicators: IndicatorsResult
  vrd: VrdData | null
}

import type { ExecutionMode } from './paperTrading'

export interface ActivePosition {
  instrumentKey: string
  direction: 'CE' | 'PE'
  entryPrice: number
  quantity: number
  entryTime: string
  tradeId: number
  executionMode?: ExecutionMode
  paperTradeId?: string
}

// ─── Hard stop checks (Layer 0) ───────────────────────────────────────────────
export function runHardStopChecks(vrd: VrdData | null): {
  blocked: boolean
  reasons: string[]
} {
  const reasons: string[] = []
  if (!vrd) return { blocked: false, reasons }
  const vixCheck = scoreVix(vrd.vix)
  if (!vixCheck.tradeable) reasons.push(vixCheck.label)
  const pe = vrd.niftyPe?.pe
  if (pe !== null && pe !== undefined && pe > 28) {
    reasons.push(`Nifty PE ${pe} > 28 — historically overvalued`)
  }
  return { blocked: reasons.length > 0, reasons }
}

// ─── V4 composite signal ──────────────────────────────────────────────────────
export function getV4Signal(ind: IndicatorsResult): SignalType {
  const { ema, adx, pcr, bollinger, rsi } = ind
  if (rsi.signal === 'Overbought' || rsi.signal === 'Oversold') return 'Hold'
  // All 4 agree
  if (
    ema === 'Buy' &&
    (adx === 'Buy' || adx === 'Hold') &&
    pcr === 'Buy' &&
    bollinger.signal === 'Buy'
  )
    return 'Buy'
  if (
    ema === 'Sell' &&
    (adx === 'Sell' || adx === 'Hold') &&
    pcr === 'Sell' &&
    bollinger.signal === 'Sell'
  )
    return 'Sell'
  // 3 of 4 agree (relaxed)
  const buyVotes = [
    ema === 'Buy',
    adx === 'Buy',
    pcr === 'Buy',
    bollinger.signal === 'Buy',
  ].filter(Boolean).length
  const sellVotes = [
    ema === 'Sell',
    adx === 'Sell',
    pcr === 'Sell',
    bollinger.signal === 'Sell',
  ].filter(Boolean).length
  if (buyVotes >= 3) return 'Buy'
  if (sellVotes >= 3) return 'Sell'
  return 'Hold'
}

function addScore(
  breakdown: ScoreBreakdown[],
  layer: string,
  indicator: string,
  condition: string,
  points: number,
  max: number,
): number {
  breakdown.push({ layer, indicator, condition, points, max })
  return points
}

// ─── Bullish scoring ──────────────────────────────────────────────────────────
export function scoreBullish(data: AllSignalData): ScoreResult {
  const bd: ScoreBreakdown[] = []
  let score = 0
  let max = 0
  const v4 = getV4Signal(data.indicators)

  // V3 (4 pts)
  const v3p = data.v3 === 'buy' ? 4 : data.v3 === 'hold' ? 0 : -2
  score += addScore(bd, 'V3', 'Macro Signal', data.v3, v3p, 4)
  max += 4

  // V4 (5 pts)
  const v4p = v4 === 'Buy' ? 5 : v4 === 'Hold' ? 0 : -3
  score += addScore(bd, 'V4', 'Price Action', v4, v4p, 5)
  max += 5

  // EMA (3 pts)
  const emap =
    data.indicators.ema === 'Buy' ? 3 : data.indicators.ema === 'Hold' ? 0 : -1
  score += addScore(bd, 'V4', 'EMA Crossover', data.indicators.ema, emap, 3)
  max += 3

  // RSI (2 pts)
  const rsip =
    data.indicators.rsi.signal === 'Oversold'
      ? 2
      : data.indicators.rsi.signal === 'Hold'
        ? 1
        : -1
  score += addScore(
    bd,
    'V4',
    `RSI ${data.indicators.rsi.value.toFixed(1)}`,
    data.indicators.rsi.signal,
    rsip,
    2,
  )
  max += 2

  // ATR (penalty only)
  if (data.indicators.atr.level === 'Low') {
    score += addScore(bd, 'V4', 'ATR', 'Low volatility', -2, 0)
  }

  // VRD signals
  if (data.vrd) {
    const mmi = scoreMMI(data.vrd.mmi?.score ?? null)
    if (mmi.direction === 'BULL' || mmi.contrarian) {
      score += addScore(bd, 'L2', 'MMI', mmi.label, mmi.score, mmi.max)
      max += mmi.max
    }

    const ad = data.vrd.advancesDeclines
    const adS = scoreADRatio(
      ad?.advances ?? null,
      ad?.declines ?? null,
      ad?.ratio ?? null,
    )
    if (adS.direction === 'BULL') {
      score += addScore(bd, 'L3', 'A/D Ratio', adS.label, adS.score, adS.max)
      max += adS.max
    }

    const fii = data.vrd.fiiLongShort
    const fiiS = scoreFiiLongShort(fii?.longPct ?? null, fii?.shortPct ?? null)
    if (fiiS.direction === 'BULL' || fiiS.contrarian) {
      score += addScore(bd, 'L2', 'FII L/S', fiiS.label, fiiS.score, fiiS.max)
      max += fiiS.max
    }

    const pos = data.vrd.fiiPositioning
    const posS = scoreFiiPositioning(
      pos?.netPosition ?? null,
      pos?.consecutiveShortDays ?? null,
    )
    if (posS.score > 0) {
      score += addScore(
        bd,
        'L2',
        'FII Positioning',
        posS.label,
        posS.score,
        posS.max,
      )
      max += posS.max
    }

    const pe = scoreNiftyPE(data.vrd.niftyPe?.pe ?? null)
    if (pe.bias !== 'PE') {
      score += addScore(bd, 'L2', 'Nifty PE', pe.label, pe.score, pe.max)
      max += pe.max
    }

    const iv = scoreStraddleIV(data.vrd.straddleIv?.percentAboveAvg ?? null)
    if (iv.preferBuy) {
      score += addScore(bd, 'L3', 'Straddle IV', iv.label, iv.score, iv.max)
      max += iv.max
    }
  }

  return { score: Math.max(0, score), max, breakdown: bd }
}

// ─── Bearish scoring ──────────────────────────────────────────────────────────
export function scoreBearish(data: AllSignalData): ScoreResult {
  const bd: ScoreBreakdown[] = []
  let score = 0
  let max = 0
  const v4 = getV4Signal(data.indicators)

  const v3p = data.v3 === 'sell' ? 4 : data.v3 === 'hold' ? 0 : -2
  score += addScore(bd, 'V3', 'Macro Signal', data.v3, v3p, 4)
  max += 4

  const v4p = v4 === 'Sell' ? 5 : v4 === 'Hold' ? 0 : -3
  score += addScore(bd, 'V4', 'Price Action', v4, v4p, 5)
  max += 5

  const emap =
    data.indicators.ema === 'Sell' ? 3 : data.indicators.ema === 'Hold' ? 0 : -1
  score += addScore(bd, 'V4', 'EMA Crossover', data.indicators.ema, emap, 3)
  max += 3

  const rsip =
    data.indicators.rsi.signal === 'Overbought'
      ? 2
      : data.indicators.rsi.signal === 'Hold'
        ? 1
        : -1
  score += addScore(
    bd,
    'V4',
    `RSI ${data.indicators.rsi.value.toFixed(1)}`,
    data.indicators.rsi.signal,
    rsip,
    2,
  )
  max += 2

  if (data.indicators.atr.level === 'Low') {
    score += addScore(bd, 'V4', 'ATR', 'Low volatility', -2, 0)
  }

  if (data.vrd) {
    const mmi = scoreMMI(data.vrd.mmi?.score ?? null)
    if (
      mmi.direction === 'BEAR' ||
      (mmi.contrarian && mmi.direction === 'BEAR')
    ) {
      const pts = Math.abs(mmi.score)
      score += addScore(bd, 'L2', 'MMI', mmi.label, pts, mmi.max)
      max += mmi.max
    }

    const ad = data.vrd.advancesDeclines
    const adS = scoreADRatio(
      ad?.advances ?? null,
      ad?.declines ?? null,
      ad?.ratio ?? null,
    )
    if (adS.direction === 'BEAR') {
      score += addScore(
        bd,
        'L3',
        'A/D Ratio',
        adS.label,
        Math.abs(adS.score),
        adS.max,
      )
      max += adS.max
    }

    const pe = scoreNiftyPE(data.vrd.niftyPe?.pe ?? null)
    if (pe.bias === 'PE') {
      score += addScore(
        bd,
        'L2',
        'Nifty PE',
        pe.label,
        Math.abs(pe.score),
        pe.max,
      )
      max += pe.max
    }

    const iv = scoreStraddleIV(data.vrd.straddleIv?.percentAboveAvg ?? null)
    if (!iv.preferBuy && iv.score < 0) {
      score += addScore(
        bd,
        'L3',
        'Straddle IV',
        iv.label,
        Math.abs(iv.score),
        iv.max,
      )
      max += iv.max
    }
  }

  return { score: Math.max(0, score), max, breakdown: bd }
}

// ─── Final signal decision ────────────────────────────────────────────────────
export function getFinalSignal(
  data: AllSignalData,
  config: Pick<
    StrategyConfig,
    'strongThreshold' | 'moderateThreshold' | 'minConfidence'
  >,
): FinalSignal {
  const bull = scoreBullish(data)
  const bear = scoreBearish(data)
  const v4 = getV4Signal(data.indicators)
  const gap = Math.abs(bull.score - bear.score)
  const top = Math.max(bull.score, bear.score)
  const max = Math.max(bull.max, bear.max, 1)
  const dominant =
    bull.score > bear.score ? 'bull' : bear.score > bull.score ? 'bear' : 'none'

  let confidence: 'strong' | 'moderate' | 'weak' | 'none' = 'none'
  if (top >= config.strongThreshold && gap >= 6) confidence = 'strong'
  else if (top >= config.moderateThreshold && gap >= 3) confidence = 'moderate'
  else if (top >= config.moderateThreshold) confidence = 'weak'

  const minConf = config.minConfidence
  const shouldTrade =
    confidence === 'strong' ||
    (minConf === 'moderate' && confidence === 'moderate')

  if (!shouldTrade || dominant === 'none') {
    return {
      signal: 'NO_TRADE',
      confidence,
      positionSize: 'none',
      v3: data.v3,
      v4,
      bullScore: bull.score,
      bearScore: bear.score,
      scoreMax: max,
    }
  }

  const signal = dominant === 'bull' ? 'BUY_CE' : 'BUY_PE'
  const positionSize = confidence === 'strong' ? 'full' : 'half'
  return {
    signal,
    confidence,
    positionSize,
    v3: data.v3,
    v4,
    bullScore: bull.score,
    bearScore: bear.score,
    scoreMax: max,
  }
}

// ─── Exit decision ────────────────────────────────────────────────────────────
export function shouldExit(
  position: ActivePosition,
  currentData: AllSignalData,
  currentPrice: number,
  config: Pick<StrategyConfig, 'maxProfitPct' | 'maxLossPct'>,
): { exit: boolean; reason: string } {
  const pct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100
  if (pct >= config.maxProfitPct)
    return { exit: true, reason: `Profit +${pct.toFixed(1)}% reached` }
  if (pct <= -config.maxLossPct)
    return {
      exit: true,
      reason: `Stop loss -${Math.abs(pct).toFixed(1)}% triggered`,
    }

  const v4 = getV4Signal(currentData.indicators)
  const reversal = position.direction === 'CE' ? 'Sell' : 'Buy'
  if (v4 === reversal)
    return { exit: true, reason: `V4 signal reversed to ${v4}` }

  const v3Reversal = position.direction === 'CE' ? 'sell' : 'buy'
  if (currentData.v3 === v3Reversal)
    return { exit: true, reason: `V3 signal reversed to ${currentData.v3}` }

  const ad = currentData.vrd?.advancesDeclines
  if (ad?.ratio != null) {
    if (position.direction === 'CE' && ad.ratio < 0.8)
      return { exit: true, reason: 'Breadth turned bearish' }
    if (position.direction === 'PE' && ad.ratio > 1.5)
      return { exit: true, reason: 'Breadth turned bullish' }
  }

  return { exit: false, reason: '' }
}
