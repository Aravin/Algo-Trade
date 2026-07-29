import type {
  Env,
  PaperAccountRow,
  PaperStatementRow,
  PaperTradeRow,
} from './types'
import { nowIso, makeId, getLotSizeForSymbol } from './utils'

const PAPER_STARTING_CREDIT = 15000_00
const PAPER_BROKERAGE_PAISE = 20_00
export const MAX_PAPER_ENTRY_FEE_RATIO = 0.05

function toPaise(value: number): number {
  return Math.round(value * 100)
}

function toRupees(paise: number): number {
  return Math.round(paise) / 100
}

export function calculateOptionCharges(
  tradeValuePaise: number,
  isSelling: boolean,
): { totalCharges: number; brokerage: number; statutoryTaxes: number } {
  const brokerage = PAPER_BROKERAGE_PAISE
  const stt = isSelling ? Math.round(tradeValuePaise * 0.001) : 0
  const stampDuty = !isSelling ? Math.round(tradeValuePaise * 0.00003) : 0
  const exchangeFee = Math.round(tradeValuePaise * 0.0003503)
  const gst = Math.round((brokerage + exchangeFee) * 0.18)
  const statutoryTaxes = stt + stampDuty + exchangeFee + gst
  const totalCharges = brokerage + statutoryTaxes
  return { totalCharges, brokerage, statutoryTaxes }
}

export function calculatePaperExitSettlement(input: {
  entryValuePaise: number
  exitPricePaise: number
  quantity: number
  isSelling: boolean
  entryChargesPaise: number
  marginBlockedPaise: number
  isRollback: boolean
}): {
  exitValuePaise: number
  exitCharges: {
    totalCharges: number
    brokerage: number
    statutoryTaxes: number
  }
  totalTradeFeesPaise: number
  grossPnlPaise: number
  realizedPnlPaise: number
  netChangePaise: number
} {
  const exitValuePaise = Math.round(input.exitPricePaise * input.quantity)
  if (input.isRollback) {
    return {
      exitValuePaise,
      exitCharges: { totalCharges: 0, brokerage: 0, statutoryTaxes: 0 },
      totalTradeFeesPaise: 0,
      grossPnlPaise: 0,
      realizedPnlPaise: 0,
      netChangePaise: input.isSelling
        ? -input.entryValuePaise +
          input.entryChargesPaise +
          input.marginBlockedPaise
        : input.entryValuePaise + input.entryChargesPaise,
    }
  }

  const exitCharges = calculateOptionCharges(exitValuePaise, !input.isSelling)
  const totalTradeFeesPaise = input.entryChargesPaise + exitCharges.totalCharges
  const grossPnlPaise = input.isSelling
    ? input.entryValuePaise - exitValuePaise
    : exitValuePaise - input.entryValuePaise

  return {
    exitValuePaise,
    exitCharges,
    totalTradeFeesPaise,
    grossPnlPaise,
    realizedPnlPaise: grossPnlPaise - totalTradeFeesPaise,
    netChangePaise: input.isSelling
      ? -exitValuePaise - exitCharges.totalCharges + input.marginBlockedPaise
      : exitValuePaise - exitCharges.totalCharges,
  }
}

function indiaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = (type: 'year' | 'month' | 'day') =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function paperTradeMetadata(row: PaperTradeRow): Record<string, unknown> {
  if (!row.metadata_json) return {}
  try {
    return JSON.parse(row.metadata_json) as Record<string, unknown>
  } catch {
    return {}
  }
}

function toResponseAccount(row: PaperAccountRow): PaperAccountRow {
  return { ...row, balance: toRupees(row.balance) }
}

function toResponseTrade(row: PaperTradeRow): PaperTradeRow {
  return {
    ...row,
    entry_price: toRupees(row.entry_price),
    entry_value: toRupees(row.entry_value),
    exit_price: row.exit_price != null ? toRupees(row.exit_price) : null,
    exit_value: row.exit_value != null ? toRupees(row.exit_value) : null,
    realized_pnl: row.realized_pnl != null ? toRupees(row.realized_pnl) : null,
  }
}

function toResponseStatement(row: PaperStatementRow): PaperStatementRow {
  return {
    ...row,
    amount: toRupees(row.amount),
    balance_before: toRupees(row.balance_before),
    balance_after: toRupees(row.balance_after),
  }
}

export async function ensurePaperAccount(
  env: Env,
  userId: string,
): Promise<PaperAccountRow> {
  const createdAt = nowIso()

  const accountResult = await env.PAPER_TRADING_DB.prepare(
    'INSERT OR IGNORE INTO paper_accounts (id, mode, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(userId, 'paper', PAPER_STARTING_CREDIT, 'INR', createdAt)
    .run()

  if (accountResult.meta.changes === 1) {
    await env.PAPER_TRADING_DB.prepare(
      'INSERT OR IGNORE INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        makeId('stmt'),
        userId,
        'seed',
        PAPER_STARTING_CREDIT,
        0,
        PAPER_STARTING_CREDIT,
        'Initial paper trading credit',
        JSON.stringify({ source: 'system-seed' }),
        createdAt,
      )
      .run()
  }

  const row = await env.PAPER_TRADING_DB.prepare(
    'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
  )
    .bind(userId)
    .first<PaperAccountRow>()

  if (!row) throw new Error('Failed to initialise paper account')
  return row
}

async function fetchAccountSummary(
  env: Env,
  account: PaperAccountRow,
): Promise<{
  account: PaperAccountRow
  recentEntries: PaperStatementRow[]
  openTradeCount: number
}> {
  const recentEntries = await env.PAPER_TRADING_DB.prepare(
    'SELECT id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at FROM paper_statement_entries WHERE account_id = ? ORDER BY created_at DESC LIMIT 20',
  )
    .bind(account.id)
    .all<PaperStatementRow>()
  const openTradeCountRow = await env.PAPER_TRADING_DB.prepare(
    'SELECT COUNT(*) as count FROM paper_trades WHERE account_id = ? AND status = ?',
  )
    .bind(account.id, 'OPEN')
    .first<{ count: number }>()

  return {
    account,
    recentEntries: recentEntries.results ?? [],
    openTradeCount: Number(openTradeCountRow?.count ?? 0),
  }
}

export async function getPaperAccountSummary(
  env: Env,
  userId: string,
): Promise<{
  account: PaperAccountRow
  recentEntries: PaperStatementRow[]
  openTradeCount: number
}> {
  const account = await ensurePaperAccount(env, userId)
  return fetchAccountSummary(env, account)
}

export async function listPaperTrades(
  env: Env,
  userId: string,
  limit = 50,
): Promise<PaperTradeRow[]> {
  const trades = await env.PAPER_TRADING_DB.prepare(
    'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE account_id = ? ORDER BY opened_at DESC LIMIT ?',
  )
    .bind(userId, limit)
    .all<PaperTradeRow>()
  return trades.results ?? []
}

const PAPER_TRADE_SELECT =
  'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades'

export async function listOpenPaperTrades(
  env: Env,
  userId: string,
): Promise<PaperTradeRow[]> {
  const trades = await env.PAPER_TRADING_DB.prepare(
    `${PAPER_TRADE_SELECT}
     WHERE account_id = ? AND status = 'OPEN'
     ORDER BY opened_at DESC`,
  )
    .bind(userId)
    .all<PaperTradeRow>()
  return trades.results ?? []
}

async function findPaperTradeByClientOrderId(
  env: Env,
  accountId: string,
  clientOrderId: string,
): Promise<PaperTradeRow | null> {
  return env.PAPER_TRADING_DB.prepare(
    `${PAPER_TRADE_SELECT}
     WHERE account_id = ? AND json_extract(metadata_json, '$.clientOrderId') = ?
     ORDER BY opened_at DESC LIMIT 1`,
  )
    .bind(accountId, clientOrderId)
    .first<PaperTradeRow>()
}

async function findOpenPaperTradeForUnderlying(
  env: Env,
  accountId: string,
  underlyingSymbol: string,
  currentIndiaDate: string,
): Promise<PaperTradeRow | null> {
  return env.PAPER_TRADING_DB.prepare(
    `${PAPER_TRADE_SELECT}
     WHERE account_id = ? AND status = 'OPEN'
       AND json_extract(metadata_json, '$.underlyingSymbol') = ?
       AND COALESCE(json_extract(metadata_json, '$.expiry'), ?) >= ?
     ORDER BY opened_at DESC LIMIT 1`,
  )
    .bind(accountId, underlyingSymbol, currentIndiaDate, currentIndiaDate)
    .first<PaperTradeRow>()
}

async function paperTradeResponse(
  env: Env,
  account: PaperAccountRow,
  trade: PaperTradeRow,
  reconciliationReason?: 'CLIENT_ORDER_REPLAY' | 'OPEN_POSITION_EXISTS',
): Promise<Response> {
  const freshAccount = await env.PAPER_TRADING_DB.prepare(
    'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
  )
    .bind(account.id)
    .first<PaperAccountRow>()
  if (!freshAccount) throw new Error('Account vanished')

  const summary = await fetchAccountSummary(env, freshAccount)
  return Response.json({
    trade: toResponseTrade(trade),
    reconciled: reconciliationReason !== undefined,
    reconciliationReason,
    ...summary,
    account: toResponseAccount(freshAccount),
    recentEntries: summary.recentEntries.map(toResponseStatement),
  })
}

export async function handlePaperAccount(
  env: Env,
  userId: string,
): Promise<Response> {
  try {
    const summary = await getPaperAccountSummary(env, userId)
    return Response.json({
      ...summary,
      account: toResponseAccount(summary.account),
      recentEntries: summary.recentEntries.map(toResponseStatement),
    })
  } catch (error) {
    console.error('Failed to load paper account:', error)
    return Response.json(
      { error: 'Failed to load paper account', details: String(error) },
      { status: 500 },
    )
  }
}

export async function handlePaperHistory(
  env: Env,
  userId: string,
): Promise<Response> {
  try {
    const [summary, trades, openTrades] = await Promise.all([
      getPaperAccountSummary(env, userId),
      listPaperTrades(env, userId),
      listOpenPaperTrades(env, userId),
    ])
    return Response.json({
      ...summary,
      account: toResponseAccount(summary.account),
      recentEntries: summary.recentEntries.map(toResponseStatement),
      trades: trades.map(toResponseTrade),
      openTrades: openTrades.map(toResponseTrade),
    })
  } catch (error) {
    console.error('Failed to load paper history:', error)
    return Response.json(
      { error: 'Failed to load paper history', details: String(error) },
      { status: 500 },
    )
  }
}

export async function handlePaperAccountAdjust(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  let body: { amount?: number; note?: string; mode?: 'set' | 'adjust' }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const mode = body.mode ?? 'set'
  const amount = Number(body.amount)
  if (!Number.isFinite(amount)) {
    return Response.json(
      { error: 'Amount must be a valid number' },
      { status: 400 },
    )
  }
  if (mode !== 'set' && mode !== 'adjust') {
    return Response.json(
      { error: 'Mode must be set or adjust' },
      { status: 400 },
    )
  }

  try {
    const account = await ensurePaperAccount(env, userId)
    const amountPaise = toPaise(amount)
    const updatedAt = nowIso()

    if (mode === 'set') {
      if (amountPaise < 0) {
        return Response.json(
          { error: 'Paper credit cannot go below zero' },
          { status: 400 },
        )
      }
      const balanceAfterPaise = amountPaise

      const results = await env.PAPER_TRADING_DB.batch([
        env.PAPER_TRADING_DB.prepare(
          `INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at)
           SELECT ?, ?, ?, ? - balance, balance, ?, ?, ?, ?
           FROM paper_accounts WHERE id = ?`,
        ).bind(
          makeId('stmt'),
          account.id,
          'manual_set',
          balanceAfterPaise,
          balanceAfterPaise,
          body.note ?? 'Manual paper credit set',
          JSON.stringify({ source: 'admin-ui', requestedAmount: amount, mode }),
          updatedAt,
          account.id,
        ),
        env.PAPER_TRADING_DB.prepare(
          'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
        ).bind(balanceAfterPaise, updatedAt, account.id),
      ])
      if (results[0].meta.changes === 0) {
        return Response.json({ error: 'Account not found' }, { status: 404 })
      }

      const freshAccount = await env.PAPER_TRADING_DB.prepare(
        'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
      )
        .bind(account.id)
        .first<PaperAccountRow>()
      const summary = await fetchAccountSummary(env, account)
      return Response.json({
        ...summary,
        account: toResponseAccount(freshAccount ?? account),
        recentEntries: summary.recentEntries.map(toResponseStatement),
      })
    }

    if (account.balance + amountPaise < 0) {
      return Response.json(
        { error: 'Paper credit cannot go below zero' },
        { status: 400 },
      )
    }

    const results = await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at)
         SELECT ?, ?, ?, ?, balance, balance + ?, ?, ?, ?
         FROM paper_accounts WHERE id = ?`,
      ).bind(
        makeId('stmt'),
        account.id,
        'manual_adjust',
        amountPaise,
        amountPaise,
        body.note ?? 'Manual paper credit adjustment',
        JSON.stringify({ source: 'admin-ui', requestedAmount: amount, mode }),
        updatedAt,
        account.id,
      ),
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
      ).bind(amountPaise, updatedAt, account.id),
    ])
    if (results[0].meta.changes === 0) {
      return Response.json({ error: 'Account not found' }, { status: 404 })
    }

    const freshAccount = await env.PAPER_TRADING_DB.prepare(
      'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
    )
      .bind(account.id)
      .first<PaperAccountRow>()
    const summary = await fetchAccountSummary(env, account)
    return Response.json({
      ...summary,
      account: toResponseAccount(
        freshAccount ?? {
          ...account,
          balance: account.balance + amountPaise,
          updated_at: updatedAt,
        },
      ),
      recentEntries: summary.recentEntries.map(toResponseStatement),
    })
  } catch (error) {
    console.error('Failed to update paper account:', error)
    return Response.json(
      { error: 'Failed to update paper account' },
      { status: 500 },
    )
  }
}

export async function handlePaperReset(
  env: Env,
  userId: string,
): Promise<Response> {
  try {
    const account = await ensurePaperAccount(env, userId)
    const updatedAt = nowIso()

    await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        'DELETE FROM paper_statement_entries WHERE account_id = ?',
      ).bind(account.id),
      env.PAPER_TRADING_DB.prepare(
        'DELETE FROM paper_trades WHERE account_id = ?',
      ).bind(account.id),
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at)
         SELECT ?, ?, ?, ? - balance, balance, ?, ?, ?, ?
         FROM paper_accounts WHERE id = ?`,
      ).bind(
        makeId('stmt'),
        account.id,
        'reset',
        PAPER_STARTING_CREDIT,
        PAPER_STARTING_CREDIT,
        'Paper account reset to starting credit',
        JSON.stringify({ source: 'admin-ui-reset' }),
        updatedAt,
        account.id,
      ),
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
      ).bind(PAPER_STARTING_CREDIT, updatedAt, account.id),
    ])

    const [summary, trades] = await Promise.all([
      getPaperAccountSummary(env, userId),
      listPaperTrades(env, userId),
    ])
    return Response.json({
      ...summary,
      account: toResponseAccount(summary.account),
      recentEntries: summary.recentEntries.map(toResponseStatement),
      trades: trades.map(toResponseTrade),
    })
  } catch (error) {
    console.error('Failed to reset paper account:', error)
    return Response.json(
      { error: 'Failed to reset paper account' },
      { status: 500 },
    )
  }
}

export async function handlePaperTradeEnter(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  let body: {
    instrumentKey?: string
    direction?: 'CE' | 'PE'
    quantity?: number
    entryPrice?: number
    lotSize?: number
    marginPerLot?: number
    clientOrderId?: string
    maxTradesPerDay?: number
    metadata?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const quantity = Number(body.quantity)
  const entryPrice = Number(body.entryPrice)
  if (
    !body.instrumentKey ||
    (body.direction !== 'CE' && body.direction !== 'PE') ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    return Response.json(
      {
        error: 'instrumentKey, direction, quantity and entryPrice are required',
      },
      { status: 400 },
    )
  }

  const metadataObj =
    typeof body.metadata === 'object' && body.metadata !== null
      ? (body.metadata as {
          tradingSymbol?: string
          underlyingSymbol?: string
          tradeType?: 'buying' | 'selling'
          expiry?: string
        })
      : null
  const requestedClientOrderId = body.clientOrderId?.trim()
  if (
    body.clientOrderId !== undefined &&
    (!requestedClientOrderId || requestedClientOrderId.length > 128)
  ) {
    return Response.json(
      { error: 'clientOrderId must be between 1 and 128 characters' },
      { status: 400 },
    )
  }
  const requestedMaxTradesPerDay =
    body.maxTradesPerDay === undefined ? 3 : Number(body.maxTradesPerDay)
  if (
    !Number.isInteger(requestedMaxTradesPerDay) ||
    requestedMaxTradesPerDay <= 0 ||
    requestedMaxTradesPerDay > 100
  ) {
    return Response.json(
      { error: 'maxTradesPerDay must be an integer between 1 and 100' },
      { status: 400 },
    )
  }
  const lotSymbol =
    metadataObj?.tradingSymbol ??
    metadataObj?.underlyingSymbol ??
    body.instrumentKey
  const requestedLotSize =
    body.lotSize === undefined ? null : Number(body.lotSize)
  if (
    requestedLotSize !== null &&
    (!Number.isInteger(requestedLotSize) || requestedLotSize <= 0)
  ) {
    return Response.json(
      { error: 'lotSize must be a positive integer when provided' },
      { status: 400 },
    )
  }
  const lotSize = requestedLotSize ?? getLotSizeForSymbol(lotSymbol)
  if (quantity % lotSize !== 0) {
    return Response.json(
      {
        error: `Quantity (${quantity}) must be a multiple of lot size (${lotSize}) for ${lotSymbol}`,
      },
      { status: 400 },
    )
  }

  const entryPricePaise = toPaise(entryPrice)
  const entryValuePaise = Math.round(entryPricePaise * quantity)
  const tradeType = metadataObj?.tradeType ?? 'buying'
  const isSelling = tradeType === 'selling'
  const charges = calculateOptionCharges(entryValuePaise, isSelling)
  const entryFeeRatio = charges.totalCharges / entryValuePaise
  if (entryFeeRatio > MAX_PAPER_ENTRY_FEE_RATIO) {
    return Response.json(
      {
        error: `Paper entry rejected: estimated fees are ${(entryFeeRatio * 100).toFixed(2)}% of the trade value`,
        code: 'ENTRY_FEES_TOO_HIGH',
        feeRatio: entryFeeRatio,
        maxFeeRatio: MAX_PAPER_ENTRY_FEE_RATIO,
      },
      { status: 422 },
    )
  }

  const marginPerLot = body.marginPerLot ?? 100000
  if (!Number.isFinite(marginPerLot) || marginPerLot <= 0) {
    return Response.json(
      { error: 'marginPerLot must be a positive number when provided' },
      { status: 400 },
    )
  }
  const marginPerLotPaise = toPaise(marginPerLot)
  const marginBlockedPaise = isSelling
    ? (quantity / lotSize) * marginPerLotPaise
    : 0
  const netChangePaise = isSelling
    ? entryValuePaise - charges.totalCharges - marginBlockedPaise
    : -(entryValuePaise + charges.totalCharges)

  try {
    const account = await ensurePaperAccount(env, userId)
    const currentIndiaDate = indiaDate()
    const metadataUnderlyingSymbol = metadataObj?.underlyingSymbol?.trim()
    const underlyingSymbol =
      metadataUnderlyingSymbol && metadataUnderlyingSymbol.length > 0
        ? metadataUnderlyingSymbol
        : body.instrumentKey

    if (requestedClientOrderId) {
      const replayedTrade = await findPaperTradeByClientOrderId(
        env,
        account.id,
        requestedClientOrderId,
      )
      if (replayedTrade) {
        return paperTradeResponse(
          env,
          account,
          replayedTrade,
          'CLIENT_ORDER_REPLAY',
        )
      }
    }

    const existingOpenTrade = await findOpenPaperTradeForUnderlying(
      env,
      account.id,
      underlyingSymbol,
      currentIndiaDate,
    )
    if (existingOpenTrade) {
      return paperTradeResponse(
        env,
        account,
        existingOpenTrade,
        'OPEN_POSITION_EXISTS',
      )
    }

    const dailyTradeCountRow = await env.PAPER_TRADING_DB.prepare(
      `SELECT COUNT(*) AS count FROM paper_trades
       WHERE account_id = ?
         AND json_extract(metadata_json, '$.underlyingSymbol') = ?
         AND status != 'CANCELLED'
         AND date(opened_at, '+330 minutes') = ?`,
    )
      .bind(account.id, underlyingSymbol, currentIndiaDate)
      .first<{ count: number }>()
    if (Number(dailyTradeCountRow?.count ?? 0) >= requestedMaxTradesPerDay) {
      return Response.json(
        {
          error: `Maximum paper trades per day (${requestedMaxTradesPerDay}) reached for ${underlyingSymbol}`,
          code: 'MAX_TRADES_PER_DAY',
        },
        { status: 409 },
      )
    }

    const tradeId = makeId('paper_trade')
    const clientOrderId = requestedClientOrderId ?? tradeId
    const createdAt = nowIso()

    const tradeMetadata = {
      ...(typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata
        : {}),
      entryCharges: charges,
      marginBlocked: toRupees(marginBlockedPaise),
      lotSize,
      clientOrderId,
    }

    const results = await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_trades (id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, opened_at, metadata_json)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM paper_accounts
         WHERE id = ?
           AND (? >= 0 OR balance >= ?)
           AND NOT EXISTS (
             SELECT 1 FROM paper_trades
             WHERE account_id = ?
               AND json_extract(metadata_json, '$.clientOrderId') = ?
           )
           AND NOT EXISTS (
             SELECT 1 FROM paper_trades
             WHERE account_id = ? AND status = 'OPEN'
               AND json_extract(metadata_json, '$.underlyingSymbol') = ?
               AND COALESCE(json_extract(metadata_json, '$.expiry'), ?) >= ?
           )
           AND (
             SELECT COUNT(*) FROM paper_trades
             WHERE account_id = ?
               AND json_extract(metadata_json, '$.underlyingSymbol') = ?
               AND status != 'CANCELLED'
               AND date(opened_at, '+330 minutes') = ?
           ) < ?`,
      ).bind(
        tradeId,
        account.id,
        'OPEN',
        body.instrumentKey,
        body.direction,
        quantity,
        entryPricePaise,
        entryValuePaise,
        createdAt,
        JSON.stringify(tradeMetadata),
        account.id,
        netChangePaise,
        -netChangePaise,
        account.id,
        clientOrderId,
        account.id,
        underlyingSymbol,
        currentIndiaDate,
        currentIndiaDate,
        account.id,
        underlyingSymbol,
        currentIndiaDate,
        requestedMaxTradesPerDay,
      ),
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at)
         SELECT ?, ?, ?, ?, balance, balance + ?, ?, ?, ?
         FROM paper_accounts
         WHERE id = ?
           AND EXISTS (SELECT 1 FROM paper_trades WHERE id = ?)`,
      ).bind(
        makeId('stmt'),
        account.id,
        'paper_entry',
        netChangePaise,
        netChangePaise,
        isSelling
          ? `Paper SELL ${body.direction} (Fee: ₹${toRupees(charges.totalCharges)})`
          : `Paper BUY ${body.direction} (Fee: ₹${toRupees(charges.totalCharges)})`,
        JSON.stringify({
          tradeId,
          instrumentKey: body.instrumentKey,
          quantity,
          entryPrice: toRupees(entryPricePaise),
          entryValue: toRupees(entryValuePaise),
          charges: {
            totalCharges: toRupees(charges.totalCharges),
            brokerage: toRupees(charges.brokerage),
            statutoryTaxes: toRupees(charges.statutoryTaxes),
          },
        }),
        createdAt,
        account.id,
        tradeId,
      ),
      env.PAPER_TRADING_DB.prepare(
        `UPDATE paper_accounts SET balance = balance + ?, updated_at = ?
         WHERE id = ?
           AND EXISTS (SELECT 1 FROM paper_trades WHERE id = ?)`,
      ).bind(netChangePaise, createdAt, account.id, tradeId),
    ])

    if (results[0].meta.changes === 0) {
      const replayedTrade = await findPaperTradeByClientOrderId(
        env,
        account.id,
        clientOrderId,
      )
      if (replayedTrade) {
        return paperTradeResponse(
          env,
          account,
          replayedTrade,
          'CLIENT_ORDER_REPLAY',
        )
      }
      const concurrentOpenTrade = await findOpenPaperTradeForUnderlying(
        env,
        account.id,
        underlyingSymbol,
        currentIndiaDate,
      )
      if (concurrentOpenTrade) {
        return paperTradeResponse(
          env,
          account,
          concurrentOpenTrade,
          'OPEN_POSITION_EXISTS',
        )
      }
      const freshDailyTradeCount = await env.PAPER_TRADING_DB.prepare(
        `SELECT COUNT(*) AS count FROM paper_trades
         WHERE account_id = ?
           AND json_extract(metadata_json, '$.underlyingSymbol') = ?
           AND status != 'CANCELLED'
           AND date(opened_at, '+330 minutes') = ?`,
      )
        .bind(account.id, underlyingSymbol, currentIndiaDate)
        .first<{ count: number }>()
      if (
        Number(freshDailyTradeCount?.count ?? 0) >= requestedMaxTradesPerDay
      ) {
        return Response.json(
          {
            error: `Maximum paper trades per day (${requestedMaxTradesPerDay}) reached for ${underlyingSymbol}`,
            code: 'MAX_TRADES_PER_DAY',
          },
          { status: 409 },
        )
      }
      return Response.json(
        { error: 'Insufficient paper credit' },
        { status: 400 },
      )
    }

    const [trade, freshAccount, summary] = await Promise.all([
      env.PAPER_TRADING_DB.prepare(
        'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE id = ?',
      )
        .bind(tradeId)
        .first<PaperTradeRow>(),
      env.PAPER_TRADING_DB.prepare(
        'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
      )
        .bind(account.id)
        .first<PaperAccountRow>(),
      fetchAccountSummary(env, account),
    ])
    if (!freshAccount) throw new Error('Account vanished')
    if (!trade) throw new Error('Paper trade was not persisted')
    return Response.json({
      trade: toResponseTrade(trade),
      reconciled: false,
      ...summary,
      account: toResponseAccount(freshAccount),
      recentEntries: summary.recentEntries.map(toResponseStatement),
    })
  } catch (error) {
    console.error('Failed to enter paper trade:', error)
    return Response.json(
      { error: 'Failed to enter paper trade' },
      { status: 500 },
    )
  }
}

export async function handlePaperTradeExit(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  let body: {
    tradeId?: string
    exitPrice?: number
    isRollback?: boolean
    metadata?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const exitPrice = Number(body.exitPrice)
  if (!body.tradeId || !Number.isFinite(exitPrice) || exitPrice <= 0) {
    return Response.json(
      { error: 'tradeId and exitPrice are required' },
      { status: 400 },
    )
  }

  try {
    const account = await ensurePaperAccount(env, userId)
    const trade = await env.PAPER_TRADING_DB.prepare(
      'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE id = ? AND account_id = ?',
    )
      .bind(body.tradeId, account.id)
      .first<PaperTradeRow>()

    if (!trade)
      return Response.json(
        { error: 'Paper trade not found', code: 'TRADE_NOT_FOUND' },
        { status: 404 },
      )
    if (trade.status !== 'OPEN')
      return Response.json(
        {
          error: 'Paper trade is already closed',
          code: 'TRADE_ALREADY_CLOSED',
        },
        { status: 400 },
      )

    const existingMetadata = paperTradeMetadata(trade)
    const requestMetadata =
      typeof body.metadata === 'object' && body.metadata !== null
        ? (body.metadata as Record<string, unknown>)
        : {}
    const isRollback =
      body.isRollback === true || requestMetadata.isRollback === true
    let tradeType = 'buying'
    let entryCharges = { totalCharges: 0, brokerage: 0, statutoryTaxes: 0 }
    let marginBlockedPaise = 0
    if (existingMetadata.tradeType === 'selling') tradeType = 'selling'
    if (
      typeof existingMetadata.entryCharges === 'object' &&
      existingMetadata.entryCharges !== null
    )
      entryCharges = existingMetadata.entryCharges as typeof entryCharges
    if (typeof existingMetadata.marginBlocked === 'number')
      marginBlockedPaise = toPaise(existingMetadata.marginBlocked)

    const isSelling = tradeType === 'selling'
    const closedAt = nowIso()
    const exitPricePaise = isRollback ? trade.entry_price : toPaise(exitPrice)
    const settlement = calculatePaperExitSettlement({
      entryValuePaise: trade.entry_value,
      exitPricePaise,
      quantity: trade.quantity,
      isSelling,
      entryChargesPaise: Math.round(entryCharges.totalCharges),
      marginBlockedPaise,
      isRollback,
    })
    const {
      exitValuePaise,
      exitCharges,
      totalTradeFeesPaise,
      grossPnlPaise,
      realizedPnlPaise,
      netChangePaise,
    } = settlement

    const mergedMetadata = {
      ...existingMetadata,
      ...requestMetadata,
      isRollback,
      exitCharges: {
        totalCharges: toRupees(exitCharges.totalCharges),
        brokerage: toRupees(exitCharges.brokerage),
        statutoryTaxes: toRupees(exitCharges.statutoryTaxes),
      },
      totalTradeFees: toRupees(totalTradeFeesPaise),
      grossPnl: toRupees(grossPnlPaise),
    }

    const results = await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at)
         SELECT ?, ?, ?, ?, balance, balance + ?, ?, ?, ?
         FROM paper_accounts
         WHERE id = ? AND (SELECT status FROM paper_trades WHERE id = ?) = 'OPEN'`,
      ).bind(
        makeId('stmt'),
        account.id,
        'paper_exit',
        netChangePaise,
        netChangePaise,
        isRollback
          ? `Paper ROLLBACK ${trade.direction} (Fee: ₹0)`
          : `Paper EXIT ${trade.direction} (Fee: ₹${toRupees(exitCharges.totalCharges)})`,
        JSON.stringify({
          tradeId: trade.id,
          instrumentKey: trade.instrument_key,
          quantity: trade.quantity,
          exitPrice: toRupees(exitPricePaise),
          exitValue: toRupees(exitValuePaise),
          grossPnl: toRupees(grossPnlPaise),
          totalTradeFees: toRupees(totalTradeFeesPaise),
          realizedPnl: toRupees(realizedPnlPaise),
          isRollback,
          exitCharges: {
            totalCharges: toRupees(exitCharges.totalCharges),
            brokerage: toRupees(exitCharges.brokerage),
            statutoryTaxes: toRupees(exitCharges.statutoryTaxes),
          },
        }),
        closedAt,
        account.id,
        trade.id,
      ),
      env.PAPER_TRADING_DB.prepare(
        `UPDATE paper_accounts SET balance = balance + ?, updated_at = ?
         WHERE id = ? AND (SELECT status FROM paper_trades WHERE id = ?) = 'OPEN'`,
      ).bind(netChangePaise, closedAt, account.id, trade.id),
      env.PAPER_TRADING_DB.prepare(
        `UPDATE paper_trades SET status = ?, exit_price = ?, exit_value = ?, realized_pnl = ?, closed_at = ?, metadata_json = ?
         WHERE id = ? AND status = ?`,
      ).bind(
        isRollback ? 'CANCELLED' : 'CLOSED',
        exitPricePaise,
        exitValuePaise,
        realizedPnlPaise,
        closedAt,
        JSON.stringify(mergedMetadata),
        trade.id,
        'OPEN',
      ),
    ])

    if (results[2].meta.changes === 0) {
      return Response.json(
        {
          error: 'Paper trade is already closed',
          code: 'TRADE_ALREADY_CLOSED',
        },
        { status: 400 },
      )
    }

    const [updatedTrade, freshAccount, summary] = await Promise.all([
      env.PAPER_TRADING_DB.prepare(
        'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE id = ?',
      )
        .bind(trade.id)
        .first<PaperTradeRow>(),
      env.PAPER_TRADING_DB.prepare(
        'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
      )
        .bind(account.id)
        .first<PaperAccountRow>(),
      fetchAccountSummary(env, account),
    ])
    if (!freshAccount) throw new Error('Account vanished')
    return Response.json({
      trade: updatedTrade ? toResponseTrade(updatedTrade) : null,
      ...summary,
      account: toResponseAccount(freshAccount),
      recentEntries: summary.recentEntries.map(toResponseStatement),
    })
  } catch (error) {
    console.error('Failed to exit paper trade:', error)
    return Response.json(
      { error: 'Failed to exit paper trade' },
      { status: 500 },
    )
  }
}
