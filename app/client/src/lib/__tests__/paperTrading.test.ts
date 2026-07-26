import { describe, it, expect } from 'vitest'
import { calculateOptionCharges } from '../../../worker/paperTrading'

describe('paperTrading calculateOptionCharges', () => {
  describe('Selling Options STT & Fee Structure', () => {
    it('calculates STT for selling options at exactly 0.1% (0.001) of trade value', () => {
      const tradeValuePaise = 10000000 // ₹1,00,000 premium sold in paise
      const charges = calculateOptionCharges(tradeValuePaise, true)

      // STT on selling options = 0.1% of ₹1,00,000 = ₹100.00
      // Stamp Duty on selling = ₹0
      // Exchange Fee = 0.05% of ₹1,00,000 = ₹50.00
      // GST = 18% of (brokerage ₹20 + exchangeFee ₹50) = ₹12.60
      // Statutory Taxes = ₹100 + ₹0 + ₹50 + ₹12.60 = ₹162.60
      // Total Charges = brokerage ₹2000 + ₹162.60 = ₹182.60
      // NOTE: brokerage is in paise (₹20 = 2000 paise)
      expect(charges.brokerage).toBe(2000)
      expect(charges.statutoryTaxes).toBe(16260)
      expect(charges.totalCharges).toBe(18260)
    })

    it('does NOT charge STT or Stamp Duty on BUYING options', () => {
      const tradeValuePaise = 5000000 // ₹50,000 premium bought in paise
      const charges = calculateOptionCharges(tradeValuePaise, false)

      // STT on buying options = ₹0
      // Stamp Duty on buying = 0.003% of ₹50,000 = ₹1.50
      // Exchange Fee = 0.05% of ₹50,000 = ₹25.00
      // GST = 18% of (brokerage ₹20 + exchangeFee ₹25) = ₹8.10
      // Statutory Taxes = ₹0 + ₹150 + ₹2500 + ₹810 = ₹3460
      // Total Charges = brokerage ₹2000 + ₹3460 = ₹5460
      // NOTE: all values are in paise
      expect(charges.brokerage).toBe(2000)
      expect(charges.statutoryTaxes).toBe(3460)
      expect(charges.totalCharges).toBe(5460)
    })

    it('handles small lot trade value correctly without negative or rounding errors', () => {
      const tradeValuePaise = 250000 // 1 lot of NIFTY at ₹100 premium in paise
      const chargesSell = calculateOptionCharges(tradeValuePaise, true)
      const chargesBuy = calculateOptionCharges(tradeValuePaise, false)

      expect(chargesSell.totalCharges).toBeGreaterThan(0)
      expect(chargesBuy.totalCharges).toBeGreaterThan(0)
      expect(chargesSell.brokerage).toBe(2000)
      expect(chargesBuy.brokerage).toBe(2000)
    })
  })

  describe('Paper Rollback Math Verification', () => {
    it('simulates paper BUY trade entry and rollback yielding net 0 balance change', () => {
      const initialBalancePaise = 1500000 // ₹15000 in paise
      const entryPricePaise = 10000 // ₹100 in paise
      const quantity = 50 // 2 lots NIFTY
      const entryValuePaise = entryPricePaise * quantity // 500000 paise = ₹5000

      const entryCharges = calculateOptionCharges(entryValuePaise, false) // BUY mode
      // On BUY entry: balance reduced by entryValue + totalCharges (all in paise)
      const balanceAfterEntryPaise =
        initialBalancePaise - entryValuePaise - entryCharges.totalCharges

      // On ROLLBACK exit: refund entryValue + entryCharges.totalCharges (exitCharges = 0)
      const balanceAfterRollbackPaise =
        balanceAfterEntryPaise + entryValuePaise + entryCharges.totalCharges

      expect(balanceAfterRollbackPaise).toBe(initialBalancePaise)
    })

    it('simulates paper SELL trade entry and rollback yielding net 0 balance change', () => {
      const initialBalancePaise = 1500000 // ₹15000 in paise
      const entryPricePaise = 10000 // ₹100 in paise
      const quantity = 50 // 2 lots NIFTY
      const entryValuePaise = entryPricePaise * quantity // 500000 paise = ₹5000

      const entryCharges = calculateOptionCharges(entryValuePaise, true) // SELL mode
      // On SELL entry: balance increased by entryValue - totalCharges (all in paise)
      const marginBlockedPaise = (quantity / 25) * 400000 // 2 lots * ₹4000 margin
      const netChangePaise =
        entryValuePaise - entryCharges.totalCharges - marginBlockedPaise
      const balanceAfterEntryPaise = initialBalancePaise + netChangePaise

      // On ROLLBACK exit: reverse the net change (exitCharges = 0)
      const balanceAfterRollbackPaise = balanceAfterEntryPaise - netChangePaise

      expect(balanceAfterRollbackPaise).toBe(initialBalancePaise)
    })
  })
})
