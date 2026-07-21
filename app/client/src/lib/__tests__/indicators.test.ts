import { describe, it, expect } from 'vitest'
import { computeAllIndicators, getOtmStrike } from '../indicators'
import type { Candle, OptionData } from '../types'

describe('indicators', () => {
  function generateCandles(
    count: number,
    startPrice = 24000,
    trend = 10,
  ): Candle[] {
    const candles: Candle[] = []
    let price = startPrice
    const now = Date.now()
    for (let i = 0; i < count; i++) {
      price += (i % 2 === 0 ? 1 : -0.5) * trend
      const open = price - 2
      const high = price + 5
      const low = price - 5
      const close = price
      const timestamp = new Date(now + i * 60000).toISOString()
      candles.push([timestamp, open, high, low, close, 1000, 0])
    }
    return candles
  }

  describe('computeAllIndicators', () => {
    it('returns Hold for all indicators when candles list is too short', () => {
      const shortCandles = generateCandles(10)
      const result = computeAllIndicators(shortCandles, [])

      expect(result.ema).toBe('Hold')
      expect(result.adx).toBe('Hold')
      expect(result.rsi.signal).toBe('Hold')
      expect(result.stochastic.signal).toBe('Hold')
      expect(result.bollinger.signal).toBe('Hold')
      expect(result.atr.level).toBe('Low')
      expect(result.pcr).toBe('Hold')
    })

    it('computes EMA, RSI, and Bollinger correctly on sufficient candle count', () => {
      const candles = generateCandles(60, 24000, 15)
      const result = computeAllIndicators(candles, [])

      expect(result.ema).toBe('Buy')
      expect(typeof result.rsi.value).toBe('number')
      expect(['Overbought', 'Oversold', 'Hold']).includes(result.rsi.signal)
      expect(['Buy', 'Sell', 'Hold']).includes(result.bollinger.signal)
      expect(result.atr.value).toBeGreaterThan(0)
    })

    it('outputs Buy for Bollinger signal in breakout mode when price breaks above upper band', () => {
      const candles = generateCandles(60, 24000, 20)
      const result = computeAllIndicators(candles, [])
      expect(result.bollinger.signal).toBe('Buy')
    })

    it('calculates PCR correctly from option chain', () => {
      const mockOptionChain: OptionData[] = [
        {
          expiry: '2026-07-30',
          strike_price: 24000,
          underlying_spot_price: 24000,
          call_options: {
            instrument_key: 'CE_KEY',
            market_data: { ltp: 150, volume: 500, oi: 1000 },
          },
          put_options: {
            instrument_key: 'PE_KEY',
            market_data: { ltp: 120, volume: 600, oi: 1500 },
          },
        },
      ]
      const candles = generateCandles(50)
      const result = computeAllIndicators(candles, mockOptionChain)

      expect(result.pcrValue).toBe(1.5)
      expect(result.pcr).toBe('Buy')
    })
  })

  describe('getOtmStrike', () => {
    it('returns null for empty option chain', () => {
      expect(getOtmStrike([], 'CE')).toBeNull()
    })

    it('selects correct OTM CE strike', () => {
      const optionChain: OptionData[] = [
        {
          expiry: '2026-07-30',
          strike_price: 24000,
          underlying_spot_price: 24050,
          call_options: {
            instrument_key: 'CE1',
            market_data: { ltp: 200, volume: 10, oi: 10 },
          },
          put_options: {
            instrument_key: 'PE1',
            market_data: { ltp: 50, volume: 10, oi: 10 },
          },
        },
        {
          expiry: '2026-07-30',
          strike_price: 24100,
          underlying_spot_price: 24050,
          call_options: {
            instrument_key: 'CE2',
            market_data: { ltp: 150, volume: 10, oi: 10 },
          },
          put_options: {
            instrument_key: 'PE2',
            market_data: { ltp: 80, volume: 10, oi: 10 },
          },
        },
        {
          expiry: '2026-07-30',
          strike_price: 24200,
          underlying_spot_price: 24050,
          call_options: {
            instrument_key: 'CE3',
            market_data: { ltp: 100, volume: 10, oi: 10 },
          },
          put_options: {
            instrument_key: 'PE3',
            market_data: { ltp: 120, volume: 10, oi: 10 },
          },
        },
        {
          expiry: '2026-07-30',
          strike_price: 24300,
          underlying_spot_price: 24050,
          call_options: {
            instrument_key: 'CE4',
            market_data: { ltp: 60, volume: 10, oi: 10 },
          },
          put_options: {
            instrument_key: 'PE4',
            market_data: { ltp: 180, volume: 10, oi: 10 },
          },
        },
        {
          expiry: '2026-07-30',
          strike_price: 24400,
          underlying_spot_price: 24050,
          call_options: {
            instrument_key: 'CE5',
            market_data: { ltp: 30, volume: 10, oi: 10 },
          },
          put_options: {
            instrument_key: 'PE5',
            market_data: { ltp: 250, volume: 10, oi: 10 },
          },
        },
      ]
      const selected = getOtmStrike(optionChain, 'CE', 2)
      expect(selected?.strike_price).toBe(24300)
    })
  })
})
