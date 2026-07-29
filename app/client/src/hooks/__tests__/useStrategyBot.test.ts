import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useStrategyBot } from '@/hooks/useStrategyBot'

const LOCAL_STORAGE_PREFIX = 'algo-trade:'
const marketMocks = vi.hoisted(() => ({
  fetchMarketForSymbols: vi.fn(),
}))
const paperMocks = vi.hoisted(() => ({
  fetchPaperHistory: vi.fn(),
}))

vi.mock('@/lib/marketService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketService')>()
  return {
    ...actual,
    fetchMarketForSymbols: marketMocks.fetchMarketForSymbols,
  }
})

vi.mock('@/lib/paperTrading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paperTrading')>()
  return {
    ...actual,
    fetchPaperHistory: paperMocks.fetchPaperHistory,
  }
})

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  marketMocks.fetchMarketForSymbols.mockReset()
  marketMocks.fetchMarketForSymbols.mockResolvedValue({})
  paperMocks.fetchPaperHistory.mockReset()
  paperMocks.fetchPaperHistory.mockResolvedValue({
    account: {
      id: 'user-1',
      mode: 'paper',
      balance: 15_000,
      currency: 'INR',
      updated_at: '2026-07-29T04:00:00.000Z',
    },
    recentEntries: [],
    openTradeCount: 0,
    trades: [],
    openTrades: [],
  })
})

describe('useStrategyBot', () => {
  it('should initialise with IDLE state when no token provided', () => {
    const { result } = renderHook(() => useStrategyBot(null))
    expect(result.current.state).toBe('IDLE')
    expect(result.current.position).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.indicators).toBeNull()
    expect(result.current.tradesCount).toBe(0)
  })

  it('should initialise with IDLE state even with token', () => {
    const { result } = renderHook(() => useStrategyBot('test-token'))
    expect(result.current.state).toBe('IDLE')
  })

  it('should stop the bot without discarding an active position', () => {
    const position = {
      instrumentKey: 'NSE_FO|ACTIVE',
      direction: 'CE',
      entryPrice: 100,
      currentPrice: 101,
      quantity: 65,
      lotSize: 65,
      entryTime: '2026-07-28T09:30:00.000Z',
      tradeId: 1,
      executionMode: 'paper',
      tradeType: 'buying',
      underlyingSymbol: 'NIFTY 50',
    }
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}bot-positions`,
      JSON.stringify({
        'NIFTY 50': position,
        BANKNIFTY: null,
        FINNIFTY: null,
      }),
    )
    const { result } = renderHook(() => useStrategyBot('test-token'))

    act(() => {
      result.current.stop()
    })

    expect(result.current.state).toBe('STOPPED')
    expect(result.current.position?.instrumentKey).toBe('NSE_FO|ACTIVE')
    expect(result.current.positions['NIFTY 50']?.quantity).toBe(65)
    expect(result.current.error).toBeNull()
  })

  it('aborts the in-flight tick when stopped', async () => {
    const observed: { signal?: AbortSignal } = {}
    marketMocks.fetchMarketForSymbols.mockImplementation(
      (...args: unknown[]) => {
        observed.signal =
          args[4] instanceof AbortSignal ? args[4] : (args[4] as AbortSignal)
        return new Promise((_, reject) => {
          observed.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      },
    )
    const { result } = renderHook(() => useStrategyBot('test-token'))

    act(() => {
      result.current.start()
    })
    await waitFor(() =>
      expect(marketMocks.fetchMarketForSymbols).toHaveBeenCalledOnce(),
    )

    act(() => {
      result.current.stop()
    })
    expect(observed.signal?.aborted).toBe(true)
  })

  it('requires explicit confirmation before arming live entries', () => {
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}strategy-config`,
      JSON.stringify({ executionMode: 'live' }),
    )
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useStrategyBot('test-token'))

    act(() => {
      result.current.start()
    })

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(result.current.liveArmed).toBe(false)
    expect(result.current.state).toBe('IDLE')
    expect(marketMocks.fetchMarketForSymbols).not.toHaveBeenCalled()
  })

  it('does not auto-resume live entries without an open position', async () => {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-state`, 'RUNNING')
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}strategy-config`,
      JSON.stringify({ executionMode: 'live' }),
    )

    const { result } = renderHook(() => useStrategyBot('test-token'))

    await waitFor(() => expect(result.current.state).toBe('IDLE'))
    expect(result.current.liveArmed).toBe(false)
    expect(marketMocks.fetchMarketForSymbols).not.toHaveBeenCalled()
  })

  it('reconciles persisted paper positions while live mode is selected', async () => {
    const position = {
      instrumentKey: 'NSE_FO|PAPER-CE',
      direction: 'CE',
      entryPrice: 100,
      currentPrice: 101,
      quantity: 65,
      lotSize: 65,
      entryTime: '2026-07-29T04:00:00.000Z',
      tradeId: 1,
      executionMode: 'paper',
      tradeType: 'buying',
      paperTradeId: 'paper-trade-1',
      underlyingSymbol: 'NIFTY 50',
    }
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-state`, 'RUNNING')
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}bot-positions`,
      JSON.stringify({
        'NIFTY 50': position,
        BANKNIFTY: null,
        FINNIFTY: null,
      }),
    )
    localStorage.setItem(
      `${LOCAL_STORAGE_PREFIX}strategy-config`,
      JSON.stringify({ executionMode: 'live' }),
    )
    paperMocks.fetchPaperHistory.mockResolvedValueOnce({
      account: {
        id: 'user-1',
        mode: 'paper',
        balance: 15_000,
        currency: 'INR',
        updated_at: '2026-07-29T04:00:00.000Z',
      },
      recentEntries: [],
      openTradeCount: 1,
      trades: [],
      openTrades: [
        {
          id: 'paper-trade-1',
          account_id: 'user-1',
          status: 'OPEN',
          instrument_key: 'NSE_FO|PAPER-CE',
          direction: 'CE',
          quantity: 65,
          entry_price: 100,
          entry_value: 6_500,
          exit_price: null,
          exit_value: null,
          realized_pnl: null,
          opened_at: '2026-07-29T04:00:00.000Z',
          closed_at: null,
          metadata_json: JSON.stringify({
            underlyingSymbol: 'NIFTY 50',
            expiry: '2026-08-04',
            lotSize: 65,
            tradeType: 'buying',
          }),
        },
      ],
    })

    const { unmount } = renderHook(() => useStrategyBot('test-token'))

    await waitFor(() =>
      expect(paperMocks.fetchPaperHistory).toHaveBeenCalledOnce(),
    )
    unmount()
  })

  it('should persist and load bot state from localStorage', () => {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-state`, 'RUNNING')

    const { result } = renderHook(() => useStrategyBot('test-token'))
    expect(result.current.state).toBe('RUNNING')
  })

  it('should handle corrupted localStorage gracefully', () => {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-state`, '{invalid json')
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-position`, '{broken')

    const { result } = renderHook(() => useStrategyBot('test-token'))
    expect(result.current.state).toBe('IDLE')
    expect(result.current.position).toBeNull()
    expect(result.current.logs).toEqual([])
  })

  it('should clear logs', () => {
    const { result } = renderHook(() => useStrategyBot('test-token'))

    act(() => {
      result.current.clearLogs()
    })

    expect(result.current.logs).toEqual([])
  })

  it('should not crash with empty token on start', () => {
    const { result } = renderHook(() => useStrategyBot(null))

    act(() => {
      result.current.start()
    })

    expect(result.current.state).toBe('IDLE')
  })
})
