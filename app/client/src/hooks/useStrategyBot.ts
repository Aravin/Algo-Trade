import type {
  Candle,
  AllSignalData,
  ActivePosition,
  PositionLeg,
  ExecutionMode,
  VrdData,
  IndicatorsResult,
  FinalSignal,
  PaperTrade,
  PaperAccountSummary,
  BollingerSqueezeMetrics,
  UnderlyingSymbol,
} from '@/lib/types'
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react'
import {
  calcBollingerSqueezeMetrics,
  computeAllIndicators,
  getOtmStrike,
} from '@/lib/indicators'
import { notify } from '@/lib/notifications'
import {
  runHardStopChecks,
  getFinalSignal,
  shouldExit,
} from '@/lib/strategyEngine'
import { getStrategyConfig } from '@/lib/strategyConfig'
import { fetchPaperAccount } from '@/lib/paperTrading'
import { scoreStraddleIV } from '@/lib/vrdSignals'
import { appendTick } from '@/lib/tickLog'
import {
  isStaticIpRestrictionError,
  isPaperPosition,
  getLotSizeForSymbol,
} from '@/lib/syntheticCalculators'
import type { SourceStatus, BotLog, GlobalIndexItem } from '@/lib/marketService'
import {
  mkLog,
  safeFetch,
  fetchMarketForSymbols,
  fetchMarketSentiment,
} from '@/lib/marketService'

export type { SourceStatus, BotLog, GlobalIndexItem }

// ─── Types ─────────────────────────────────────────────────────────────────────
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
  squeezeMetrics: BollingerSqueezeMetrics | null
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

// ─── LocalStorage keys ─────────────────────────────────────────────────────────
const KEYS = {
  state: 'algo-trade:bot-state',
  position: 'algo-trade:bot-position',
  positions: 'algo-trade:bot-positions',
  trades: 'algo-trade:bot-trades-today',
  tradesPerSymbol: 'algo-trade:bot-trades-per-symbol',
  date: 'algo-trade:bot-trades-date',
  vrdCache: 'algo-trade:vrd-cache', // { data: VrdData; savedAt: string }
  logs: 'algo-trade:bot-logs', // BotLog[] (last 200)
  snapshot: 'algo-trade:bot-snapshot',
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

const DEFAULT_POSITIONS: Record<UnderlyingSymbol, ActivePosition | null> = {
  'NIFTY 50': null,
  BANKNIFTY: null,
  FINNIFTY: null,
}

// ─── Load persisted bot state ─────────────────────────────────────────────────
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

// ─── Hook ──────────────────────────────────────────────────────────────────────
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
  squeezeMetrics: null,
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

export function useStrategyBot(token: string | null) {
  const [status, setStatus] = useState<BotStatus>(() => ({
    ...INITIAL,
    ...loadPersisted(),
  }))
  const isTickingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastExitTimesRef = useRef<Record<string, number>>({})
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
      if ('positions' in partial && partial.positions) {
        localStorage.setItem(KEYS.positions, JSON.stringify(partial.positions))
        const primary =
          partial.positions['NIFTY 50'] ??
          Object.values(partial.positions).find(
            (p): p is ActivePosition => p !== null,
          ) ??
          null
        localStorage.setItem(KEYS.position, JSON.stringify(primary))
        next.position = primary
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
    if (isTickingRef.current) return
    isTickingRef.current = true
    const cur = statusRef.current
    if (cur.state === 'STOPPED' || cur.state === 'IDLE') {
      isTickingRef.current = false
      return
    }

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

    log('info', 'tick', `state=${cur.state} trades=${cur.tradesCount}`)

    try {
      const config = getStrategyConfig()

      // Step 1: Determine target active underlying symbols (Single or ALL_PARALLEL)
      const targetSymbols: UnderlyingSymbol[] =
        (config.underlyingMode ?? 'ALL_PARALLEL') === 'ALL_PARALLEL'
          ? ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY']
          : [config.underlyingMode as UnderlyingSymbol]

      // Step 1b: Fetch candles + option chains for all target symbols concurrently
      const marketMap = await fetchMarketForSymbols(
        token,
        (e) => tickLogs.push(e),
        srcUpd,
        targetSymbols,
      )

      const primaryMarket =
        marketMap['NIFTY 50'] ??
        marketMap[targetSymbols[0]] ??
        Object.values(marketMap)[0]

      if (!primaryMarket?.candles.length) {
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

      const { candles, optionChain, v3, breadth, globalIndices, giftNifty } =
        primaryMarket

      // Step 2: compute indicators for primary market
      const indicators = computeAllIndicators(candles, optionChain)

      // Step 3: fetch market sentiment (VIX, breadth, NSE PE, FII)
      const vrdData = await fetchMarketSentiment(
        token,
        (e) => tickLogs.push(e),
        srcUpd,
        optionChain,
        indicators,
        breadth,
        giftNifty,
      )
      saveVrdCache(vrdData)
      log(
        'info',
        'sentiment',
        `mmi=${vrdData.mmi?.score} vix=${vrdData.vix} pe=${vrdData.niftyPe?.pe} A/D=${vrdData.advancesDeclines?.advances}↑${vrdData.advancesDeclines?.declines}↓`,
      )
      const hardStop = runHardStopChecks(vrdData)
      const allSignalData: AllSignalData = {
        v3,
        indicators,
        vrd: vrdData,
        globalIndices,
      }
      const squeezeMetrics = calcBollingerSqueezeMetrics(
        candles,
        config.squeezeThresholdPct,
        config.minSqueezeCandles,
        config.adxMinThreshold,
      )

      // Evaluate & record signals for all active target symbols in parallel
      const symbolSignals: Partial<
        Record<UnderlyingSymbol, FinalSignal | null>
      > = {}
      const symbolIndicators: Partial<
        Record<UnderlyingSymbol, IndicatorsResult | null>
      > = {}

      for (const sym of targetSymbols) {
        const symMarket = marketMap[sym]
        if (!symMarket?.candles.length) continue
        const symIndicators = computeAllIndicators(
          symMarket.candles,
          symMarket.optionChain,
        )
        const symSignalData: AllSignalData = {
          v3: symMarket.v3,
          indicators: symIndicators,
          vrd: vrdData,
          globalIndices,
        }
        const symSignal = getFinalSignal(
          symSignalData,
          config,
          symMarket.candles,
        )
        symbolSignals[sym] = symSignal
        symbolIndicators[sym] = symIndicators
        log(
          'info',
          'engine',
          `[${sym}] bull=${symSignal.bullScore} bear=${symSignal.bearScore} → ${symSignal.signal} (${symSignal.confidence})`,
        )
      }

      const finalSignal =
        symbolSignals['NIFTY 50'] ??
        symbolSignals[primaryMarket.underlyingSymbol] ??
        Object.values(symbolSignals).find(
          (s): s is FinalSignal => s !== null,
        ) ??
        getFinalSignal(allSignalData, config, candles)

      // ── Tick log (threshold backtesting) ────────────────────────────────────
      appendTick({
        ts: Date.now(),
        bullScore: finalSignal.bullScore,
        bearScore: finalSignal.bearScore,
        scoreMax: finalSignal.scoreMax,
        confidence: finalSignal.confidence,
        signal: finalSignal.signal,
        vix: vrdData.vix,
        strongThreshold: config.strongThreshold,
        moderateThreshold: config.moderateThreshold,
        strongGap: config.strongGap,
        moderateGap: config.moderateGap,
      })

      if (hardStop.blocked)
        log('warn', 'engine', `HARD STOP: ${hardStop.reasons.join(', ')}`)

      addLogs(tickLogs)
      tickLogs.length = 0

      updateStatus({
        indicators,
        symbolIndicators,
        symbolSignals,
        vrdData,
        candles,
        allSignalData,
        finalSignal,
        squeezeMetrics,
        hardStop,
        globalIndices,
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
        globalIndices,
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
      })

      if (hardStop.blocked && hardStop.blockedDirection === 'BOTH') {
        const hasOpenPos = Object.values(cur.positions ?? {}).some(
          (p) => p !== null,
        )
        if (!hasOpenPos && !cur.position) {
          updateStatus({ state: 'STOPPED' })
          return
        }
      }

      // Entry cutoff check
      const [lh, lm] = config.lastEntryTime.split(':').map(Number)
      const nowIST = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      )
      const afterCutoff =
        nowIST.getHours() > lh ||
        (nowIST.getHours() === lh && nowIST.getMinutes() >= lm)

      const curPositions: Record<UnderlyingSymbol, ActivePosition | null> = {
        ...DEFAULT_POSITIONS,
        ...(cur.positions ?? {}),
      }
      if (
        cur.position &&
        !curPositions[cur.position.underlyingSymbol ?? 'NIFTY 50']
      ) {
        curPositions[cur.position.underlyingSymbol ?? 'NIFTY 50'] = cur.position
      }
      const curTradesPerSym: Partial<Record<UnderlyingSymbol, number>> = {
        ...(cur.tradesCountPerSymbol ?? {}),
      }

      // ── Step A: Order Placement Dispatcher for Multi-Symbol Candidates ─────
      if (
        (cur.state === 'RUNNING' || cur.state === 'ORDERED') &&
        !afterCutoff
      ) {
        const mode = config.multiSymbolExecutionMode ?? 'independent'
        interface CandidateEntry {
          symbol: UnderlyingSymbol
          signal: FinalSignal
        }
        let candidates: CandidateEntry[] = []

        if (mode === 'consensus') {
          const activeSigs = targetSymbols
            .map((sym) => ({ sym, sig: symbolSignals[sym] }))
            .filter(
              (item): item is { sym: UnderlyingSymbol; sig: FinalSignal } =>
                Boolean(item.sig) &&
                (item.sig?.signal === 'BUY_CE' ||
                  item.sig?.signal === 'BUY_PE'),
            )
          if (
            activeSigs.length === targetSymbols.length &&
            activeSigs.every((s) => s.sig.signal === activeSigs[0].sig.signal)
          ) {
            candidates = activeSigs
              .filter((item) => !curPositions[item.sym])
              .map((item) => ({ symbol: item.sym, signal: item.sig }))
          }
        } else if (mode === 'best_signal') {
          const eligible = targetSymbols
            .map((sym) => ({ sym, sig: symbolSignals[sym] }))
            .filter(
              (item): item is { sym: UnderlyingSymbol; sig: FinalSignal } =>
                Boolean(item.sig) &&
                !curPositions[item.sym] &&
                (item.sig?.signal === 'BUY_CE' ||
                  item.sig?.signal === 'BUY_PE'),
            )
          if (eligible.length > 0) {
            eligible.sort(
              (a, b) =>
                Math.max(b.sig.bullScore, b.sig.bearScore) -
                Math.max(a.sig.bullScore, a.sig.bearScore),
            )
            candidates = [{ symbol: eligible[0].sym, signal: eligible[0].sig }]
          }
        } else {
          // 'independent'
          candidates = targetSymbols
            .map((sym) => ({ sym, sig: symbolSignals[sym] }))
            .filter(
              (item): item is { sym: UnderlyingSymbol; sig: FinalSignal } =>
                Boolean(item.sig) &&
                !curPositions[item.sym] &&
                (item.sig?.signal === 'BUY_CE' ||
                  item.sig?.signal === 'BUY_PE'),
            )
            .map((item) => ({ symbol: item.sym, signal: item.sig }))
        }

        for (const candidate of candidates) {
          const { symbol: sym, signal: symSig } = candidate
          const symTradesCount = curTradesPerSym[sym] ?? 0
          if (symTradesCount >= config.maxTradesPerDay) {
            addLog(
              mkLog(
                'warn',
                'bot',
                `[${sym}] max trades/day (${config.maxTradesPerDay}) reached — skipping entry`,
              ),
            )
            continue
          }

          const lastExit = lastExitTimesRef.current[sym] ?? 0
          const COOLDOWN_MS = 60 * 1000 // 1 minute cooldown
          if (Date.now() - lastExit < COOLDOWN_MS) {
            continue
          }

          if (
            hardStop.blocked &&
            (hardStop.blockedDirection === 'BOTH' ||
              (hardStop.blockedDirection === 'CE' &&
                symSig.signal === 'BUY_CE') ||
              (hardStop.blockedDirection === 'PE' &&
                symSig.signal === 'BUY_PE'))
          ) {
            addLog(
              mkLog(
                'warn',
                'bot',
                `[${sym}] Entry ${symSig.signal} blocked by hard stop: ${hardStop.reasons.join(', ')}`,
              ),
            )
            continue
          }

          const symMarket = marketMap[sym]
          if (!symMarket?.optionChain.length) continue

          interface LegSetup {
            direction: 'CE' | 'PE'
            tradeType: 'buying' | 'selling'
          }
          const legsToPlace: LegSetup[] = []
          let activeTradeType: 'buying' | 'selling' = 'buying'
          if (config.tradeType === 'both') {
            const percentAboveAvg = vrdData?.straddleIv?.percentAboveAvg
            if (percentAboveAvg !== undefined && percentAboveAvg !== null) {
              const iv = scoreStraddleIV(percentAboveAvg)
              activeTradeType = iv.preferBuy ? 'buying' : 'selling'
            } else {
              activeTradeType = 'buying'
            }
          } else {
            activeTradeType = config.tradeType
          }

          legsToPlace.push({
            direction:
              activeTradeType === 'selling'
                ? symSig.signal === 'BUY_CE'
                  ? 'PE'
                  : 'CE'
                : symSig.signal === 'BUY_CE'
                  ? 'CE'
                  : 'PE',
            tradeType: activeTradeType,
          })

          let totalReq = 0
          for (const leg of legsToPlace) {
            const strike = getOtmStrike(
              symMarket.optionChain,
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
          const lotSize = getLotSizeForSymbol(
            symMarket.optionChain[0]?.call_options?.trading_symbol ?? sym,
          )
          let qty = symSig.positionSize === 'full' ? lotSize * 2 : lotSize

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
              const lotReq = totalReq * lotSize
              const affordableLots = Math.floor(paperBalance / lotReq)
              const affordableQty = affordableLots * lotSize
              if (affordableQty <= 0) {
                addLog(
                  mkLog(
                    'warn',
                    'paper',
                    `Skipping paper entry for ${sym}: balance ₹${paperBalance.toFixed(2)} cannot afford 1 lot (cost ₹${lotReq.toFixed(2)})`,
                  ),
                )
                continue
              }
              if (affordableQty < qty) {
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
              symMarket.optionChain,
              leg.direction,
              config.otmSkip,
            )
            if (!strike) {
              addLog(
                mkLog(
                  'warn',
                  'order',
                  `[${sym}] no OTM strike found for ${leg.direction}`,
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
                `[${sym}] placing ${side} ${leg.direction} ${instrumentKey} qty=${qty} ltp=${ltp}`,
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
                    signal: symSig.signal,
                    confidence: symSig.confidence,
                    bullScore: symSig.bullScore,
                    bearScore: symSig.bearScore,
                    tradeType: leg.tradeType,
                    tradingSymbol:
                      leg.direction === 'CE'
                        ? strike.call_options.trading_symbol
                        : strike.put_options.trading_symbol,
                    strikePrice: strike.strike_price,
                    expiry: strike.expiry,
                    underlyingSymbol: sym,
                  },
                }),
              })
              if (paperErr || !paperData?.trade?.id) {
                addLog(
                  mkLog(
                    'error',
                    'paper',
                    `[${sym}] Paper ${side} failed: ${paperErr ?? JSON.stringify(paperData)}`,
                  ),
                )
                success = false
                break
              }
              paperTradeId = paperData.trade.id
              const lotsCount = lotSize > 1 ? Math.round(qty / lotSize) : null
              const lotLabel = lotsCount
                ? ` (${lotsCount} ${lotsCount > 1 ? 'lots' : 'lot'})`
                : ''
              notify(
                `Paper Trade Executed [${sym}]`,
                `Paper ${side} ${leg.direction} ${qty}qty${lotLabel} (${instrumentKey}) placed`,
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
                (!orderData?.data?.order_id && orderData?.status !== 'success')
              ) {
                const failure = `[${sym}] ${side} failed: ${orderErr ?? JSON.stringify(orderData)}`
                addLog(mkLog('error', 'order', failure))
                success = false
                if (isStaticIpRestrictionError(orderErr)) {
                  const hasActivePos = Object.values(curPositions).some(
                    (p) => p !== null,
                  )
                  if (!hasActivePos) {
                    if (intervalRef.current) clearInterval(intervalRef.current)
                    intervalRef.current = null
                    updateStatus({
                      state: 'STOPPED',
                      error:
                        'Order placement blocked by Upstox static IP restriction. Configure a static IP in Upstox or use a whitelisted execution environment.',
                    })
                  } else {
                    updateStatus({
                      error:
                        'Order placement blocked by Upstox static IP restriction. Maintaining active position ticker.',
                    })
                  }
                  addLog(
                    mkLog(
                      'warn',
                      'bot',
                      'Upstox order API is blocked by static IP restriction',
                    ),
                  )
                }
                break
              }
              const lotsCount = lotSize > 1 ? Math.round(qty / lotSize) : null
              const lotLabel = lotsCount
                ? ` (${lotsCount} ${lotsCount > 1 ? 'lots' : 'lot'})`
                : ''
              notify(
                `Trade Executed [${sym}]`,
                `${side} ${leg.direction} ${qty}qty${lotLabel} (${instrumentKey}) placed successfully`,
                'success',
              )
            }

            positionLegs.push({
              instrumentKey,
              direction: leg.direction,
              entryPrice: ltp,
              currentPrice: ltp,
              unrealizedPnl: 0,
              quantity: qty,
              tradeType: leg.tradeType,
              paperTradeId,
            })
          }

          if (success) {
            const newPos: ActivePosition = {
              instrumentKey: firstInstrumentKey,
              direction: firstDirection,
              entryPrice: firstEntryPrice,
              currentPrice: firstEntryPrice,
              unrealizedPnl: 0,
              quantity: qty,
              entryTime: new Date().toISOString(),
              tradeId: Date.now(),
              executionMode,
              tradeType: activeTradeType,
              legs: positionLegs,
              underlyingSymbol: sym,
            }
            curPositions[sym] = newPos
            curTradesPerSym[sym] = (curTradesPerSym[sym] ?? 0) + 1
          } else if (positionLegs.length > 0) {
            if (executionMode === 'paper') {
              // Clean up orphaned paper trade legs in D1 if multi-leg entry fails mid-way
              for (const leg of positionLegs) {
                if (leg.paperTradeId) {
                  const [, rollbackErr] = await safeFetch(
                    '/api/paper/trades/exit',
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tradeId: leg.paperTradeId,
                        exitPrice: leg.entryPrice,
                        isRollback: true,
                        metadata: {
                          reason: 'Rollback due to multi-leg entry failure',
                          isRollback: true,
                        },
                      }),
                    },
                  )
                  if (rollbackErr) {
                    addLog(
                      mkLog(
                        'warn',
                        'paper',
                        `[${sym}] Rollback failed for orphaned leg ${leg.instrumentKey}: ${rollbackErr}`,
                      ),
                    )
                  }
                }
              }
            } else {
              addLog(
                mkLog(
                  'warn',
                  'order',
                  `[${sym}] Multi-leg live entry partially failed. Recording ${positionLegs.length} active leg(s) into state for tracking and exit management.`,
                ),
              )
              const partialPos: ActivePosition = {
                instrumentKey: firstInstrumentKey,
                direction: firstDirection,
                entryPrice: firstEntryPrice,
                currentPrice: firstEntryPrice,
                unrealizedPnl: 0,
                quantity: qty,
                entryTime: new Date().toISOString(),
                tradeId: Date.now(),
                executionMode,
                tradeType: activeTradeType,
                legs: positionLegs,
                underlyingSymbol: sym,
              }
              curPositions[sym] = partialPos
              curTradesPerSym[sym] = (curTradesPerSym[sym] ?? 0) + 1
            }
          }
        }
      } else if (
        (cur.state === 'RUNNING' || cur.state === 'ORDERED') &&
        afterCutoff
      ) {
        addLog(
          mkLog(
            'warn',
            'bot',
            `after last entry time ${config.lastEntryTime} — skipping new entries`,
          ),
        )
      }

      // ── Step B: Multi-Position Exit Routine for Active Symbols ───────────────
      for (const sym of targetSymbols) {
        const pos = curPositions[sym]
        if (!pos) continue
        const symMarket = marketMap[sym]
        const symOptionChain = symMarket?.optionChain ?? []
        const posKey = pos.instrumentKey
        const match = symOptionChain.find(
          (o) =>
            o.call_options.instrument_key === posKey ||
            o.put_options.instrument_key === posKey,
        )
        const currentPrice = match
          ? pos.direction === 'CE'
            ? match.call_options.market_data.ltp
            : match.put_options.market_data.ltp
          : (pos.currentPrice ?? pos.entryPrice)

        let updatedLegs: PositionLeg[] | undefined
        let totalUnrealizedPnl = 0

        if (pos.legs && pos.legs.length > 0) {
          updatedLegs = pos.legs.map((leg) => {
            const legKey = leg.instrumentKey
            const legMatch = symOptionChain.find(
              (o) =>
                o.call_options.instrument_key === legKey ||
                o.put_options.instrument_key === legKey,
            )
            const legCurrentPrice = legMatch
              ? leg.direction === 'CE'
                ? legMatch.call_options.market_data.ltp
                : legMatch.put_options.market_data.ltp
              : (leg.currentPrice ?? leg.entryPrice)

            const legUrPnl =
              leg.tradeType === 'selling'
                ? (leg.entryPrice - legCurrentPrice) * leg.quantity
                : (legCurrentPrice - leg.entryPrice) * leg.quantity
            totalUnrealizedPnl += legUrPnl

            return {
              ...leg,
              currentPrice: legCurrentPrice,
              unrealizedPnl: legUrPnl,
            }
          })
        } else {
          const isSelling = pos.tradeType === 'selling'
          totalUnrealizedPnl = isSelling
            ? (pos.entryPrice - currentPrice) * pos.quantity
            : (currentPrice - pos.entryPrice) * pos.quantity
        }

        curPositions[sym] = {
          ...pos,
          currentPrice,
          unrealizedPnl: totalUnrealizedPnl,
          legs: updatedLegs,
        }

        const symSigData: AllSignalData = {
          v3: symMarket?.v3 ?? v3,
          indicators: symbolIndicators[sym] ?? indicators,
          vrd: vrdData,
          globalIndices,
        }
        const { exit: signalExit, reason: signalReason } = shouldExit(
          pos,
          symSigData,
          currentPrice,
          config,
        )
        const exit =
          signalExit ||
          afterCutoff ||
          (hardStop.blocked && hardStop.blockedDirection === 'BOTH')
        const reason = afterCutoff
          ? `EOD forced exit — after ${config.lastEntryTime}`
          : hardStop.blocked && hardStop.blockedDirection === 'BOTH'
            ? `Hard Stop triggered — ${hardStop.reasons.join(', ')}`
            : signalReason

        if (exit) {
          const legsSource =
            updatedLegs && updatedLegs.length > 0 ? updatedLegs : pos.legs
          const allLegs =
            legsSource && legsSource.length > 0
              ? legsSource
              : [
                  {
                    instrumentKey: pos.instrumentKey,
                    direction: pos.direction,
                    entryPrice: pos.entryPrice,
                    quantity: pos.quantity,
                    tradeType:
                      pos.tradeType === 'selling'
                        ? ('selling' as const)
                        : ('buying' as const),
                    paperTradeId: pos.paperTradeId,
                    currentPrice,
                  },
                ]

          const exitedLegsSet = new Set(pos.exitedLegs ?? [])
          let allLegsCleared = true

          for (const leg of allLegs) {
            if (exitedLegsSet.has(leg.instrumentKey)) {
              continue // skip leg already exited or reconciled on previous tick
            }
            const isSelling = leg.tradeType === 'selling'
            const exitTxType = isSelling ? 'BUY' : 'SELL'
            if (isPaperPosition(pos)) {
              addLog(
                mkLog(
                  'info',
                  'paper',
                  `[${sym}] exit triggered: ${reason} — closing paper trade leg ${leg.instrumentKey}`,
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
                const isTerminalClosed =
                  paperExitErr.includes('TRADE_ALREADY_CLOSED') ||
                  paperExitErr.includes('TRADE_NOT_FOUND') ||
                  paperExitErr.toLowerCase().includes('already closed') ||
                  /^HTTP (400|404)\b/i.test(paperExitErr)
                if (isTerminalClosed) {
                  addLog(
                    mkLog(
                      'warn',
                      'paper',
                      `[${sym}] Paper trade leg ${leg.instrumentKey} was already closed on server (${paperExitErr}). Reconciling state.`,
                    ),
                  )
                  notify(
                    `Paper Trade Reconciled [${sym}]`,
                    `Paper trade leg ${leg.instrumentKey} was already closed on server.`,
                    'info',
                  )
                  exitedLegsSet.add(leg.instrumentKey)
                } else {
                  addLog(
                    mkLog(
                      'error',
                      'paper',
                      `[${sym}] Paper ${exitTxType} failed for ${leg.instrumentKey}: ${paperExitErr}`,
                    ),
                  )
                  allLegsCleared = false
                }
              } else {
                notify(
                  `Paper Trade Exited [${sym}]`,
                  `Paper ${exitTxType} settled for ${leg.instrumentKey}. Reason: ${reason}`,
                  'info',
                )
                exitedLegsSet.add(leg.instrumentKey)
              }
            } else {
              addLog(
                mkLog(
                  'info',
                  'order',
                  `[${sym}] exit triggered: ${reason} — placing ${exitTxType} for ${leg.instrumentKey}`,
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
                    `[${sym}] ${exitTxType} failed for ${leg.instrumentKey}: ${sellErr}`,
                  ),
                )
                allLegsCleared = false
              } else {
                notify(
                  `Trade Exited [${sym}]`,
                  `${exitTxType} order placed for ${leg.instrumentKey}. Reason: ${reason}`,
                  'info',
                )
                exitedLegsSet.add(leg.instrumentKey)
              }
            }
          }
          if (allLegsCleared) {
            curPositions[sym] = null
            lastExitTimesRef.current[sym] = Date.now()
            addLog(mkLog('info', 'bot', `[${sym}] position exited: ${reason}`))
          } else {
            curPositions[sym] = {
              ...pos,
              exitedLegs: Array.from(exitedLegsSet),
            }
          }
        }
      }

      // ── Step C: Final State Sync ─────────────────────────────────────────────
      const hasActivePosition = Object.values(curPositions).some(
        (p) => p !== null,
      )
      const totalTrades = Object.values(curTradesPerSym).reduce(
        (acc, count) => acc + (count ?? 0),
        0,
      )
      const nextState: BotState = hasActivePosition
        ? 'ORDERED'
        : afterCutoff
          ? 'STOPPED'
          : 'RUNNING'

      const primaryPos =
        curPositions['NIFTY 50'] ??
        Object.values(curPositions).find(
          (p): p is ActivePosition => p !== null,
        ) ??
        null

      updateStatus({
        state: nextState,
        position: primaryPos,
        positions: curPositions,
        tradesCount: totalTrades,
        tradesCountPerSymbol: curTradesPerSym,
        symbolSignals,
        symbolIndicators,
        indicators,
        vrdData,
        candles,
        allSignalData,
        finalSignal,
        squeezeMetrics,
        hardStop,
        globalIndices,
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        error: null,
      })
    } catch (err) {
      const msg = (err as Error).message
      addLogs([...tickLogs, mkLog('error', 'tick', `unhandled: ${msg}`)])
      updateStatus({ error: msg })
    } finally {
      isTickingRef.current = false
    }
  }, [token, updateStatus, addLogs, addLog])

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
