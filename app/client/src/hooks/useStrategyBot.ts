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
  transformGlobalData,
  evaluateGlobalSentiment,
  evaluateNiftySentiment,
  evaluatePCR,
  getV3Signal,
  type V3OrderType,
} from '@/lib/v3Sentiment'
import {
  runHardStopChecks,
  getFinalSignal,
  shouldExit,
  type AllSignalData,
  type FinalSignal,
  type ActivePosition,
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

export interface BotStatus {
  state: BotState
  position: ActivePosition | null
  indicators: IndicatorsResult | null
  vrdData: VrdData | null
  allSignalData: AllSignalData | null
  finalSignal: FinalSignal | null
  hardStop: { blocked: boolean; reasons: string[] }
  lastUpdated: string | null
  error: string | null
  tradesCount: number
  logs: BotLog[]
  sourceStatus: Record<string, SourceStatus>
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
const VRD_CACHE_MAX_MS = 6 * 60 * 60 * 1000 // 6 hours

type BotSnapshot = Pick<
  BotStatus,
  | 'indicators'
  | 'vrdData'
  | 'allSignalData'
  | 'finalSignal'
  | 'hardStop'
  | 'lastUpdated'
  | 'sourceStatus'
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
        : Object.fromEntries(
            Object.keys(snapshot.sourceStatus ?? {}).map((key) => [
              key,
              'unknown' satisfies SourceStatus,
            ]),
          )
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

function evaluateGlobalSentimentFromVrd(
  items: { change?: number; displayName?: string }[],
): 'bullish' | 'bearish' | 'neutral' {
  let score = 0
  for (const item of items) {
    const change = item.change ?? 0
    const weight = item.displayName?.toLowerCase().includes('gift') ? 2 : 1
    if (change >= 1.5) score += 2 * weight
    else if (change > 0.15) score += 1 * weight
    else if (change <= -1.5) score -= 2 * weight
    else if (change < -0.15) score -= 1 * weight
  }
  if (score <= -4) return 'bullish'
  if (score >= 4) return 'bearish'
  return 'neutral'
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
  niftyLtp: number,
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
  const normalizedPrice = niftyLtp > 0 ? (niftyLtp % 1000) / 1000 : 0.5
  const base =
    21 +
    rsiStretch +
    trendStretch +
    volStretch +
    breadthStretch +
    premiumStretch +
    (normalizedPrice - 0.5)
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
const MKTDATA_SOURCES: { key: string; label: string }[] = [
  { key: 'vix', label: 'VIX' },
  { key: 'breadth', label: 'Breadth' },
  { key: 'vrd/dashboard', label: 'VRD Dashboard' },
  { key: 'vrd/mmi', label: 'VRD MMI' },
  { key: 'vrd/fii-ratio', label: 'VRD FII Ratio' },
  { key: 'vrd/fii-position', label: 'VRD FII Pos' },
  { key: 'vrd/pe', label: 'VRD PE' },
  { key: 'vrd/ad', label: 'VRD A/D' },
  { key: 'vrd/pcr', label: 'VRD PCR' },
  { key: 'synthetic/flow', label: 'Proxy Flow' },
  { key: 'synthetic/value', label: 'Proxy Value' },
]

async function fetchMarketSentiment(
  token: string,
  addLog: (l: BotLog) => void,
  sourceUpdate: (k: string, s: SourceStatus) => void,
  optionChain: OptionData[],
  indicators: IndicatorsResult,
  cachedVrdData: VrdData | null,
): Promise<VrdData> {
  for (const s of MKTDATA_SOURCES) sourceUpdate(s.key, 'pending')

  const [
    vixRes,
    breadthRes,
    vrdDashboardRes,
    vrdMmiRes,
    vrdFiiRatioRes,
    vrdFiiPositionRes,
    vrdPeRes,
    vrdAdRes,
    vrdPcrRes,
  ] = await Promise.allSettled([
    safeFetch<{ vix: number | null }>('/api/market/vix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
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
    safeFetch<{ vix: number | null; pcr: number | null }>(
      '/api/market/vrd/dashboard',
    ),
    safeFetch<{ score: number | null; date: string | null }>(
      '/api/market/vrd/market-mood',
    ),
    safeFetch<{
      longPct: number | null
      shortPct: number | null
      date: string | null
    }>('/api/market/vrd/fii-ratio'),
    safeFetch<{
      netPosition: number | null
      consecutiveShortDays: number | null
      date: string | null
    }>('/api/market/vrd/fii-positioning'),
    safeFetch<{ pe: number | null; label: string | null; date: string | null }>(
      '/api/market/vrd/pe',
    ),
    safeFetch<{
      advances: number | null
      declines: number | null
      ratio: number | null
      date: string | null
    }>('/api/market/vrd/advance-decline'),
    safeFetch<{ value: number | null; date: string | null }>(
      '/api/market/vrd/pcr',
    ),
  ])

  const vrdDashboard =
    vrdDashboardRes.status === 'fulfilled' && !vrdDashboardRes.value[1]
      ? vrdDashboardRes.value[0]
      : null
  sourceUpdate('vrd/dashboard', vrdDashboard ? 'ok' : 'error')
  if (!vrdDashboard) {
    const err =
      vrdDashboardRes.status === 'fulfilled'
        ? (vrdDashboardRes.value[1] ?? 'unknown')
        : 'fetch failed'
    addLog(mkLog('warn', 'vrd/dashboard', err))
  }

  // VIX
  let vix: number | null = null
  if (vixRes.status === 'fulfilled' && !vixRes.value[1]) {
    vix = vixRes.value[0]?.vix ?? null
    addLog(
      mkLog(
        vix !== null ? 'info' : 'warn',
        'vix',
        vix !== null ? `VIX=${vix}` : 'VIX returned null',
      ),
    )
    sourceUpdate('vix', vix !== null ? 'ok' : 'error')
  } else {
    const err =
      vixRes.status === 'fulfilled'
        ? (vixRes.value[1] ?? 'unknown')
        : 'fetch failed'
    if (vrdDashboard?.vix !== null && vrdDashboard?.vix !== undefined) {
      vix = vrdDashboard.vix
      addLog(
        mkLog(
          'warn',
          'vix',
          `Upstox failed (${err}); using VRD dashboard VIX=${vix}`,
        ),
      )
      sourceUpdate('vix', 'ok')
    } else if (
      cachedVrdData?.vix !== null &&
      cachedVrdData?.vix !== undefined
    ) {
      vix = cachedVrdData.vix
      addLog(
        mkLog(
          'warn',
          'vix',
          `live sources unavailable (${err}); using cached VIX=${vix}`,
        ),
      )
      sourceUpdate('vix', 'stale')
    } else {
      addLog(mkLog('error', 'vix', err))
      sourceUpdate('vix', 'error')
    }
  }

  // Breadth
  let advances: number | null = null
  let declines: number | null = null
  let adRatio: number | null = null
  if (breadthRes.status === 'fulfilled' && !breadthRes.value[1]) {
    const bd = breadthRes.value[0]
    advances = bd?.advances ?? null
    declines = bd?.declines ?? null
    adRatio = bd?.ratio ?? null
    addLog(
      mkLog(
        'info',
        'breadth',
        `A/D=${advances}↑ ${declines}↓ ratio=${adRatio} (${bd?.total} stocks)`,
      ),
    )
    sourceUpdate('breadth', advances !== null ? 'ok' : 'error')
    sourceUpdate('vrd/ad', 'unknown')
  } else {
    const err =
      breadthRes.status === 'fulfilled'
        ? (breadthRes.value[1] ?? 'unknown')
        : 'fetch failed'
    const vrdAd =
      vrdAdRes.status === 'fulfilled' && !vrdAdRes.value[1]
        ? vrdAdRes.value[0]
        : null
    sourceUpdate('vrd/ad', vrdAd ? 'ok' : 'error')
    if (vrdAd?.advances !== null && vrdAd?.declines !== null) {
      advances = vrdAd.advances
      declines = vrdAd.declines
      adRatio =
        vrdAd.ratio ??
        (declines > 0 ? Number((advances / declines).toFixed(3)) : null)
      addLog(
        mkLog(
          'warn',
          'breadth',
          `Upstox failed (${err}); using VRD A/D=${advances}↑ ${declines}↓ ratio=${adRatio}`,
        ),
      )
      sourceUpdate('breadth', 'ok')
    } else if (
      cachedVrdData?.advancesDeclines?.advances !== null &&
      cachedVrdData?.advancesDeclines?.advances !== undefined
    ) {
      advances = cachedVrdData.advancesDeclines.advances
      declines = cachedVrdData.advancesDeclines.declines
      adRatio = cachedVrdData.advancesDeclines.ratio ?? null
      addLog(
        mkLog(
          'warn',
          'breadth',
          `live breadth unavailable (${err}); using cached A/D=${advances}↑ ${declines}↓ ratio=${adRatio}`,
        ),
      )
      sourceUpdate('breadth', 'stale')
      sourceUpdate('vrd/ad', 'stale')
    } else {
      addLog(mkLog('error', 'breadth', err))
      sourceUpdate('breadth', 'error')
    }
  }

  // Compute straddle IV from option chain
  const niftyLtp = optionChain[0]?.underlying_spot_price ?? 0
  const straddleIv = computeStraddleIV(optionChain, niftyLtp, vix)
  addLog(
    mkLog(
      'debug',
      'straddle-iv',
      `ATM IV=${straddleIv.currentIv} vs VIX=${vix} → ${straddleIv.percentAboveAvg?.toFixed(1)}% above avg`,
    ),
  )

  const proxyFlow = computeProxyFlow(optionChain, niftyLtp)
  const vrdFiiRatio =
    vrdFiiRatioRes.status === 'fulfilled' && !vrdFiiRatioRes.value[1]
      ? vrdFiiRatioRes.value[0]
      : null
  const vrdFiiPosition =
    vrdFiiPositionRes.status === 'fulfilled' && !vrdFiiPositionRes.value[1]
      ? vrdFiiPositionRes.value[0]
      : null

  const fiiLongShort =
    vrdFiiRatio?.longPct !== null && vrdFiiRatio?.shortPct !== null
      ? { longPct: vrdFiiRatio.longPct, shortPct: vrdFiiRatio.shortPct }
      : proxyFlow.longPct !== null && proxyFlow.shortPct !== null
        ? { longPct: proxyFlow.longPct, shortPct: proxyFlow.shortPct }
        : cachedVrdData?.fiiLongShort?.longPct !== null &&
            cachedVrdData?.fiiLongShort?.longPct !== undefined &&
            cachedVrdData?.fiiLongShort?.shortPct !== null &&
            cachedVrdData?.fiiLongShort?.shortPct !== undefined
          ? {
              longPct: cachedVrdData.fiiLongShort.longPct,
              shortPct: cachedVrdData.fiiLongShort.shortPct,
            }
          : null
  const fiiPositioning =
    vrdFiiPosition?.netPosition !== null
      ? {
          netPosition: vrdFiiPosition.netPosition,
          consecutiveShortDays: vrdFiiPosition.consecutiveShortDays,
        }
      : proxyFlow.netPosition !== null
        ? {
            netPosition: proxyFlow.netPosition,
            consecutiveShortDays: proxyFlow.consecutiveShortDays,
          }
        : cachedVrdData?.fiiPositioning?.netPosition !== null &&
            cachedVrdData?.fiiPositioning?.netPosition !== undefined
          ? {
              netPosition: cachedVrdData.fiiPositioning.netPosition,
              consecutiveShortDays:
                cachedVrdData.fiiPositioning.consecutiveShortDays,
            }
          : null

  const usingProxyFlow = proxyFlow.netPosition !== null
  const usingCachedFii =
    !usingProxyFlow && (fiiLongShort !== null || fiiPositioning !== null)

  sourceUpdate(
    'synthetic/flow',
    proxyFlow.netPosition !== null
      ? 'ok'
      : usingCachedFii
        ? 'stale'
        : 'unknown',
  )

  sourceUpdate(
    'vrd/fii-ratio',
    fiiLongShort
      ? vrdFiiRatio?.longPct !== null && vrdFiiRatio?.shortPct !== null
        ? 'ok'
        : cachedVrdData?.fiiLongShort
          ? 'stale'
          : 'unknown'
      : 'error',
  )
  sourceUpdate(
    'vrd/fii-position',
    fiiPositioning
      ? vrdFiiPosition?.netPosition !== null
        ? 'ok'
        : cachedVrdData?.fiiPositioning
          ? 'stale'
          : 'unknown'
      : 'error',
  )

  if (vrdFiiRatio?.longPct !== null && vrdFiiRatio?.shortPct !== null) {
    addLog(
      mkLog(
        'info',
        'vrd/fii-ratio',
        `L=${vrdFiiRatio.longPct}% S=${vrdFiiRatio.shortPct}%`,
      ),
    )
  } else {
    addLog(
      mkLog(
        proxyFlow.netPosition !== null ? 'warn' : 'error',
        'synthetic/flow',
        proxyFlow.netPosition !== null
          ? `VRD FII ratio unavailable; using proxy putShare=${proxyFlow.longPct}% callShare=${proxyFlow.shortPct}%`
          : 'VRD FII ratio unavailable and proxy flow unavailable',
      ),
    )
  }

  if (vrdFiiPosition?.netPosition !== null) {
    addLog(
      mkLog(
        'info',
        'vrd/fii-position',
        `net=${vrdFiiPosition.netPosition} shortDays=${vrdFiiPosition.consecutiveShortDays ?? '—'}`,
      ),
    )
  } else if (proxyFlow.netPosition !== null) {
    addLog(
      mkLog(
        'warn',
        'synthetic/flow',
        `VRD FII positioning unavailable; using proxy net=${proxyFlow.netPosition} shortDays=${proxyFlow.consecutiveShortDays ?? '—'}`,
      ),
    )
  } else if (
    cachedVrdData?.fiiPositioning?.netPosition !== null &&
    cachedVrdData?.fiiPositioning?.netPosition !== undefined
  ) {
    addLog(
      mkLog(
        'warn',
        'vrd/fii-position',
        `live positioning unavailable; using cached net=${cachedVrdData.fiiPositioning.netPosition} shortDays=${cachedVrdData.fiiPositioning.consecutiveShortDays ?? '—'}`,
      ),
    )
  }

  const proxyValue = computeProxyValuation(niftyLtp, indicators, vix, adRatio)
  const vrdPe =
    vrdPeRes.status === 'fulfilled' && !vrdPeRes.value[1]
      ? vrdPeRes.value[0]
      : null
  sourceUpdate(
    'vrd/pe',
    vrdPe?.pe !== null && vrdPe?.pe !== undefined
      ? 'ok'
      : cachedVrdData?.niftyPe?.pe !== null &&
          cachedVrdData?.niftyPe?.pe !== undefined
        ? 'stale'
        : 'unknown',
  )
  sourceUpdate('synthetic/value', 'ok')

  const niftyPe =
    vrdPe?.pe !== null && vrdPe?.pe !== undefined
      ? { pe: vrdPe.pe, label: vrdPe.label ?? 'VRD value' }
      : cachedVrdData?.niftyPe?.pe !== null &&
          cachedVrdData?.niftyPe?.pe !== undefined
        ? {
            pe: cachedVrdData.niftyPe.pe,
            label: cachedVrdData.niftyPe.label ?? 'Cached value',
          }
        : { pe: proxyValue.pe, label: proxyValue.label }
  addLog(
    mkLog(
      vrdPe?.pe !== null && vrdPe?.pe !== undefined ? 'info' : 'warn',
      vrdPe?.pe !== null && vrdPe?.pe !== undefined
        ? 'vrd/pe'
        : 'synthetic/value',
      vrdPe?.pe !== null && vrdPe?.pe !== undefined
        ? `PE=${vrdPe.pe} (${vrdPe.label ?? 'VRD'})`
        : `VRD PE unavailable; using proxy valuation=${proxyValue.pe} (${proxyValue.label})`,
    ),
  )

  const vrdPcr =
    vrdPcrRes.status === 'fulfilled' && !vrdPcrRes.value[1]
      ? vrdPcrRes.value[0]
      : null
  sourceUpdate(
    'vrd/pcr',
    vrdPcr?.value !== null && vrdPcr?.value !== undefined
      ? 'ok'
      : vrdDashboard?.pcr !== null && vrdDashboard?.pcr !== undefined
        ? 'unknown'
        : cachedVrdData?.pcr?.value !== null &&
            cachedVrdData?.pcr?.value !== undefined
          ? 'stale'
          : 'error',
  )
  const effectivePcr =
    indicators.pcrValue > 0
      ? indicators.pcrValue
      : (vrdPcr?.value ?? vrdDashboard?.pcr ?? cachedVrdData?.pcr?.value ?? 0)
  if (indicators.pcrValue > 0) {
    addLog(
      mkLog(
        'info',
        'pcr',
        `option-chain PCR=${indicators.pcrValue.toFixed(3)}`,
      ),
    )
  } else if (vrdPcr?.value !== null && vrdPcr?.value !== undefined) {
    addLog(
      mkLog(
        'warn',
        'pcr',
        `option-chain PCR unavailable; using VRD PCR=${vrdPcr.value}`,
      ),
    )
  } else if (vrdDashboard?.pcr !== null && vrdDashboard?.pcr !== undefined) {
    addLog(
      mkLog(
        'warn',
        'pcr',
        `option-chain PCR unavailable; using VRD dashboard PCR=${vrdDashboard.pcr}`,
      ),
    )
  } else {
    addLog(mkLog('error', 'pcr', 'PCR unavailable from option chain and VRD'))
  }

  // Synthetic MMI
  const vrdMmi =
    vrdMmiRes.status === 'fulfilled' && !vrdMmiRes.value[1]
      ? vrdMmiRes.value[0]
      : null
  sourceUpdate(
    'vrd/mmi',
    vrdMmi?.score !== null && vrdMmi?.score !== undefined
      ? 'ok'
      : vix !== null || effectivePcr > 0
        ? 'unknown'
        : 'error',
  )
  const mmi =
    vrdMmi?.score !== null && vrdMmi?.score !== undefined
      ? {
          score: vrdMmi.score,
          label:
            vrdMmi.score < 30
              ? 'Extreme Fear'
              : vrdMmi.score < 50
                ? 'Fear'
                : vrdMmi.score < 70
                  ? 'Greed'
                  : 'Extreme Greed',
        }
      : computeMMI(vix, indicators.rsi.value, effectivePcr)
  addLog(
    mkLog(
      vrdMmi?.score !== null && vrdMmi?.score !== undefined ? 'info' : 'warn',
      vrdMmi?.score !== null && vrdMmi?.score !== undefined ? 'vrd/mmi' : 'mmi',
      vrdMmi?.score !== null && vrdMmi?.score !== undefined
        ? `VRD MMI=${vrdMmi.score}`
        : `VRD MMI unavailable; using computed score=${mmi.score} (${mmi.label}) [vix=${vix} rsi=${indicators.rsi.value.toFixed(1)} pcr=${effectivePcr.toFixed(3)}]`,
    ),
  )

  // Assemble VrdData (same shape as before — compatible with all scoring functions)
  return {
    mmi: { score: mmi.score, label: mmi.label },
    advancesDeclines:
      advances !== null
        ? { advances, declines: declines ?? 0, ratio: adRatio, label: null }
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
): Promise<{ candles: Candle[]; optionChain: OptionData[]; v3: V3OrderType }> {
  const [contractsData, contractsErr] = await safeFetch<{
    expiries?: string[]
  }>('/api/market/option-contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const expiryCandidates = (contractsData?.expiries ?? []).slice(0, 5)
  let expiryDate: string | null = null
  addLog(
    mkLog(
      expiryCandidates.length > 0 ? 'debug' : 'warn',
      'market',
      expiryCandidates.length > 0
        ? `fetching candles + option chain (candidate expiries: ${expiryCandidates.join(', ')})`
        : `option contracts unavailable${contractsErr ? ` (${contractsErr})` : ''}`,
    ),
  )

  sourceUpdate('candles', 'pending')
  sourceUpdate('option-chain', 'pending')
  sourceUpdate('global-sentiment', 'pending')
  sourceUpdate('nifty-sentiment', 'pending')

  const [candleRes, globalRes, niftyRes, vrdDashboardRes, vrdAdRes, vrdPcrRes] =
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
      safeFetch<unknown>('/api/market/global-sentiment'),
      safeFetch<{ resultData?: { change_per?: number }[] }>(
        '/api/market/nifty-sentiment',
      ),
      safeFetch<{
        asia?: { change?: number; displayName?: string }[]
        us?: { change?: number; displayName?: string }[]
        commodities?: { change?: number; displayName?: string }[]
        pcr?: number | null
      }>('/api/market/vrd/dashboard'),
      safeFetch<{
        advances: number | null
        declines: number | null
        ratio: number | null
      }>('/api/market/vrd/advance-decline'),
      safeFetch<{ value: number | null }>('/api/market/vrd/pcr'),
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
      addLog(mkLog('info', 'candles', `${candles.length} candles loaded`))
      sourceUpdate('candles', candles.length > 0 ? 'ok' : 'error')
    }
  } else {
    addLog(mkLog('error', 'candles', 'fetch failed'))
    sourceUpdate('candles', 'error')
  }

  // option chain
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
      optionChainError = `${candidate}: ${err}`
      addLog(
        mkLog('warn', 'option-chain', `expiry ${candidate} failed: ${err}`),
      )
      continue
    }
    const chain = data?.data ?? []
    if (!chain.length) {
      optionChainError = `${candidate}: empty chain`
      addLog(
        mkLog(
          'warn',
          'option-chain',
          `expiry ${candidate} returned empty chain`,
        ),
      )
      continue
    }
    optionChain = chain
    expiryDate = candidate
    addLog(
      mkLog(
        'info',
        'option-chain',
        `${optionChain.length} strikes loaded (expiry: ${expiryDate})`,
      ),
    )
    sourceUpdate('option-chain', 'ok')
    break
  }

  if (!optionChain.length) {
    addLog(mkLog('error', 'option-chain', optionChainError))
    sourceUpdate('option-chain', 'error')
  }

  let upstoxPcr: { value: number | null } | null = null
  if (expiryDate) {
    const [pcrData, pcrErr] = await safeFetch<{ value: number | null }>(
      '/api/market/upstox/pcr',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, expiry: expiryDate, bucketInterval: 60 }),
      },
    )
    if (pcrErr)
      addLog(
        mkLog('warn', 'pcr', `Upstox PCR failed for ${expiryDate}: ${pcrErr}`),
      )
    else upstoxPcr = pcrData
  } else {
    addLog(
      mkLog(
        'warn',
        'pcr',
        'Skipping Upstox PCR because no valid option-chain expiry was resolved',
      ),
    )
  }

  // V3
  let v3: V3OrderType = 'hold'
  const globalOk = globalRes.status === 'fulfilled' && !globalRes.value[1]
  const niftyOk = niftyRes.status === 'fulfilled' && !niftyRes.value[1]
  const vrdDashboard =
    vrdDashboardRes.status === 'fulfilled' && !vrdDashboardRes.value[1]
      ? vrdDashboardRes.value[0]
      : null
  const vrdAd =
    vrdAdRes.status === 'fulfilled' && !vrdAdRes.value[1]
      ? vrdAdRes.value[0]
      : null
  const vrdPcr =
    vrdPcrRes.status === 'fulfilled' && !vrdPcrRes.value[1]
      ? vrdPcrRes.value[0]
      : null

  let globalSentiment: ReturnType<typeof evaluateGlobalSentiment> = 'neutral'
  let niftySentiment: ReturnType<typeof evaluateNiftySentiment> = 'neutral'
  let pcrZone: ReturnType<typeof evaluatePCR> = 'neutral'

  if (globalOk) {
    try {
      const gData = transformGlobalData(
        globalRes.value[0] as Parameters<typeof transformGlobalData>[0],
      )
      globalSentiment = evaluateGlobalSentiment(gData)
      sourceUpdate('global-sentiment', 'ok')
    } catch (e) {
      addLog(
        mkLog(
          'error',
          'global-sentiment',
          `compute failed: ${(e as Error).message}`,
        ),
      )
      sourceUpdate('global-sentiment', 'error')
    }
  } else if (vrdDashboard) {
    globalSentiment = evaluateGlobalSentimentFromVrd([
      ...(vrdDashboard.asia ?? []),
      ...(vrdDashboard.us ?? []),
      ...(vrdDashboard.commodities ?? []),
    ])
    addLog(
      mkLog(
        'warn',
        'global-sentiment',
        `legacy source failed; using VRD dashboard fallback=${globalSentiment}`,
      ),
    )
    sourceUpdate('global-sentiment', 'ok')
  } else {
    addLog(
      mkLog(
        'error',
        'global-sentiment',
        globalRes.status === 'fulfilled'
          ? (globalRes.value[1] ?? 'unknown')
          : 'fetch failed',
      ),
    )
    sourceUpdate('global-sentiment', 'error')
  }

  if (niftyOk) {
    niftySentiment = evaluateNiftySentiment(
      (niftyRes.value[0] as { resultData?: { change_per?: number }[] })
        ?.resultData ?? [],
    )
    sourceUpdate('nifty-sentiment', 'ok')
  } else if (vrdAd?.advances !== null && vrdAd?.advances !== undefined) {
    niftySentiment = evaluateNiftySentimentFromAdvanceCount(vrdAd.advances)
    addLog(
      mkLog(
        'warn',
        'nifty-sentiment',
        `legacy source failed; using VRD A/D fallback=${niftySentiment}`,
      ),
    )
    sourceUpdate('nifty-sentiment', 'ok')
  } else {
    addLog(
      mkLog(
        'error',
        'nifty-sentiment',
        niftyRes.status === 'fulfilled'
          ? (niftyRes.value[1] ?? 'unknown')
          : 'fetch failed',
      ),
    )
    sourceUpdate('nifty-sentiment', 'error')
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
  } else if (upstoxPcr?.value != null) {
    pcrZone = evaluatePCR(upstoxPcr.value)
    addLog(
      mkLog(
        'warn',
        'option-chain',
        `OI data unavailable; using Upstox PCR=${upstoxPcr.value}`,
      ),
    )
  } else if (vrdPcr?.value != null) {
    pcrZone = evaluatePCR(vrdPcr.value)
    addLog(
      mkLog(
        'warn',
        'option-chain',
        `OI data unavailable; using VRD PCR=${vrdPcr.value}`,
      ),
    )
  } else if (vrdDashboard?.pcr != null) {
    pcrZone = evaluatePCR(vrdDashboard.pcr)
    addLog(
      mkLog(
        'warn',
        'option-chain',
        `OI data unavailable; using VRD dashboard PCR=${vrdDashboard.pcr}`,
      ),
    )
  }

  try {
    if (globalSentiment || niftySentiment || pcrZone) {
      v3 = getV3Signal(globalSentiment, niftySentiment, pcrZone)
      addLog(
        mkLog(
          'info',
          'v3',
          `signal=${v3} | global=${globalSentiment} | nifty=${niftySentiment} | pcr=${pcrZone}`,
        ),
      )
    }
  } catch (e) {
    addLog(mkLog('error', 'v3', `compute failed: ${(e as Error).message}`))
  }

  return { candles, optionChain, v3 }
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
  hardStop: { blocked: false, reasons: [] },
  lastUpdated: null,
  error: null,
  tradesCount: 0,
  logs: [],
  sourceStatus: {},
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
    const liveLog = (entry: BotLog) => tickLogs.push(entry)
    void liveLog // suppress unused warning — it's captured in closures below

    log('info', 'tick', `state=${cur.state} trades=${cur.tradesCount}`)

    try {
      const config = getStrategyConfig()

      // Step 1: fetch candles + option chain + V3 signal in parallel
      const market = await fetchMarket(token, (e) => tickLogs.push(e), srcUpd)
      const { candles, optionChain, v3 } = market

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
        cur.vrdData,
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
        indicators,
        vrdData,
        allSignalData,
        finalSignal,
        hardStop,
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        error: null,
      })
      saveSnapshot({
        indicators,
        vrdData,
        allSignalData,
        finalSignal,
        hardStop,
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
      })

      if (hardStop.blocked) {
        updateStatus({ state: 'STOPPED' })
        return
      }

      // Entry cutoff check
      const [lh, lm] = config.lastEntryTime.split(':').map(Number)
      const now = new Date()
      const afterCutoff =
        now.getHours() > lh || (now.getHours() === lh && now.getMinutes() >= lm)

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
          const dir = finalSignal.signal === 'BUY_CE' ? 'CE' : 'PE'
          const strike = getOtmStrike(optionChain, dir, config.otmSkip)
          if (!strike) {
            addLog(mkLog('warn', 'order', `no OTM strike found for ${dir}`))
            return
          }
          const instrumentKey =
            dir === 'CE'
              ? strike.call_options.instrument_key
              : strike.put_options.instrument_key
          const ltp =
            dir === 'CE'
              ? strike.call_options.market_data.ltp
              : strike.put_options.market_data.ltp
          const executionMode: ExecutionMode = config.executionMode
          let qty = finalSignal.positionSize === 'full' ? LOT_SIZE : LOT_SIZE
          let paperTrade: PaperTrade | null = null
          if (executionMode === 'paper') {
            let paperBalance: number | null = null
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

            if (paperBalance !== null) {
              const affordableQty = Math.floor(paperBalance / ltp)
              if (affordableQty <= 0) {
                addLog(
                  mkLog(
                    'warn',
                    'paper',
                    `Skipping paper BUY ${dir}: balance ₹${paperBalance.toFixed(2)} cannot afford 1 unit at ₹${ltp.toFixed(2)}`,
                  ),
                )
                updateStatus({
                  error: `Paper credit ₹${paperBalance.toFixed(2)} is below option price ₹${ltp.toFixed(2)}`,
                })
                return
              }
              if (affordableQty < qty) {
                addLog(
                  mkLog(
                    'warn',
                    'paper',
                    `Reducing paper quantity from ${qty} to ${affordableQty} to fit credit ₹${paperBalance.toFixed(2)}`,
                  ),
                )
                qty = affordableQty
              }
            }
          }

          addLog(
            mkLog(
              'info',
              'order',
              `placing BUY ${dir} ${instrumentKey} qty=${qty} ltp=${ltp}`,
            ),
          )

          if (executionMode === 'paper') {
            const [paperData, paperErr] = await safeFetch<{
              trade?: PaperTrade
              account?: PaperAccountSummary['account']
            }>('/api/paper/trades/enter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instrumentKey,
                direction: dir,
                quantity: qty,
                entryPrice: ltp,
                metadata: {
                  signal: finalSignal.signal,
                  confidence: finalSignal.confidence,
                  bullScore: finalSignal.bullScore,
                  bearScore: finalSignal.bearScore,
                },
              }),
            })
            if (paperErr || !paperData?.trade?.id) {
              addLog(
                mkLog(
                  'error',
                  'paper',
                  `Paper BUY failed: ${paperErr ?? JSON.stringify(paperData)}`,
                ),
              )
              updateStatus({ error: paperErr ?? 'Paper trade entry failed' })
              return
            }
            paperTrade = paperData.trade
            addLog(
              mkLog(
                'info',
                'paper',
                `Paper BUY created tradeId=${paperTrade.id}`,
              ),
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
                transactionType: 'BUY',
                quantity: qty,
              }),
            })
            if (
              orderErr ||
              (!orderData?.data?.order_id && orderData?.status !== 'success')
            ) {
              const failure = `BUY failed: ${orderErr ?? JSON.stringify(orderData)}`
              addLog(mkLog('error', 'order', failure))
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
              return
            }
            addLog(
              mkLog(
                'info',
                'order',
                `BUY placed orderId=${orderData?.data?.order_id ?? '—'}`,
              ),
            )
          }
          const position: ActivePosition = {
            instrumentKey,
            direction: dir,
            entryPrice: ltp,
            quantity: qty,
            entryTime: new Date().toISOString(),
            tradeId: Date.now(),
            executionMode,
            paperTradeId: paperTrade?.id,
          }
          updateStatus({
            state: 'ORDERED',
            position,
            tradesCount: cur.tradesCount + 1,
          })
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

        if (!match)
          addLog(
            mkLog(
              'warn',
              'position',
              `instrument not found in chain — using entry price as current`,
            ),
          )

        const { exit, reason } = shouldExit(
          cur.position,
          allSignalData,
          currentPrice,
          config,
        )
        if (exit) {
          if (isPaperPosition(cur.position)) {
            addLog(
              mkLog(
                'info',
                'paper',
                `exit triggered: ${reason} — closing paper trade`,
              ),
            )
            const [, paperExitErr] = await safeFetch('/api/paper/trades/exit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tradeId: cur.position.paperTradeId,
                exitPrice: currentPrice,
                metadata: { reason },
              }),
            })
            if (paperExitErr) {
              addLog(
                mkLog('error', 'paper', `Paper SELL failed: ${paperExitErr}`),
              )
              return
            }
            addLog(mkLog('info', 'paper', 'Paper SELL settled successfully'))
          } else {
            addLog(
              mkLog(
                'info',
                'order',
                `exit triggered: ${reason} — placing SELL`,
              ),
            )
            const [, sellErr] = await safeFetch('/api/order/place', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token,
                instrumentKey: cur.position.instrumentKey,
                transactionType: 'SELL',
                quantity: cur.position.quantity,
              }),
            })
            if (sellErr) {
              addLog(mkLog('error', 'order', `SELL failed: ${sellErr}`))
              return
            }
            addLog(mkLog('info', 'order', 'SELL placed successfully'))
          }
          const nextState: BotState =
            cur.tradesCount >= config.maxTradesPerDay ? 'STOPPED' : 'RUNNING'
          updateStatus({
            state: nextState,
            position: null,
            error: `Exited: ${reason}`,
          })
        } else {
          addLog(
            mkLog(
              'debug',
              'position',
              `holding — price=${currentPrice.toFixed(2)} pnl=${(((currentPrice - cur.position.entryPrice) / cur.position.entryPrice) * 100).toFixed(2)}%`,
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
