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
  technical_rating: string
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
        const item: McMarketItem = { symbol: '', technical_rating: '' }
        row.forEach((val, k) => {
          item[apiData.header[k]?.name ?? String(k)] = val
        })
        result.push(item)
      })
    }
  })
  return result
}

const SKIP_SYMBOLS = [
  'CCMP:IND',
  'SPX:IND',
  'sg;STII',
  'tw;IXTA',
  'th;SETI',
  'id;JSC',
]

export function evaluateGlobalSentiment(
  marketData: McMarketItem[],
): GlobalSentiment {
  let score = 0
  for (const item of marketData) {
    if (SKIP_SYMBOLS.includes(item.symbol)) continue
    const m = item.symbol === 'in;gsx' ? 2 : 1
    switch (item.technical_rating) {
      case 'Very Bullish':
        score += 2 * m
        break
      case 'Bullish':
        score += 1 * m
        break
      case 'Very Bearish':
        score -= 2 * m
        break
      case 'Bearish':
        score -= 1 * m
        break
    }
  }
  if (score <= -8) return 'bullish'
  if (score >= 8) return 'bearish'
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
  if (pcr > 1 && pcr < 1.6) return 'buy'
  if (pcr >= 1.6) return 'overbought'
  if (pcr < 1 && pcr > 0.6) return 'sell'
  if (pcr <= 0.6) return 'oversold'
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
