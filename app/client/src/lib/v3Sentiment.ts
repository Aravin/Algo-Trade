// V3 macro sentiment — ported from app/core/src/cron.ts + shared/getMarketSentiment.ts

export type GlobalSentiment = 'bullish' | 'bearish' | 'neutral'
export type NiftySentiment =
  | 'very bullish'
  | 'bullish'
  | 'neutral'
  | 'bearish'
  | 'very bearish'
export type PcrZone = 'buy' | 'sell' | 'neutral' | 'overbought' | 'oversold'
export type V3OrderType = 'buy' | 'sell' | 'hold'

interface McMarketItem {
  symbol: string
  technical_rating?: string
  change_per?: number
  [key: string]: unknown
}

export function transformGlobalData(apiData: {
  header: { name: string }[]
  dataList: { heading: string; data: unknown[][] }[]
}): McMarketItem[] {
  const result: McMarketItem[] = []
  apiData.dataList.forEach((section) => {
    if (section.data) {
      section.data.forEach((row: unknown[]) => {
        const item: McMarketItem = { symbol: '' }
        row.forEach((val, k) => {
          item[apiData.header[k]?.name ?? String(k)] = val
        })
        result.push(item)
      })
    }
  })
  return result
}

// Symbols to exclude from global sentiment scoring (none currently needed for Upstox)
const SKIP_SYMBOLS: string[] = []

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
const globalNiftyMapping = [
  { globalSentiment: 'bearish', marketSentiment: 'very bearish', canTrade: 1 },
  { globalSentiment: 'bearish', marketSentiment: 'bearish', canTrade: 1 },
  { globalSentiment: 'bearish', marketSentiment: 'neutral', canTrade: 1 },
  { globalSentiment: 'bearish', marketSentiment: 'bullish', canTrade: 0 },
  { globalSentiment: 'bearish', marketSentiment: 'very bullish', canTrade: 0 },
  { globalSentiment: 'neutral', marketSentiment: 'very bearish', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'bearish', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'neutral', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'bullish', canTrade: 1 },
  { globalSentiment: 'neutral', marketSentiment: 'very bullish', canTrade: 1 },
  { globalSentiment: 'bullish', marketSentiment: 'very bearish', canTrade: 0 },
  { globalSentiment: 'bullish', marketSentiment: 'bearish', canTrade: 0 },
  { globalSentiment: 'bullish', marketSentiment: 'neutral', canTrade: 1 },
  { globalSentiment: 'bullish', marketSentiment: 'bullish', canTrade: 1 },
  { globalSentiment: 'bullish', marketSentiment: 'very bullish', canTrade: 1 },
]

const marketStrategyMapping: {
  marketSentiment: string
  putCallRatio: string
  orderType: string | null
}[] = [
  {
    marketSentiment: 'very bearish',
    putCallRatio: 'oversold',
    orderType: 'buy',
  },
  { marketSentiment: 'bearish', putCallRatio: 'oversold', orderType: 'buy' },
  { marketSentiment: 'neutral', putCallRatio: 'oversold', orderType: 'buy' },
  { marketSentiment: 'bullish', putCallRatio: 'oversold', orderType: 'buy' },
  {
    marketSentiment: 'very bullish',
    putCallRatio: 'oversold',
    orderType: 'buy',
  },
  { marketSentiment: 'very bearish', putCallRatio: 'sell', orderType: 'sell' },
  { marketSentiment: 'bearish', putCallRatio: 'sell', orderType: 'sell' },
  { marketSentiment: 'neutral', putCallRatio: 'sell', orderType: 'sell' },
  { marketSentiment: 'bullish', putCallRatio: 'sell', orderType: null },
  { marketSentiment: 'very bullish', putCallRatio: 'sell', orderType: null },
  {
    marketSentiment: 'very bearish',
    putCallRatio: 'neutral',
    orderType: 'sell',
  },
  { marketSentiment: 'bearish', putCallRatio: 'neutral', orderType: 'sell' },
  { marketSentiment: 'neutral', putCallRatio: 'neutral', orderType: 'hold' },
  { marketSentiment: 'bullish', putCallRatio: 'neutral', orderType: 'buy' },
  {
    marketSentiment: 'very bullish',
    putCallRatio: 'neutral',
    orderType: 'buy',
  },
  { marketSentiment: 'very bearish', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'bearish', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'neutral', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'bullish', putCallRatio: 'buy', orderType: 'buy' },
  { marketSentiment: 'very bullish', putCallRatio: 'buy', orderType: 'buy' },
  {
    marketSentiment: 'very bearish',
    putCallRatio: 'overbought',
    orderType: 'sell',
  },
  { marketSentiment: 'bearish', putCallRatio: 'overbought', orderType: 'sell' },
  { marketSentiment: 'neutral', putCallRatio: 'overbought', orderType: 'sell' },
  { marketSentiment: 'bullish', putCallRatio: 'overbought', orderType: 'sell' },
  {
    marketSentiment: 'very bullish',
    putCallRatio: 'overbought',
    orderType: 'sell',
  },
]

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
