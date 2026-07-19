// Institutional signal scoring — converts live Upstox + synthetic data into scored points

import type { VrdScore } from './types'

// ─── MMI ─────────────────────────────────────────────────────────────────────
export function scoreMMI(
  score: number | null,
): VrdScore & { contrarian: boolean; direction: 'BULL' | 'BEAR' | 'NEUTRAL' } {
  if (score === null)
    return {
      score: 0,
      max: 3,
      label: 'MMI unavailable',
      contrarian: false,
      direction: 'NEUTRAL',
    }
  let points: number
  let label: string
  let direction: 'BULL' | 'BEAR' | 'NEUTRAL'
  let contrarian = false
  if (score < 30) {
    points = 3
    label = 'Extreme Fear — contrarian BUY'
    direction = 'BULL'
    contrarian = true
  } else if (score < 50) {
    points = 1
    label = 'Fear — moderate buy signal'
    direction = 'BULL'
  } else if (score < 70) {
    points = -1
    label = 'Greed — be cautious'
    direction = 'BEAR'
  } else {
    points = -3
    label = 'Extreme Greed — avoid entries'
    direction = 'BEAR'
    contrarian = true
  }
  return {
    score: points,
    max: 3,
    label,
    contrarian,
    direction,
    detail: `MMI: ${score}`,
  }
}

// ─── A/D Ratio ────────────────────────────────────────────────────────────────
export function scoreADRatio(
  advances: number | null,
  declines: number | null,
  ratio: number | null,
): VrdScore & { direction: 'BULL' | 'BEAR' | 'NEUTRAL' } {
  if (ratio === null)
    return { score: 0, max: 3, label: 'A/D unavailable', direction: 'NEUTRAL' }
  let points: number
  let direction: 'BULL' | 'BEAR' | 'NEUTRAL'
  let label: string
  if (ratio >= 2.0) {
    points = 3
    direction = 'BULL'
    label = `Breadth Thrust A/D ${ratio.toFixed(1)}`
  } else if (ratio >= 1.2) {
    points = 2
    direction = 'BULL'
    label = `Healthy Breadth A/D ${ratio.toFixed(1)}`
  } else if (ratio >= 0.8) {
    points = 0
    direction = 'NEUTRAL'
    label = `Balanced A/D ${ratio.toFixed(1)}`
  } else if (ratio >= 0.5) {
    points = -2
    direction = 'BEAR'
    label = `Weak Breadth A/D ${ratio.toFixed(1)}`
  } else {
    points = -3
    direction = 'BEAR'
    label = `Persistent Weakness A/D ${ratio.toFixed(1)}`
  }
  const detail =
    advances !== null && declines !== null
      ? `${advances}↑ ${declines}↓`
      : undefined
  return { score: points, max: 3, label, direction, detail }
}

// ─── FII Long/Short ──────────────────────────────────────────────────────────
export function scoreFiiLongShort(
  longPct: number | null,
  shortPct: number | null,
): VrdScore & { contrarian: boolean; direction: 'BULL' | 'BEAR' | 'NEUTRAL' } {
  if (longPct === null || shortPct === null) {
    return {
      score: 0,
      max: 3,
      label: 'FII data unavailable',
      contrarian: false,
      direction: 'NEUTRAL',
    }
  }
  let points: number
  let label: string
  let contrarian = false
  let direction: 'BULL' | 'BEAR' | 'NEUTRAL'
  if (shortPct >= 80) {
    points = 3
    contrarian = true
    direction = 'BULL'
    label = `FII ${shortPct.toFixed(1)}% short — short-cover risk`
  } else if (shortPct >= 60) {
    points = 2
    direction = 'BULL'
    label = `FII mostly short (${shortPct.toFixed(1)}%)`
  } else if (longPct >= 60) {
    points = 2
    direction = 'BULL'
    label = `FII momentum long (${longPct.toFixed(1)}%)`
  } else {
    points = 0
    direction = 'NEUTRAL'
    label = `FII balanced L:${longPct.toFixed(1)}% S:${shortPct.toFixed(1)}%`
  }
  return { score: points, max: 3, label, contrarian, direction }
}

// ─── FII Net Positioning ─────────────────────────────────────────────────────
export function scoreFiiPositioning(
  netPosition: number | null,
  consecutiveShortDays: number | null,
): VrdScore {
  if (netPosition === null)
    return { score: 0, max: 1, label: 'FII positioning unavailable' }
  const formatted = Math.abs(netPosition).toLocaleString('en-IN')
  const direction = netPosition < 0 ? '-' : '+'
  const label =
    consecutiveShortDays !== null
      ? `FII net ${direction}${formatted} (${consecutiveShortDays} short days)`
      : `FII net ${direction}${formatted}`
  let score = 0
  if (consecutiveShortDays !== null && consecutiveShortDays >= 15) {
    score = 1
  } else if (netPosition > 50000) {
    score = 1
  } else if (netPosition < -50000) {
    score = -1
  }
  return { score, max: 1, label }
}

// ─── Nifty PE ────────────────────────────────────────────────────────────────
export function scoreNiftyPE(
  pe: number | null,
): VrdScore & { bias: 'CE' | 'PE' | 'NEUTRAL' } {
  if (pe === null)
    return { score: 0, max: 2, label: 'PE unavailable', bias: 'NEUTRAL' }
  let score: number
  let bias: 'CE' | 'PE' | 'NEUTRAL'
  let label: string
  if (pe > 28) {
    score = -2
    bias = 'PE'
    label = `PE ${pe} — Overvalued, avoid CE`
  } else if (pe > 24) {
    score = 0
    bias = 'PE'
    label = `PE ${pe} — Slightly overvalued`
  } else if (pe >= 18) {
    score = 1
    bias = 'NEUTRAL'
    label = `PE ${pe} — Fair value`
  } else {
    score = 2
    bias = 'CE'
    label = `PE ${pe} — Undervalued, CE favoured`
  }
  return { score, max: 2, label, bias }
}

// ─── VIX ─────────────────────────────────────────────────────────────────────
export function scoreVix(vix: number | null): {
  tradeable: boolean
  preferSell: boolean
  label: string
} {
  if (vix === null)
    return { tradeable: true, preferSell: false, label: 'VIX unknown' }
  if (vix > 25)
    return {
      tradeable: false,
      preferSell: false,
      label: `VIX ${vix} > 25 — too volatile`,
    }
  if (vix < 10)
    return {
      tradeable: false,
      preferSell: false,
      label: `VIX ${vix} < 10 — no volatility`,
    }
  if (vix >= 18)
    return {
      tradeable: true,
      preferSell: true,
      label: `VIX ${vix} — high vol, prefer sell`,
    }
  return { tradeable: true, preferSell: false, label: `VIX ${vix} — normal` }
}

// ─── Straddle IV ─────────────────────────────────────────────────────────────
export function scoreStraddleIV(
  percentAboveAvg: number | null,
): VrdScore & { preferBuy: boolean } {
  if (percentAboveAvg === null)
    return { score: 0, max: 1, label: 'IV unavailable', preferBuy: false }
  if (percentAboveAvg > 30)
    return {
      score: -1,
      max: 1,
      label: `IV ${percentAboveAvg.toFixed(1)}% above avg — prefer sell`,
      preferBuy: false,
    }
  if (percentAboveAvg > 0)
    return { score: 0, max: 1, label: 'IV slightly elevated', preferBuy: false }
  return {
    score: 1,
    max: 1,
    label: 'IV below avg — buying cheap',
    preferBuy: true,
  }
}
