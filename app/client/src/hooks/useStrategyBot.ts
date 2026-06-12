import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react'
import {
  computeAllIndicators,
  getOtmStrike,
  type Candle,
  type OptionData,
  type IndicatorsResult,
} from '@/lib/indicators'
import {
  evaluateGlobalSentiment,
  evaluateNiftySentiment,
  evaluatePCR,
  getV3Signal,
  type V3OrderType,
} from '@/lib/v3Sentiment'
import { notify } from '@/lib/notifications'
import {
  runHardStopChecks,
  getFinalSignal,
  shouldExit,
  type AllSignalData,
  type FinalSignal,
  type ActivePosition,
  type PositionLeg,
} from '@/lib/strategyEngine'
import { getStrategyConfig } from '@/lib/strategyConfig'
import {
  fetchPaperAccount,
  type ExecutionMode,
  type PaperAccountSummary,
  type PaperTrade,
} from '@/lib/paperTrading'
import type { VrdData } from '@/lib/vrdSignals'

// ─── Types ─────────────────────────────────────────────────────────────────────
export type BotState = 'IDLE' | 'RUNNING' | 'ORDERED' | 'STOPPED'
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

export interface BotStatus {
  state: BotState
  position: ActivePosition | null
  indicators: IndicatorsResult | null
  vrdData: VrdData | null
  allSignalData: AllSignalData | null
  finalSignal: FinalSignal | null
  hardStop: {
    blocked: boolean
    blockedDirection?: 'CE' | 'PE' | 'BOTH' | 'NONE'
    reasons: string[]
  }
  lastUpdated: string | null
  error: string | null
  tradesCount: number
  logs: BotLog[]
  sourceStatus: Record<string, SourceStatus>
  globalIndices: GlobalIndexItem[] | null
}

// ─── LocalStorage keys ─────────────────────────────────────────────────────────
const KEYS = {
  state: 'algo-trade:bot-state',
  position: 'algo-trade:bot-position',
  trades: 'algo-trade:bot-trades-today',
  date: 'algo-trade:bot-trades-date',
  vrdCache: 'algo-trade:vrd-cache', // { data: VrdData; savedAt: string }
  logs: 'algo-trade:bot-logs', // BotLog[] (last 200)
  snapshot: 'algo-trade:bot-snapshot',
  proxyHistory: 'algo-trade:proxy-history',
}
const MAX_LOGS = 200
const VRD_CACHE_MAX_MS = 30 * 60 * 1000 // 30 minutes

type BotSnapshot = Pick<
  BotStatus,
  | 'indicators'
  | 'vrdData'
  | 'allSignalData'
  | 'finalSignal'
  | 'hardStop'
  | 'lastUpdated'
  | 'sourceStatus'
  | 'globalIndices'
>

// ─── Log factory ───────────────────────────────────────────────────────────────
function mkLog(level: BotLog['level'], source: string, msg: string): BotLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    level,
    source,
    msg,
  }
}

// ─── Safe JSON fetch — returns [data, null] or [null, errorMsg] ───────────────
async function safeFetch<T>(
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
        message?: string
        errors?: { message?: string; errorCode?: string; error_code?: string }[]
      }
      const detail =
        errData.error ??
        errData.message ??
        errData.errors
          ?.map((error) => error.message ?? error.errorCode ?? error.error_code)
          .filter(Boolean)
          .join(', ')
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

// ─── Persist & load logs ───────────────────────────────────────────────────────
function loadLogs(): BotLog[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.logs) ?? '[]') as BotLog[]
  } catch {
    return []
  }
}
function saveLogs(logs: BotLog[]) {
  try {
    localStorage.setItem(KEYS.logs, JSON.stringify(logs.slice(-MAX_LOGS)))
  } catch {
    /* ignore */
  }
}

// ─── Persist & load VRD cache ─────────────────────────────────────────────────
function saveVrdCache(data: VrdData) {
  try {
    localStorage.setItem(
      KEYS.vrdCache,
      JSON.stringify({ data, savedAt: new Date().toISOString() }),
    )
  } catch {
    /* ignore */
  }
}
function loadVrdCache(): VrdData | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.vrdCache) ?? 'null') as {
      data: VrdData
      savedAt: string
    } | null
    if (!raw) return null
    const ageMs = Date.now() - new Date(raw.savedAt).getTime()
    if (ageMs > VRD_CACHE_MAX_MS) return null
    return raw.data
  } catch {
    return null
  }
}

function saveSnapshot(snapshot: BotSnapshot) {
  try {
    localStorage.setItem(KEYS.snapshot, JSON.stringify(snapshot))
  } catch {
    /* ignore */
  }
}

function loadSnapshot(): Partial<BotSnapshot> {
  try {
    return (
      (JSON.parse(
        localStorage.getItem(KEYS.snapshot) ?? 'null',
      ) as BotSnapshot | null) ?? {}
    )
  } catch {
    return {}
  }
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

function updateProxyHistory(netPosition: number): number | null {
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

// ─── Load persisted bot state ─────────────────────────────────────────────────
function loadPersisted(): Partial<BotStatus> {
  try {
    const rawState = localStorage.getItem(KEYS.state) as BotState | null
    const position = JSON.parse(
      localStorage.getItem(KEYS.position) ?? 'null',
    ) as ActivePosition | null
    const savedDate = localStorage.getItem(KEYS.date)
    const today = new Date().toISOString().split('T')[0]
    const tradesCount =
      savedDate === today
        ? parseInt(localStorage.getItem(KEYS.trades) ?? '0')
        : 0
    if (savedDate !== today) {
      localStorage.setItem(KEYS.date, today)
      localStorage.setItem(KEYS.trades, '0')
    }
    const state: BotState =
      rawState === 'RUNNING' || rawState === 'ORDERED' ? rawState : 'IDLE'
    const vrdData = loadVrdCache()
    const logs = loadLogs()
    const snapshot = loadSnapshot()
    const sourceStatus =
      state === 'RUNNING' || state === 'ORDERED'
        ? (snapshot.sourceStatus ?? {})
        : (Object.fromEntries(
            Object.keys(snapshot.sourceStatus ?? {}).map((key) => [
              key,
              'unknown' satisfies SourceStatus,
            ]),
          ) as Record<string, SourceStatus>)
    return {
      state,
      position,
      tradesCount,
      vrdData,
      logs,
      ...snapshot,
      sourceStatus,
    }
  } catch {
    return {
      state: 'IDLE',
      position: null,
      tradesCount: 0,
      vrdData: null,
      logs: [],
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function evaluateNiftySentimentFromAdvanceCount(
  advances: number | null,
): ReturnType<typeof evaluateNiftySentiment> {
  if (advances === null || Number.isNaN(advances)) return 'neutral'
  if (advances >= 39) return 'very bullish'
  if (advances >= 29) return 'bullish'
  if (advances >= 23) return 'neutral'
  if (advances >= 13) return 'bearish'
  return 'very bearish'
}

function isStaticIpRestrictionError(
  message: string | null | undefined,
): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes('static ip restrictions') ||
    normalized.includes('no static ip has been configured')
  )
}

function isPaperPosition(position: ActivePosition | null): boolean {
  return position?.executionMode === 'paper'
}

// ─── Synthetic MMI from Upstox data ──────────────────────────────────────────
function computeMMI(
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
function computeStraddleIV(
  optionChain: import('@/lib/indicators').OptionData[],
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

function getAtmWindow(
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

function computeProxyFlow(optionChain: OptionData[], niftyLtp: number) {
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

function computeProxyValuation(
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

// ─── Market Sentiment data (replaces VRD fetch) ───────────────────────────────
async function fetchMarketSentiment(
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
): Promise<VrdData> {
  sourceUpdate('vix', 'pending')
  sourceUpdate('upstox/fii', 'pending')
  sourceUpdate('upstox/dii', 'pending')
  sourceUpdate('upstox/pcr', 'pending')
  sourceUpdate('upstox/max-pain', 'pending')
  sourceUpdate('synthetic/value', 'pending')

  const latestExpiry = optionChain[0]?.expiry ?? ''

  const [vixRes, fiiRes, diiRes, pcrRes, maxPainRes] = await Promise.allSettled(
    [
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
    ],
  )

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
  let fiiLongShort: { longPct: number | null; shortPct: number | null } | null =
    null
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
        fiiLongShort = {
          longPct: parseFloat(((long / total) * 100).toFixed(1)),
          shortPct: parseFloat(((short / total) * 100).toFixed(1)),
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
            `FII Futures: L=${fiiLongShort.longPct}% S=${fiiLongShort.shortPct}% Net=${fiiPositioning.netPosition}`,
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
        ? { longPct: proxyFlow.longPct, shortPct: proxyFlow.shortPct }
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
  if (maxPainRes.status === 'fulfilled' && !maxPainRes.value[1]) {
    const maxPain = maxPainRes.value[0]?.data?.max_pain ?? null
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
        straddleIv.percentAboveAvg !== null && straddleIv.percentAboveAvg > 20,
      percentAboveAvg: straddleIv.percentAboveAvg,
    },
    niftyPe: niftyPe,
    vix,
    fetchedAt: new Date().toISOString(),
  }
}

// ─── Market fetch ─────────────────────────────────────────────────────────────
async function fetchMarket(
  token: string,
  addLog: (l: BotLog) => void,
  sourceUpdate: (k: string, s: SourceStatus) => void,
): Promise<{
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
}> {
  addLog(
    mkLog('debug', 'market', 'fetching candles + breadth + option contracts'),
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
            instrumentKey: 'NSE_INDEX|Nifty 50',
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
        body: JSON.stringify({ token }),
      }),
      safeFetch<{
        status: string
        data?: GlobalIndexItem[]
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
      addLog(mkLog('error', 'candles', err))
      sourceUpdate('candles', 'error')
    } else {
      candles = data?.data?.candles ?? []
      addLog(mkLog('info', 'candles', candles.length + ' candles loaded'))
      sourceUpdate('candles', candles.length > 0 ? 'ok' : 'error')
    }
  } else {
    addLog(mkLog('error', 'candles', 'fetch failed'))
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
    contractsErr ?? 'No live expiry returned from Upstox option contracts'
  for (const candidate of expiryCandidates) {
    const [data, err] = await safeFetch<{ data?: OptionData[] }>(
      '/api/market/option-chain',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, expiryDate: candidate }),
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
        optionChain.length + ' strikes loaded (expiry: ' + candidate + ')',
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
  if (globalRes.status === 'fulfilled' && !globalRes.value[1]) {
    const gData = globalRes.value[0]?.data ?? []
    globalIndices = gData
    globalSentiment = evaluateGlobalSentiment(gData)
    globalSentimentFetched = true
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
  let niftySentiment: ReturnType<typeof evaluateNiftySentiment> = 'neutral'
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

  return { candles, optionChain, v3, breadth, globalIndices }
}

const LOT_SIZE = 25

// ─── Hook ──────────────────────────────────────────────────────────────────────
const INITIAL: BotStatus = {
  state: 'IDLE',
  position: null,
  indicators: null,
  vrdData: null,
  allSignalData: null,
  finalSignal: null,
  hardStop: { blocked: false, blockedDirection: 'NONE', reasons: [] },
  lastUpdated: null,
  error: null,
  tradesCount: 0,
  logs: [],
  sourceStatus: {},
  globalIndices: null,
}

export function useStrategyBot(token: string | null) {
  const [status, setStatus] = useState<BotStatus>(() => ({
    ...INITIAL,
    ...loadPersisted(),
  }))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const statusRef = useRef<BotStatus>(status)
  useLayoutEffect(() => {
    statusRef.current = status
  })

  // ── State updater with localStorage sync ────────────────────────────────────
  const updateStatus = useCallback((partial: Partial<BotStatus>) => {
    setStatus((prev) => {
      const next = { ...prev, ...partial }
      statusRef.current = next
      if (partial.state !== undefined)
        localStorage.setItem(KEYS.state, partial.state)
      if ('position' in partial)
        localStorage.setItem(KEYS.position, JSON.stringify(partial.position))
      if (partial.tradesCount !== undefined)
        localStorage.setItem(KEYS.trades, String(partial.tradesCount))
      return next
    })
  }, [])

  // ── Log helpers ─────────────────────────────────────────────────────────────
  const addLog = useCallback((entry: BotLog) => {
    setStatus((prev) => {
      const logs = [...prev.logs, entry].slice(-MAX_LOGS)
      saveLogs(logs)
      return { ...prev, logs }
    })
  }, [])

  const addLogs = useCallback((entries: BotLog[]) => {
    if (!entries.length) return
    setStatus((prev) => {
      const logs = [...prev.logs, ...entries].slice(-MAX_LOGS)
      saveLogs(logs)
      return { ...prev, logs }
    })
  }, [])

  const clearLogs = useCallback(() => {
    setStatus((prev) => {
      saveLogs([])
      return { ...prev, logs: [] }
    })
  }, [])

  // ── Main tick ────────────────────────────────────────────────────────────────
  const tick = useCallback(async () => {
    if (!token) return
    const cur = statusRef.current
    if (cur.state === 'STOPPED' || cur.state === 'IDLE') return

    const tickLogs: BotLog[] = []
    const log = (level: BotLog['level'], source: string, msg: string) => {
      const entry = mkLog(level, source, msg)
      tickLogs.push(entry)
      return entry
    }

    // Collect source updates to batch them
    const srcUpdates: Record<string, SourceStatus> = {}
    const srcUpd = (k: string, s: SourceStatus) => {
      srcUpdates[k] = s
    }

    // Wraps addLog so tick-level logs use the local buffer

    log('info', 'tick', `state=${cur.state} trades=${cur.tradesCount}`)

    try {
      const config = getStrategyConfig()
      let positionUpdate: Partial<BotStatus> = {}

      // Step 1: fetch candles + option chain + V3 signal in parallel
      const market = await fetchMarket(token, (e) => tickLogs.push(e), srcUpd)
      const { candles, optionChain, v3, breadth, globalIndices } = market

      if (!candles.length) {
        const canUseSnapshot = Boolean(
          cur.indicators && cur.vrdData && cur.allSignalData && cur.finalSignal,
        )
        if (canUseSnapshot) {
          const normalizedStatuses = Object.fromEntries(
            Object.entries({ ...cur.sourceStatus, ...srcUpdates }).map(
              ([key, value]) => [
                key,
                value === 'error' || value === 'pending' ? 'stale' : value,
              ],
            ),
          ) as Record<string, SourceStatus>
          log('warn', 'tick', 'no candle data — using cached snapshot')
          addLogs(tickLogs)
          updateStatus({
            sourceStatus: normalizedStatuses,
            lastUpdated: new Date().toLocaleTimeString('en-IN'),
            error: null,
          })
          return
        }
        log('error', 'tick', 'no candle data — skipping tick')
        addLogs(tickLogs)
        updateStatus({
          sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
          lastUpdated: new Date().toLocaleTimeString('en-IN'),
          error: 'No candle data',
        })
        return
      }

      // Step 2: compute indicators first (needed by fetchMarketSentiment for MMI)
      const indicators = computeAllIndicators(candles, optionChain)

      // Step 3: fetch market sentiment (VIX, breadth, NSE PE, FII) using indicator values
      const vrdData = await fetchMarketSentiment(
        token,
        (e) => tickLogs.push(e),
        srcUpd,
        optionChain,
        indicators,
        breadth,
      )
      saveVrdCache(vrdData)
      log(
        'info',
        'sentiment',
        `mmi=${vrdData.mmi?.score} vix=${vrdData.vix} pe=${vrdData.niftyPe?.pe} A/D=${vrdData.advancesDeclines?.advances}↑${vrdData.advancesDeclines?.declines}↓`,
      )
      const hardStop = runHardStopChecks(vrdData)
      const allSignalData: AllSignalData = { v3, indicators, vrd: vrdData }
      const finalSignal = getFinalSignal(allSignalData, config)

      log(
        'info',
        'engine',
        `bull=${finalSignal.bullScore} bear=${finalSignal.bearScore} → ${finalSignal.signal} (${finalSignal.confidence})`,
      )
      if (hardStop.blocked)
        log('warn', 'engine', `HARD STOP: ${hardStop.reasons.join(', ')}`)

      addLogs(tickLogs)
      tickLogs.length = 0

      updateStatus({
        ...positionUpdate,
        indicators,
        vrdData,
        allSignalData,
        finalSignal,
        hardStop,
        globalIndices,
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        error: null,
      })
      saveSnapshot({
        ...positionUpdate,
        indicators,
        vrdData,
        allSignalData,
        finalSignal,
        hardStop,
        globalIndices,
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
      })

      if (hardStop.blocked && hardStop.blockedDirection === 'BOTH') {
        updateStatus({ state: 'STOPPED' })
        return
      }

      // Entry cutoff check
      const [lh, lm] = config.lastEntryTime.split(':').map(Number)
      // Use IST explicitly so the cutoff fires at the correct local market time
      const nowIST = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      )
      const afterCutoff =
        nowIST.getHours() > lh ||
        (nowIST.getHours() === lh && nowIST.getMinutes() >= lm)

      if (cur.state === 'RUNNING') {
        if (afterCutoff) {
          addLog(
            mkLog(
              'warn',
              'bot',
              `after last entry time ${config.lastEntryTime} — stopping`,
            ),
          )
          updateStatus({ state: 'STOPPED' })
          return
        }
        if (cur.tradesCount >= config.maxTradesPerDay) {
          addLog(
            mkLog(
              'warn',
              'bot',
              `max trades/day (${config.maxTradesPerDay}) reached — stopping`,
            ),
          )
          updateStatus({ state: 'STOPPED' })
          return
        }

        if (
          finalSignal.signal === 'BUY_CE' ||
          finalSignal.signal === 'BUY_PE'
        ) {
          if (
            hardStop.blocked &&
            ((hardStop.blockedDirection === 'CE' &&
              finalSignal.signal === 'BUY_CE') ||
              (hardStop.blockedDirection === 'PE' &&
                finalSignal.signal === 'BUY_PE'))
          ) {
            addLog(
              mkLog(
                'warn',
                'bot',
                `Entry ${finalSignal.signal} blocked by hard stop: ${hardStop.reasons.join(', ')}`,
              ),
            )
          } else {
            interface LegSetup {
              direction: 'CE' | 'PE'
              tradeType: 'buying' | 'selling'
            }
            const legsToPlace: LegSetup[] = []
            if (config.tradeType === 'both') {
              legsToPlace.push({
                direction: finalSignal.signal === 'BUY_CE' ? 'CE' : 'PE',
                tradeType: 'buying',
              })
              legsToPlace.push({
                direction: finalSignal.signal === 'BUY_CE' ? 'PE' : 'CE',
                tradeType: 'selling',
              })
            } else {
              legsToPlace.push({
                direction:
                  config.tradeType === 'selling'
                    ? finalSignal.signal === 'BUY_CE'
                      ? 'PE'
                      : 'CE'
                    : finalSignal.signal === 'BUY_CE'
                      ? 'CE'
                      : 'PE',
                tradeType: config.tradeType,
              })
            }

            let totalReq = 0
            for (const leg of legsToPlace) {
              const strike = getOtmStrike(
                optionChain,
                leg.direction,
                config.otmSkip,
              )
              if (!strike) continue
              const ltp =
                leg.direction === 'CE'
                  ? strike.call_options.market_data.ltp
                  : strike.put_options.market_data.ltp
              const legReq = leg.tradeType === 'selling' ? 4000 : ltp
              totalReq += legReq
            }

            const executionMode: ExecutionMode = config.executionMode
            let qty =
              finalSignal.positionSize === 'full'
                ? LOT_SIZE
                : Math.floor(LOT_SIZE / 2)

            let paperBalance: number | null = null
            if (executionMode === 'paper') {
              try {
                const summary = await fetchPaperAccount()
                paperBalance = summary.account.balance
              } catch (error) {
                addLog(
                  mkLog(
                    'warn',
                    'paper',
                    `Unable to read paper balance before entry: ${(error as Error).message}`,
                  ),
                )
              }

              if (paperBalance !== null && totalReq > 0) {
                const affordableQty = Math.floor(paperBalance / totalReq)
                if (affordableQty <= 0) {
                  addLog(
                    mkLog(
                      'warn',
                      'paper',
                      `Skipping paper entry: balance ₹${paperBalance.toFixed(2)} cannot afford combo margin/cost ₹${totalReq.toFixed(2)}`,
                    ),
                  )
                  updateStatus({
                    error: `Paper credit ₹${paperBalance.toFixed(2)} is below required margin/cost ₹${totalReq.toFixed(2)}`,
                  })
                  return
                }
                if (affordableQty < qty) {
                  addLog(
                    mkLog(
                      'warn',
                      'paper',
                      `Reducing quantity from ${qty} to ${affordableQty} to fit credit ₹${paperBalance.toFixed(2)}`,
                    ),
                  )
                  qty = affordableQty
                }
              }
            }

            const positionLegs: PositionLeg[] = []
            let success = true
            let firstInstrumentKey = ''
            let firstDirection: 'CE' | 'PE' = 'CE'
            let firstEntryPrice = 0

            for (const leg of legsToPlace) {
              const strike = getOtmStrike(
                optionChain,
                leg.direction,
                config.otmSkip,
              )
              if (!strike) {
                addLog(
                  mkLog(
                    'warn',
                    'order',
                    `no OTM strike found for ${leg.direction}`,
                  ),
                )
                success = false
                break
              }
              const instrumentKey =
                leg.direction === 'CE'
                  ? strike.call_options.instrument_key
                  : strike.put_options.instrument_key
              const ltp =
                leg.direction === 'CE'
                  ? strike.call_options.market_data.ltp
                  : strike.put_options.market_data.ltp

              if (!firstInstrumentKey) {
                firstInstrumentKey = instrumentKey
                firstDirection = leg.direction
                firstEntryPrice = ltp
              }

              const side = leg.tradeType === 'selling' ? 'SELL' : 'BUY'
              addLog(
                mkLog(
                  'info',
                  'order',
                  `placing ${side} ${leg.direction} ${instrumentKey} qty=${qty} ltp=${ltp}`,
                ),
              )

              let paperTradeId: string | undefined
              if (executionMode === 'paper') {
                const [paperData, paperErr] = await safeFetch<{
                  trade?: PaperTrade
                  account?: PaperAccountSummary['account']
                }>('/api/paper/trades/enter', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    instrumentKey,
                    direction: leg.direction,
                    quantity: qty,
                    entryPrice: ltp,
                    metadata: {
                      signal: finalSignal.signal,
                      confidence: finalSignal.confidence,
                      bullScore: finalSignal.bullScore,
                      bearScore: finalSignal.bearScore,
                      tradeType: leg.tradeType,
                    },
                  }),
                })
                if (paperErr || !paperData?.trade?.id) {
                  addLog(
                    mkLog(
                      'error',
                      'paper',
                      `Paper ${side} failed: ${paperErr ?? JSON.stringify(paperData)}`,
                    ),
                  )
                  updateStatus({
                    error: paperErr ?? 'Paper trade entry failed',
                  })
                  success = false
                  break
                }
                paperTradeId = paperData.trade.id
                addLog(
                  mkLog(
                    'info',
                    'paper',
                    `Paper ${side} created tradeId=${paperTradeId}`,
                  ),
                )
                notify(
                  'Paper Trade Executed',
                  `Paper ${side} ${leg.direction} ${qty}qty (${instrumentKey}) placed`,
                  'success',
                )
              } else {
                const [orderData, orderErr] = await safeFetch<{
                  status?: string
                  data?: { order_id?: string }
                }>('/api/order/place', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    token,
                    instrumentKey,
                    transactionType: side,
                    quantity: qty,
                  }),
                })
                if (
                  orderErr ||
                  (!orderData?.data?.order_id &&
                    orderData?.status !== 'success')
                ) {
                  const failure = `${side} failed: ${orderErr ?? JSON.stringify(orderData)}`
                  addLog(mkLog('error', 'order', failure))
                  success = false
                  if (isStaticIpRestrictionError(orderErr)) {
                    if (intervalRef.current) clearInterval(intervalRef.current)
                    intervalRef.current = null
                    updateStatus({
                      state: 'STOPPED',
                      error:
                        'Order placement blocked by Upstox static IP restriction. Configure a static IP in Upstox or use a whitelisted execution environment.',
                    })
                    addLog(
                      mkLog(
                        'warn',
                        'bot',
                        'stopping bot — Upstox order API is blocked by static IP restriction',
                      ),
                    )
                  }
                  break
                }
                addLog(
                  mkLog(
                    'info',
                    'order',
                    `${side} placed orderId=${orderData?.data?.order_id ?? '—'}`,
                  ),
                )
                notify(
                  'Trade Executed',
                  `${side} ${leg.direction} ${qty}qty (${instrumentKey}) placed successfully`,
                  'success',
                )
              }

              positionLegs.push({
                instrumentKey,
                direction: leg.direction,
                entryPrice: ltp,
                quantity: qty,
                tradeType: leg.tradeType,
                paperTradeId,
              })
            }

            if (success) {
              const position: ActivePosition = {
                instrumentKey: firstInstrumentKey,
                direction: firstDirection,
                entryPrice: firstEntryPrice,
                quantity: qty,
                entryTime: new Date().toISOString(),
                tradeId: Date.now(),
                executionMode,
                tradeType: config.tradeType,
                legs: positionLegs,
              }
              updateStatus({
                state: 'ORDERED',
                position,
                tradesCount: cur.tradesCount + 1,
              })
            }
          }
        } else {
          addLog(
            mkLog('debug', 'bot', `signal=${finalSignal.signal} — no entry`),
          )
        }
      } else if (cur.state === 'ORDERED' && cur.position) {
        const match = optionChain.find(
          (o) =>
            o.call_options.instrument_key === cur.position!.instrumentKey ||
            o.put_options.instrument_key === cur.position!.instrumentKey,
        )
        const currentPrice = match
          ? cur.position.direction === 'CE'
            ? match.call_options.market_data.ltp
            : match.put_options.market_data.ltp
          : cur.position.entryPrice

        let updatedLegs: PositionLeg[] | undefined
        if (cur.position.legs && cur.position.legs.length > 0) {
          updatedLegs = cur.position.legs.map((leg) => {
            const legMatch = optionChain.find(
              (o) =>
                o.call_options.instrument_key === leg.instrumentKey ||
                o.put_options.instrument_key === leg.instrumentKey,
            )
            const legCurrentPrice = legMatch
              ? leg.direction === 'CE'
                ? legMatch.call_options.market_data.ltp
                : legMatch.put_options.market_data.ltp
              : leg.entryPrice
            return {
              ...leg,
              currentPrice: legCurrentPrice,
            }
          })
        }

        positionUpdate = {
          position: {
            ...cur.position,
            currentPrice,
            legs: updatedLegs,
          },
        }

        if (!match)
          addLog(
            mkLog(
              'warn',
              'position',
              `instrument not found in chain — using entry price as current`,
            ),
          )

        const { exit: signalExit, reason: signalReason } = shouldExit(
          cur.position,
          allSignalData,
          currentPrice,
          config,
        )
        const exit = signalExit || afterCutoff
        const reason = afterCutoff
          ? `EOD forced exit — after ${config.lastEntryTime}`
          : signalReason
        if (exit) {
          const legsToExit =
            cur.position.legs && cur.position.legs.length > 0
              ? cur.position.legs
              : [
                  {
                    instrumentKey: cur.position.instrumentKey,
                    direction: cur.position.direction,
                    entryPrice: cur.position.entryPrice,
                    quantity: cur.position.quantity,
                    tradeType:
                      cur.position.tradeType === 'selling'
                        ? ('selling' as const)
                        : ('buying' as const),
                    paperTradeId: cur.position.paperTradeId,
                    currentPrice,
                  },
                ]

          for (const leg of legsToExit) {
            const isSelling = leg.tradeType === 'selling'
            const exitTxType = isSelling ? 'BUY' : 'SELL'
            if (isPaperPosition(cur.position)) {
              addLog(
                mkLog(
                  'info',
                  'paper',
                  `exit triggered: ${reason} — closing paper trade leg ${leg.instrumentKey}`,
                ),
              )
              const [, paperExitErr] = await safeFetch(
                '/api/paper/trades/exit',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tradeId: leg.paperTradeId,
                    exitPrice: leg.currentPrice ?? currentPrice,
                    metadata: { reason },
                  }),
                },
              )
              if (paperExitErr) {
                addLog(
                  mkLog(
                    'error',
                    'paper',
                    `Paper ${exitTxType} failed for ${leg.instrumentKey}: ${paperExitErr}`,
                  ),
                )
                notify(
                  'Paper Trade Error',
                  `Paper ${exitTxType} failed: ${paperExitErr}`,
                  'error',
                )
                continue
              }
              addLog(
                mkLog(
                  'info',
                  'paper',
                  `Paper ${exitTxType} settled successfully for ${leg.instrumentKey}`,
                ),
              )
              notify(
                'Paper Trade Exited',
                `Paper ${exitTxType} settled for ${leg.instrumentKey}. Reason: ${reason}`,
                'info',
              )
            } else {
              addLog(
                mkLog(
                  'info',
                  'order',
                  `exit triggered: ${reason} — placing ${exitTxType} for ${leg.instrumentKey}`,
                ),
              )
              const [, sellErr] = await safeFetch('/api/order/place', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token,
                  instrumentKey: leg.instrumentKey,
                  transactionType: exitTxType,
                  quantity: leg.quantity,
                }),
              })
              if (sellErr) {
                addLog(
                  mkLog(
                    'error',
                    'order',
                    `${exitTxType} failed for ${leg.instrumentKey}: ${sellErr}`,
                  ),
                )
                notify(
                  'Trade Error',
                  `${exitTxType} failed: ${sellErr}`,
                  'error',
                )
                continue
              }
              addLog(
                mkLog(
                  'info',
                  'order',
                  `${exitTxType} placed successfully for ${leg.instrumentKey}`,
                ),
              )
              notify(
                'Trade Exited',
                `${exitTxType} order placed for ${leg.instrumentKey}. Reason: ${reason}`,
                'info',
              )
            }
          }
          const nextState: BotState =
            cur.tradesCount >= config.maxTradesPerDay ? 'STOPPED' : 'RUNNING'
          updateStatus({
            state: nextState,
            position: null,
            error: `Exited: ${reason}`,
          })
        } else {
          const displayPrice = currentPrice
          addLog(
            mkLog(
              'debug',
              'position',
              `holding — price=${displayPrice.toFixed(2)}`,
            ),
          )
        }
      }
    } catch (err) {
      const msg = (err as Error).message
      addLogs([...tickLogs, mkLog('error', 'tick', `unhandled: ${msg}`)])
      updateStatus({ error: msg })
    }
  }, [token, updateStatus, addLog, addLogs])

  // ── Start / stop ─────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (!token) {
      addLog(mkLog('error', 'bot', 'cannot start — no broker token'))
      return
    }
    const config = getStrategyConfig()
    if (intervalRef.current) clearInterval(intervalRef.current)
    addLog(
      mkLog(
        'info',
        'bot',
        `starting — interval=${config.pollingIntervalSec}s threshold=${config.strongThreshold}/${config.moderateThreshold}`,
      ),
    )
    updateStatus({ state: 'RUNNING', error: null })
    void tick()
    intervalRef.current = setInterval(
      () => void tick(),
      config.pollingIntervalSec * 1000,
    )
  }, [token, tick, updateStatus, addLog])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    addLog(mkLog('info', 'bot', 'stopped by user'))
    updateStatus({
      state: 'IDLE',
      position: null,
      error: null,
      sourceStatus: {},
    })
  }, [updateStatus, addLog])

  // ── Resume on mount if was running ──────────────────────────────────────────
  useEffect(() => {
    if (token && (status.state === 'RUNNING' || status.state === 'ORDERED')) {
      const config = getStrategyConfig()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      addLog(
        mkLog('info', 'bot', `resumed from persisted state=${status.state}`),
      )
      void tick()
      intervalRef.current = setInterval(
        () => void tick(),
        config.pollingIntervalSec * 1000,
      )
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ...status, start, stop, clearLogs }
}
