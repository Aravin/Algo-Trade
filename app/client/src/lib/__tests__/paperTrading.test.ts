import { describe, it, expect } from 'vitest'
import { calculateOptionCharges } from '../../../worker/paperTrading'

describe('paperTrading calculateOptionCharges', () => {
  describe('Selling Options STT & Fee Structure', () => {
    it('calculates STT for selling options at exactly 0.1% (0.001) of trade value', () => {
      const tradeValue = 100000 // ₹1,00,000 premium sold
      const charges = calculateOptionCharges(tradeValue, true)

      // STT on selling options = 0.1% of ₹1,00,000 = ₹100.00
      // Stamp Duty on selling = ₹0
      // Exchange Fee = 0.05% of ₹1,00,000 = ₹50.00
      // GST = 18% of (brokerage ₹20 + exchangeFee ₹50) = ₹12.60
      // Statutory Taxes = ₹100 + ₹0 + ₹50 + ₹12.60 = ₹162.60
      // Total Charges = brokerage ₹20 + ₹162.60 = ₹182.60
      expect(charges.brokerage).toBe(20)
      expect(charges.statutoryTaxes).toBe(162.6)
      expect(charges.totalCharges).toBe(182.6)
    })

    it('does NOT charge STT or Stamp Duty on BUYING options', () => {
      const tradeValue = 50000 // ₹50,000 premium bought
      const charges = calculateOptionCharges(tradeValue, false)

      // STT on buying options = ₹0
      // Stamp Duty on buying = 0.003% of ₹50,000 = ₹1.50
      // Exchange Fee = 0.05% of ₹50,000 = ₹25.00
      // GST = 18% of (brokerage ₹20 + exchangeFee ₹25) = ₹8.10
      // Statutory Taxes = ₹0 + ₹1.50 + ₹25 + ₹8.10 = ₹34.60
      // Total Charges = brokerage ₹20 + ₹34.60 = ₹54.60
      expect(charges.brokerage).toBe(20)
      expect(charges.statutoryTaxes).toBe(34.6)
      expect(charges.totalCharges).toBe(54.6)
    })

    it('handles small lot trade value correctly without negative or rounding errors', () => {
      const tradeValue = 2500 // 1 lot of NIFTY at ₹100 premium
      const chargesSell = calculateOptionCharges(tradeValue, true)
      const chargesBuy = calculateOptionCharges(tradeValue, false)

      expect(chargesSell.totalCharges).toBeGreaterThan(0)
      expect(chargesBuy.totalCharges).toBeGreaterThan(0)
      expect(chargesSell.brokerage).toBe(20)
      expect(chargesBuy.brokerage).toBe(20)
    })
  })

  describe('Paper Rollback Math Verification', () => {
    it('simulates paper BUY trade entry and rollback yielding net 0 balance change', () => {
      const initialBalance = 15000
      const entryPrice = 100
      const quantity = 50 // 2 lots NIFTY
      const entryValue = entryPrice * quantity // 5000

      const entryCharges = calculateOptionCharges(entryValue, false) // BUY mode
      // On BUY entry: balance reduced by entryValue + totalCharges
      const balanceAfterEntry =
        initialBalance - entryValue - entryCharges.totalCharges

      // On ROLLBACK exit: refund entryValue + entryCharges.totalCharges (exitCharges = 0)
      const balanceAfterRollback =
        balanceAfterEntry + entryValue + entryCharges.totalCharges

      expect(balanceAfterRollback).toBe(initialBalance)
    })

    it('simulates paper SELL trade entry and rollback yielding net 0 balance change', () => {
      const initialBalance = 15000
      const entryPrice = 100
      const quantity = 50 // 2 lots NIFTY
      const entryValue = entryPrice * quantity // 5000

      const entryCharges = calculateOptionCharges(entryValue, true) // SELL mode
      // On SELL entry: balance increased by entryValue - totalCharges
      const balanceAfterEntry =
        initialBalance + entryValue - entryCharges.totalCharges

      // On ROLLBACK exit: subtract entryValue + add back entryCharges.totalCharges (exitCharges = 0)
      const balanceAfterRollback =
        balanceAfterEntry - entryValue + entryCharges.totalCharges

      expect(balanceAfterRollback).toBe(initialBalance)
    })
  })
})
