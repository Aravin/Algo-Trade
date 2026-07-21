import {
  scoreMMI,
  scoreADRatio,
  scoreFiiLongShort,
  scoreFiiPositioning,
  scoreNiftyPE,
  scoreVix,
  scoreStraddleIV,
} from './vrdSignals'
import type {
  IndicatorsResult,
  SignalType,
  VrdData,
  StrategyConfig,
  ScoreBreakdown,
  ScoreResult,
  FinalSignal,
  AllSignalData,
  ActivePosition,
  McMarketItem,
} from './types'

// ─── Hard stop checks (Layer 0) ───────────────────────────────────────────────
export function runHardStopChecks(
  vrd: VrdData | null,
  globalIndices?: McMarketItem[] | null,
): {
  blocked: boolean
  blockedDirection: 'CE' | 'PE' | 'BOTH' | 'NONE'
  reasons: string[]
} {
  const reasons: string[] = []
  let blockedDirection: 'CE' | 'PE' | 'BOTH' | 'NONE' = 'NONE'

  // Only VIX is a reliable hard stop (real Upstox data). Nifty PE is now
  // synthetic (proxy-computed from indicators) and is penalised through scoring
  // instead — see scoreNiftyPE() in scoreBearish/scoreBullish.
  if (!vrd) return { blocked: false, blockedDirection: 'NONE', reasons }
  const vixCheck = scoreVix(vrd.vix)
  if (!vixCheck.tradeable) {
    reasons.push(vixCheck.label)
    blockedDirection = 'BOTH'
  }

  if (globalIndices) {
    const brent = globalIndices.find(
      (item) => item.symbol.toLowerCase() === 'brent oil',
    )
    const brentPrice = brent?.last_price ? Number(brent.last_price) : null
    if (brentPrice !== null && brentPrice >= 95) {
      reasons.push(`Brent Crude $${brentPrice} >= $95 (Extreme Global Risk)`)
      blockedDirection = 'BOTH'
    }
  }

  if (vrd.newsAlerts) {
    const highMacro = vrd.newsAlerts.find(
      (alert) => alert.type === 'MACRO' && alert.severity === 'HIGH',
    )
    if (highMacro) {
      reasons.push(`Macro Guard: High Risk Event - ${highMacro.headline}`)
      blockedDirection = 'BOTH'
    }
  }

  return { blocked: reasons.length > 0, blockedDirection, reasons }
}

// ─── V4 composite signal ──────────────────────────────────────────────────────
function getV4Signal(ind: IndicatorsResult): SignalType {
  const { ema, adx, pcr, bollinger } = ind
  let baseSignal: SignalType = 'Hold'

  // All 4 agree
  if (
    ema === 'Buy' &&
    (adx === 'Buy' || adx === 'Hold') &&
    pcr === 'Buy' &&
    bollinger.signal === 'Buy'
  ) {
    baseSignal = 'Buy'
  } else if (
    ema === 'Sell' &&
    (adx === 'Sell' || adx === 'Hold') &&
    pcr === 'Sell' &&
    bollinger.signal === 'Sell'
  ) {
    baseSignal = 'Sell'
  } else {
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
    if (buyVotes >= 3) baseSignal = 'Buy'
    if (sellVotes >= 3) baseSignal = 'Sell'
  }

  return baseSignal
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
    if (mmi.direction === 'BULL') {
      max += mmi.max
      score += addScore(bd, 'L2', 'MMI', mmi.label, mmi.score, mmi.max)
    }

    const ad = data.vrd.advancesDeclines
    const adS = scoreADRatio(
      ad?.advances ?? null,
      ad?.declines ?? null,
      ad?.ratio ?? null,
    )
    if (adS.direction === 'BULL') {
      max += adS.max
      score += addScore(bd, 'L3', 'A/D Ratio', adS.label, adS.score, adS.max)
    }

    const fii = data.vrd.fiiLongShort
    const fiiS = scoreFiiLongShort(fii?.longPct ?? null, fii?.shortPct ?? null)
    if (fiiS.direction === 'BULL' || fiiS.contrarian) {
      max += fiiS.max
      score += addScore(bd, 'L2', 'FII L/S', fiiS.label, fiiS.score, fiiS.max)
    }

    const pos = data.vrd.fiiPositioning
    const posS = scoreFiiPositioning(
      pos?.netPosition ?? null,
      pos?.consecutiveShortDays ?? null,
    )
    if (posS.score > 0) {
      max += posS.max
      score += addScore(
        bd,
        'L2',
        'FII Positioning',
        posS.label,
        posS.score,
        posS.max,
      )
    }

    const pe = scoreNiftyPE(data.vrd.niftyPe?.pe ?? null)
    if (pe.bias !== 'PE') {
      max += pe.max
      score += addScore(bd, 'L2', 'Nifty PE', pe.label, pe.score, pe.max)
    }

    const iv = scoreStraddleIV(data.vrd.straddleIv?.percentAboveAvg ?? null)
    if (iv.preferBuy) {
      max += iv.max
      score += addScore(bd, 'L3', 'Straddle IV', iv.label, iv.score, iv.max)
    }
  }

  // Brent Crude Overhang Penalty (Commodities)
  if (data.globalIndices) {
    const brent = data.globalIndices.find(
      (item) => item.symbol.toLowerCase() === 'brent oil',
    )
    const brentPrice = brent?.last_price ? Number(brent.last_price) : null
    if (brentPrice !== null && brentPrice >= 88) {
      score += addScore(
        bd,
        'Macro',
        'Brent Crude Overhang',
        `Oil at $${brentPrice} >= $88 (penalty)`,
        -2,
        0,
      )
    }
  }

  // News Alerts Macro / Earnings Guard Penalty
  if (data.vrd?.newsAlerts) {
    const macroAlerts = data.vrd.newsAlerts.filter(
      (alert) =>
        alert.type === 'MACRO' &&
        (alert.severity === 'HIGH' || alert.severity === 'MEDIUM'),
    )
    const earningsAlerts = data.vrd.newsAlerts.filter(
      (alert) =>
        alert.type === 'EARNINGS' &&
        (alert.severity === 'HIGH' || alert.severity === 'MEDIUM'),
    )
    if (macroAlerts.length > 0) {
      score += addScore(
        bd,
        'Macro',
        'Macro News Penalty',
        `Classified ${macroAlerts.length} risk events (penalty)`,
        -2 * macroAlerts.length,
        0,
      )
    }
    if (earningsAlerts.length > 0) {
      score += addScore(
        bd,
        'Macro',
        'Earnings News Penalty',
        `Classified ${earningsAlerts.length} earnings events (penalty)`,
        -1 * earningsAlerts.length,
        0,
      )
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
    if (mmi.direction === 'BEAR') {
      max += mmi.max
      const pts = Math.abs(mmi.score)
      score += addScore(bd, 'L2', 'MMI', mmi.label, pts, mmi.max)
    }

    const ad = data.vrd.advancesDeclines
    const adS = scoreADRatio(
      ad?.advances ?? null,
      ad?.declines ?? null,
      ad?.ratio ?? null,
    )
    if (adS.direction === 'BEAR') {
      max += adS.max
      score += addScore(
        bd,
        'L3',
        'A/D Ratio',
        adS.label,
        Math.abs(adS.score),
        adS.max,
      )
    }

    // FII L/S — momentum-short scoring (shortPct 60–79%)
    const fiiLs = data.vrd.fiiLongShort
    const fiiLsS = scoreFiiLongShort(
      fiiLs?.longPct ?? null,
      fiiLs?.shortPct ?? null,
    )
    if (fiiLsS.direction === 'BEAR') {
      max += fiiLsS.max
      score += addScore(
        bd,
        'L2',
        'FII L/S',
        fiiLsS.label,
        Math.abs(fiiLsS.score),
        fiiLsS.max,
      )
    }

    // FII Net Positioning — negative net = FII net short = bearish confirmation
    const fiiPos = data.vrd.fiiPositioning
    const fiiPosS = scoreFiiPositioning(
      fiiPos?.netPosition ?? null,
      fiiPos?.consecutiveShortDays ?? null,
    )
    if (fiiPosS.score < 0) {
      max += fiiPosS.max
      score += addScore(
        bd,
        'L2',
        'FII Positioning',
        fiiPosS.label,
        Math.abs(fiiPosS.score),
        fiiPosS.max,
      )
    }

    const pe = scoreNiftyPE(data.vrd.niftyPe?.pe ?? null)
    if (pe.bias === 'PE') {
      max += pe.max
      score += addScore(
        bd,
        'L2',
        'Nifty PE',
        pe.label,
        Math.abs(pe.score),
        pe.max,
      )
    }

    const iv = scoreStraddleIV(data.vrd.straddleIv?.percentAboveAvg ?? null)
    if (!iv.preferBuy && iv.score < 0) {
      max += iv.max
      score += addScore(
        bd,
        'L3',
        'Straddle IV',
        iv.label,
        Math.abs(iv.score),
        iv.max,
      )
    }
  }

  // Brent Crude Overhang Bonus (Commodities)
  if (data.globalIndices) {
    const brent = data.globalIndices.find(
      (item) => item.symbol.toLowerCase() === 'brent oil',
    )
    const brentPrice = brent?.last_price ? Number(brent.last_price) : null
    if (brentPrice !== null && brentPrice >= 88) {
      max += 1
      score += addScore(
        bd,
        'Macro',
        'Brent Crude Overhang',
        `Oil at $${brentPrice} >= $88 (bearish catalyst)`,
        1,
        1,
      )
    }
  }

  // News Alerts Macro / Earnings Guard confirmation & penalty
  if (data.vrd?.newsAlerts) {
    const macroAlerts = data.vrd.newsAlerts.filter(
      (alert) =>
        alert.type === 'MACRO' &&
        (alert.severity === 'HIGH' || alert.severity === 'MEDIUM'),
    )
    const earningsAlerts = data.vrd.newsAlerts.filter(
      (alert) =>
        alert.type === 'EARNINGS' &&
        (alert.severity === 'HIGH' || alert.severity === 'MEDIUM'),
    )
    if (macroAlerts.length > 0) {
      const pts = Math.min(2, macroAlerts.length)
      score += addScore(
        bd,
        'Macro',
        'Macro News Confirmation',
        `Classified ${macroAlerts.length} risk events (bearish catalyst)`,
        pts,
        2,
      )
    }
    if (earningsAlerts.length > 0) {
      score += addScore(
        bd,
        'Macro',
        'Earnings News Penalty',
        `Classified ${earningsAlerts.length} earnings events (penalty)`,
        -1 * earningsAlerts.length,
        0,
      )
    }
  }

  return { score: Math.max(0, score), max, breakdown: bd }
}

// ─── Final signal decision ────────────────────────────────────────────────────
export function getFinalSignal(
  data: AllSignalData,
  config: Pick<
    StrategyConfig,
    | 'strongThreshold'
    | 'moderateThreshold'
    | 'minConfidence'
    | 'strongGap'
    | 'moderateGap'
  >,
): FinalSignal {
  const bull = scoreBullish(data)
  const bear = scoreBearish(data)
  const v4 = getV4Signal(data.indicators)
  const gap = Math.abs(bull.score - bear.score)
  const top = Math.max(bull.score, bear.score)
  const dominant =
    bull.score > bear.score ? 'bull' : bear.score > bull.score ? 'bear' : 'none'
  const scoreMax =
    dominant === 'bull'
      ? Math.max(bull.max, 1)
      : dominant === 'bear'
        ? Math.max(bear.max, 1)
        : Math.max(bull.max, bear.max, 1)

  const ratio = scoreMax > 0 ? top / scoreMax : 0
  let confidence: 'strong' | 'moderate' | 'weak' | 'none' = 'none'

  const satisfiesStrong =
    top >= config.strongThreshold ||
    (ratio >= 0.7 && top >= Math.min(config.strongThreshold, 10))
  const satisfiesModerate =
    top >= config.moderateThreshold ||
    (ratio >= 0.5 && top >= Math.min(config.moderateThreshold, 6))

  if (satisfiesStrong && gap >= config.strongGap) confidence = 'strong'
  else if (satisfiesModerate && gap >= config.moderateGap)
    confidence = 'moderate'
  else if (satisfiesModerate) confidence = 'weak'

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
      scoreMax: scoreMax,
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
    scoreMax: scoreMax,
  }
}

// ─── Exit decision ────────────────────────────────────────────────────────────
export function shouldExit(
  position: ActivePosition,
  currentData: AllSignalData,
  currentPrice: number,
  config: Pick<StrategyConfig, 'maxProfitPct' | 'maxLossPct'>,
): { exit: boolean; reason: string } {
  let pct: number
  if (position.legs && position.legs.length > 0) {
    let totalPnl = 0
    let totalEntryValue = 0
    for (const leg of position.legs) {
      const legCurrentPrice = leg.currentPrice ?? leg.entryPrice
      const legPnl =
        leg.tradeType === 'selling'
          ? (leg.entryPrice - legCurrentPrice) * leg.quantity
          : (legCurrentPrice - leg.entryPrice) * leg.quantity
      totalPnl += legPnl
      totalEntryValue += leg.entryPrice * leg.quantity
    }
    pct = totalEntryValue > 0 ? (totalPnl / totalEntryValue) * 100 : 0
  } else {
    const isSelling = position.tradeType === 'selling'
    pct = isSelling
      ? ((position.entryPrice - currentPrice) / position.entryPrice) * 100
      : ((currentPrice - position.entryPrice) / position.entryPrice) * 100
  }

  if (pct >= config.maxProfitPct)
    return { exit: true, reason: `Profit +${pct.toFixed(1)}% reached` }
  if (pct <= -config.maxLossPct)
    return {
      exit: true,
      reason: `Stop loss -${Math.abs(pct).toFixed(1)}% triggered`,
    }

  const v4 = getV4Signal(currentData.indicators)
  const isSellingMode = position.tradeType === 'selling'
  const isBullishBias = isSellingMode
    ? position.direction === 'PE'
    : position.direction === 'CE'

  const reversal = isBullishBias ? 'Sell' : 'Buy'
  if (v4 === reversal)
    return { exit: true, reason: `V4 signal reversed to ${v4}` }

  const v3Reversal = isBullishBias ? 'sell' : 'buy'
  if (currentData.v3 === v3Reversal)
    return { exit: true, reason: `V3 signal reversed to ${currentData.v3}` }

  const ad = currentData.vrd?.advancesDeclines
  if (ad?.ratio != null) {
    if (isBullishBias && ad.ratio < 0.8)
      return { exit: true, reason: 'Breadth turned bearish' }
    if (!isBullishBias && ad.ratio > 1.5)
      return { exit: true, reason: 'Breadth turned bullish' }
  }

  return { exit: false, reason: '' }
}
