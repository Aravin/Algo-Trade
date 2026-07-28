import { useState, useCallback, useRef, useLayoutEffect } from 'react'
import type {
  Candle,
  AllSignalData,
  ActivePosition,
  VrdData,
  IndicatorsResult,
  FinalSignal,
  UnderlyingSymbol,
} from '@/lib/types'
import {
  STORAGE_KEY_BOT_STATE,
  STORAGE_KEY_BOT_POSITION,
  STORAGE_KEY_BOT_POSITIONS,
  STORAGE_KEY_BOT_TRADES_TODAY,
  STORAGE_KEY_BOT_TRADES_PER_SYMBOL,
  STORAGE_KEY_BOT_TRADES_DATE,
  STORAGE_KEY_VRD_CACHE,
  STORAGE_KEY_BOT_LOGS,
  STORAGE_KEY_BOT_SNAPSHOT,
  STORAGE_KEY_BOT_EXIT_TIMES,
  MAX_LOGS,
  VRD_CACHE_MAX_MS,
} from '@/lib/constants'
import type { SourceStatus, BotLog, GlobalIndexItem } from '@/lib/marketService'

export type BotState = 'IDLE' | 'RUNNING' | 'ORDERED' | 'STOPPED'

export interface BotStatus {
  state: BotState
  position: ActivePosition | null
  positions: Record<UnderlyingSymbol, ActivePosition | null>
  indicators: IndicatorsResult | null
  symbolIndicators: Partial<Record<UnderlyingSymbol, IndicatorsResult | null>>
  vrdData: VrdData | null
  allSignalData: AllSignalData | null
  finalSignal: FinalSignal | null
  symbolSignals: Partial<Record<UnderlyingSymbol, FinalSignal | null>>
  hardStop: {
    blocked: boolean
    blockedDirection?: 'CE' | 'PE' | 'BOTH' | 'NONE'
    reasons: string[]
  }
  lastUpdated: string | null
  error: string | null
  tradesCount: number
  tradesCountPerSymbol: Partial<Record<UnderlyingSymbol, number>>
  logs: BotLog[]
  sourceStatus: Record<string, SourceStatus>
  globalIndices: GlobalIndexItem[] | null
  candles: Candle[]
}

export type BotSnapshot = Pick<
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

const KEYS = {
  state: STORAGE_KEY_BOT_STATE,
  position: STORAGE_KEY_BOT_POSITION,
  positions: STORAGE_KEY_BOT_POSITIONS,
  trades: STORAGE_KEY_BOT_TRADES_TODAY,
  tradesPerSymbol: STORAGE_KEY_BOT_TRADES_PER_SYMBOL,
  date: STORAGE_KEY_BOT_TRADES_DATE,
  vrdCache: STORAGE_KEY_VRD_CACHE,
  logs: STORAGE_KEY_BOT_LOGS,
  snapshot: STORAGE_KEY_BOT_SNAPSHOT,
  exitTimes: STORAGE_KEY_BOT_EXIT_TIMES,
}

export function loadExitTimes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEYS.exitTimes) ?? '{}') as Record<
      string,
      number
    >
  } catch {
    return {}
  }
}

export function saveExitTimes(exitTimes: Record<string, number>) {
  setTimeout(() => {
    try {
      localStorage.setItem(KEYS.exitTimes, JSON.stringify(exitTimes))
    } catch {
      /* ignore */
    }
  }, 0)
}

function loadLogs(): BotLog[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.logs) ?? '[]') as BotLog[]
  } catch {
    return []
  }
}

function saveLogs(logs: BotLog[]) {
  setTimeout(() => {
    try {
      localStorage.setItem(KEYS.logs, JSON.stringify(logs.slice(-MAX_LOGS)))
    } catch (error) {
      console.error('Failed to save logs to localStorage', error)
    }
  }, 0)
}

export function saveVrdCache(data: VrdData) {
  setTimeout(() => {
    try {
      localStorage.setItem(
        KEYS.vrdCache,
        JSON.stringify({ data, savedAt: new Date().toISOString() }),
      )
    } catch (error) {
      console.error('Failed to save VRD cache to localStorage', error)
    }
  }, 0)
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

export function saveSnapshot(snapshot: BotSnapshot) {
  setTimeout(() => {
    try {
      localStorage.setItem(KEYS.snapshot, JSON.stringify(snapshot))
    } catch (error) {
      console.error('Failed to save snapshot to localStorage', error)
    }
  }, 0)
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

export const DEFAULT_POSITIONS: Record<
  UnderlyingSymbol,
  ActivePosition | null
> = {
  'NIFTY 50': null,
  BANKNIFTY: null,
  FINNIFTY: null,
}

function loadPersisted(): Partial<BotStatus> {
  try {
    const rawState = localStorage.getItem(KEYS.state) as BotState | null
    const position = JSON.parse(
      localStorage.getItem(KEYS.position) ?? 'null',
    ) as ActivePosition | null
    let positions = { ...DEFAULT_POSITIONS }
    try {
      const rawPositions = localStorage.getItem(KEYS.positions)
      if (rawPositions) {
        positions = {
          ...DEFAULT_POSITIONS,
          ...(JSON.parse(rawPositions) as Record<
            UnderlyingSymbol,
            ActivePosition | null
          >),
        }
      } else if (position) {
        const sym = position.underlyingSymbol ?? 'NIFTY 50'
        positions[sym] = position
      }
    } catch {
      positions = { ...DEFAULT_POSITIONS }
    }

    const savedDate = localStorage.getItem(KEYS.date)
    const today = new Date().toISOString().split('T')[0]
    const tradesCount =
      savedDate === today
        ? parseInt(localStorage.getItem(KEYS.trades) ?? '0')
        : 0
    let tradesCountPerSymbol: Partial<Record<UnderlyingSymbol, number>> = {}
    try {
      if (savedDate === today) {
        tradesCountPerSymbol = JSON.parse(
          localStorage.getItem(KEYS.tradesPerSymbol) ?? '{}',
        ) as Partial<Record<UnderlyingSymbol, number>>
      }
    } catch {
      tradesCountPerSymbol = {}
    }

    if (savedDate !== today) {
      localStorage.setItem(KEYS.date, today)
      localStorage.setItem(KEYS.trades, '0')
      localStorage.setItem(KEYS.tradesPerSymbol, '{}')
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

    const primaryPosition =
      positions['NIFTY 50'] ??
      Object.values(positions).find((p): p is ActivePosition => p !== null) ??
      null

    return {
      state,
      position: primaryPosition,
      positions,
      tradesCount,
      tradesCountPerSymbol,
      vrdData,
      logs,
      ...snapshot,
      sourceStatus,
    }
  } catch {
    return {
      state: 'IDLE',
      position: null,
      positions: { ...DEFAULT_POSITIONS },
      tradesCount: 0,
      tradesCountPerSymbol: {},
      vrdData: null,
      logs: [],
    }
  }
}

const INITIAL: BotStatus = {
  state: 'IDLE',
  position: null,
  positions: { ...DEFAULT_POSITIONS },
  indicators: null,
  symbolIndicators: {},
  vrdData: null,
  allSignalData: null,
  finalSignal: null,
  symbolSignals: {},
  hardStop: { blocked: false, blockedDirection: 'NONE', reasons: [] },
  lastUpdated: null,
  error: null,
  tradesCount: 0,
  tradesCountPerSymbol: {},
  logs: [],
  sourceStatus: {},
  globalIndices: null,
  candles: [],
}

export function useBotState() {
  const [status, setStatus] = useState<BotStatus>(() => ({
    ...INITIAL,
    ...loadPersisted(),
  }))
  const statusRef = useRef<BotStatus>(status)

  useLayoutEffect(() => {
    statusRef.current = status
  })

  const updateStatus = useCallback((partial: Partial<BotStatus>) => {
    setStatus((prev) => {
      let finalError = partial.error !== undefined ? partial.error : prev.error
      if (
        prev.error?.includes('static IP restriction') &&
        partial.error === null &&
        partial.state !== 'IDLE'
      ) {
        finalError = prev.error
      }

      const next = { ...prev, ...partial, error: finalError }
      statusRef.current = next

      setTimeout(() => {
        if (partial.state !== undefined)
          localStorage.setItem(KEYS.state, partial.state)
        if ('positions' in partial && partial.positions) {
          localStorage.setItem(
            KEYS.positions,
            JSON.stringify(partial.positions),
          )
          const primary =
            partial.positions['NIFTY 50'] ??
            Object.values(partial.positions).find(
              (p): p is ActivePosition => p !== null,
            ) ??
            null
          localStorage.setItem(KEYS.position, JSON.stringify(primary))
        } else if ('position' in partial) {
          localStorage.setItem(KEYS.position, JSON.stringify(partial.position))
        }
        if (partial.tradesCount !== undefined)
          localStorage.setItem(KEYS.trades, String(partial.tradesCount))
        if (partial.tradesCountPerSymbol !== undefined)
          localStorage.setItem(
            KEYS.tradesPerSymbol,
            JSON.stringify(partial.tradesCountPerSymbol),
          )
      }, 0)

      return next
    })
  }, [])

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

  return {
    status,
    statusRef,
    updateStatus,
    addLog,
    addLogs,
    clearLogs,
  }
}
