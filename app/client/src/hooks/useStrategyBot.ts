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
  indicators: IndicatorsResult | null
  vrdData: VrdData | null
  allSignalData: AllSignalData | null
  finalSignal: FinalSignal | null
  squeezeMetrics: BollingerSqueezeMetrics | null
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
  candles: Candle[]
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

// ─── Hook ──────────────────────────────────────────────────────────────────────
const INITIAL: BotStatus = {
  state: 'IDLE',
  position: null,
  indicators: null,
  vrdData: null,
  allSignalData: null,
  finalSignal: null,
  squeezeMetrics: null,
  hardStop: { blocked: false, blockedDirection: 'NONE', reasons: [] },
  lastUpdated: null,
  error: null,
  tradesCount: 0,
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
      let positionUpdate: Partial<BotStatus> = {}

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
      const hardStop = runHardStopChecks(vrdData, globalIndices)
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
      const finalSignal = getFinalSignal(allSignalData, config, candles)

      // Evaluate & Log signals for all active target symbols in parallel
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
        log(
          'info',
          'engine',
          `[${sym}] bull=${symSignal.bullScore} bear=${symSignal.bearScore} → ${symSignal.signal} (${symSignal.confidence})`,
        )
      }

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
        ...positionUpdate,
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
        if (!cur.position) {
          updateStatus({ state: 'STOPPED' })
          return
        }
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
            (hardStop.blockedDirection === 'BOTH' ||
              (hardStop.blockedDirection === 'CE' &&
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
            let activeTradeType: 'buying' | 'selling' = 'buying'
            if (config.tradeType === 'both') {
              const percentAboveAvg = vrdData?.straddleIv?.percentAboveAvg
              if (percentAboveAvg !== undefined && percentAboveAvg !== null) {
                const iv = scoreStraddleIV(percentAboveAvg)
                activeTradeType = iv.preferBuy ? 'buying' : 'selling'
              } else {
                activeTradeType = 'buying'
              }
              addLog(
                mkLog(
                  'info',
                  'bot',
                  `Trade type 'both' resolved to '${activeTradeType}' based on Straddle IV (percentAboveAvg=${percentAboveAvg ?? 'null'})`,
                ),
              )
            } else {
              activeTradeType = config.tradeType
            }

            legsToPlace.push({
              direction:
                activeTradeType === 'selling'
                  ? finalSignal.signal === 'BUY_CE'
                    ? 'PE'
                    : 'CE'
                  : finalSignal.signal === 'BUY_CE'
                    ? 'CE'
                    : 'PE',
              tradeType: activeTradeType,
            })

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
            const lotSize =
              optionChain.length > 0
                ? getLotSizeForSymbol(
                    optionChain[0].call_options.instrument_key,
                  )
                : 25
            let qty =
              finalSignal.positionSize === 'full' ? lotSize * 2 : lotSize

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
                      `Skipping paper entry: balance ₹${paperBalance.toFixed(2)} cannot afford even 1 lot (cost ₹${lotReq.toFixed(2)})`,
                    ),
                  )
                  updateStatus({
                    error: `Paper credit ₹${paperBalance.toFixed(2)} is below required margin/cost per lot ₹${lotReq.toFixed(2)}`,
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
                const lotsCount = lotSize > 1 ? Math.round(qty / lotSize) : null
                const lotLabel = lotsCount
                  ? ` (${lotsCount} ${lotsCount > 1 ? 'lots' : 'lot'})`
                  : ''
                notify(
                  'Paper Trade Executed',
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
                const lotsCount = lotSize > 1 ? Math.round(qty / lotSize) : null
                const lotLabel = lotsCount
                  ? ` (${lotsCount} ${lotsCount > 1 ? 'lots' : 'lot'})`
                  : ''
                notify(
                  'Trade Executed',
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
              const position: ActivePosition = {
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
        const posKey = cur.position.instrumentKey
        const match = optionChain.find(
          (o) =>
            o.call_options.instrument_key === posKey ||
            o.put_options.instrument_key === posKey,
        )
        const currentPrice = match
          ? cur.position.direction === 'CE'
            ? match.call_options.market_data.ltp
            : match.put_options.market_data.ltp
          : (cur.position.currentPrice ?? cur.position.entryPrice)

        let updatedLegs: PositionLeg[] | undefined
        let totalUnrealizedPnl = 0

        if (cur.position.legs && cur.position.legs.length > 0) {
          updatedLegs = cur.position.legs.map((leg) => {
            const legKey = leg.instrumentKey
            const legMatch = optionChain.find(
              (o) =>
                o.call_options.instrument_key === legKey ||
                o.put_options.instrument_key === legKey,
            )
            if (!legMatch && legKey) {
              log(
                'warn',
                'position',
                `leg instrument ${legKey} not found in chain`,
              )
            }
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
          const isSelling = cur.position.tradeType === 'selling'
          totalUnrealizedPnl = isSelling
            ? (cur.position.entryPrice - currentPrice) * cur.position.quantity
            : (currentPrice - cur.position.entryPrice) * cur.position.quantity
        }

        positionUpdate = {
          position: {
            ...cur.position,
            currentPrice,
            unrealizedPnl: totalUnrealizedPnl,
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
            cur.tradesCount >= config.maxTradesPerDay ||
            (hardStop.blocked && hardStop.blockedDirection === 'BOTH')
              ? 'STOPPED'
              : 'RUNNING'
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
