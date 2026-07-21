import { describe, it, expect } from 'vitest'
import { calcBollingerSqueezeMetrics, calcADXRaw } from '../indicators'
import { evaluateBollingerSqueezeStrategy } from '../strategyEngine'
import type { Candle, AllSignalData, StrategyConfig } from '../types'

describe('Bollinger Volatility Squeeze Strategy', () => {
  // Helper to generate N candles with low volatility (flat range around 24000)
  function createFlatCandles(count: number, basePrice = 24000): Candle[] {
    const candles: Candle[] = []
    const now = new Date()
    for (let i = 0; i < count; i++) {
      const time = new Date(now.getTime() + i * 60000).toISOString()
      // Small fluctuation of +/- 2 points
      const offset = (i % 2 === 0 ? 1 : -1) * 1.5
      const close = basePrice + offset
      candles.push([time, basePrice, basePrice + 3, basePrice - 3, close, 1000])
    }
    return candles
  }

  // Helper to generate breakout candles upwards or downwards
  function createBreakoutCandles(direction: 'UP' | 'DOWN'): Candle[] {
    const flat = createFlatCandles(35, 24000)
    const lastTime = new Date().toISOString()
    if (direction === 'UP') {
      // Sudden sharp move above upper band with high range
      flat.push([lastTime, 24005, 24150, 24000, 24140, 5000])
    } else {
      // Sudden sharp move below lower band
      flat.push([lastTime, 23995, 24000, 23850, 23860, 5000])
    }
    return flat
  }

  describe('calcBollingerSqueezeMetrics', () => {
    it('returns empty metrics if candles < 20', () => {
      const smallCandles = createFlatCandles(10)
      const metrics = calcBollingerSqueezeMetrics(smallCandles)
      expect(metrics.isSqueezing).toBe(false)
      expect(metrics.bandwidthPct).toBe(0)
    })

    it('detects SQUEEZING status when candles are compressed in a tight range', () => {
      const flatCandles = createFlatCandles(30)
      const metrics = calcBollingerSqueezeMetrics(flatCandles, 2.0, 3, 10)
      expect(metrics.isSqueezing).toBe(true)
      expect(metrics.squeezeCandleCount).toBeGreaterThanOrEqual(3)
      expect(metrics.bandwidthPct).toBeGreaterThan(0)
    })

    it('computes raw ADX values correctly', () => {
      const candles = createFlatCandles(30)
      const adx = calcADXRaw(candles)
      expect(typeof adx.adx).toBe('number')
      expect(typeof adx.plusDi).toBe('number')
      expect(typeof adx.minusDi).toBe('number')
    })
  })

  describe('evaluateBollingerSqueezeStrategy', () => {
    const dummySignalData: AllSignalData = {
      v3: 'buy',
      indicators: {
        ema: 'Buy',
        adx: 'Buy',
        rsi: { value: 50, signal: 'Hold' },
        stochastic: { k: 50, d: 50, signal: 'Hold' },
        bollinger: {
          upper: 24050,
          middle: 24000,
          lower: 23950,
          signal: 'Hold',
          trend: 'Neutral',
        },
        atr: { value: 20, level: 'Neutral' },
        pcr: 'Buy',
        pcrValue: 1.1,
      },
      vrd: null,
    }

    const dummyConfig: StrategyConfig = {
      strategyMode: 'bollinger_squeeze',
      underlyingMode: 'ALL_PARALLEL',
      squeezeThresholdPct: 2.0,
      minSqueezeCandles: 2,
      adxMinThreshold: 0, // relaxed for test
      strongThreshold: 14,
      moderateThreshold: 10,
      strongGap: 6,
      moderateGap: 3,
      maxProfitPct: 10,
      maxLossPct: 5,
      maxTradesPerDay: 3,
      lastEntryTime: '15:15',
      pollingIntervalSec: 60,
      minConfidence: 'moderate',
      otmSkip: 3,
      executionMode: 'paper',
      tradeType: 'buying',
    }

    it('returns WAIT or NO_TRADE when in squeeze without breakout', () => {
      const flat = createFlatCandles(30)
      const res = evaluateBollingerSqueezeStrategy(
        dummySignalData,
        flat,
        dummyConfig,
      )
      expect(['WAIT', 'NO_TRADE']).toContain(res.signal)
    })

    it('triggers BUY_CE on upside breakout after squeeze', () => {
      const upBreakout = createBreakoutCandles('UP')
      const res = evaluateBollingerSqueezeStrategy(
        dummySignalData,
        upBreakout,
        dummyConfig,
      )
      expect(res.signal).toBe('BUY_CE')
      expect(['strong', 'moderate']).toContain(res.confidence)
    })

    it('triggers BUY_PE on downside breakout after squeeze', () => {
      const downBreakout = createBreakoutCandles('DOWN')
      const res = evaluateBollingerSqueezeStrategy(
        dummySignalData,
        downBreakout,
        dummyConfig,
      )
      expect(res.signal).toBe('BUY_PE')
      expect(['strong', 'moderate']).toContain(res.confidence)
    })

    it('suppresses moderate breakout signals when minConfidence is set to strong', () => {
      const upBreakout = createBreakoutCandles('UP')
      const strictConfig: StrategyConfig = {
        ...dummyConfig,
        minConfidence: 'strong',
        adxMinThreshold: 10, // Breakout triggers, but ADX < 15 so confidence is moderate
      }
      const res = evaluateBollingerSqueezeStrategy(
        dummySignalData,
        upBreakout,
        strictConfig,
      )
      expect(res.signal).toBe('NO_TRADE')
      expect(res.confidence).toBe('moderate')
    })

    it('blocks breakout when ADX is below adxMinThreshold', () => {
      const upBreakout = createBreakoutCandles('UP')
      const highAdxConfig: StrategyConfig = {
        ...dummyConfig,
        adxMinThreshold: 90, // Unreachable ADX
      }
      const res = evaluateBollingerSqueezeStrategy(
        dummySignalData,
        upBreakout,
        highAdxConfig,
      )
      expect(res.signal).toBe('WAIT')
    })

    it('gracefully handles empty or partial config options', () => {
      const flat = createFlatCandles(30)
      const res = evaluateBollingerSqueezeStrategy(dummySignalData, flat, {})
      expect(res.signal).toBeDefined()
      expect(res.confidence).toBeDefined()
    })
  })
})
