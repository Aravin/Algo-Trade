import { describe, it, expect } from 'vitest'
import {
  calculateCapitalSizing,
  generateDailyReport,
  getWoWComparison,
  calculateOptionFees,
} from '../dailyBacktestEngine'

describe('dailyBacktestEngine', () => {
  describe('calculateCapitalSizing', () => {
    it('calculates sizing correctly for ₹15,000 capital', () => {
      const sizing = calculateCapitalSizing(15000, 'NIFTY', 25, 110)
      expect(sizing.accountValue).toBe(15000)
      expect(sizing.costPerLot).toBe(2750) // 110 * 25
      expect(sizing.maxLotsAllowedPerTrade).toBe(2) // Math.floor((15000 * 0.5) / 2750) = 2
      expect(sizing.maxSimultaneousTrades).toBe(2)
      expect(sizing.maxCapitalDeployed).toBe(11000)
      expect(sizing.cashBuffer).toBe(4000)
      expect(sizing.utilizationPct).toBe(73)
    })

    it('scales sizing proportionally for higher account capital (₹30,000)', () => {
      const sizing = calculateCapitalSizing(30000, 'NIFTY', 25, 110)
      expect(sizing.maxLotsAllowedPerTrade).toBe(5)
      expect(sizing.costPerLot).toBe(2750)
      expect(sizing.maxCapitalDeployed).toBe(27500)
    })
  })

  describe('calculateOptionFees', () => {
    it('computes realistic statutory fees for trade value', () => {
      const buyFee = calculateOptionFees(5500, false)
      expect(buyFee).toBeGreaterThan(20)

      const sellFee = calculateOptionFees(6400, true)
      expect(sellFee).toBeGreaterThan(buyFee) // Sell incurs STT 0.125%
    })
  })

  describe('generateDailyReport', () => {
    it('generates a valid daily report with complete metrics', () => {
      const report = generateDailyReport('2026-07-20', 15000)
      expect(report.dateStr).toBe('2026-07-20')
      expect(report.totalCandles).toBeGreaterThan(0)
      expect(report.sizing.accountValue).toBe(15000)
      expect(report.totalTrades).toBeGreaterThanOrEqual(1)
      expect(report.winRatePct).toBeGreaterThanOrEqual(0)
      expect(typeof report.netPnl).toBe('number')
      expect(typeof report.roiPct).toBe('number')
      expect(report.trades.length).toBe(report.totalTrades)
    })
  })

  describe('getWoWComparison', () => {
    it('computes Week-over-Week comparison against 7 days prior', () => {
      const wow = getWoWComparison('2026-07-20', 15000)
      expect(wow.selectedReport.dateStr).toBe('2026-07-20')
      expect(wow.wowReport.dateStr).toBe('2026-07-13')
      expect(typeof wow.pnlDelta).toBe('number')
      expect(typeof wow.roiDeltaPct).toBe('number')
      expect(typeof wow.winRateDeltaPct).toBe('number')
    })

    it('ensures data for identical weekdays varies due to deterministic PRNG seeding', () => {
      // 2026-07-20 and 2026-07-13 are both Mondays.
      // Prior to the fix, they returned identical results.
      const wow = getWoWComparison('2026-07-20', 15000)

      const { selectedReport, wowReport } = wow

      // Because we seed PRNG with the date string, they should generate different synthetic data
      const isSameOpenPrice = selectedReport.openPrice === wowReport.openPrice
      const isSameHighPrice = selectedReport.highPrice === wowReport.highPrice

      // We expect the random variation to make these different
      expect(isSameOpenPrice && isSameHighPrice).toBe(false)
    })
  })
})
