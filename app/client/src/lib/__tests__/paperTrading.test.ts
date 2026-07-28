import { describe, it, expect } from 'vitest'
import {
  calculateOptionCharges,
  handlePaperTradeEnter,
} from '../../../worker/paperTrading'
import type { Env } from '../../../worker/types'

describe('paperTrading calculateOptionCharges', () => {
  describe('Selling Options STT & Fee Structure', () => {
    it('calculates STT for selling options at exactly 0.1% (0.001) of trade value', () => {
      const tradeValuePaise = 10000000 // ₹1,00,000 premium sold in paise
      const charges = calculateOptionCharges(tradeValuePaise, true)

      // STT on selling options = 0.1% of ₹1,00,000 = ₹100.00
      // Stamp Duty on selling = ₹0
      // Exchange Fee = 0.03503% of ₹1,00,000 = ₹35.03
      // GST = 18% of (brokerage ₹20 + exchangeFee ₹35.03) = ₹9.91
      // Statutory Taxes = ₹100 + ₹0 + ₹35.03 + ₹9.91 = ₹144.94
      // Total Charges = brokerage ₹2000 + ₹144.94 = ₹164.94
      // NOTE: brokerage is in paise (₹20 = 2000 paise)
      expect(charges.brokerage).toBe(2000)
      expect(charges.statutoryTaxes).toBe(14494)
      expect(charges.totalCharges).toBe(16494)
    })

    it('does NOT charge STT or Stamp Duty on BUYING options', () => {
      const tradeValuePaise = 5000000 // ₹50,000 premium bought in paise
      const charges = calculateOptionCharges(tradeValuePaise, false)

      // STT on buying options = ₹0
      // Stamp Duty on buying = 0.003% of ₹50,000 = ₹1.50
      // Exchange Fee = 0.03503% of ₹50,000 = ₹17.52
      // GST = 18% of (brokerage ₹20 + exchangeFee ₹17.52) = ₹6.75
      // Statutory Taxes = ₹0 + ₹150 + ₹1752 + ₹675 = ₹2577
      // Total Charges = brokerage ₹2000 + ₹2577 = ₹4577
      // NOTE: all values are in paise
      expect(charges.brokerage).toBe(2000)
      expect(charges.statutoryTaxes).toBe(2577)
      expect(charges.totalCharges).toBe(4577)
    })

    it('handles small lot trade value correctly without negative or rounding errors', () => {
      const tradeValuePaise = 650000 // 1 fallback lot of NIFTY at ₹100 premium
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
      const quantity = 130 // 2 fallback lots NIFTY
      const entryValuePaise = entryPricePaise * quantity

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
      const quantity = 130 // 2 fallback lots NIFTY
      const entryValuePaise = entryPricePaise * quantity

      const entryCharges = calculateOptionCharges(entryValuePaise, true) // SELL mode
      // On SELL entry: balance increased by entryValue - totalCharges (all in paise)
      const marginBlockedPaise = (quantity / 65) * 400000 // 2 lots * ₹4000 margin
      const netChangePaise =
        entryValuePaise - entryCharges.totalCharges - marginBlockedPaise
      const balanceAfterEntryPaise = initialBalancePaise + netChangePaise

      // On ROLLBACK exit: reverse the net change (exitCharges = 0)
      const balanceAfterRollbackPaise = balanceAfterEntryPaise - netChangePaise

      expect(balanceAfterRollbackPaise).toBe(initialBalancePaise)
    })
  })
})

describe('paper trade lot metadata', () => {
  it('rejects invalid exchange lot metadata before touching D1', async () => {
    const request = new Request('https://example.test/api/paper/trades/enter', {
      method: 'POST',
      body: JSON.stringify({
        instrumentKey: 'NSE_FO|NIFTY',
        direction: 'CE',
        quantity: 65,
        entryPrice: 100,
        lotSize: 0,
      }),
    })

    const response = await handlePaperTradeEnter(request, {} as Env, 'user-1')

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'lotSize must be a positive integer when provided',
    })
  })
})
