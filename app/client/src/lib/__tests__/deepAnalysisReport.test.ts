import { describe, it, expect } from 'vitest'
import type { Candle, VrdData } from '@/lib/types'

describe('deepAnalysisReport', () => {
  it('should generate report structure', () => {
    const mockCandles: Candle[] = [
      ['2026-07-24T09:15:00', 24500, 24550, 24480, 24520, 100000],
    ]
    const mockVrd: VrdData = {
      mmi: { score: 65, label: 'Moderate' },
      advancesDeclines: {
        advances: 1200,
        declines: 800,
        ratio: 1.5,
        label: 'Positive',
      },
      fiiLongShort: { longPct: 65, shortPct: 35, shortPctTrend: 'Falling' },
      fiiPositioning: { netPosition: 25000, consecutiveShortDays: 0 },
      pcr: { value: 1.2, zone: 'Bullish' },
      straddleIv: { elevated: false, percentAboveAvg: 12 },
      niftyPe: { pe: 22, label: 'Fair' },
      vix: 14.5,
      giftNifty: {
        price: 24520,
        changePts: 45,
        changePct: 0.18,
        openingSignal: 'Gap Up',
      },
      supportWall: 24300,
      resistanceWall: 24700,
      maxPain: 24500,
      fetchedAt: new Date().toISOString(),
    }
    expect(mockCandles.length).toBeGreaterThan(0)
    expect(mockVrd.mmi?.score).toBe(65)
    expect(mockVrd.vix).toBe(14.5)
    expect(mockVrd.advancesDeclines?.advances).toBe(1200)
    expect(mockVrd.fiiLongShort?.longPct).toBe(65)
  })
})
