import { useEffect, useRef, useCallback } from 'react'
import type {
  AllSignalData,
  ActivePosition,
  VrdData,
  IndicatorsResult,
  FinalSignal,
  UnderlyingSymbol,
} from '@/lib/types'
import { UNDERLYING_INSTRUMENT_KEYS } from '@/lib/types'
import { computeAllIndicators } from '@/lib/indicators'
import { runHardStopChecks, getFinalSignal } from '@/lib/strategyEngine'
import { getStrategyConfig } from '@/lib/strategyConfig'
import { appendTick } from '@/lib/tickLog'
import type { SourceStatus, BotLog } from '@/lib/marketService'
import {
  mkLog,
  fetchMarketForSymbols,
  fetchGlobalMarketData,
  fetchSymbolSentiment,
} from '@/lib/marketService'
import {
  useBotState,
  saveSnapshot,
  saveVrdCache,
  saveExitTimes,
  DEFAULT_POSITIONS,
  loadExitTimes,
} from './useBotState'
import { useTradeExecution, type ExecutionContext } from './useTradeExecution'

export type { SourceStatus, BotLog, GlobalIndexItem } from '@/lib/marketService'
export type { BotState, BotStatus } from './useBotState'

export function useStrategyBot(token: string | null) {
  const { status, statusRef, updateStatus, addLog, addLogs, clearLogs } =
    useBotState()
  const { evaluateAndEnter, evaluateAndExit } = useTradeExecution()

  const isTickingRef = useRef(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastExitTimesRef = useRef<Record<string, number>>(loadExitTimes())
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const tick = useCallback(async () => {
    if (!token) return
    if (isTickingRef.current) return
    isTickingRef.current = true

    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

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

    const srcUpdates: Record<string, SourceStatus> = {}
    const srcUpd = (k: string, s: SourceStatus) => {
      srcUpdates[k] = s
    }

    log('info', 'tick', `state=${cur.state} trades=${cur.tradesCount}`)

    try {
      const config = getStrategyConfig()
      const allowedSymbols: UnderlyingSymbol[] =
        (config.underlyingMode ?? 'ALL_PARALLEL') === 'ALL_PARALLEL'
          ? ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY']
          : [config.underlyingMode as UnderlyingSymbol]

      const targetSymbolsSet = new Set<UnderlyingSymbol>(allowedSymbols)
      Object.entries(cur.positions ?? {}).forEach(([sym, pos]) => {
        if (pos !== null) {
          targetSymbolsSet.add(sym as UnderlyingSymbol)
        }
      })
      const targetSymbols = Array.from(targetSymbolsSet)

      const marketMap = await fetchMarketForSymbols(
        token,
        (e) => tickLogs.push(e),
        srcUpd,
        targetSymbols,
        abort.signal,
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

      const globalData = await fetchGlobalMarketData(
        token,
        (e) => tickLogs.push(e),
        srcUpd,
        primaryMarket.optionChain,
        targetSymbols,
        abort.signal,
      )

      const symbolSignals: Partial<
        Record<UnderlyingSymbol, FinalSignal | null>
      > = {}
      const symbolIndicators: Partial<
        Record<UnderlyingSymbol, IndicatorsResult | null>
      > = {}
      const symbolVrds: Partial<Record<UnderlyingSymbol, VrdData>> = {}

      await Promise.all(
        targetSymbols.map(async (sym) => {
          const symMarket = marketMap[sym]
          if (!symMarket?.candles.length) return
          const symIndicators = computeAllIndicators(
            symMarket.candles,
            symMarket.optionChain,
          )
          const targetInstrumentKey =
            UNDERLYING_INSTRUMENT_KEYS[sym] ?? 'NSE_INDEX|Nifty 50'

          const symVrdData = await fetchSymbolSentiment(
            token,
            (e) => tickLogs.push(e),
            srcUpd,
            sym,
            targetInstrumentKey,
            symMarket.optionChain,
            symIndicators,
            primaryMarket.breadth,
            primaryMarket.giftNifty,
            globalData,
            abort.signal,
          )

          const symSignalData: AllSignalData = {
            v3: symMarket.v3,
            indicators: symIndicators,
            vrd: symVrdData,
            globalIndices: symMarket.globalIndices,
          }
          const symSignal = getFinalSignal(symSignalData, config)
          symbolSignals[sym] = symSignal
          symbolIndicators[sym] = symIndicators
          symbolVrds[sym] = symVrdData

          log(
            'info',
            'engine',
            `[${sym}] bull=${symSignal.bullScore} bear=${symSignal.bearScore} → ${symSignal.signal} (${symSignal.confidence})`,
          )
        }),
      )

      const primaryVrdData = symbolVrds[primaryMarket.underlyingSymbol] ?? null
      if (primaryVrdData) {
        saveVrdCache(primaryVrdData)
        log(
          'info',
          'sentiment',
          `mmi=${primaryVrdData.mmi?.score} vix=${primaryVrdData.vix} pe=${primaryVrdData.niftyPe?.pe} A/D=${primaryVrdData.advancesDeclines?.advances}↑${primaryVrdData.advancesDeclines?.declines}↓`,
        )
      }

      const hardStop = primaryVrdData
        ? runHardStopChecks(primaryVrdData)
        : { blocked: false, blockedDirection: 'NONE' as const, reasons: [] }

      const indicators =
        symbolIndicators[primaryMarket.underlyingSymbol] ??
        computeAllIndicators(primaryMarket.candles, primaryMarket.optionChain)

      const allSignalData: AllSignalData = {
        v3: primaryMarket.v3,
        indicators,
        vrd: primaryVrdData ?? null,
        globalIndices: primaryMarket.globalIndices,
      }

      const finalSignal =
        symbolSignals['NIFTY 50'] ??
        symbolSignals[primaryMarket.underlyingSymbol] ??
        Object.values(symbolSignals).find(
          (s): s is FinalSignal => s !== null,
        ) ??
        getFinalSignal(allSignalData, config)

      appendTick({
        ts: Date.now(),
        bullScore: finalSignal.bullScore,
        bearScore: finalSignal.bearScore,
        scoreMax: finalSignal.scoreMax,
        confidence: finalSignal.confidence,
        signal: finalSignal.signal,
        vix: primaryVrdData?.vix ?? null,
        strongThreshold: config.strongThreshold,
        moderateThreshold: config.moderateThreshold,
        strongGap: config.strongGap,
        moderateGap: config.moderateGap,
      })

      if (hardStop.blocked)
        log('warn', 'engine', `HARD STOP: ${hardStop.reasons.join(', ')}`)

      addLogs(tickLogs)
      tickLogs.length = 0

      saveSnapshot({
        indicators,
        vrdData: primaryVrdData ?? null,
        allSignalData,
        finalSignal,
        hardStop,
        globalIndices: primaryMarket.globalIndices,
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
      })

      if (hardStop.blocked && hardStop.blockedDirection === 'BOTH') {
        const hasOpenPos = Object.values(cur.positions ?? {}).some(
          (p) => p !== null,
        )
        if (!hasOpenPos && !cur.position) {
          updateStatus({
            state: 'STOPPED',
            indicators,
            allSignalData,
            finalSignal,
            hardStop,
            sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
            lastUpdated: new Date().toLocaleTimeString('en-IN'),
          })
          return
        }
      }

      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const [lh, lm] = (config.lastEntryTime ?? '15:15').split(':').map(Number)
      const afterCutoff =
        Number.isFinite(lh) && Number.isFinite(lm)
          ? currentHour > lh || (currentHour === lh && currentMinute >= lm)
          : false

      if (afterCutoff) {
        log(
          'warn',
          'bot',
          `after last entry time ${config.lastEntryTime} — skipping new entries`,
        )
      }

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

      const ctx: ExecutionContext = {
        token,
        config,
        targetSymbols,
        allowedSymbols,
        marketMap,
        symbolSignals,
        symbolIndicators,
        symbolVrds,
        primaryMarket,
        primaryVrdData,
        indicators,
        hardStop,
        afterCutoff,
        curPositions,
        curTradesPerSym,
        lastExitTimes: lastExitTimesRef.current,
        addLog: (l) => addLog(l),
        onStaticIpError: () => {
          const hasActivePos = Object.values(curPositions).some(
            (p) => p !== null,
          )
          if (!hasActivePos) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            timeoutRef.current = null
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
        },
        abortSignal: abort.signal,
      }

      const newlyEnteredPositions = await evaluateAndEnter(ctx)
      await evaluateAndExit(ctx, newlyEnteredPositions)

      saveExitTimes(lastExitTimesRef.current)

      const hasActivePosition = Object.values(curPositions).some(
        (p) => p !== null,
      )
      const totalTrades = Object.values(curTradesPerSym).reduce(
        (acc, count) => acc + (count ?? 0),
        0,
      )
      const nextState = hasActivePosition
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
        indicators,
        symbolIndicators,
        vrdData: primaryVrdData ?? null,
        allSignalData,
        finalSignal,
        symbolSignals,
        hardStop,
        sourceStatus: { ...cur.sourceStatus, ...srcUpdates },
        lastUpdated: new Date().toLocaleTimeString('en-IN'),
        error: undefined,
      })
    } catch (err) {
      if (abort.signal.aborted) return
      const msg = err instanceof Error ? err.message : String(err)
      addLogs([...tickLogs, mkLog('error', 'tick', `unhandled: ${msg}`)])
      updateStatus({ error: msg })
    } finally {
      isTickingRef.current = false
    }
  }, [
    token,
    updateStatus,
    addLogs,
    addLog,
    evaluateAndEnter,
    evaluateAndExit,
    statusRef,
  ])

  const scheduleNext = useCallback(() => {
    function loop() {
      const config = getStrategyConfig()
      timeoutRef.current = setTimeout(() => {
        void tick().finally(() => {
          const state = statusRef.current.state
          if (state === 'RUNNING' || state === 'ORDERED') {
            loop()
          }
        })
      }, config.pollingIntervalSec * 1000)
    }
    loop()
  }, [tick, statusRef])

  const start = useCallback(() => {
    if (!token) {
      addLog(mkLog('error', 'bot', 'cannot start — no broker token'))
      return
    }
    const config = getStrategyConfig()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    addLog(
      mkLog(
        'info',
        'bot',
        `starting — interval=${config.pollingIntervalSec}s threshold=${config.strongThreshold}/${config.moderateThreshold}`,
      ),
    )
    updateStatus({ state: 'RUNNING', error: null })
    void tick().finally(() => {
      const state = statusRef.current.state
      if (state === 'RUNNING' || state === 'ORDERED') {
        scheduleNext()
      }
    })
  }, [token, tick, updateStatus, addLog, scheduleNext, statusRef])

  const stop = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    addLog(mkLog('info', 'bot', 'stopped by user'))
    updateStatus({
      state: 'IDLE',
      position: null,
      positions: { ...DEFAULT_POSITIONS },
      error: null,
      sourceStatus: {},
    })
  }, [updateStatus, addLog])

  useEffect(() => {
    if (token && (status.state === 'RUNNING' || status.state === 'ORDERED')) {
      const resumeTimer = setTimeout(() => {
        addLog(
          mkLog('info', 'bot', `resumed from persisted state=${status.state}`),
        )
        void tick().finally(() => {
          const state = statusRef.current.state
          if (state === 'RUNNING' || state === 'ORDERED') {
            scheduleNext()
          }
        })
      }, 0)
      return () => {
        clearTimeout(resumeTimer)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        abortRef.current?.abort()
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      abortRef.current?.abort()
    }
  }, [token, status.state, tick, addLog, scheduleNext, statusRef])

  return { ...status, start, stop, clearLogs }
}
