import { useCallback } from 'react'
import type {
  ActivePosition,
  PositionLeg,
  FinalSignal,
  UnderlyingSymbol,
  VrdData,
  IndicatorsResult,
  AllSignalData,
  OptionData,
} from '@/lib/types'
import type { StrategyConfig } from '@/lib/types'
import {
  API_PAPER_TRADES_ENTER,
  API_PAPER_TRADES_EXIT,
  API_ORDER_PLACE,
} from '@/lib/constants'
import {
  safeFetch,
  mkLog,
  type BotLog,
  type fetchMarket,
} from '@/lib/marketService'
import { getOtmStrike } from '@/lib/indicators'
import { notify } from '@/lib/notifications'
import {
  isStaticIpRestrictionError,
  isPaperPosition,
  getLotSizeForSymbol,
} from '@/lib/syntheticCalculators'
import { fetchPaperAccount } from '@/lib/paperTrading'
import { shouldExit } from '@/lib/strategyEngine'

export interface ExecutionContext {
  token: string
  config: StrategyConfig
  targetSymbols: UnderlyingSymbol[]
  allowedSymbols: UnderlyingSymbol[]
  marketMap: Record<string, Awaited<ReturnType<typeof fetchMarket>>>
  symbolSignals: Partial<Record<UnderlyingSymbol, FinalSignal | null>>
  symbolIndicators: Partial<Record<UnderlyingSymbol, IndicatorsResult | null>>
  symbolVrds: Partial<Record<UnderlyingSymbol, VrdData>>
  primaryMarket: Awaited<ReturnType<typeof fetchMarket>>
  primaryVrdData: VrdData | null
  indicators: IndicatorsResult | null
  hardStop: { blocked: boolean; blockedDirection?: string; reasons: string[] }
  symbolHardStops?: Partial<
    Record<
      UnderlyingSymbol,
      { blocked: boolean; blockedDirection?: string; reasons: string[] }
    >
  >
  afterCutoff: boolean
  allowEntries: boolean
  curPositions: Record<UnderlyingSymbol, ActivePosition | null>
  curTradesPerSym: Partial<Record<UnderlyingSymbol, number>>
  lastExitTimes: Record<string, number>
  addLog: (log: BotLog) => void
  onStaticIpError: () => void
  abortSignal?: AbortSignal
}

export function isTerminalPaperExitError(error: string): boolean {
  return /\[(TRADE_ALREADY_CLOSED|TRADE_NOT_FOUND)\]/.test(error)
}

export function indexOptionPrices(
  optionChain: OptionData[],
): Map<string, number> {
  const prices = new Map<string, number>()
  for (const option of optionChain) {
    prices.set(
      option.call_options.instrument_key,
      option.call_options.market_data.ltp,
    )
    prices.set(
      option.put_options.instrument_key,
      option.put_options.market_data.ltp,
    )
  }
  return prices
}

export function useTradeExecution() {
  const evaluateAndEnter = useCallback(
    async (ctx: ExecutionContext): Promise<Set<UnderlyingSymbol>> => {
      const {
        token,
        config,
        allowedSymbols,
        marketMap,
        symbolSignals,
        symbolVrds,
        hardStop,
        afterCutoff,
        allowEntries,
        curPositions,
        curTradesPerSym,
        lastExitTimes,
        addLog,
        onStaticIpError,
        abortSignal,
      } = ctx

      const newlyEnteredPositions = new Set<UnderlyingSymbol>()
      if (afterCutoff || !allowEntries || abortSignal?.aborted) {
        return newlyEnteredPositions
      }

      const mode = config.multiSymbolExecutionMode ?? 'independent'
      let candidates: { symbol: UnderlyingSymbol; signal: FinalSignal }[] = []

      if (mode === 'consensus') {
        const activeSigs = allowedSymbols
          .map((sym) => ({ sym, sig: symbolSignals[sym] }))
          .filter(
            (item): item is { sym: UnderlyingSymbol; sig: FinalSignal } =>
              Boolean(item.sig) &&
              (item.sig?.signal === 'BUY_CE' || item.sig?.signal === 'BUY_PE'),
          )
        if (
          activeSigs.length === allowedSymbols.length &&
          activeSigs.every((s) => s.sig.signal === activeSigs[0].sig.signal)
        ) {
          candidates = activeSigs
            .filter((item) => !curPositions[item.sym])
            .map((item) => ({ symbol: item.sym, signal: item.sig }))
        }
      } else if (mode === 'best_signal') {
        const hasAnyOpenPosition = Object.values(curPositions).some(
          (p) => p !== null,
        )
        if (!hasAnyOpenPosition) {
          const eligible = allowedSymbols
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
        }
      } else {
        candidates = allowedSymbols
          .map((sym) => ({ sym, sig: symbolSignals[sym] }))
          .filter(
            (item): item is { sym: UnderlyingSymbol; sig: FinalSignal } =>
              Boolean(item.sig) &&
              !curPositions[item.sym] &&
              (item.sig?.signal === 'BUY_CE' || item.sig?.signal === 'BUY_PE'),
          )
          .map((item) => ({ symbol: item.sym, signal: item.sig }))
      }

      for (const candidate of candidates) {
        if (abortSignal?.aborted) break
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

        const lastExit = lastExitTimes[sym] ?? 0
        const cooldownMs = (config.exitCooldownSec ?? 60) * 1000
        if (Date.now() - lastExit < cooldownMs) {
          continue
        }

        // Use per-symbol hard stop if available, fall back to shared primary hard stop
        const symHardStop = ctx.symbolHardStops?.[sym] ?? hardStop
        if (
          symHardStop.blocked &&
          (symHardStop.blockedDirection === 'BOTH' ||
            (symHardStop.blockedDirection === 'CE' &&
              symSig.signal === 'BUY_CE') ||
            (symHardStop.blockedDirection === 'PE' &&
              symSig.signal === 'BUY_PE'))
        ) {
          addLog(
            mkLog(
              'warn',
              'bot',
              `[${sym}] Entry ${symSig.signal} blocked by hard stop: ${symHardStop.reasons.join(', ')}`,
            ),
          )
          continue
        }

        const symMarket = marketMap[sym]
        if (!symMarket?.optionChain.length) continue

        const legsToPlace: {
          direction: 'CE' | 'PE'
          tradeType: 'buying' | 'selling'
        }[] = []

        let resolvedTradeType = config.tradeType
        if (resolvedTradeType === 'both') {
          const vix = symbolVrds[sym]?.vix ?? 0
          const straddleElevated =
            symbolVrds[sym]?.straddleIv?.elevated ?? false
          if (vix >= 18 || straddleElevated) {
            resolvedTradeType = 'selling'
          } else {
            resolvedTradeType = 'buying'
          }
        }

        if (resolvedTradeType === 'buying') {
          legsToPlace.push({
            direction: symSig.signal === 'BUY_CE' ? 'CE' : 'PE',
            tradeType: 'buying',
          })
        }
        if (resolvedTradeType === 'selling') {
          legsToPlace.push({
            direction: symSig.signal === 'BUY_CE' ? 'PE' : 'CE',
            tradeType: 'selling',
          })
        }

        let totalReq = 0
        let missingStrike = false
        for (const leg of legsToPlace) {
          const strike = getOtmStrike(
            symMarket.optionChain,
            leg.direction,
            config.otmSkip,
          )
          if (!strike) {
            missingStrike = true
            break
          }
          const ltp =
            leg.direction === 'CE'
              ? strike.call_options.market_data.ltp
              : strike.put_options.market_data.ltp
          const lotSize =
            symMarket.lotSize ??
            getLotSizeForSymbol(
              symMarket.optionChain[0]?.call_options?.trading_symbol ?? sym,
            )
          const legReq = leg.tradeType === 'selling' ? 100000 / lotSize : ltp
          totalReq += legReq
        }

        if (missingStrike) {
          addLog(
            mkLog(
              'warn',
              'order',
              `[${sym}] no OTM strike found for one or more legs`,
            ),
          )
          continue
        }

        const executionMode = config.executionMode
        const lotSize =
          symMarket.lotSize ??
          getLotSizeForSymbol(
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
          if (abortSignal?.aborted) break

          if (paperBalance !== null && totalReq > 0) {
            const lotReq = totalReq * lotSize
            const affordableLots = Math.floor(paperBalance / lotReq)
            const affordableQty = affordableLots * lotSize
            if (affordableQty <= 0) {
              addLog(
                mkLog(
                  'warn',
                  'paper',
                  `Skipping paper entry for ${sym}: balance ₹${paperBalance.toFixed(2)} cannot afford 1 lot (needs ₹${lotReq.toFixed(2)})`,
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
        let firstEntryTime = new Date().toISOString()

        for (const leg of legsToPlace) {
          if (abortSignal?.aborted) {
            success = false
            break
          }
          const strike = getOtmStrike(
            symMarket.optionChain,
            leg.direction,
            config.otmSkip,
          )
          if (!strike) {
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
          let positionInstrumentKey = instrumentKey
          let positionDirection = leg.direction
          let positionEntryPrice = ltp
          let positionQuantity = qty
          let positionLotSize = lotSize
          let positionTradeType = leg.tradeType

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
            const clientOrderId =
              globalThis.crypto?.randomUUID?.() ??
              `${sym}-${Date.now()}-${Math.random().toString(36).slice(2)}`
            const [paperData, paperErr] = await safeFetch<{
              trade?: {
                id: string
                status: string
                instrument_key: string
                direction: string
                quantity: number
                entry_price: number
                opened_at: string
                metadata_json: string | null
              }
              reconciled?: boolean
              reconciliationReason?:
                | 'CLIENT_ORDER_REPLAY'
                | 'OPEN_POSITION_EXISTS'
            }>(API_PAPER_TRADES_ENTER, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                instrumentKey,
                direction: leg.direction,
                quantity: qty,
                entryPrice: ltp,
                lotSize,
                clientOrderId,
                maxTradesPerDay: config.maxTradesPerDay,
                metadata: {
                  signal: symSig.signal,
                  confidence: symSig.confidence,
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
                  `[${sym}] Paper ${side} failed: ${paperErr}`,
                ),
              )
              success = false
              break
            }
            const persistedTrade = paperData.trade
            if (
              persistedTrade.status !== 'OPEN' ||
              (persistedTrade.direction !== 'CE' &&
                persistedTrade.direction !== 'PE')
            ) {
              addLog(
                mkLog(
                  'error',
                  'paper',
                  `[${sym}] Paper entry returned a non-open or invalid trade`,
                ),
              )
              success = false
              break
            }
            paperTradeId = persistedTrade.id

            if (paperData.reconciled) {
              let persistedMetadata: {
                lotSize?: number
                tradeType?: 'buying' | 'selling'
              } = {}
              try {
                persistedMetadata = persistedTrade.metadata_json
                  ? (JSON.parse(
                      persistedTrade.metadata_json,
                    ) as typeof persistedMetadata)
                  : {}
              } catch {
                // The persisted trade fields still contain enough data to supervise it.
              }
              positionInstrumentKey = persistedTrade.instrument_key
              positionDirection = persistedTrade.direction
              positionEntryPrice = persistedTrade.entry_price
              positionQuantity = persistedTrade.quantity
              positionLotSize =
                persistedMetadata.lotSize ??
                getLotSizeForSymbol(persistedTrade.instrument_key)
              positionTradeType = persistedMetadata.tradeType ?? leg.tradeType
              qty = positionQuantity
              firstInstrumentKey = positionInstrumentKey
              firstDirection = positionDirection
              firstEntryPrice = positionEntryPrice
              firstEntryTime = persistedTrade.opened_at
              addLog(
                mkLog(
                  'warn',
                  'paper',
                  `[${sym}] Reattached persisted paper position (${paperData.reconciliationReason ?? 'existing trade'})`,
                ),
              )
            } else {
              notify(
                `Paper Trade Executed [${sym}]`,
                `Paper ${side} ${leg.direction} placed`,
                'success',
              )
            }
          } else {
            const [orderData, orderErr] = await safeFetch<{
              data?: { order_id: string }
              status?: string
            }>(API_ORDER_PLACE, {
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
              addLog(
                mkLog('error', 'order', `[${sym}] ${side} failed: ${orderErr}`),
              )
              success = false
              if (isStaticIpRestrictionError(orderErr)) {
                onStaticIpError()
              }
              break
            }
            notify(
              `Trade Executed [${sym}]`,
              `${side} ${leg.direction} placed`,
              'success',
            )
          }

          positionLegs.push({
            instrumentKey: positionInstrumentKey,
            direction: positionDirection,
            entryPrice: positionEntryPrice,
            currentPrice: positionEntryPrice,
            unrealizedPnl: 0,
            quantity: positionQuantity,
            lotSize: positionLotSize,
            tradeType: positionTradeType,
            paperTradeId,
            status: 'OPEN',
          })
        }

        if (success) {
          curPositions[sym] = {
            instrumentKey: firstInstrumentKey,
            direction: firstDirection,
            entryPrice: firstEntryPrice,
            currentPrice: firstEntryPrice,
            unrealizedPnl: 0,
            quantity: qty,
            lotSize,
            entryTime: firstEntryTime,
            tradeId: Date.now(),
            executionMode,
            tradeType: positionLegs[0]?.tradeType ?? resolvedTradeType,
            paperTradeId: positionLegs[0]?.paperTradeId,
            legs: positionLegs,
            underlyingSymbol: sym,
          }
          curTradesPerSym[sym] = (curTradesPerSym[sym] ?? 0) + 1
          newlyEnteredPositions.add(sym)
        } else if (positionLegs.length > 0) {
          if (executionMode === 'paper') {
            for (const leg of positionLegs) {
              if (leg.paperTradeId) {
                const [, rollbackErr] = await safeFetch(API_PAPER_TRADES_EXIT, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tradeId: leg.paperTradeId,
                    exitPrice: leg.currentPrice ?? leg.entryPrice, // Fix: use current price
                    isRollback: true,
                    metadata: {
                      reason: 'Rollback due to multi-leg entry failure',
                      isRollback: true,
                    },
                  }),
                })
                if (rollbackErr) {
                  addLog(
                    mkLog(
                      'warn',
                      'paper',
                      `[${sym}] Rollback failed for leg ${leg.instrumentKey}`,
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
                `[${sym}] Attempting emergency exit for executed legs...`,
              ),
            )
            const failedExitLegs: PositionLeg[] = []
            for (const leg of positionLegs) {
              const exitTxType = leg.tradeType === 'selling' ? 'BUY' : 'SELL'
              const [, exitErr] = await safeFetch(API_ORDER_PLACE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  token,
                  instrumentKey: leg.instrumentKey,
                  transactionType: exitTxType,
                  quantity: leg.quantity,
                }),
              })
              if (exitErr) {
                failedExitLegs.push({ ...leg, status: 'OPEN' })
              }
            }
            if (failedExitLegs.length > 0) {
              notify(
                `Multi-Leg Alert [${sym}]`,
                `Failed to emergency close legs`,
                'error',
              )
              curPositions[sym] = {
                instrumentKey: firstInstrumentKey,
                direction: firstDirection,
                entryPrice: firstEntryPrice,
                currentPrice: firstEntryPrice,
                unrealizedPnl: 0,
                quantity: qty,
                lotSize,
                entryTime: new Date().toISOString(),
                tradeId: Date.now(),
                executionMode,
                tradeType: resolvedTradeType,
                legs: failedExitLegs,
                underlyingSymbol: sym,
              }
              curTradesPerSym[sym] = (curTradesPerSym[sym] ?? 0) + 1
            }
          }
        }
      }

      return newlyEnteredPositions
    },
    [],
  )

  const evaluateAndExit = useCallback(
    async (
      ctx: ExecutionContext,
      newlyEnteredPositions: Set<UnderlyingSymbol>,
    ): Promise<void> => {
      const {
        token,
        config,
        targetSymbols,
        marketMap,
        symbolIndicators,
        symbolVrds,
        primaryMarket,
        primaryVrdData,
        indicators,
        hardStop,
        afterCutoff,
        curPositions,
        lastExitTimes,
        addLog,
        abortSignal,
      } = ctx

      for (const sym of targetSymbols) {
        if (abortSignal?.aborted) break
        if (newlyEnteredPositions.has(sym)) continue
        const pos = curPositions[sym]
        if (!pos) continue
        const symMarket = marketMap[sym]
        const symOptionChain: OptionData[] = symMarket?.optionChain ?? []
        const optionPrices = indexOptionPrices(symOptionChain)
        const posKey = pos.instrumentKey
        const currentPrice =
          optionPrices.get(posKey) ?? pos.currentPrice ?? pos.entryPrice

        let updatedLegs: PositionLeg[] | undefined
        let totalUnrealizedPnl = 0

        if (pos.legs && pos.legs.length > 0) {
          updatedLegs = pos.legs.map((leg) => {
            const isExited = leg.status === 'CLOSED'
            let legCurrentPrice = leg.currentPrice ?? leg.entryPrice

            if (!isExited) {
              legCurrentPrice =
                optionPrices.get(leg.instrumentKey) ?? legCurrentPrice
            }

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

        // Use per-symbol hard stop if available, fall back to shared primary hard stop
        const symHardStop = ctx.symbolHardStops?.[sym] ?? hardStop
        const forcedExit =
          afterCutoff ||
          (symHardStop.blocked && symHardStop.blockedDirection === 'BOTH')
        const exitIndicators = symbolIndicators[sym] ?? indicators
        let signalExit = false
        let signalReason = ''
        if (!forcedExit && exitIndicators) {
          const symSigData: AllSignalData = {
            v3: symMarket?.v3 ?? primaryMarket.v3,
            indicators: exitIndicators,
            vrd: symbolVrds[sym] ?? primaryVrdData ?? null,
            globalIndices:
              symMarket?.globalIndices ?? primaryMarket.globalIndices,
          }
          const decision = shouldExit(pos, symSigData, currentPrice, config)
          signalExit = decision.exit
          signalReason = decision.reason
        }
        const exit = signalExit || forcedExit
        const reason = afterCutoff
          ? `EOD forced exit`
          : symHardStop.blocked && symHardStop.blockedDirection === 'BOTH'
            ? `Hard Stop triggered`
            : signalReason

        if (exit) {
          const allLegs =
            updatedLegs && updatedLegs.length > 0
              ? updatedLegs
              : [
                  {
                    instrumentKey: pos.instrumentKey,
                    direction: pos.direction,
                    entryPrice: pos.entryPrice,
                    quantity: pos.quantity,
                    lotSize: pos.lotSize,
                    tradeType:
                      pos.tradeType === 'selling'
                        ? ('selling' as const)
                        : ('buying' as const),
                    paperTradeId: pos.paperTradeId,
                    currentPrice,
                    status: 'OPEN' as const,
                  },
                ]

          let allLegsCleared = true

          for (const leg of allLegs) {
            if (abortSignal?.aborted) {
              allLegsCleared = false
              break
            }
            if (leg.status === 'CLOSED') {
              continue
            }
            const isSelling = leg.tradeType === 'selling'
            const exitTxType = isSelling ? 'BUY' : 'SELL'
            if (isPaperPosition(pos)) {
              addLog(
                mkLog(
                  'info',
                  'paper',
                  `[${sym}] closing paper trade leg ${leg.instrumentKey}`,
                ),
              )
              const [, paperExitErr] = await safeFetch(API_PAPER_TRADES_EXIT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tradeId: leg.paperTradeId,
                  exitPrice: leg.currentPrice ?? currentPrice,
                  metadata: { reason },
                }),
              })
              if (paperExitErr) {
                const isTerminalClosed = isTerminalPaperExitError(paperExitErr)
                if (isTerminalClosed) {
                  addLog(
                    mkLog(
                      'warn',
                      'paper',
                      `[${sym}] Leg ${leg.instrumentKey} was already closed on server.`,
                    ),
                  )
                  leg.status = 'CLOSED'
                } else {
                  addLog(
                    mkLog(
                      'error',
                      'paper',
                      `[${sym}] Paper ${exitTxType} failed: ${paperExitErr}`,
                    ),
                  )
                  allLegsCleared = false
                }
              } else {
                leg.status = 'CLOSED'
              }
            } else {
              addLog(
                mkLog(
                  'info',
                  'order',
                  `[${sym}] placing ${exitTxType} for ${leg.instrumentKey}`,
                ),
              )
              const [, sellErr] = await safeFetch(API_ORDER_PLACE, {
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
                    `[${sym}] ${exitTxType} failed: ${sellErr}`,
                  ),
                )
                allLegsCleared = false
              } else {
                leg.status = 'CLOSED'
              }
            }
          }
          if (allLegsCleared) {
            curPositions[sym] = null
            lastExitTimes[sym] = Date.now()
            addLog(mkLog('info', 'bot', `[${sym}] position exited: ${reason}`))
          } else {
            curPositions[sym] = {
              ...curPositions[sym],
              legs: allLegs,
            }
          }
        }
      }
    },
    [],
  )

  return { evaluateAndEnter, evaluateAndExit }
}
