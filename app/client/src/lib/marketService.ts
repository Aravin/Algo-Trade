import type {
  Candle,
  OptionData,
  IndicatorsResult,
  V3OrderType,
  VrdData,
  UpstoxNewsItem,
  NewsAlert,
  NiftySentiment,
  UnderlyingSymbol,
} from '@/lib/types'
import { UNDERLYING_INSTRUMENT_KEYS } from '@/lib/types'
import {
  evaluateGlobalSentiment,
  evaluatePCR,
  getV3Signal,
} from '@/lib/v3Sentiment'
import { classifyNews } from '@/lib/vrdSignals'
import {
  evaluateNiftySentimentFromAdvanceCount,
  computeProxyFlow,
  computeProxyValuation,
  computeMMI,
  computeStraddleIV,
} from './syntheticCalculators'

export type SourceStatus = 'ok' | 'error' | 'stale' | 'pending' | 'unknown'

export interface BotLog {
  id: string
  ts: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source: string
  msg: string
}

export interface GlobalIndexItem {
  symbol: string
  last_price: number
  change_per: number
  net_change?: number
  [key: string]: unknown
}

export function mkLog(
  level: BotLog['level'],
  source: string,
  msg: string,
): BotLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    level,
    source,
    msg,
  }
}

// ─── Safe JSON fetch — returns [data, null] or [null, errorMsg] ───────────────
export async function safeFetch<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<[T | null, string | null]> {
  try {
    const res = await fetch(input, init)
    const data = (await res.json()) as
      | T
      | {
          error?: string
          message?: string
          errors?: {
            message?: string
            errorCode?: string
            error_code?: string
          }[]
        }
    if (!res.ok) {
      const errData = data as {
        error?: string
        code?: string
        message?: string
        errors?: { message?: string; errorCode?: string; error_code?: string }[]
      }
      const rawDetail =
        errData.error ??
        errData.message ??
        errData.errors
          ?.map((error) => error.message ?? error.errorCode ?? error.error_code)
          .filter(Boolean)
          .join(', ')
      const codePrefix = errData.code ? `[${errData.code}] ` : ''
      const detail = rawDetail
        ? `${codePrefix}${rawDetail}`
        : errData.code
          ? `[${errData.code}]`
          : ''
      return [
        null,
        detail
          ? `HTTP ${res.status} ${res.statusText}: ${detail}`
          : `HTTP ${res.status} ${res.statusText}`,
      ]
    }
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      (data as { error?: string }).error
    ) {
      return [null, String((data as { error: string }).error)]
    }
    return [data as T, null]
  } catch (e) {
    return [null, (e as Error).message]
  }
}

// ─── Market Sentiment data (replaces VRD fetch) ───────────────────────────────
export async function fetchMarketSentiment(
  token: string,
  addLog: (l: BotLog) => void,
  sourceUpdate: (k: string, s: SourceStatus) => void,
  optionChain: OptionData[],
  indicators: IndicatorsResult,
  breadth: {
    advances: number
    declines: number
    ratio: number
    total: number
  } | null,
  giftNifty: VrdData['giftNifty'],
): Promise<VrdData> {
  sourceUpdate('vix', 'pending')
  sourceUpdate('upstox/fii', 'pending')
  sourceUpdate('upstox/dii', 'pending')
  sourceUpdate('upstox/pcr', 'pending')
  sourceUpdate('upstox/max-pain', 'pending')
  sourceUpdate('synthetic/value', 'pending')
  sourceUpdate('upstox/news', 'pending')

  const latestExpiry = optionChain[0]?.expiry ?? ''

  const [vixRes, fiiRes, diiRes, pcrRes, maxPainRes, newsRes] =
    await Promise.allSettled([
      safeFetch<{ vix: number | null }>('/api/market/vix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
      safeFetch<{
        status: string
        data?: Record<
          string,
          {
            time_stamp: number
            total_long_contracts: number
            total_short_contracts: number
            buy_amount: number
            sell_amount: number
          }[]
        >
      }>('/api/market/upstox/fii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
      safeFetch<{
        status: string
        data?: Record<
          string,
          {
            time_stamp: number
            buy_amount: number
            sell_amount: number
          }[]
        >
      }>('/api/market/upstox/dii', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
      safeFetch<{
        value: number | null
      }>('/api/market/upstox/pcr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, expiry: latestExpiry }),
      }),
      safeFetch<{
        status: string
        data?: {
          max_pain: number
        }
      }>('/api/market/upstox/max-pain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, expiry: latestExpiry }),
      }),
      safeFetch<{
        status: string
        data?: Record<string, UpstoxNewsItem[]>
      }>('/api/market/upstox/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          category: 'instrument_keys',
          instrumentKeys: 'NSE_INDEX|Nifty 50',
        }),
      }),
    ])

  // VIX
  let vix: number | null = null
  if (vixRes.status === 'fulfilled' && !vixRes.value[1]) {
    vix = vixRes.value[0]?.vix ?? null
    addLog(
      mkLog(
        vix !== null ? 'info' : 'warn',
        'vix',
        vix !== null ? 'VIX=' + vix : 'VIX returned null',
      ),
    )
    sourceUpdate('vix', vix !== null ? 'ok' : 'error')
  } else {
    const err =
      vixRes.status === 'fulfilled'
        ? (vixRes.value[1] ?? 'unknown')
        : 'fetch failed'
    addLog(mkLog('error', 'vix', err))
    sourceUpdate('vix', 'error')
  }

  // FII
  let fiiLongShort: {
    longPct: number | null
    shortPct: number | null
    shortPctTrend: 'Rising' | 'Falling' | 'Stable' | null
  } | null = null
  let fiiPositioning: {
    netPosition: number | null
    consecutiveShortDays: number | null
  } | null = null

  if (
    fiiRes.status === 'fulfilled' &&
    !fiiRes.value[1] &&
    fiiRes.value[0]?.data
  ) {
    const fiiData = fiiRes.value[0].data
    const indexFutures = fiiData['NSE_FO|INDEX_FUTURES'] ?? []
    const sortedFii = [...indexFutures].sort(
      (a, b) => b.time_stamp - a.time_stamp,
    )
    const latestFii = sortedFii[0]

    if (latestFii) {
      const long = latestFii.total_long_contracts ?? 0
      const short = latestFii.total_short_contracts ?? 0
      const total = long + short

      if (total > 0) {
        let shortPctTrend: 'Rising' | 'Falling' | 'Stable' | null = null
        if (sortedFii.length >= 2) {
          const getShortPct = (entry: (typeof sortedFii)[0]) => {
            const l = entry.total_long_contracts ?? 0
            const s = entry.total_short_contracts ?? 0
            return l + s > 0 ? (s / (l + s)) * 100 : 0
          }
          const todayShortPct = getShortPct(sortedFii[0])
          const comparisonEntry = sortedFii[Math.min(sortedFii.length - 1, 3)]
          const pastShortPct = getShortPct(comparisonEntry)

          if (todayShortPct - pastShortPct > 1.5) {
            shortPctTrend = 'Rising'
          } else if (pastShortPct - todayShortPct > 1.5) {
            shortPctTrend = 'Falling'
          } else {
            shortPctTrend = 'Stable'
          }
        }

        fiiLongShort = {
          longPct: parseFloat(((long / total) * 100).toFixed(1)),
          shortPct: parseFloat(((short / total) * 100).toFixed(1)),
          shortPctTrend,
        }
        fiiPositioning = {
          netPosition: long - short,
          consecutiveShortDays: 0,
        }

        let shortDays = 0
        for (const entry of sortedFii) {
          const entryNet =
            (entry.total_long_contracts ?? 0) -
            (entry.total_short_contracts ?? 0)
          if (entryNet < 0) {
            shortDays++
          } else {
            break
          }
        }
        fiiPositioning.consecutiveShortDays = shortDays || null

        addLog(
          mkLog(
            'info',
            'fii',
            `FII Futures: L=${fiiLongShort.longPct}% S=${fiiLongShort.shortPct}% (${fiiLongShort.shortPctTrend}) Net=${fiiPositioning.netPosition}`,
          ),
        )
        sourceUpdate('upstox/fii', 'ok')
      } else {
        sourceUpdate('upstox/fii', 'error')
      }
    } else {
      sourceUpdate('upstox/fii', 'error')
    }
  } else {
    sourceUpdate('upstox/fii', 'error')
  }

  // Fallback to proxy/synthetic FII if Upstox FII failed
  const niftyLtp = optionChain[0]?.underlying_spot_price ?? 0
  if (!fiiLongShort || !fiiPositioning) {
    const proxyFlow = computeProxyFlow(optionChain, niftyLtp)
    fiiLongShort =
      proxyFlow.longPct !== null && proxyFlow.shortPct !== null
        ? {
            longPct: proxyFlow.longPct,
            shortPct: proxyFlow.shortPct,
            shortPctTrend: 'Stable',
          }
        : null
    fiiPositioning =
      proxyFlow.netPosition !== null
        ? {
            netPosition: proxyFlow.netPosition,
            consecutiveShortDays: proxyFlow.consecutiveShortDays,
          }
        : null
    addLog(
      mkLog(
        'warn',
        'fii',
        'FII API unavailable; fell back to synthetic flow options estimate',
      ),
    )
    sourceUpdate('upstox/fii', 'stale')
  }

  // DII
  if (
    diiRes.status === 'fulfilled' &&
    !diiRes.value[1] &&
    diiRes.value[0]?.data
  ) {
    const diiData = diiRes.value[0].data
    const cashList = diiData['NSE_EQ|CASH'] ?? []
    const latestDii = [...cashList].sort(
      (a, b) => b.time_stamp - a.time_stamp,
    )[0]
    if (latestDii) {
      const netCash = (latestDii.buy_amount ?? 0) - (latestDii.sell_amount ?? 0)
      addLog(
        mkLog(
          'info',
          'dii',
          `DII Cash Net: ${(netCash / 10000000).toFixed(2)} Cr`,
        ),
      )
      sourceUpdate('upstox/dii', 'ok')
    } else {
      sourceUpdate('upstox/dii', 'error')
    }
  } else {
    sourceUpdate('upstox/dii', 'error')
  }

  // PCR
  let officialPcr: number | null = null
  if (pcrRes.status === 'fulfilled' && !pcrRes.value[1]) {
    officialPcr = pcrRes.value[0]?.value ?? null
    if (officialPcr !== null) {
      addLog(
        mkLog('info', 'upstox/pcr', `Upstox PCR=${officialPcr.toFixed(3)}`),
      )
      sourceUpdate('upstox/pcr', 'ok')
    } else {
      sourceUpdate('upstox/pcr', 'error')
    }
  } else {
    sourceUpdate('upstox/pcr', 'error')
  }

  const effectivePcr = officialPcr ?? indicators.pcrValue
  addLog(mkLog('info', 'pcr', 'Option PCR=' + effectivePcr.toFixed(3)))

  // Max Pain
  let maxPain: number | null = null
  if (maxPainRes.status === 'fulfilled' && !maxPainRes.value[1]) {
    maxPain = maxPainRes.value[0]?.data?.max_pain ?? null
    if (maxPain !== null) {
      addLog(
        mkLog('info', 'upstox/max-pain', `Upstox Max Pain Strike=${maxPain}`),
      )
      sourceUpdate('upstox/max-pain', 'ok')
    } else {
      sourceUpdate('upstox/max-pain', 'error')
    }
  } else {
    sourceUpdate('upstox/max-pain', 'error')
  }

  // Support and Resistance walls from optionChain Open Interest
  let supportWall: number | null = null
  let resistanceWall: number | null = null
  if (optionChain.length > 0) {
    let maxPutOi = -1
    let maxCallOi = -1
    for (const strike of optionChain) {
      const putOi = strike.put_options?.market_data?.oi ?? 0
      const callOi = strike.call_options?.market_data?.oi ?? 0
      if (putOi > maxPutOi) {
        maxPutOi = putOi
        supportWall = strike.strike_price
      }
      if (callOi > maxCallOi) {
        maxCallOi = callOi
        resistanceWall = strike.strike_price
      }
    }
  }

  // Compute straddle IV from option chain
  const straddleIv = computeStraddleIV(optionChain, niftyLtp, vix)
  addLog(
    mkLog(
      'debug',
      'straddle-iv',
      'ATM IV=' +
        straddleIv.currentIv +
        ' vs VIX=' +
        vix +
        ' -> ' +
        (straddleIv.percentAboveAvg !== null
          ? straddleIv.percentAboveAvg.toFixed(1)
          : 'null') +
        '% above avg',
    ),
  )

  const adRatio = breadth?.ratio ?? null
  const proxyValue = computeProxyValuation(niftyLtp, indicators, vix, adRatio)
  sourceUpdate('synthetic/value', 'ok')

  const niftyPe = { pe: proxyValue.pe, label: proxyValue.label }
  addLog(
    mkLog(
      'info',
      'synthetic/value',
      'Computed proxy Nifty PE valuation=' +
        proxyValue.pe +
        ' (' +
        proxyValue.label +
        ')',
    ),
  )

  // Synthetic MMI
  const mmi = computeMMI(vix, indicators.rsi.value, effectivePcr)
  addLog(
    mkLog(
      'info',
      'mmi',
      'Computed proxy MMI score=' +
        mmi.score +
        ' (' +
        mmi.label +
        ') [vix=' +
        vix +
        ' rsi=' +
        indicators.rsi.value.toFixed(1) +
        ' pcr=' +
        effectivePcr.toFixed(3) +
        ']',
    ),
  )

  // News Alerts
  let newsAlerts: NewsAlert[] = []
  if (newsRes.status === 'fulfilled' && !newsRes.value[1]) {
    const rawNews = newsRes.value[0]?.data ?? {}
    const newsItems = Array.isArray(rawNews)
      ? rawNews
      : Object.values(rawNews).flat()
    try {
      newsAlerts = classifyNews(newsItems)
      addLog(
        mkLog(
          'info',
          'upstox/news',
          `Fetched ${newsItems.length} news articles; classified ${newsAlerts.length} event alerts.`,
        ),
      )
      sourceUpdate('upstox/news', 'ok')
    } catch (e) {
      addLog(
        mkLog('error', 'upstox/news', 'classification failed: ' + String(e)),
      )
      sourceUpdate('upstox/news', 'error')
    }
  } else {
    sourceUpdate('upstox/news', 'error')
  }

  return {
    mmi: { score: mmi.score, label: mmi.label },
    advancesDeclines:
      breadth !== null && breadth.advances !== null
        ? {
            advances: breadth.advances,
            declines: breadth.declines,
            ratio: breadth.ratio,
            label: null,
          }
        : null,
    fiiLongShort: fiiLongShort,
    fiiPositioning: fiiPositioning,
    pcr:
      effectivePcr > 0
        ? {
            value: parseFloat(effectivePcr.toFixed(3)),
            zone:
              effectivePcr >= 1.6
                ? 'Overbought'
                : effectivePcr >= 1.0
                  ? 'Bullish'
                  : effectivePcr > 0.7
                    ? 'Neutral'
                    : 'Bearish',
          }
        : null,
    straddleIv: {
      elevated:
        straddleIv.percentAboveAvg !== null && straddleIv.percentAboveAvg > 30,
      percentAboveAvg: straddleIv.percentAboveAvg,
    },
    niftyPe: niftyPe,
    vix,
    giftNifty,
    supportWall,
    resistanceWall,
    maxPain,
    newsAlerts,
    fetchedAt: new Date().toISOString(),
  }
}

// ─── Market fetch ─────────────────────────────────────────────────────────────
export async function fetchMarket(
  token: string,
  addLog: (l: BotLog) => void,
  sourceUpdate: (k: string, s: SourceStatus) => void,
  underlyingSymbol: UnderlyingSymbol = 'NIFTY 50',
): Promise<{
  underlyingSymbol: UnderlyingSymbol
  candles: Candle[]
  optionChain: OptionData[]
  v3: V3OrderType
  breadth: {
    advances: number
    declines: number
    ratio: number
    total: number
  } | null
  globalIndices: GlobalIndexItem[]
  giftNifty: VrdData['giftNifty']
}> {
  const targetInstrumentKey =
    UNDERLYING_INSTRUMENT_KEYS[underlyingSymbol] ?? 'NSE_INDEX|Nifty 50'

  addLog(
    mkLog(
      'debug',
      'market',
      `fetching candles + breadth + option contracts for ${underlyingSymbol} (${targetInstrumentKey})`,
    ),
  )

  sourceUpdate('candles', 'pending')
  sourceUpdate('breadth', 'pending')
  sourceUpdate('option-chain', 'pending')
  sourceUpdate('global-sentiment', 'pending')

  const [candleRes, breadthRes, contractsRes, globalRes] =
    await Promise.allSettled([
      safeFetch<{ data?: { candles?: Candle[] } }>(
        '/api/market/candles/intraday',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            instrumentKey: targetInstrumentKey,
            interval: '1minute',
          }),
        },
      ),
      safeFetch<{
        advances: number
        declines: number
        ratio: number
        total: number
      }>('/api/market/breadth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
      safeFetch<{
        expiries?: string[]
      }>('/api/market/option-contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, instrumentKey: targetInstrumentKey }),
      }),
      safeFetch<{
        status: string
        data?: GlobalIndexItem[]
        giftNifty: VrdData['giftNifty']
      }>('/api/market/upstox/global-indices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    ])

  // candles
  let candles: Candle[] = []
  if (candleRes.status === 'fulfilled') {
    const [data, err] = candleRes.value
    if (err) {
      addLog(mkLog('error', 'candles', `${underlyingSymbol}: ${err}`))
      sourceUpdate('candles', 'error')
    } else {
      candles = data?.data?.candles ?? []
      addLog(
        mkLog(
          'info',
          'candles',
          `${underlyingSymbol}: ${candles.length} candles loaded`,
        ),
      )
      sourceUpdate('candles', candles.length > 0 ? 'ok' : 'error')
    }
  } else {
    addLog(mkLog('error', 'candles', `${underlyingSymbol}: fetch failed`))
    sourceUpdate('candles', 'error')
  }

  // breadth
  let breadth: {
    advances: number
    declines: number
    ratio: number
    total: number
  } | null = null
  if (breadthRes.status === 'fulfilled' && !breadthRes.value[1]) {
    breadth = breadthRes.value[0]
    addLog(
      mkLog(
        'info',
        'breadth',
        'Nifty 50 A/D loaded: ' +
          breadth?.advances +
          '↑ ' +
          breadth?.declines +
          '↓ ratio=' +
          breadth?.ratio,
      ),
    )
    sourceUpdate('breadth', 'ok')
  } else {
    const err =
      breadthRes.status === 'fulfilled'
        ? (breadthRes.value[1] ?? 'unknown')
        : 'fetch failed'
    addLog(mkLog('error', 'breadth', err))
    sourceUpdate('breadth', 'error')
  }

  // option chain
  const contractsData =
    contractsRes.status === 'fulfilled' && !contractsRes.value[1]
      ? contractsRes.value[0]
      : null
  const contractsErr =
    contractsRes.status === 'fulfilled' ? contractsRes.value[1] : 'fetch failed'
  const expiryCandidates = (contractsData?.expiries ?? []).slice(0, 5)

  let optionChain: OptionData[] = []
  let optionChainError =
    contractsErr ??
    `No live expiry returned for ${underlyingSymbol} from Upstox option contracts`
  for (const candidate of expiryCandidates) {
    const [data, err] = await safeFetch<{ data?: OptionData[] }>(
      '/api/market/option-chain',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          expiryDate: candidate,
          instrumentKey: targetInstrumentKey,
        }),
      },
    )
    if (err) {
      optionChainError = candidate + ': ' + err
      addLog(
        mkLog(
          'warn',
          'option-chain',
          'expiry ' + candidate + ' failed: ' + err,
        ),
      )
      continue
    }
    const chain = data?.data ?? []
    if (!chain.length) {
      optionChainError = candidate + ': empty chain'
      addLog(
        mkLog(
          'warn',
          'option-chain',
          'expiry ' + candidate + ' returned empty chain',
        ),
      )
      continue
    }
    optionChain = chain
    addLog(
      mkLog(
        'info',
        'option-chain',
        `${underlyingSymbol}: ${optionChain.length} strikes loaded (expiry: ${candidate})`,
      ),
    )
    sourceUpdate('option-chain', 'ok')
    break
  }

  if (!optionChain.length) {
    addLog(mkLog('error', 'option-chain', optionChainError))
    sourceUpdate('option-chain', 'error')
  }

  // Global Sentiment
  let globalSentiment: ReturnType<typeof evaluateGlobalSentiment> = 'neutral'
  let globalSentimentFetched = false
  let globalIndices: GlobalIndexItem[] = []
  let giftNifty: VrdData['giftNifty'] = null
  if (globalRes.status === 'fulfilled' && !globalRes.value[1]) {
    const gData = globalRes.value[0]?.data ?? []
    globalIndices = gData
    globalSentiment = evaluateGlobalSentiment(gData)
    globalSentimentFetched = true
    giftNifty = globalRes.value[0]?.giftNifty ?? null
    addLog(
      mkLog(
        'info',
        'global-sentiment',
        `Global Indices: DJI/NASDAQ/DAX/GIFT rating = ${globalSentiment}`,
      ),
    )
    sourceUpdate('global-sentiment', 'ok')
  } else {
    const err =
      globalRes.status === 'fulfilled'
        ? (globalRes.value[1] ?? 'unknown')
        : 'fetch failed'
    addLog(mkLog('error', 'global-sentiment', err))
    sourceUpdate('global-sentiment', 'error')
  }

  // V3
  let v3: V3OrderType = 'hold'
  let niftySentiment: NiftySentiment = 'neutral'
  let pcrZone: ReturnType<typeof evaluatePCR> = 'neutral'
  let niftySentimentFetched = false
  let pcrZoneFetched = false

  if (breadth && breadth.advances !== null) {
    niftySentiment = evaluateNiftySentimentFromAdvanceCount(breadth.advances)
    niftySentimentFetched = true
  }

  const totalPut = optionChain.reduce(
    (sum, item) => sum + item.put_options.market_data.oi,
    0,
  )
  const totalCall = optionChain.reduce(
    (sum, item) => sum + item.call_options.market_data.oi,
    0,
  )
  if (totalCall > 0) {
    pcrZone = evaluatePCR(totalPut / totalCall)
    pcrZoneFetched = true
  }

  try {
    if (globalSentimentFetched || niftySentimentFetched || pcrZoneFetched) {
      v3 = getV3Signal(globalSentiment, niftySentiment, pcrZone)
      addLog(
        mkLog(
          'info',
          'v3',
          'signal=' +
            v3 +
            ' | global=' +
            globalSentiment +
            ' | nifty=' +
            niftySentiment +
            ' | pcr=' +
            pcrZone,
        ),
      )
    }
  } catch (e) {
    addLog(mkLog('error', 'v3', 'compute failed: ' + (e as Error).message))
  }

  return {
    underlyingSymbol,
    candles,
    optionChain,
    v3,
    breadth,
    globalIndices,
    giftNifty,
  }
}

export async function fetchMarketForSymbols(
  token: string,
  addLog: (l: BotLog) => void,
  sourceUpdate: (k: string, s: SourceStatus) => void,
  symbols: UnderlyingSymbol[],
): Promise<Record<UnderlyingSymbol, Awaited<ReturnType<typeof fetchMarket>>>> {
  const results = await Promise.allSettled(
    symbols.map((sym) => fetchMarket(token, addLog, sourceUpdate, sym)),
  )
  const map = {} as Record<
    UnderlyingSymbol,
    Awaited<ReturnType<typeof fetchMarket>>
  >
  results.forEach((res, idx) => {
    const sym = symbols[idx]
    if (res.status === 'fulfilled') {
      map[sym] = res.value
    }
  })
  return map
}

// ─── WebSocket Stream Utility ───────────────────────────────────────────────
export interface MarketStreamOptions {
  wsUrl: string
  onTick?: (data: unknown) => void
  onError?: (err: Event | Error) => void
  onClose?: () => void
}

export function createUpstoxMarketStream(options: MarketStreamOptions): {
  close: () => void
  send: (msg: unknown) => void
} {
  let ws: WebSocket | null = null
  try {
    ws = new WebSocket(options.wsUrl)
    ws.onmessage = (evt) => {
      try {
        const parsed = JSON.parse(evt.data as string) as unknown
        options.onTick?.(parsed)
      } catch {
        options.onTick?.(evt.data)
      }
    }
    ws.onerror = (err) => options.onError?.(err)
    ws.onclose = () => options.onClose?.()
  } catch (err) {
    options.onError?.(err as Error)
  }

  return {
    close: () => {
      if (
        ws?.readyState === WebSocket.OPEN ||
        ws?.readyState === WebSocket.CONNECTING
      ) {
        ws.close()
      }
    },
    send: (msg: unknown) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg))
      }
    },
  }
}
