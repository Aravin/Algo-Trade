import type {
  NiftySentiment,
  OptionData,
  IndicatorsResult,
  ActivePosition,
} from '@/lib/types'

const KEYS = {
  proxyHistory: 'algo-trade:proxy-history',
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function evaluateNiftySentimentFromAdvanceCount(
  advances: number | null,
): NiftySentiment {
  if (advances === null || Number.isNaN(advances)) return 'neutral'
  if (advances >= 39) return 'very bullish'
  if (advances >= 29) return 'bullish'
  if (advances >= 23) return 'neutral'
  if (advances >= 13) return 'bearish'
  return 'very bearish'
}

export function isStaticIpRestrictionError(
  message: string | null | undefined,
): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes('static ip restrictions') ||
    normalized.includes('no static ip has been configured')
  )
}

export function isPaperPosition(position: ActivePosition | null): boolean {
  return position?.executionMode === 'paper'
}

export { getLotSizeForSymbol } from '../utils/tradeUtils'

// ─── Synthetic MMI from Upstox data ──────────────────────────────────────────
export function computeMMI(
  vix: number | null,
  rsiValue: number,
  pcrValue: number,
): { score: number; label: string } {
  const vixScore =
    vix === null
      ? 50
      : vix > 25
        ? 10
        : vix > 20
          ? 25
          : vix > 16
            ? 40
            : vix > 13
              ? 55
              : vix > 10
                ? 70
                : 80

  const rsiScore =
    rsiValue < 30
      ? 15
      : rsiValue < 40
        ? 30
        : rsiValue < 50
          ? 45
          : rsiValue < 60
            ? 55
            : rsiValue < 70
              ? 65
              : 80

  const pcrScore =
    pcrValue > 1.5
      ? 20
      : pcrValue > 1.0
        ? 35
        : pcrValue > 0.8
          ? 55
          : pcrValue > 0.6
            ? 65
            : 80

  const score = Math.round(vixScore * 0.4 + rsiScore * 0.3 + pcrScore * 0.3)

  const label =
    score < 25
      ? 'Extreme Fear'
      : score < 40
        ? 'Fear'
        : score < 55
          ? 'Neutral'
          : score < 70
            ? 'Greed'
            : 'Extreme Greed'

  return { score, label }
}

// ─── Straddle IV from ATM option chain Greeks ─────────────────────────────────
export function computeStraddleIV(
  optionChain: OptionData[],
  niftyLtp: number,
  vix: number | null,
): {
  currentIv: number | null
  averageIv: number | null
  percentAboveAvg: number | null
} {
  if (!optionChain.length || niftyLtp === 0)
    return { currentIv: null, averageIv: null, percentAboveAvg: null }
  const atm = optionChain.reduce((prev, curr) =>
    Math.abs(curr.strike_price - niftyLtp) <
    Math.abs(prev.strike_price - niftyLtp)
      ? curr
      : prev,
  )
  const callIv = atm.call_options.option_greeks?.iv ?? null
  const putIv = atm.put_options.option_greeks?.iv ?? null
  if (callIv === null || putIv === null)
    return { currentIv: null, averageIv: vix, percentAboveAvg: null }
  const avgStrikeIv = (callIv + putIv) / 2
  // Compare ATM straddle IV to VIX (VIX IS the 30-day expected IV benchmark)
  const pct =
    vix && vix > 0
      ? parseFloat((((avgStrikeIv - vix) / vix) * 100).toFixed(1))
      : null
  return {
    currentIv: parseFloat(avgStrikeIv.toFixed(2)),
    averageIv: vix,
    percentAboveAvg: pct,
  }
}

export function getAtmWindow(
  optionChain: OptionData[],
  niftyLtp: number,
  windowSize = 5,
): OptionData[] {
  return [...optionChain]
    .sort(
      (left, right) =>
        Math.abs(left.strike_price - niftyLtp) -
        Math.abs(right.strike_price - niftyLtp),
    )
    .slice(0, windowSize)
}

function loadProxyHistory(): { date: string; netPosition: number }[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.proxyHistory) ?? '[]') as {
      date: string
      netPosition: number
    }[]
  } catch {
    return []
  }
}

function saveProxyHistory(history: { date: string; netPosition: number }[]) {
  try {
    localStorage.setItem(KEYS.proxyHistory, JSON.stringify(history.slice(-20)))
  } catch {
    /* ignore */
  }
}

export function updateProxyHistory(netPosition: number): number | null {
  const today = new Date().toISOString().split('T')[0]
  const history = loadProxyHistory().filter((item) => item.date)
  const withoutToday = history.filter((item) => item.date !== today)
  const nextHistory = [...withoutToday, { date: today, netPosition }].sort(
    (left, right) => right.date.localeCompare(left.date),
  )
  saveProxyHistory(nextHistory)

  if (netPosition >= 0) return null

  let consecutiveShortDays = 0
  for (const item of nextHistory) {
    if (item.netPosition < 0) consecutiveShortDays += 1
    else break
  }
  return consecutiveShortDays || null
}

export function computeProxyFlow(optionChain: OptionData[], niftyLtp: number) {
  if (!optionChain.length || niftyLtp === 0) {
    return {
      longPct: null as number | null,
      shortPct: null as number | null,
      netPosition: null as number | null,
      consecutiveShortDays: null as number | null,
    }
  }

  const window = getAtmWindow(optionChain, niftyLtp)
  const callOi = window.reduce(
    (sum, item) => sum + (item.call_options.market_data.oi ?? 0),
    0,
  )
  const putOi = window.reduce(
    (sum, item) => sum + (item.put_options.market_data.oi ?? 0),
    0,
  )
  const totalOi = callOi + putOi
  if (totalOi === 0) {
    return {
      longPct: null,
      shortPct: null,
      netPosition: null,
      consecutiveShortDays: null,
    }
  }

  const putShare = (putOi / totalOi) * 100
  const longPct = parseFloat(clamp(putShare, 5, 95).toFixed(1))
  const shortPct = parseFloat((100 - longPct).toFixed(1))
  const netPosition = putOi - callOi
  const consecutiveShortDays = updateProxyHistory(netPosition)

  return {
    longPct,
    shortPct,
    netPosition,
    consecutiveShortDays,
  }
}

export function computeProxyValuation(
  _niftyLtp: number,
  indicators: IndicatorsResult,
  vix: number | null,
  adRatio: number | null,
): { pe: number; label: string } {
  const rsiStretch = (indicators.rsi.value - 50) / 8
  const trendStretch =
    indicators.bollinger.trend === 'Up'
      ? 1.25
      : indicators.bollinger.trend === 'Down'
        ? -1.25
        : 0
  const volStretch = vix === null ? 0 : (15 - vix) / 5
  const breadthStretch =
    adRatio === null ? 0 : adRatio > 1.4 ? -0.75 : adRatio < 0.8 ? 1 : 0
  const premiumStretch =
    indicators.pcrValue > 1.1 ? -0.75 : indicators.pcrValue < 0.8 ? 1.25 : 0
  const base =
    21 +
    rsiStretch +
    trendStretch +
    volStretch +
    breadthStretch +
    premiumStretch
  const pe = parseFloat(clamp(base, 16, 30).toFixed(1))
  const label =
    pe < 18
      ? 'Synthetic undervaluation'
      : pe > 24
        ? 'Synthetic overvaluation'
        : 'Synthetic fair value'
  return { pe, label }
}
