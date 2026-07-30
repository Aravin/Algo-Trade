import { useEffect, useRef, useCallback, useState } from 'react'
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
import {
  fetchPaperHistory,
  getIndiaDateString,
  paperTradeToActivePosition,
} from '@/lib/paperTrading'

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
  const stopRequestedRef = useRef(false)
  const liveArmedRef = useRef(false)
  const resumedTokenRef = useRef<string | null>(null)
  const [liveArmed, setLiveArmed] = useState(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const tick = useCallback(async () => {
    if (!token || stopRequestedRef.current) return
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
      const allowEntries =
        config.executionMode === 'paper' || liveArmedRef.current
      const allowedSymbols: UnderlyingSymbol[] =
        (config.underlyingMode ?? 'ALL_PARALLEL') === 'ALL_PARALLEL'
          ? ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY']
          : [config.underlyingMode as UnderlyingSymbol]

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

      try {
        const history = await fetchPaperHistory()
        const hasAuthoritativeOpenTrades = history.openTrades !== undefined
        const openTrades =
          history.openTrades ??
          (history.trades ?? []).filter((trade) => trade.status === 'OPEN')
        const persistedPositions = openTrades
          .map((trade) =>
            paperTradeToActivePosition(trade, getIndiaDateString()),
          )
          .filter(
            (
              value,
            ): value is {
              symbol: UnderlyingSymbol
              position: ActivePosition
            } => value !== null,
          )
        const persistedTradeIds = new Set(
          persistedPositions.map(({ position }) => position.paperTradeId),
        )

        if (hasAuthoritativeOpenTrades) {
          for (const symbol of Object.keys(
            curPositions,
          ) as UnderlyingSymbol[]) {
            const localPosition = curPositions[symbol]
            if (
              localPosition?.executionMode === 'paper' &&
              localPosition.paperTradeId &&
              !persistedTradeIds.has(localPosition.paperTradeId)
            ) {
              curPositions[symbol] = null
              log(
                'warn',
                'paper',
                `[${symbol}] removed stale local paper position; D1 is authoritative`,
              )
            }
          }
        }

        for (const { symbol, position } of persistedPositions) {
          if (!curPositions[symbol]) {
            curPositions[symbol] = position
            log(
              'warn',
              'paper',
              `[${symbol}] restored open paper position from D1`,
            )
          }
        }
      } catch (error) {
        log(
          'warn',
          'paper',
          `Unable to reconcile open paper positions: ${(error as Error).message}`,
        )
      }

      const targetSymbolsSet = new Set<UnderlyingSymbol>(allowedSymbols)
      Object.entries(curPositions).forEach(([sym, pos]) => {
        if (pos !== null) {
          targetSymbolsSet.add(sym as UnderlyingSymbol)
        }
      })
      const targetSymbols = Array.from(targetSymbolsSet)
      const now = new Date()
      const currentHour = now.getHours()
      const currentMinute = now.getMinutes()
      const [lh, lm] = (config.lastEntryTime ?? '15:15').split(':').map(Number)
      const afterCutoff =
        Number.isFinite(lh) && Number.isFinite(lm)
          ? currentHour > lh || (currentHour === lh && currentMinute >= lm)
          : false

      const marketMap = await fetchMarketForSymbols(
        token,
        (e) => tickLogs.push(e),
        srcUpd,
        targetSymbols,
        abort.signal,
      )
      if (abort.signal.aborted || stopRequestedRef.current) return

      const primaryMarket =
        marketMap['NIFTY 50'] ??
        marketMap[targetSymbols[0]] ??
        Object.values(marketMap)[0]

      if (!primaryMarket?.candles.length) {
        const canUseSnapshot = Boolean(
          cur.indicators && cur.allSignalData && cur.finalSignal,
        )
        const hasOpenPosition = Object.values(curPositions).some(
          (position) => position !== null,
        )
        if (primaryMarket && hasOpenPosition) {
          log(
            'warn',
            'exit',
            'no candle data — running degraded position supervision',
          )
          const degradedCtx: ExecutionContext = {
            token,
            config,
            targetSymbols,
            allowedSymbols,
            marketMap,
            symbolSignals: cur.symbolSignals,
            symbolIndicators: cur.symbolIndicators,
            symbolVrds: cur.vrdData
              ? { [primaryMarket.underlyingSymbol]: cur.vrdData }
              : {},
            symbolHardStops: {},
            primaryMarket,
            primaryVrdData: cur.vrdData,
            indicators: cur.indicators,
            hardStop: cur.hardStop,
            afterCutoff,
            allowEntries: false,
            curPositions,
            curTradesPerSym,
            lastExitTimes: lastExitTimesRef.current,
            addLog,
            onStaticIpError: () => {
              updateStatus({
                error:
                  'Order placement blocked by Upstox static IP restriction while supervising an active position.',
              })
            },
            abortSignal: abort.signal,
          }
          await evaluateAndExit(degradedCtx, new Set())
          saveExitTimes(lastExitTimesRef.current)
        }

        const interrupted = abort.signal.aborted || stopRequestedRef.current
        const remainingPosition =
          curPositions['NIFTY 50'] ??
          Object.values(curPositions).find(
            (position): position is ActivePosition => position !== null,
          ) ??
          null
        const nextState = interrupted
          ? 'STOPPED'
          : remainingPosition
            ? 'ORDERED'
            : afterCutoff || !allowEntries
              ? 'STOPPED'
              : 'RUNNING'
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
            state: nextState,
            position: remainingPosition,
            positions: curPositions,
            sourceStatus: normalizedStatuses,
            lastUpdated: new Date().toLocaleTimeString('en-IN'),
            error: null,
          })
          return
        }
        log('error', 'tick', 'no candle data — skipping tick')
        addLogs(tickLogs)
        updateStatus({
          state: nextState,
          position: remainingPosition,
          positions: curPositions,
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
      if (abort.signal.aborted || stopRequestedRef.current) return

      const symbolSignals: Partial<
        Record<UnderlyingSymbol, FinalSignal | null>
      > = {}
      const symbolIndicators: Partial<
        Record<UnderlyingSymbol, IndicatorsResult | null>
      > = {}
      const symbolVrds: Partial<Record<UnderlyingSymbol, VrdData>> = {}
      const symbolHardStops: Partial<
        Record<
          UnderlyingSymbol,
          {
            blocked: boolean
            blockedDirection: 'CE' | 'PE' | 'BOTH' | 'NONE'
            reasons: string[]
          }
        >
      > = {}

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
          symbolHardStops[sym] = runHardStopChecks(symVrdData)

          log(
            'info',
            'engine',
            `[${sym}] bull=${symSignal.bullScore} bear=${symSignal.bearScore} → ${symSignal.signal} (${symSignal.confidence})`,
          )
        }),
      )
      if (abort.signal.aborted || stopRequestedRef.current) return

      const primaryVrdData = symbolVrds[primaryMarket.underlyingSymbol] ?? null
      if (primaryVrdData) {
        saveVrdCache(primaryVrdData)
        log(
          'info',
          'sentiment',
          `mmi=${primaryVrdData.mmi?.score} vix=${primaryVrdData.vix} pe=${primaryVrdData.niftyPe?.pe} A/D=${primaryVrdData.advancesDeclines?.advances}↑${primaryVrdData.advancesDeclines?.declines}↓`,
        )
      }

      // Primary hard stop comes from the primary market symbol's own VRD;
      // each symbol's individual hard stop is tracked in symbolHardStops.
      const hardStop =
        symbolHardStops[primaryMarket.underlyingSymbol] ??
        (primaryVrdData
          ? runHardStopChecks(primaryVrdData)
          : { blocked: false, blockedDirection: 'NONE' as const, reasons: [] })

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

      if (afterCutoff) {
        addLog(
          mkLog(
            'warn',
            'bot',
            `after last entry time ${config.lastEntryTime} — skipping new entries`,
          ),
        )
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
        symbolHardStops,
        primaryMarket,
        primaryVrdData,
        indicators,
        hardStop,
        afterCutoff,
        allowEntries,
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

      const persistExecutionState = (forceStopped: boolean) => {
        saveExitTimes(lastExitTimesRef.current)
        const hasActivePosition = Object.values(curPositions).some(
          (position) => position !== null,
        )
        const totalTrades = Object.values(curTradesPerSym).reduce(
          (acc, count) => acc + (count ?? 0),
          0,
        )
        const nextState = forceStopped
          ? ('STOPPED' as const)
          : hasActivePosition
            ? ('ORDERED' as const)
            : afterCutoff || !allowEntries
              ? ('STOPPED' as const)
              : ('RUNNING' as const)
        const primaryPos =
          curPositions['NIFTY 50'] ??
          Object.values(curPositions).find(
            (position): position is ActivePosition => position !== null,
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
      }

      const newlyEnteredPositions = await evaluateAndEnter(ctx)
      if (abort.signal.aborted || stopRequestedRef.current) {
        if (newlyEnteredPositions.size > 0) {
          addLog(
            mkLog(
              'warn',
              'bot',
              'stop was requested while an order was in flight; accepted positions were retained',
            ),
          )
        }
        persistExecutionState(true)
        return
      }
      await evaluateAndExit(ctx, newlyEnteredPositions)
      persistExecutionState(abort.signal.aborted || stopRequestedRef.current)
    } catch (err) {
      if (abort.signal.aborted || stopRequestedRef.current) return
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
      if (stopRequestedRef.current) return
      const config = getStrategyConfig()
      timeoutRef.current = setTimeout(() => {
        void tick().finally(() => {
          const state = statusRef.current.state
          if (
            !stopRequestedRef.current &&
            (state === 'RUNNING' || state === 'ORDERED')
          ) {
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
    if (config.executionMode === 'live') {
      const confirmed = window.confirm(
        'Arm LIVE trading for this session? New strategy signals can place real Upstox orders until you stop the bot or close the app.',
      )
      if (!confirmed) {
        liveArmedRef.current = false
        setLiveArmed(false)
        addLog(mkLog('warn', 'bot', 'live start cancelled — not armed'))
        return
      }
      liveArmedRef.current = true
      setLiveArmed(true)
    } else {
      liveArmedRef.current = false
      setLiveArmed(false)
    }
    stopRequestedRef.current = false
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    addLog(
      mkLog(
        'info',
        'bot',
        `starting — interval=${config.pollingIntervalSec}s threshold=${config.strongThreshold}/${config.moderateThreshold}`,
      ),
    )
    updateStatus({ state: 'RUNNING', error: null })
    void Promise.resolve()
      .then(tick)
      .finally(() => {
        const state = statusRef.current.state
        if (
          !stopRequestedRef.current &&
          (state === 'RUNNING' || state === 'ORDERED')
        ) {
          scheduleNext()
        }
      })
  }, [token, tick, updateStatus, addLog, scheduleNext, statusRef])

  const stop = useCallback(() => {
    stopRequestedRef.current = true
    abortRef.current?.abort()
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = null
    liveArmedRef.current = false
    setLiveArmed(false)
    const current = statusRef.current
    const hasOpenPosition = Object.values(current.positions).some(
      (position) => position !== null,
    )
    addLog(mkLog('info', 'bot', 'stopped by user'))
    updateStatus({
      state: hasOpenPosition ? 'STOPPED' : 'IDLE',
      error: null,
    })
  }, [updateStatus, addLog, statusRef])

  useEffect(() => {
    if (!token) {
      resumedTokenRef.current = null
      return
    }
    if (resumedTokenRef.current === token) return
    resumedTokenRef.current = token

    const persisted = statusRef.current
    if (persisted.state !== 'RUNNING' && persisted.state !== 'ORDERED') return

    const config = getStrategyConfig()
    const hasOpenPosition = Object.values(persisted.positions).some(
      (position) => position !== null,
    )
    if (config.executionMode === 'live' && !hasOpenPosition) {
      addLog(
        mkLog(
          'warn',
          'bot',
          'persisted live run was not resumed — press Start to arm live trading for this session',
        ),
      )
      updateStatus({ state: 'IDLE' })
      return
    }

    stopRequestedRef.current = false
    if (config.executionMode === 'live') {
      updateStatus({ state: 'ORDERED' })
      addLog(
        mkLog(
          'warn',
          'bot',
          'resumed live position supervision without arming new entries',
        ),
      )
    } else {
      addLog(
        mkLog('info', 'bot', `resumed from persisted state=${persisted.state}`),
      )
    }

    const resumeTimer = setTimeout(() => {
      void tick().finally(() => {
        const state = statusRef.current.state
        if (
          !stopRequestedRef.current &&
          (state === 'RUNNING' || state === 'ORDERED')
        ) {
          scheduleNext()
        }
      })
    }, 0)

    return () => {
      clearTimeout(resumeTimer)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      abortRef.current?.abort()
    }
  }, [token, tick, addLog, scheduleNext, statusRef, updateStatus])

  return { ...status, liveArmed, start, stop, clearLogs }
}

export type StrategyBotController = ReturnType<typeof useStrategyBot>
