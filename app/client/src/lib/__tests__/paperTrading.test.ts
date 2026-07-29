// @vitest-environment node

import { describe, it, expect } from 'vitest'
import { Miniflare } from 'miniflare'
import {
  calculateOptionCharges,
  calculatePaperExitSettlement,
  handlePaperHistory,
  handlePaperTradeEnter,
  handlePaperTradeExit,
  MAX_PAPER_ENTRY_FEE_RATIO,
} from '../../../worker/paperTrading'
import type { Env } from '../../../worker/types'
import { paperTradeToActivePosition } from '../paperTrading'
import type { PaperAccountSummary, PaperTrade } from '../types'

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

      const rollback = calculatePaperExitSettlement({
        entryValuePaise,
        exitPricePaise: entryPricePaise,
        quantity,
        isSelling: false,
        entryChargesPaise: entryCharges.totalCharges,
        marginBlockedPaise: 0,
        isRollback: true,
      })
      const balanceAfterRollbackPaise =
        balanceAfterEntryPaise + rollback.netChangePaise

      expect(balanceAfterRollbackPaise).toBe(initialBalancePaise)
      expect(rollback.realizedPnlPaise).toBe(0)
      expect(rollback.totalTradeFeesPaise).toBe(0)
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

      const rollback = calculatePaperExitSettlement({
        entryValuePaise,
        exitPricePaise: entryPricePaise,
        quantity,
        isSelling: true,
        entryChargesPaise: entryCharges.totalCharges,
        marginBlockedPaise,
        isRollback: true,
      })
      const balanceAfterRollbackPaise =
        balanceAfterEntryPaise + rollback.netChangePaise

      expect(balanceAfterRollbackPaise).toBe(initialBalancePaise)
      expect(rollback.realizedPnlPaise).toBe(0)
      expect(rollback.totalTradeFeesPaise).toBe(0)
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

  it('rejects entries whose fixed charges dominate the premium', async () => {
    const request = new Request('https://example.test/api/paper/trades/enter', {
      method: 'POST',
      body: JSON.stringify({
        instrumentKey: 'NSE_FO|NIFTY-CHEAP-CE',
        direction: 'CE',
        quantity: 65,
        entryPrice: 0.7,
        lotSize: 65,
      }),
    })

    const response = await handlePaperTradeEnter(request, {} as Env, 'user-1')
    const body: {
      code: string
      feeRatio: number
      maxFeeRatio: number
    } = await response.json()

    expect(response.status).toBe(422)
    expect(body.code).toBe('ENTRY_FEES_TOO_HIGH')
    expect(body.feeRatio).toBeGreaterThan(MAX_PAPER_ENTRY_FEE_RATIO)
    expect(body.maxFeeRatio).toBe(MAX_PAPER_ENTRY_FEE_RATIO)
  })
})

describe('paper position reconciliation', () => {
  const openTrade: PaperTrade = {
    id: 'paper-trade-1',
    account_id: 'user-1',
    status: 'OPEN',
    instrument_key: 'NSE_FO|NIFTY-CE',
    direction: 'CE',
    quantity: 65,
    entry_price: 71.85,
    entry_value: 4670.25,
    exit_price: null,
    exit_value: null,
    realized_pnl: null,
    opened_at: '2026-07-29T04:10:00.000Z',
    closed_at: null,
    metadata_json: JSON.stringify({
      underlyingSymbol: 'NIFTY 50',
      expiry: '2026-08-04',
      lotSize: 65,
      tradeType: 'buying',
    }),
  }

  it('rebuilds a current open D1 trade for supervision', () => {
    const restored = paperTradeToActivePosition(openTrade, '2026-07-29')

    expect(restored?.symbol).toBe('NIFTY 50')
    expect(restored?.position).toMatchObject({
      instrumentKey: 'NSE_FO|NIFTY-CE',
      paperTradeId: 'paper-trade-1',
      entryPrice: 71.85,
      quantity: 65,
      executionMode: 'paper',
    })
    expect(restored?.position.legs?.[0]?.paperTradeId).toBe('paper-trade-1')
  })

  it('does not restore an expired orphan trade', () => {
    const expiredTrade = {
      ...openTrade,
      metadata_json: JSON.stringify({
        underlyingSymbol: 'NIFTY 50',
        expiry: '2026-07-28',
      }),
    }

    expect(paperTradeToActivePosition(expiredTrade, '2026-07-29')).toBeNull()
  })
})

describe('paper history reconciliation contract', () => {
  it('returns every open trade even when it falls outside recent history', async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      compatibilityDate: '2026-06-16',
      d1Databases: { PAPER_TRADING_DB: 'paper-history-test' },
    })

    try {
      const database = await miniflare.getD1Database('PAPER_TRADING_DB')
      await database.batch([
        database.prepare(
          `CREATE TABLE paper_accounts (
            id TEXT PRIMARY KEY, mode TEXT NOT NULL, balance INTEGER NOT NULL,
            currency TEXT NOT NULL, updated_at TEXT NOT NULL
          )`,
        ),
        database.prepare(
          `CREATE TABLE paper_statement_entries (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, entry_type TEXT NOT NULL,
            amount INTEGER NOT NULL, balance_before INTEGER NOT NULL,
            balance_after INTEGER NOT NULL, note TEXT, metadata_json TEXT,
            created_at TEXT NOT NULL
          )`,
        ),
        database.prepare(
          `CREATE TABLE paper_trades (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, status TEXT NOT NULL,
            instrument_key TEXT NOT NULL, direction TEXT NOT NULL,
            quantity INTEGER NOT NULL, entry_price INTEGER NOT NULL,
            entry_value INTEGER NOT NULL, exit_price INTEGER, exit_value INTEGER,
            realized_pnl INTEGER, opened_at TEXT NOT NULL, closed_at TEXT,
            metadata_json TEXT
          )`,
        ),
        database
          .prepare(
            'INSERT INTO paper_accounts (id, mode, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(
            'user-1',
            'paper',
            15_000_00,
            'INR',
            '2026-07-29T06:00:00.000Z',
          ),
      ])

      const closedTrades = Array.from({ length: 51 }, (_, index) =>
        database
          .prepare(
            `INSERT INTO paper_trades (
              id, account_id, status, instrument_key, direction, quantity,
              entry_price, entry_value, exit_price, exit_value, realized_pnl,
              opened_at, closed_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            `closed-${index}`,
            'user-1',
            'CLOSED',
            `NSE_FO|CLOSED-${index}`,
            'CE',
            65,
            10_000,
            650_000,
            11_000,
            715_000,
            65_000,
            `2026-07-29T05:${String(index).padStart(2, '0')}:00.000Z`,
            `2026-07-29T05:${String(index).padStart(2, '0')}:30.000Z`,
            '{}',
          ),
      )
      await database.batch([
        database
          .prepare(
            `INSERT INTO paper_trades (
              id, account_id, status, instrument_key, direction, quantity,
              entry_price, entry_value, opened_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            'older-open-trade',
            'user-1',
            'OPEN',
            'NSE_FO|OPEN-CE',
            'CE',
            65,
            10_000,
            650_000,
            '2026-07-29T04:00:00.000Z',
            JSON.stringify({
              underlyingSymbol: 'NIFTY 50',
              expiry: '2026-08-04',
            }),
          ),
        ...closedTrades,
      ])
      const env = { PAPER_TRADING_DB: database } as unknown as Env

      const response = await handlePaperHistory(env, 'user-1')
      const rawSummary: unknown = await response.json()
      const summary = rawSummary as PaperAccountSummary

      expect(response.status).toBe(200)
      expect(summary.trades).toHaveLength(50)
      expect(summary.trades?.some((trade) => trade.status === 'OPEN')).toBe(
        false,
      )
      expect(summary.openTrades?.map((trade) => trade.id)).toEqual([
        'older-open-trade',
      ])
      expect(summary.openTradeCount).toBe(1)
    } finally {
      await miniflare.dispose()
    }
  })
})

describe('paper entry persistence', () => {
  it('debits once for a replayed client order and reconciles an existing position', async () => {
    const miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      compatibilityDate: '2026-06-16',
      d1Databases: { PAPER_TRADING_DB: 'paper-test' },
    })

    try {
      const database = await miniflare.getD1Database('PAPER_TRADING_DB')
      await database.batch([
        database.prepare(
          `CREATE TABLE paper_accounts (
            id TEXT PRIMARY KEY, mode TEXT NOT NULL, balance INTEGER NOT NULL,
            currency TEXT NOT NULL, updated_at TEXT NOT NULL
          )`,
        ),
        database.prepare(
          `CREATE TABLE paper_statement_entries (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, entry_type TEXT NOT NULL,
            amount INTEGER NOT NULL, balance_before INTEGER NOT NULL,
            balance_after INTEGER NOT NULL, note TEXT, metadata_json TEXT,
            created_at TEXT NOT NULL
          )`,
        ),
        database.prepare(
          `CREATE TABLE paper_trades (
            id TEXT PRIMARY KEY, account_id TEXT NOT NULL, status TEXT NOT NULL,
            instrument_key TEXT NOT NULL, direction TEXT NOT NULL,
            quantity INTEGER NOT NULL, entry_price INTEGER NOT NULL,
            entry_value INTEGER NOT NULL, exit_price INTEGER, exit_value INTEGER,
            realized_pnl INTEGER, opened_at TEXT NOT NULL, closed_at TEXT,
            metadata_json TEXT
          )`,
        ),
      ])
      const env = { PAPER_TRADING_DB: database } as unknown as Env
      const request = (clientOrderId: string) =>
        new Request('https://example.test/api/paper/trades/enter', {
          method: 'POST',
          body: JSON.stringify({
            instrumentKey: 'NSE_FO|NIFTY-CE',
            direction: 'CE',
            quantity: 65,
            entryPrice: 100,
            lotSize: 65,
            clientOrderId,
            maxTradesPerDay: 3,
            metadata: {
              underlyingSymbol: 'NIFTY 50',
              tradingSymbol: 'NIFTY26AUG24100CE',
              expiry: '2026-08-04',
              tradeType: 'buying',
            },
          }),
        })

      const firstResponse = await handlePaperTradeEnter(
        request('client-order-1'),
        env,
        'user-1',
      )
      const replayResponse = await handlePaperTradeEnter(
        request('client-order-1'),
        env,
        'user-1',
      )
      const existingPositionResponse = await handlePaperTradeEnter(
        request('client-order-2'),
        env,
        'user-1',
      )
      const firstBody: { trade: { id: string } } = await firstResponse.json()
      const replayBody: {
        reconciled: boolean
        reconciliationReason: string
      } = await replayResponse.json()
      const existingPositionBody: {
        reconciled: boolean
        reconciliationReason: string
      } = await existingPositionResponse.json()
      const persisted = await database
        .prepare(
          `SELECT
             (SELECT COUNT(*) FROM paper_trades) AS trade_count,
             (SELECT COUNT(*) FROM paper_statement_entries WHERE entry_type = 'paper_entry') AS entry_count,
             (SELECT balance FROM paper_accounts WHERE id = 'user-1') AS balance`,
        )
        .first<{
          trade_count: number
          entry_count: number
          balance: number
        }>()
      const entryValuePaise = 100_00 * 65
      const entryCharges = calculateOptionCharges(entryValuePaise, false)

      expect(firstResponse.status).toBe(200)
      expect(replayResponse.status).toBe(200)
      expect(existingPositionResponse.status).toBe(200)
      expect(replayBody).toMatchObject({
        reconciled: true,
        reconciliationReason: 'CLIENT_ORDER_REPLAY',
      })
      expect(existingPositionBody).toMatchObject({
        reconciled: true,
        reconciliationReason: 'OPEN_POSITION_EXISTS',
      })
      expect(persisted).toEqual({
        trade_count: 1,
        entry_count: 1,
        balance: 15000_00 - entryValuePaise - entryCharges.totalCharges,
      })

      const rollbackResponse = await handlePaperTradeExit(
        new Request('https://example.test/api/paper/trades/exit', {
          method: 'POST',
          body: JSON.stringify({
            tradeId: firstBody.trade.id,
            exitPrice: 90,
            isRollback: true,
            metadata: { isRollback: true, reason: 'integration test rollback' },
          }),
        }),
        env,
        'user-1',
      )
      const rolledBack = await database
        .prepare(
          `SELECT
             (SELECT status FROM paper_trades WHERE id = ?) AS status,
             (SELECT realized_pnl FROM paper_trades WHERE id = ?) AS realized_pnl,
             (SELECT balance FROM paper_accounts WHERE id = 'user-1') AS balance`,
        )
        .bind(firstBody.trade.id, firstBody.trade.id)
        .first<{
          status: string
          realized_pnl: number
          balance: number
        }>()

      expect(rollbackResponse.status).toBe(200)
      expect(rolledBack).toEqual({
        status: 'CANCELLED',
        realized_pnl: 0,
        balance: 15000_00,
      })
    } finally {
      await miniflare.dispose()
    }
  })
})
