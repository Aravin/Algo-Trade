import { describe, it, expect } from 'vitest'
import {
  runHardStopChecks,
  scoreBullish,
  scoreBearish,
  shouldExit,
} from '../strategyEngine'
import type { VrdData, AllSignalData, ActivePosition } from '../types'

describe('strategyEngine', () => {
  const baseVrd: VrdData = {
    mmi: { score: 55, label: 'Greed' },
    advancesDeclines: {
      advances: 30,
      declines: 20,
      ratio: 1.5,
      label: 'Bullish',
    },
    fiiLongShort: { longPct: 60, shortPct: 40, shortPctTrend: 'Falling' },
    fiiPositioning: { netPosition: 500, consecutiveShortDays: 0 },
    pcr: { value: 1.2, zone: 'buy' },
    straddleIv: { elevated: false, percentAboveAvg: 0 },
    niftyPe: { pe: 22, label: 'Fair' },
    vix: 15,
    giftNifty: {
      price: 24100,
      changePts: 50,
      changePct: 0.2,
      openingSignal: 'Gap Up',
    },
    supportWall: 23800,
    resistanceWall: 24300,
    maxPain: 24000,
    fetchedAt: new Date().toISOString(),
  }

  describe('runHardStopChecks', () => {
    it('returns blocked: false when VIX is within normal bounds', () => {
      const check = runHardStopChecks(baseVrd, [])
      expect(check.blocked).toBe(false)
      expect(check.reasons).toHaveLength(0)
    })

    it('blocks trading when VIX is out of bounds (< 10 or > 25)', () => {
      const vrdHighVix: VrdData = {
        ...baseVrd,
        vix: 28,
      }
      const check = runHardStopChecks(vrdHighVix, [])
      expect(check.blocked).toBe(true)
      expect(check.blockedDirection).toBe('BOTH')
      expect(check.reasons[0]).toContain('Extreme Volatility')
    })
  })

  describe('scoreBullish & scoreBearish', () => {
    it('calculates score breakdowns without crashing', () => {
      const allSignalData: AllSignalData = {
        v3: 'buy',
        indicators: {
          ema: 'Buy',
          adx: 'Buy',
          rsi: { signal: 'Hold', value: 55 },
          stochastic: { k: 70, d: 65, signal: 'Buy' },
          bollinger: {
            signal: 'Buy',
            upper: 24200,
            lower: 23800,
            middle: 24000,
            trend: 'Up',
          },
          atr: { value: 40, level: 'Neutral' },
          pcr: 'Buy',
          pcrValue: 1.2,
        },
        vrd: baseVrd,
      }

      const bullResult = scoreBullish(allSignalData)
      expect(bullResult.score).toBeGreaterThan(0)
      expect(bullResult.breakdown.length).toBeGreaterThan(0)

      const bearResult = scoreBearish(allSignalData)
      expect(typeof bearResult.score).toBe('number')
    })
  })

  describe('shouldExit', () => {
    const mockSignalData: AllSignalData = {
      v3: 'hold',
      indicators: {
        ema: 'Hold',
        adx: 'Hold',
        rsi: { signal: 'Hold', value: 50 },
        stochastic: { k: 50, d: 50, signal: 'Hold' },
        bollinger: {
          signal: 'Hold',
          upper: 24200,
          lower: 23800,
          middle: 24000,
          trend: 'Neutral',
        },
        atr: { value: 40, level: 'Neutral' },
        pcr: 'Hold',
        pcrValue: 1.0,
      },
      vrd: baseVrd,
    }

    it('triggers exit on profit target', () => {
      const pos: ActivePosition = {
        instrumentKey: 'NSE_FO|NIFTY24JULCE',
        direction: 'CE',
        entryPrice: 100,
        quantity: 25,
        tradeId: 101,
        entryTime: new Date().toISOString(),
      }

      const exitCheck = shouldExit(pos, mockSignalData, 120, {
        maxProfitPct: 15,
        maxLossPct: 10,
      })
      expect(exitCheck.exit).toBe(true)
      expect(exitCheck.reason).toContain('Profit')
    })

    it('triggers exit on stop loss', () => {
      const pos: ActivePosition = {
        instrumentKey: 'NSE_FO|NIFTY24JULCE',
        direction: 'CE',
        entryPrice: 100,
        quantity: 25,
        tradeId: 102,
        entryTime: new Date().toISOString(),
      }

      const exitCheck = shouldExit(pos, mockSignalData, 85, {
        maxProfitPct: 15,
        maxLossPct: 10,
      })
      expect(exitCheck.exit).toBe(true)
      expect(exitCheck.reason).toContain('Stop loss')
    })
  })
})
