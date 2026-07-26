/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  sweepThresholds,
  appendTick,
  getTickLog,
  clearTickLog,
} from '../tickLog'
import type { TickRecord } from '../tickLog'
import { STORAGE_KEY_TICK_LOG, MAX_TICKS } from '../constants'

beforeEach(() => {
  localStorage.clear()
})

const sampleTick: TickRecord = {
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
}

// ─── Existing sweepThresholds tests ──────────────────────────────────────────

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
    expect(sweepThresholds([])).toEqual([])
  })

  it('returns empty array for null ticks', () => {
    expect(sweepThresholds(null as unknown as TickRecord[])).toEqual([])
  })

  it('sorts results by tradeTicks ascending', () => {
    const results = sweepThresholds(
      sampleTicks,
      [10, 14],
      [6, 8],
      [
        { strongGap: 6, moderateGap: 3 },
        { strongGap: 4, moderateGap: 2 },
      ],
    )
    for (let i = 1; i < results.length; i++) {
      expect(results[i].tradeTicks).toBeGreaterThanOrEqual(
        results[i - 1].tradeTicks,
      )
    }
  })

  it('handles scoreMax of 0 or negative gracefully', () => {
    const zeroMaxTicks: TickRecord[] = [{ ...sampleTicks[0], scoreMax: 0 }]
    const results = sweepThresholds(
      zeroMaxTicks,
      [14, 14],
      [10, 10],
      [{ strongGap: 6, moderateGap: 3 }],
    )
    expect(results).toHaveLength(1)
    // scoreMax=0 falls back to scale=1 (20/20)
    expect(results[0].totalTicks).toBe(1)
  })

  it('computes cePct and pePct correctly when only one side fires', () => {
    const allCeTicks: TickRecord[] = [
      { ...sampleTicks[0] }, // bullScore=7, bearScore=1 -> CE
      { ...sampleTicks[0], ts: 1700000003000 },
    ]
    const results = sweepThresholds(
      allCeTicks,
      [14, 14],
      [10, 10],
      [{ strongGap: 6, moderateGap: 3 }],
    )
    expect(results[0].cePct).toBe(100)
    expect(results[0].pePct).toBe(0)
  })
})

// ─── New tests for appendTick / getTickLog / clearTickLog ────────────────────

describe('appendTick', () => {
  it('appends a tick to localStorage', () => {
    appendTick(sampleTick)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_TICK_LOG)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].bullScore).toBe(7)
  })

  it('appends multiple ticks', () => {
    appendTick(sampleTick)
    appendTick({ ...sampleTick, ts: 1700000001000 })
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_TICK_LOG)!)
    expect(stored).toHaveLength(2)
  })

  it('enforces MAX_TICKS limit', () => {
    const manyTicks = MAX_TICKS + 50
    for (let i = 0; i < manyTicks; i++) {
      appendTick({ ...sampleTick, ts: 1700000000000 + i })
    }
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_TICK_LOG)!)
    expect(stored.length).toBeLessThanOrEqual(MAX_TICKS)
  })

  it('keeps the latest MAX_TICKS ticks', () => {
    for (let i = 0; i < MAX_TICKS + 10; i++) {
      appendTick({ ...sampleTick, ts: 1700000000000 + i })
    }
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_TICK_LOG)!)
    expect(stored.length).toBe(MAX_TICKS)
    // The oldest tick should have been evicted
    const oldest = Math.min(...stored.map((t: TickRecord) => t.ts))
    expect(oldest).toBeGreaterThanOrEqual(1700000000000 + 10)
  })

  it('does not throw when localStorage is full', () => {
    const originalSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => appendTick(sampleTick)).not.toThrow()
    Storage.prototype.setItem = originalSetItem
  })
})

describe('getTickLog', () => {
  it('returns empty array when no ticks stored', () => {
    expect(getTickLog()).toEqual([])
  })

  it('returns stored ticks', () => {
    appendTick(sampleTick)
    appendTick({ ...sampleTick, ts: 1700000001000 })
    const ticks = getTickLog()
    expect(ticks).toHaveLength(2)
  })

  it('returns ticks in insertion order', () => {
    appendTick(sampleTick)
    appendTick({ ...sampleTick, ts: 1700000001000 })
    const ticks = getTickLog()
    expect(ticks[0].ts).toBe(1700000000000)
    expect(ticks[1].ts).toBe(1700000001000)
  })
})

describe('clearTickLog', () => {
  it('removes tick log from localStorage', () => {
    appendTick(sampleTick)
    expect(localStorage.getItem(STORAGE_KEY_TICK_LOG)).not.toBeNull()
    clearTickLog()
    expect(localStorage.getItem(STORAGE_KEY_TICK_LOG)).toBeNull()
  })

  it('does not throw when no ticks exist', () => {
    expect(() => clearTickLog()).not.toThrow()
  })

  it('getTickLog returns empty after clear', () => {
    appendTick(sampleTick)
    clearTickLog()
    expect(getTickLog()).toEqual([])
  })
})
