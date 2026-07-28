import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useTradeExecution,
  type ExecutionContext,
} from '@/hooks/useTradeExecution'

vi.mock('@/lib/marketService', () => ({
  safeFetch: vi.fn(),
  mkLog: vi.fn((level: string, source: string, message: string) => ({
    level,
    source,
    message,
    ts: Date.now(),
  })),
}))

vi.mock('@/lib/notifications', () => ({
  notify: vi.fn(),
}))

vi.mock('@/lib/paperTrading', () => ({
  fetchPaperAccount: vi.fn(),
}))

vi.mock('@/lib/strategyEngine', () => ({
  shouldExit: vi.fn(() => ({ exit: false, reason: '' })),
}))

describe('useTradeExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a Set and skip entry when afterCutoff is true', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const mockCtx = {
      token: 'test-token',
      config: {
        pollingIntervalSec: 10,
        otmSkip: 0,
        tradeType: 'buying',
        maxTradesPerDay: 5,
        executionMode: 'paper',
        strongThreshold: 15,
        moderateThreshold: 10,
        strongGap: 5,
        moderateGap: 3,
        underlyingMode: 'ALL_PARALLEL',
      },
      targetSymbols: ['NIFTY 50'],
      marketMap: {},
      symbolSignals: {},
      symbolIndicators: {},
      symbolVrds: {},
      primaryMarket: {
        underlyingSymbol: 'NIFTY 50',
        candles: [],
        optionChain: [],
        v3: {
          buyContracts: 0,
          sellContracts: 0,
          buyQty: 0,
          sellQty: 0,
          trend: 'neutral',
          ratio: 1,
          volumeRatio: 1,
          strength: 0,
          vwap: 0,
        },
        breadth: null,
        globalIndices: [],
        giftNifty: null,
      },
      primaryVrdData: null,
      indicators: {
        sma9: 0,
        sma20: 0,
        vwap: 0,
        rsi: 0,
        trend: 'neutral',
        trendScore: 0,
      },
      hardStop: { blocked: false, reasons: [] },
      afterCutoff: true,
      curPositions: {
        'NIFTY 50': null,
        BANKNIFTY: null,
        FINNIFTY: null,
      },
      curTradesPerSym: {},
      lastExitTimes: {},
      addLog: vi.fn(),
      onStaticIpError: vi.fn(),
    } as unknown as ExecutionContext

    const newlyEntered = await result.current.evaluateAndEnter(mockCtx)
    expect(newlyEntered.size).toBe(0)
  })

  it('should exit positions when afterCutoff is true', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const mockCtx = {
      token: 'test-token',
      config: {
        pollingIntervalSec: 10,
        otmSkip: 0,
        tradeType: 'buying',
        maxTradesPerDay: 5,
        executionMode: 'paper',
        strongThreshold: 15,
        moderateThreshold: 10,
        strongGap: 5,
        moderateGap: 3,
      },
      targetSymbols: ['NIFTY 50'],
      marketMap: {},
      symbolSignals: {},
      symbolIndicators: {},
      symbolVrds: {},
      primaryMarket: {
        underlyingSymbol: 'NIFTY 50',
        candles: [],
        optionChain: [],
        v3: {
          buyContracts: 0,
          sellContracts: 0,
          buyQty: 0,
          sellQty: 0,
          trend: 'neutral',
          ratio: 1,
          volumeRatio: 1,
          strength: 0,
          vwap: 0,
        },
        breadth: null,
        globalIndices: [],
        giftNifty: null,
      },
      primaryVrdData: null,
      indicators: {
        sma9: 0,
        sma20: 0,
        vwap: 0,
        rsi: 0,
        trend: 'neutral',
        trendScore: 0,
      },
      hardStop: { blocked: false, reasons: [] },
      afterCutoff: true, // triggers EOD forced exit
      curPositions: {
        'NIFTY 50': {
          instrumentKey: 'TEST_KEY',
          direction: 'CE',
          entryPrice: 100,
          currentPrice: 100,
          quantity: 25,
          entryTime: new Date().toISOString(),
          tradeId: 12345,
          executionMode: 'paper',
          tradeType: 'buying',
          underlyingSymbol: 'NIFTY 50',
          legs: [],
          unrealizedPnl: 0,
        },
        BANKNIFTY: null,
        FINNIFTY: null,
      },
      curTradesPerSym: {},
      lastExitTimes: {},
      addLog: vi.fn(),
      onStaticIpError: vi.fn(),
    } as unknown as ExecutionContext

    const { safeFetch } = await import('@/lib/marketService')
    vi.mocked(safeFetch).mockResolvedValueOnce([{}, null]) // mock successful paper exit

    await result.current.evaluateAndExit(mockCtx, new Set())

    expect(safeFetch).toHaveBeenCalledWith(
      expect.stringContaining('/paper/trades/exit'),
      expect.objectContaining({
        method: 'POST',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        body: expect.stringContaining('EOD forced exit'),
      }),
    )

    // Position should be cleared and exit time recorded
    expect(mockCtx.curPositions['NIFTY 50']).toBeNull()
    expect(mockCtx.lastExitTimes['NIFTY 50']).toBeGreaterThan(0)
  })
})
