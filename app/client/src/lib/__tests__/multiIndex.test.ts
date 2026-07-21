import { describe, it, expect, vi } from 'vitest'
import { UNDERLYING_INSTRUMENT_KEYS, DEFAULT_CONFIG } from '../types'
import { getLotSizeForSymbol } from '../syntheticCalculators'
import { fetchMarketForSymbols } from '../marketService'
import type { BotLog, SourceStatus } from '../marketService'
import type { UnderlyingSymbol } from '../types'

describe('Multi-Index Options Trading Support', () => {
  describe('Instrument Key Mappings', () => {
    it('maps NIFTY 50 to correct Upstox instrument key', () => {
      expect(UNDERLYING_INSTRUMENT_KEYS['NIFTY 50']).toBe('NSE_INDEX|Nifty 50')
    })

    it('maps BANKNIFTY to correct Upstox instrument key', () => {
      expect(UNDERLYING_INSTRUMENT_KEYS.BANKNIFTY).toBe('NSE_INDEX|Nifty Bank')
    })

    it('maps FINNIFTY to correct Upstox instrument key', () => {
      expect(UNDERLYING_INSTRUMENT_KEYS.FINNIFTY).toBe(
        'NSE_INDEX|Nifty Fin Service',
      )
    })
  })

  describe('Lot Size Calculations', () => {
    it('returns lot size 25 for NIFTY 50', () => {
      expect(getLotSizeForSymbol('NIFTY 50')).toBe(25)
      expect(getLotSizeForSymbol('NSE_INDEX|Nifty 50')).toBe(25)
    })

    it('returns lot size 15 for BANKNIFTY', () => {
      expect(getLotSizeForSymbol('BANKNIFTY')).toBe(15)
      expect(getLotSizeForSymbol('NSE_INDEX|Nifty Bank')).toBe(15)
    })

    it('returns lot size 40 for FINNIFTY', () => {
      expect(getLotSizeForSymbol('FINNIFTY')).toBe(40)
      expect(getLotSizeForSymbol('NSE_INDEX|Nifty Fin Service')).toBe(40)
    })
  })

  describe('Default Configuration & Backward Compatibility', () => {
    it('defaults strategy underlyingMode to ALL_PARALLEL', () => {
      expect(DEFAULT_CONFIG.underlyingMode).toBe('ALL_PARALLEL')
    })

    it('maintains all legacy DEFAULT_CONFIG fields intact', () => {
      expect(DEFAULT_CONFIG.strategyMode).toBe('v5_scorecard')
      expect(DEFAULT_CONFIG.executionMode).toBe('paper')
      expect(DEFAULT_CONFIG.maxTradesPerDay).toBe(3)
    })
  })

  describe('Parallel Market Fetching', () => {
    it('fetches market data for all requested symbols concurrently', async () => {
      // Mock global fetch to return minimal mock data
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('intraday')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: {
                  candles: [
                    ['2026-07-21T10:00:00Z', 24000, 24050, 23980, 24020, 5000],
                  ],
                },
              }),
          })
        }
        if (url.includes('option-contracts')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                expiries: ['2026-07-24'],
              }),
          })
        }
        if (url.includes('option-chain')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [
                  {
                    expiry: '2026-07-24',
                    strike_price: 24000,
                    underlying_spot_price: 24020,
                    call_options: {
                      instrument_key: 'NSE_FO|12345',
                      market_data: { ltp: 120, volume: 5000, oi: 10000 },
                    },
                    put_options: {
                      instrument_key: 'NSE_FO|12346',
                      market_data: { ltp: 110, volume: 4500, oi: 9500 },
                    },
                  },
                ],
              }),
          })
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        })
      })

      vi.stubGlobal('fetch', mockFetch)

      const symbols: UnderlyingSymbol[] = ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY']
      const logs: { level: string; msg: string }[] = []
      const addLog = (l: BotLog) => {
        logs.push({ level: l.level, msg: l.msg })
      }
      const sourceUpdate = vi.fn<(k: string, s: SourceStatus) => void>()

      const marketMap = await fetchMarketForSymbols(
        'mock-token',
        addLog,
        sourceUpdate,
        symbols,
      )

      expect(marketMap['NIFTY 50']).toBeDefined()
      expect(marketMap.BANKNIFTY).toBeDefined()
      expect(marketMap.FINNIFTY).toBeDefined()

      expect(marketMap['NIFTY 50'].underlyingSymbol).toBe('NIFTY 50')
      expect(marketMap.BANKNIFTY.underlyingSymbol).toBe('BANKNIFTY')
      expect(marketMap.FINNIFTY.underlyingSymbol).toBe('FINNIFTY')

      vi.unstubAllGlobals()
    })
  })
})
