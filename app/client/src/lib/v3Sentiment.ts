// V3 macro sentiment — ported from app/core/src/cron.ts + shared/getMarketSentiment.ts

import type {
  GlobalSentiment,
  NiftySentiment,
  PcrZone,
  V3OrderType,
  McMarketItem,
} from './types'
import {
  SKIP_SYMBOLS,
  globalNiftyMapping,
  marketStrategyMapping,
} from './types'

// Symbols to exclude from global sentiment scoring (none currently needed for Upstox)

export function evaluateGlobalSentiment(
  marketData: McMarketItem[],
): GlobalSentiment {
  let score = 0
  for (const item of marketData) {
    if (SKIP_SYMBOLS.includes(item.symbol)) continue
    // VRD does not include Gift Nifty in globalIndicesByRegion — no SGX double-weight needed
    const isSgx = false
    const m = isSgx ? 2 : 1

    // Inversely correlated with Indian equities (rising = bearish for Nifty)
    const upperSym = item.symbol.toUpperCase()
    const isIndicator =
      upperSym === 'USD/INR' || upperSym === 'BRENT OIL' || upperSym === 'GOLD'
    const directionMultiplier = isIndicator ? -1 : 1

    if (item.technical_rating) {
      switch (item.technical_rating) {
        case 'Very Bullish':
          score += 2 * m * directionMultiplier
          break
        case 'Bullish':
          score += 1 * m * directionMultiplier
          break
        case 'Very Bearish':
          score -= 2 * m * directionMultiplier
          break
        case 'Bearish':
          score -= 1 * m * directionMultiplier
          break
      }
    } else if (typeof item.change_per === 'number') {
      const pct = item.change_per
      if (pct >= 0.8) {
        score += 2 * m * directionMultiplier
      } else if (pct >= 0.2) {
        score += 1 * m * directionMultiplier
      } else if (pct <= -0.8) {
        score -= 2 * m * directionMultiplier
      } else if (pct <= -0.2) {
        score -= 1 * m * directionMultiplier
      }
    }
  }
  // With 13 instruments (max ~±26 range), require clear directional consensus
  if (score <= -5) return 'bearish'
  if (score >= 5) return 'bullish'
  return 'neutral'
}

export function evaluateNiftySentiment(
  data: { change_per?: number }[],
): NiftySentiment {
  const adv = data.filter((v) => (v.change_per ?? 0) > 0).length
  if (isNaN(adv)) return 'neutral'
  if (adv >= 39) return 'very bullish'
  if (adv >= 29) return 'bullish'
  if (adv >= 23) return 'neutral'
  if (adv >= 13) return 'bearish'
  return 'very bearish'
}

export function evaluatePCR(pcr: number): PcrZone {
  if (pcr >= 1.6) return 'overbought'
  if (pcr > 1) return 'buy'
  if (pcr <= 0.6) return 'oversold'
  if (pcr < 1) return 'sell'
  return 'neutral'
}

// Full mapping tables from app/core/src/shared/getMarketSentiment.ts

export function getV3Signal(
  globalSentiment: GlobalSentiment,
  niftySentiment: NiftySentiment,
  pcr: PcrZone,
): V3OrderType {
  const globalMap = globalNiftyMapping.find(
    (v) =>
      v.globalSentiment === globalSentiment &&
      v.marketSentiment === niftySentiment,
  )
  if (!globalMap?.canTrade) return 'hold'
  const strategyMap = marketStrategyMapping.find(
    (v) =>
      v.marketSentiment === niftySentiment &&
      v.putCallRatio === pcr &&
      v.orderType !== null,
  )
  return (strategyMap?.orderType as V3OrderType) ?? 'hold'
}
