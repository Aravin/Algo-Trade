import { describe, it, expect } from 'vitest'
import { sweepThresholds } from '../tickLog'
import type { TickRecord } from '../tickLog'

describe('sweepThresholds', () => {
  const sampleTicks: TickRecord[] = [
    {
      ts: 1700000000000,
      bullScore: 7,
      bearScore: 1,
      scoreMax: 10,
      confidence: 'strong',
      signal: 'BUY_CE',
      vix: 15,
      strongThreshold: 14,
      moderateThreshold: 10,
      strongGap: 6,
      moderateGap: 3,
    },
    {
      ts: 1700000001000,
      bullScore: 2,
      bearScore: 6,
      scoreMax: 10,
      confidence: 'moderate',
      signal: 'BUY_PE',
      vix: 15,
      strongThreshold: 14,
      moderateThreshold: 10,
      strongGap: 6,
      moderateGap: 3,
    },
    {
      ts: 1700000002000,
      bullScore: 3,
      bearScore: 3,
      scoreMax: 10,
      confidence: 'none',
      signal: 'NO_TRADE',
      vix: 15,
      strongThreshold: 14,
      moderateThreshold: 10,
      strongGap: 6,
      moderateGap: 3,
    },
  ]

  it('evaluates ticks using ratio scaling when scoreMax is provided', () => {
    // For tick 1: bullScore=7, scoreMax=10 -> ratio=0.7.
    // Dynamic rule satisfiesStrong = top >= sT || (ratio >= 0.7 && top >= Math.min(sT, 10))
    // With sT=14 and strongGap=6: gap=|7-1|=6 >= 6 -> satisfiesStrong & gap -> Strong signal!
    const results = sweepThresholds(
      sampleTicks,
      [14, 14],
      [10, 10],
      [{ strongGap: 6, moderateGap: 3 }],
    )

    expect(results).toHaveLength(1)
    const res = results[0]
    expect(res.totalTicks).toBe(3)
    expect(res.strongTicks).toBe(1)
    expect(res.moderateTicks).toBe(1)
    expect(res.tradeTicks).toBe(2)
    expect(res.cePct).toBe(50)
    expect(res.pePct).toBe(50)
  })

  it('returns empty array when ticks input is empty', () => {
    const results = sweepThresholds([])
    expect(results).toEqual([])
  })
})
