import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  indexOptionPrices,
  isTerminalPaperExitError,
  useTradeExecution,
  type ExecutionContext,
} from '@/hooks/useTradeExecution'
import type { OptionData } from '@/lib/types'

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
      allowEntries: true,
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

  it('uses persisted paper metadata when reattaching an existing trade', async () => {
    const { result } = renderHook(() => useTradeExecution())
    const option = {
      expiry: '2026-07-28',
      strike_price: 24100,
      underlying_spot_price: 24000,
      call_options: {
        instrument_key: 'NSE_FO|CE',
        trading_symbol: 'NIFTY26JUL24100CE',
        market_data: { ltp: 100, volume: 1000, oi: 2000 },
      },
      put_options: {
        instrument_key: 'NSE_FO|PE',
        trading_symbol: 'NIFTY26JUL24100PE',
        market_data: { ltp: 90, volume: 1000, oi: 2000 },
      },
    }
    const market = {
      underlyingSymbol: 'NIFTY 50',
      candles: [],
      optionChain: [option],
      lotSize: 65,
      expiry: '2026-07-28',
      v3: 'hold',
      breadth: null,
      globalIndices: [],
      giftNifty: null,
    }
    const mockCtx = {
      token: 'test-token',
      config: {
        pollingIntervalSec: 10,
        otmSkip: 0,
        tradeType: 'buying',
        maxTradesPerDay: 5,
        executionMode: 'paper',
        multiSymbolExecutionMode: 'independent',
      },
      targetSymbols: ['NIFTY 50'],
      allowedSymbols: ['NIFTY 50'],
      marketMap: { 'NIFTY 50': market },
      symbolSignals: {
        'NIFTY 50': {
          signal: 'BUY_CE',
          confidence: 'strong',
          positionSize: 'half',
          v3: 'buy',
          v4: 'Buy',
          bullScore: 20,
          bearScore: 2,
          scoreMax: 25,
        },
      },
      symbolIndicators: {},
      symbolVrds: {},
      primaryMarket: market,
      primaryVrdData: null,
      indicators: null,
      hardStop: { blocked: false, reasons: [] },
      afterCutoff: false,
      allowEntries: true,
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

    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 1_000_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)
    vi.mocked(safeFetch).mockResolvedValueOnce([
      {
        trade: {
          id: 'paper-1',
          status: 'OPEN',
          instrument_key: 'NSE_FO|CE',
          direction: 'CE',
          quantity: 65,
          entry_price: 100,
          opened_at: '2026-07-28T04:30:00.000Z',
          metadata_json: JSON.stringify({
            lotSize: 65,
            tradeType: 'selling',
          }),
        },
        reconciled: true,
        reconciliationReason: 'OPEN_POSITION_EXISTS',
      },
      null,
    ])

    await result.current.evaluateAndEnter(mockCtx)

    const rawRequestBody = vi.mocked(safeFetch).mock.calls[0]?.[1]?.body
    expect(typeof rawRequestBody).toBe('string')
    if (typeof rawRequestBody !== 'string') {
      throw new Error('Expected a JSON request body')
    }
    const requestBody = JSON.parse(rawRequestBody) as {
      lotSize: number
      quantity: number
      clientOrderId: string
      maxTradesPerDay: number
    }
    expect(requestBody).toMatchObject({
      lotSize: 65,
      quantity: 65,
      maxTradesPerDay: 5,
    })
    expect(requestBody.clientOrderId.length).toBeGreaterThan(0)
    expect(mockCtx.curPositions['NIFTY 50']?.lotSize).toBe(65)
    expect(mockCtx.curPositions['NIFTY 50']?.tradeType).toBe('selling')
    expect(mockCtx.curPositions['NIFTY 50']?.legs?.[0]?.tradeType).toBe(
      'selling',
    )
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
      allowEntries: true,
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
    const position = mockCtx.curPositions['NIFTY 50']

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

    mockCtx.curPositions['NIFTY 50'] = position
    delete mockCtx.lastExitTimes['NIFTY 50']
    vi.mocked(safeFetch).mockResolvedValueOnce([
      null,
      'HTTP 400 Bad Request: exitPrice must be positive',
    ])

    await result.current.evaluateAndExit(mockCtx, new Set())

    expect(mockCtx.curPositions['NIFTY 50']).not.toBeNull()
    expect(mockCtx.lastExitTimes['NIFTY 50']).toBeUndefined()
  })
})

describe('isTerminalPaperExitError', () => {
  it('only reconciles explicit server trade-state codes', () => {
    expect(
      isTerminalPaperExitError(
        'HTTP 409 Conflict: [TRADE_ALREADY_CLOSED] Trade is closed',
      ),
    ).toBe(true)
    expect(
      isTerminalPaperExitError('HTTP 404 Not Found: [TRADE_NOT_FOUND] missing'),
    ).toBe(true)
  })

  it('does not treat an arbitrary 400 or 404 as a successful exit', () => {
    expect(
      isTerminalPaperExitError(
        'HTTP 400 Bad Request: exitPrice must be positive',
      ),
    ).toBe(false)
    expect(
      isTerminalPaperExitError('HTTP 404 Not Found: route does not exist'),
    ).toBe(false)
  })
})

describe('indexOptionPrices', () => {
  it('indexes call and put LTPs by their exact instrument keys', () => {
    const option: OptionData = {
      expiry: '2026-07-28',
      strike_price: 24_100,
      underlying_spot_price: 24_000,
      call_options: {
        instrument_key: 'NSE_FO|CE',
        market_data: { ltp: 101, volume: 1_000, oi: 2_000 },
      },
      put_options: {
        instrument_key: 'NSE_FO|PE',
        market_data: { ltp: 92, volume: 900, oi: 1_800 },
      },
    }

    const prices = indexOptionPrices([option])

    expect(prices.get('NSE_FO|CE')).toBe(101)
    expect(prices.get('NSE_FO|PE')).toBe(92)
    expect(prices.get('NSE_FO|UNKNOWN')).toBeUndefined()
  })
})
