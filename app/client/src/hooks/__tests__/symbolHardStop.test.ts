/**
 * Per-Symbol Hard Stop Tests
 *
 * Verifies that each symbol (NIFTY 50 / BANKNIFTY / FINNIFTY) is gated by its
 * own hard stop computed from its own VRD data, not the shared NIFTY 50 stop.
 *
 * Scenario coverage:
 *  1. Entry blocked when the candidate symbol's own hard stop is triggered
 *  2. Entry allowed when only a *different* symbol's hard stop is triggered
 *  3. CE direction block prevents BUY_CE but not BUY_PE for same symbol
 *  4. PE direction block prevents BUY_PE but not BUY_CE
 *  5. Multi-symbol: BANKNIFTY hard-stopped, NIFTY 50 + FINNIFTY still enter
 *  6. Fallback: symbolHardStops absent → uses shared ctx.hardStop
 *  7. Fallback: symbol absent from symbolHardStops → uses shared ctx.hardStop
 *  8. Empty symbolHardStops {} + clear shared → entry proceeds
 *  9. Exit forced when a symbol's own hard stop fires (BOTH direction)
 * 10. Exit reason reads "Hard Stop triggered" from symbol's own stop
 * 11. NIFTY 50 position not force-exited when only BANKNIFTY is hard-stopped
 * 12. Degraded ctx (symbolHardStops={}) + NO_STOP shared → no force exit
 * 13. Degraded ctx (symbolHardStops={}) + shared BOTH → force exits
 * 14. Log message includes the blocked symbol name
 * 15. Log message includes the actual stop reason text
 * 16. Per-symbol NO_STOP wins over shared BOTH hard stop
 * 17. afterCutoff takes priority — no entries regardless
 * 18. All three symbols hard-stopped → zero entries
 * 19. Cooldown still respected independent of hard stop state
 * 20. Two symbols with positions — only the stopped one is force-exited
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  useTradeExecution,
  type ExecutionContext,
} from '@/hooks/useTradeExecution'
import type {
  ActivePosition,
  OptionData,
  UnderlyingSymbol,
  V3OrderType,
  SignalType,
} from '@/lib/types'

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/marketService', () => ({
  safeFetch: vi.fn(),
  mkLog: vi.fn((level: string, source: string, message: string) => ({
    level,
    source,
    message,
    ts: Date.now(),
  })),
}))

vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }))

vi.mock('@/lib/paperTrading', () => ({
  fetchPaperAccount: vi.fn(),
}))

vi.mock('@/lib/strategyEngine', () => ({
  shouldExit: vi.fn(() => ({ exit: false, reason: '' })),
}))

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const NO_STOP = {
  blocked: false,
  blockedDirection: 'NONE' as const,
  reasons: [],
}
const HARD_STOP_BOTH = {
  blocked: true,
  blockedDirection: 'BOTH' as const,
  reasons: ['VIX too high'],
}
const HARD_STOP_CE = {
  blocked: true,
  blockedDirection: 'CE' as const,
  reasons: ['CE direction blocked'],
}
const HARD_STOP_PE = {
  blocked: true,
  blockedDirection: 'PE' as const,
  reasons: ['PE direction blocked'],
}

function makeOption(
  sym: string,
  strikePrice = 25100,
  spotPrice = 25000,
): OptionData {
  return {
    expiry: '2026-08-25',
    strike_price: strikePrice,
    underlying_spot_price: spotPrice,
    call_options: {
      instrument_key: `NSE_FO|${sym}_CE_${strikePrice}`,
      trading_symbol: `${sym}CE${strikePrice}`,
      market_data: { ltp: 120, volume: 1000, oi: 5000 },
    },
    put_options: {
      instrument_key: `NSE_FO|${sym}_PE_${strikePrice}`,
      trading_symbol: `${sym}PE${strikePrice}`,
      market_data: { ltp: 110, volume: 900, oi: 4500 },
    },
  }
}

/**
 * Build a minimal option chain that satisfies getOtmStrike for both CE and PE.
 * CE OTM = strikes above spot; PE OTM = strikes below spot.
 * We create 5 strikes above and 5 below spot so skip=0 always finds a match.
 */
function makeOptionChain(sym: string, spot = 25000): OptionData[] {
  const chain: OptionData[] = []
  for (let i = 1; i <= 5; i++) {
    chain.push(makeOption(sym, spot + i * 100, spot)) // above spot → CE OTM
    chain.push(makeOption(sym, spot - i * 100, spot)) // below spot → PE OTM
  }
  return chain
}

function makeMarket(sym: UnderlyingSymbol) {
  return {
    underlyingSymbol: sym,
    candles: [{ close: 100 }],
    optionChain: makeOptionChain(sym),
    lotSize: sym === 'BANKNIFTY' ? 30 : 25,
    expiry: '2026-08-25',
    v3: 'buy',
    breadth: null,
    globalIndices: [],
    giftNifty: null,
  }
}

function makeBuySignal(
  _sym: UnderlyingSymbol,
  dir: 'BUY_CE' | 'BUY_PE' = 'BUY_CE',
) {
  return {
    signal: dir,
    confidence: 'strong' as const,
    positionSize: 'full' as const,
    v3: 'buy' as V3OrderType,
    v4: 'Buy' as SignalType,
    bullScore: 16,
    bearScore: 2,
    scoreMax: 20,
  }
}

function makeOpenPosition(
  sym: UnderlyingSymbol,
  dir: 'CE' | 'PE' = 'CE',
): ActivePosition {
  return {
    instrumentKey: `NSE_FO|${sym}_${dir}`,
    direction: dir,
    entryPrice: 120,
    currentPrice: 115,
    quantity: 25,
    lotSize: 25,
    entryTime: new Date().toISOString(),
    tradeId: Date.now(),
    executionMode: 'paper',
    tradeType: 'buying',
    underlyingSymbol: sym,
    unrealizedPnl: -125,
    paperTradeId: `paper-${sym}-${dir}`,
  }
}

const BASE_CONFIG = {
  underlyingMode: 'ALL_PARALLEL' as const,
  pollingIntervalSec: 30,
  otmSkip: 0,
  tradeType: 'buying' as const,
  maxTradesPerDay: 5,
  executionMode: 'paper' as const,
  multiSymbolExecutionMode: 'independent' as const,
  strongThreshold: 14,
  moderateThreshold: 10,
  strongGap: 6,
  moderateGap: 3,
  exitCooldownSec: 0,
  maxProfitPct: 40,
  maxLossPct: 20,
  lastEntryTime: '15:15',
  minConfidence: 'moderate' as const,
  brentCrudeExtremeThreshold: 125,
  brentCrudeOverhangThreshold: 88,
}

function baseCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    token: 'tok',
    config: BASE_CONFIG,
    targetSymbols: ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY'],
    allowedSymbols: ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY'],
    marketMap: {
      'NIFTY 50': makeMarket('NIFTY 50'),
      BANKNIFTY: makeMarket('BANKNIFTY'),
      FINNIFTY: makeMarket('FINNIFTY'),
    },
    symbolSignals: {},
    symbolIndicators: {},
    symbolVrds: {},
    symbolHardStops: {},
    primaryMarket: makeMarket('NIFTY 50'),
    primaryVrdData: null,
    indicators: null,
    hardStop: NO_STOP,
    afterCutoff: false,
    allowEntries: true,
    curPositions: { 'NIFTY 50': null, BANKNIFTY: null, FINNIFTY: null },
    curTradesPerSym: {},
    lastExitTimes: {},
    addLog: vi.fn(),
    onStaticIpError: vi.fn(),
    abortSignal: undefined,
    ...overrides,
  } as unknown as ExecutionContext
}

function mockSuccessfulPaperEntry(
  sym: UnderlyingSymbol,
  dir: 'CE' | 'PE' = 'CE',
): [
  {
    trade: {
      id: string
      status: string
      instrument_key: string
      direction: 'CE' | 'PE'
      quantity: number
      entry_price: number
      opened_at: string
      metadata_json: null
    }
    reconciled: boolean
  },
  null,
] {
  return [
    {
      trade: {
        id: `paper-${sym}-${dir}-${Date.now()}`,
        status: 'OPEN',
        instrument_key: `NSE_FO|${sym}_${dir}`,
        direction: dir,
        quantity: 25,
        entry_price: 120,
        opened_at: new Date().toISOString(),
        metadata_json: null,
      },
      reconciled: false,
    },
    null,
  ]
}

// ─── Entry tests ─────────────────────────────────────────────────────────────

describe('per-symbol hard stop — entry blocking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('1. blocks entry for a symbol whose own hard stop is BOTH', async () => {
    const { result } = renderHook(() => useTradeExecution())
    const addLog = vi.fn()

    const ctx = baseCtx({
      addLog,
      symbolSignals: { BANKNIFTY: makeBuySignal('BANKNIFTY') },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: HARD_STOP_BOTH,
        FINNIFTY: NO_STOP,
      },
    })

    const entered = await result.current.evaluateAndEnter(ctx)

    expect(entered.has('BANKNIFTY')).toBe(false)
    const logMessages = vi
      .mocked(addLog)
      .mock.calls.map(([entry]) => (entry as { message: string }).message)
    expect(logMessages.some((m) => m.includes('[BANKNIFTY]'))).toBe(true)
    expect(logMessages.some((m) => m.includes('VIX too high'))).toBe(true)
  })

  it('2. allows entry when only a DIFFERENT symbol is hard-stopped', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 500_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)
    vi.mocked(safeFetch).mockResolvedValue(mockSuccessfulPaperEntry('NIFTY 50'))

    const ctx = baseCtx({
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50') },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: HARD_STOP_BOTH, // only BANKNIFTY stopped
        FINNIFTY: NO_STOP,
      },
    })

    const entered = await result.current.evaluateAndEnter(ctx)

    expect(entered.has('NIFTY 50')).toBe(true)
    expect(entered.has('BANKNIFTY')).toBe(false)
  })

  it('3a. CE block prevents BUY_CE entry', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctxCE = baseCtx({
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50', 'BUY_CE') },
      symbolHardStops: { 'NIFTY 50': HARD_STOP_CE },
    })
    const enteredCE = await result.current.evaluateAndEnter(ctxCE)
    expect(enteredCE.has('NIFTY 50')).toBe(false)
  })

  it('3b. CE block does NOT prevent BUY_PE entry', async () => {
    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 500_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)
    vi.mocked(safeFetch).mockResolvedValue(
      mockSuccessfulPaperEntry('NIFTY 50', 'PE'),
    )

    const { result } = renderHook(() => useTradeExecution())

    const ctxPE = baseCtx({
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50', 'BUY_PE') },
      symbolHardStops: { 'NIFTY 50': HARD_STOP_CE }, // CE-only block — must not block PE
    })
    const enteredPE = await result.current.evaluateAndEnter(ctxPE)
    expect(enteredPE.has('NIFTY 50')).toBe(true)
  })

  it('4. PE block prevents BUY_PE but not BUY_CE', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctxBlocked = baseCtx({
      allowedSymbols: ['BANKNIFTY'],
      symbolSignals: { BANKNIFTY: makeBuySignal('BANKNIFTY', 'BUY_PE') },
      symbolHardStops: { BANKNIFTY: HARD_STOP_PE },
    })
    const enteredBlocked = await result.current.evaluateAndEnter(ctxBlocked)
    expect(enteredBlocked.has('BANKNIFTY')).toBe(false)

    vi.clearAllMocks()

    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 500_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)
    vi.mocked(safeFetch).mockResolvedValue(
      mockSuccessfulPaperEntry('BANKNIFTY'),
    )

    const ctxAllowed = baseCtx({
      allowedSymbols: ['BANKNIFTY'],
      symbolSignals: { BANKNIFTY: makeBuySignal('BANKNIFTY', 'BUY_CE') },
      symbolHardStops: { BANKNIFTY: HARD_STOP_PE }, // PE-only block
    })
    const enteredAllowed = await result.current.evaluateAndEnter(ctxAllowed)
    expect(enteredAllowed.has('BANKNIFTY')).toBe(true)
  })

  it('5. multi-symbol: BANKNIFTY hard-stopped, NIFTY 50 + FINNIFTY still enter', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 2_000_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)

    let callCount = 0
    vi.mocked(safeFetch).mockImplementation(() => {
      callCount++
      return Promise.resolve(
        mockSuccessfulPaperEntry(callCount === 1 ? 'NIFTY 50' : 'FINNIFTY'),
      )
    })

    const ctx = baseCtx({
      allowedSymbols: ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY'],
      symbolSignals: {
        'NIFTY 50': makeBuySignal('NIFTY 50'),
        BANKNIFTY: makeBuySignal('BANKNIFTY'),
        FINNIFTY: makeBuySignal('FINNIFTY'),
      },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: HARD_STOP_BOTH,
        FINNIFTY: NO_STOP,
      },
    })

    const entered = await result.current.evaluateAndEnter(ctx)

    expect(entered.has('NIFTY 50')).toBe(true)
    expect(entered.has('BANKNIFTY')).toBe(false)
    expect(entered.has('FINNIFTY')).toBe(true)
  })

  it('6. falls back to shared ctx.hardStop when symbolHardStops is undefined', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctx = baseCtx({
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50') },
      symbolHardStops: undefined,
      hardStop: HARD_STOP_BOTH,
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.has('NIFTY 50')).toBe(false)
  })

  it('7. falls back to shared ctx.hardStop when symbol is absent from symbolHardStops', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctx = baseCtx({
      allowedSymbols: ['BANKNIFTY'],
      symbolSignals: { BANKNIFTY: makeBuySignal('BANKNIFTY') },
      symbolHardStops: { 'NIFTY 50': NO_STOP }, // BANKNIFTY missing from map
      hardStop: HARD_STOP_BOTH,
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.has('BANKNIFTY')).toBe(false)
  })

  it('8. empty symbolHardStops {} + clear shared hardStop → entry proceeds', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 1_000_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)
    vi.mocked(safeFetch).mockResolvedValue(mockSuccessfulPaperEntry('NIFTY 50'))

    const ctx = baseCtx({
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50') },
      symbolHardStops: {},
      hardStop: NO_STOP,
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.has('NIFTY 50')).toBe(true)
  })

  it('16. per-symbol NO_STOP wins over shared BOTH hard stop', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { fetchPaperAccount } = await import('@/lib/paperTrading')
    vi.mocked(fetchPaperAccount).mockResolvedValue({
      account: { balance: 1_000_000 },
    } as Awaited<ReturnType<typeof fetchPaperAccount>>)
    vi.mocked(safeFetch).mockResolvedValue(mockSuccessfulPaperEntry('FINNIFTY'))

    const ctx = baseCtx({
      allowedSymbols: ['FINNIFTY'],
      symbolSignals: { FINNIFTY: makeBuySignal('FINNIFTY') },
      symbolHardStops: { FINNIFTY: NO_STOP }, // per-symbol is clear
      hardStop: HARD_STOP_BOTH, // shared would block — but per-symbol wins
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.has('FINNIFTY')).toBe(true)
  })

  it('17. afterCutoff takes priority — no entries regardless of hard stop state', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctx = baseCtx({
      afterCutoff: true,
      symbolSignals: {
        'NIFTY 50': makeBuySignal('NIFTY 50'),
        BANKNIFTY: makeBuySignal('BANKNIFTY'),
      },
      symbolHardStops: { 'NIFTY 50': NO_STOP, BANKNIFTY: NO_STOP },
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.size).toBe(0)
  })

  it('18. all three symbols hard-stopped → zero entries', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctx = baseCtx({
      allowedSymbols: ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY'],
      symbolSignals: {
        'NIFTY 50': makeBuySignal('NIFTY 50'),
        BANKNIFTY: makeBuySignal('BANKNIFTY'),
        FINNIFTY: makeBuySignal('FINNIFTY'),
      },
      symbolHardStops: {
        'NIFTY 50': HARD_STOP_BOTH,
        BANKNIFTY: HARD_STOP_BOTH,
        FINNIFTY: HARD_STOP_BOTH,
      },
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.size).toBe(0)
  })

  it('19. cooldown still respected independent of hard stop state', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const ctx = baseCtx({
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50') },
      symbolHardStops: { 'NIFTY 50': NO_STOP },
      lastExitTimes: { 'NIFTY 50': Date.now() },
      config: { ...BASE_CONFIG, exitCooldownSec: 60 },
    })

    const entered = await result.current.evaluateAndEnter(ctx)
    expect(entered.has('NIFTY 50')).toBe(false)
  })
})

// ─── Exit tests ───────────────────────────────────────────────────────────────

describe('per-symbol hard stop — exit forcing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('9. forces exit for a symbol whose own hard stop is BOTH', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    vi.mocked(safeFetch).mockResolvedValue([{}, null])

    const ctx = baseCtx({
      targetSymbols: ['BANKNIFTY'],
      curPositions: {
        'NIFTY 50': null,
        BANKNIFTY: makeOpenPosition('BANKNIFTY'),
        FINNIFTY: null,
      },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: HARD_STOP_BOTH,
        FINNIFTY: NO_STOP,
      },
      hardStop: NO_STOP, // shared is clear — must not prevent the per-symbol exit
    })

    await result.current.evaluateAndExit(ctx, new Set())

    expect(safeFetch).toHaveBeenCalledWith(
      expect.stringContaining('/paper/trades/exit'),
      expect.any(Object),
    )
    expect(ctx.curPositions.BANKNIFTY).toBeNull()
  })

  it('10. exit reason is "Hard Stop triggered" from symbol\'s own stop', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    vi.mocked(safeFetch).mockResolvedValue([{}, null])

    const ctx = baseCtx({
      targetSymbols: ['FINNIFTY'],
      curPositions: {
        'NIFTY 50': null,
        BANKNIFTY: null,
        FINNIFTY: makeOpenPosition('FINNIFTY'),
      },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: NO_STOP,
        FINNIFTY: HARD_STOP_BOTH,
      },
      hardStop: NO_STOP,
    })

    await result.current.evaluateAndExit(ctx, new Set())

    const exitCall = vi
      .mocked(safeFetch)
      .mock.calls.find(
        ([url]) =>
          typeof url === 'string' && url.includes('/paper/trades/exit'),
      )
    expect(exitCall).toBeDefined()
    const body = JSON.parse(exitCall![1]!.body as string) as {
      metadata?: { reason?: string }
    }
    expect(body.metadata?.reason).toBe('Hard Stop triggered')
  })

  it('11. NIFTY 50 position NOT force-exited when only BANKNIFTY is hard-stopped', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { shouldExit } = await import('@/lib/strategyEngine')
    vi.mocked(shouldExit).mockReturnValue({ exit: false, reason: '' })

    const ctx = baseCtx({
      targetSymbols: ['NIFTY 50'],
      curPositions: {
        'NIFTY 50': makeOpenPosition('NIFTY 50'),
        BANKNIFTY: null,
        FINNIFTY: null,
      },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: HARD_STOP_BOTH, // should not affect NIFTY 50
      },
      hardStop: NO_STOP,
    })

    await result.current.evaluateAndExit(ctx, new Set())

    expect(safeFetch).not.toHaveBeenCalled()
    expect(ctx.curPositions['NIFTY 50']).not.toBeNull()
  })

  it('12. degraded ctx (symbolHardStops={}) + shared NO_STOP → no force exit', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { shouldExit } = await import('@/lib/strategyEngine')
    vi.mocked(shouldExit).mockReturnValue({ exit: false, reason: '' })

    const ctx = baseCtx({
      targetSymbols: ['NIFTY 50'],
      curPositions: {
        'NIFTY 50': makeOpenPosition('NIFTY 50'),
        BANKNIFTY: null,
        FINNIFTY: null,
      },
      symbolHardStops: {}, // degraded — empty
      hardStop: NO_STOP,
    })

    await result.current.evaluateAndExit(ctx, new Set())

    expect(safeFetch).not.toHaveBeenCalled()
    expect(ctx.curPositions['NIFTY 50']).not.toBeNull()
  })

  it('13. degraded ctx (symbolHardStops={}) + shared BOTH → force exits position', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    vi.mocked(safeFetch).mockResolvedValue([{}, null])

    const ctx = baseCtx({
      targetSymbols: ['NIFTY 50'],
      curPositions: {
        'NIFTY 50': makeOpenPosition('NIFTY 50'),
        BANKNIFTY: null,
        FINNIFTY: null,
      },
      symbolHardStops: {}, // empty → falls back to shared
      hardStop: HARD_STOP_BOTH,
    })

    await result.current.evaluateAndExit(ctx, new Set())

    expect(safeFetch).toHaveBeenCalledWith(
      expect.stringContaining('/paper/trades/exit'),
      expect.any(Object),
    )
    expect(ctx.curPositions['NIFTY 50']).toBeNull()
  })

  it('20. two symbols with positions — only the stopped one is force-exited', async () => {
    const { result } = renderHook(() => useTradeExecution())

    const { safeFetch } = await import('@/lib/marketService')
    const { shouldExit } = await import('@/lib/strategyEngine')
    vi.mocked(shouldExit).mockReturnValue({ exit: false, reason: '' })
    vi.mocked(safeFetch).mockResolvedValue([{}, null])

    const ctx = baseCtx({
      targetSymbols: ['NIFTY 50', 'BANKNIFTY'],
      curPositions: {
        'NIFTY 50': makeOpenPosition('NIFTY 50'),
        BANKNIFTY: makeOpenPosition('BANKNIFTY'),
        FINNIFTY: null,
      },
      symbolHardStops: {
        'NIFTY 50': NO_STOP,
        BANKNIFTY: HARD_STOP_BOTH,
      },
      hardStop: NO_STOP,
    })

    await result.current.evaluateAndExit(ctx, new Set())

    expect(ctx.curPositions.BANKNIFTY).toBeNull()
    expect(ctx.curPositions['NIFTY 50']).not.toBeNull()
  })
})

// ─── Logging tests ────────────────────────────────────────────────────────────

describe('per-symbol hard stop — log messages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('14. log message includes the blocked symbol name', async () => {
    const { result } = renderHook(() => useTradeExecution())
    const addLog = vi.fn()

    const ctx = baseCtx({
      addLog,
      allowedSymbols: ['BANKNIFTY'],
      symbolSignals: { BANKNIFTY: makeBuySignal('BANKNIFTY') },
      symbolHardStops: { BANKNIFTY: HARD_STOP_BOTH },
    })

    await result.current.evaluateAndEnter(ctx)

    const messages = vi
      .mocked(addLog)
      .mock.calls.map(([log]) => (log as { message: string }).message)
    expect(messages.some((m) => m.includes('[BANKNIFTY]'))).toBe(true)
  })

  it('15. log message includes the actual stop reason text', async () => {
    const { result } = renderHook(() => useTradeExecution())
    const addLog = vi.fn()

    const customStop = {
      blocked: true,
      blockedDirection: 'BOTH' as const,
      reasons: ['Macro Guard: RBI Rate Decision'],
    }

    const ctx = baseCtx({
      addLog,
      allowedSymbols: ['NIFTY 50'],
      symbolSignals: { 'NIFTY 50': makeBuySignal('NIFTY 50') },
      symbolHardStops: { 'NIFTY 50': customStop },
    })

    await result.current.evaluateAndEnter(ctx)

    const messages = vi
      .mocked(addLog)
      .mock.calls.map(([log]) => (log as { message: string }).message)
    expect(
      messages.some((m) => m.includes('Macro Guard: RBI Rate Decision')),
    ).toBe(true)
  })
})
