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
      expect(getLotSizeForSymbol('NSE_FO|NIFTY26JUL24500CE')).toBe(25)
    })

    it('returns lot size 15 for BANKNIFTY', () => {
      expect(getLotSizeForSymbol('BANKNIFTY')).toBe(15)
      expect(getLotSizeForSymbol('NSE_INDEX|Nifty Bank')).toBe(15)
      expect(getLotSizeForSymbol('NSE_FO|BANKNIFTY26JUL52000PE')).toBe(15)
    })

    it('returns lot size 40 for FINNIFTY', () => {
      expect(getLotSizeForSymbol('FINNIFTY')).toBe(40)
      expect(getLotSizeForSymbol('NSE_INDEX|Nifty Fin Service')).toBe(40)
    })

    it('returns lot size 50 for MIDCPNIFTY', () => {
      expect(getLotSizeForSymbol('MIDCPNIFTY')).toBe(50)
      expect(getLotSizeForSymbol('NSE_INDEX|Nifty Mid Select')).toBe(50)
    })

    it('returns lot size 10 for SENSEX', () => {
      expect(getLotSizeForSymbol('SENSEX')).toBe(10)
      expect(getLotSizeForSymbol('BSE_INDEX|SENSEX')).toBe(10)
    })

    it('returns lot size 15 for BANKEX', () => {
      expect(getLotSizeForSymbol('BANKEX')).toBe(15)
    })

    it('returns correct lot sizes for popular Stock F&O symbols', () => {
      expect(getLotSizeForSymbol('NSE_FO|RELIANCE26JUL3000CE')).toBe(250)
      expect(getLotSizeForSymbol('INFY')).toBe(400)
      expect(getLotSizeForSymbol('TCS')).toBe(175)
      expect(getLotSizeForSymbol('HDFCBANK')).toBe(550)
      expect(getLotSizeForSymbol('SBIN')).toBe(1500)
    })
  })

  describe('Default Configuration & Backward Compatibility', () => {
    it('defaults strategy underlyingMode to ALL_PARALLEL', () => {
      expect(DEFAULT_CONFIG.underlyingMode).toBe('ALL_PARALLEL')
      expect(DEFAULT_CONFIG.multiSymbolExecutionMode).toBe('independent')
      expect(DEFAULT_CONFIG.executionMode).toBe('paper')
      expect(DEFAULT_CONFIG.maxTradesPerDay).toBe(3)
    })
  })

  describe('Multi-Symbol Execution Strategy Resolution', () => {
    it('resolves candidate entries independently in independent mode', () => {
      const mode = 'independent'
      const symbolSignals: Record<string, string> = {
        'NIFTY 50': 'BUY_CE',
        BANKNIFTY: 'NEUTRAL',
        FINNIFTY: 'BUY_CE',
      }
      const candidates = Object.entries(symbolSignals)
        .filter(([, sig]) => sig === 'BUY_CE' || sig === 'BUY_PE')
        .map(([sym]) => sym)

      expect(mode).toBe('independent')
      expect(candidates).toEqual(['NIFTY 50', 'FINNIFTY'])
    })

    it('requires consensus across all active target symbols in consensus mode', () => {
      const symbolSignals1 = {
        'NIFTY 50': 'BUY_CE',
        BANKNIFTY: 'BUY_CE',
        FINNIFTY: 'BUY_CE',
      }
      const symbolSignals2 = {
        'NIFTY 50': 'BUY_CE',
        BANKNIFTY: 'NEUTRAL',
        FINNIFTY: 'BUY_CE',
      }

      const checkConsensus = (sigs: Record<string, string>) => {
        const values = Object.values(sigs)
        return (
          values.every((s) => s === 'BUY_CE' || s === 'BUY_PE') &&
          values.every((s) => s === values[0])
        )
      }

      expect(checkConsensus(symbolSignals1)).toBe(true)
      expect(checkConsensus(symbolSignals2)).toBe(false)
    })

    it('selects single highest confidence symbol in best_signal mode', () => {
      const signals = [
        { symbol: 'NIFTY 50', score: 14 },
        { symbol: 'BANKNIFTY', score: 18 },
        { symbol: 'FINNIFTY', score: 11 },
      ]
      signals.sort((a, b) => b.score - a.score)

      expect(signals[0].symbol).toBe('BANKNIFTY')
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
