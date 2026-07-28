import type {
  Env,
  PaperAccountRow,
  PaperStatementRow,
  PaperTradeRow,
} from './types'
import { nowIso, makeId, getLotSizeForSymbol } from './utils'

const PAPER_STARTING_CREDIT = 15000_00
const PAPER_BROKERAGE_PAISE = 20_00

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

    const openTradeCountRow = await env.PAPER_TRADING_DB.prepare(
      'SELECT COUNT(*) as count FROM paper_trades WHERE account_id = ? AND status = ?',
    )
      .bind(account.id, 'OPEN')
      .first<{ count: number }>()
    const openTradeCount = Number(openTradeCountRow?.count ?? 0)
    if (openTradeCount > 0) {
      return Response.json(
        {
          error: `Cannot reset account with ${openTradeCount} open trade(s). Close all trades first.`,
        },
        { status: 409 },
      )
    }

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

  const metadataObj = body.metadata as {
    tradingSymbol?: string
    underlyingSymbol?: string
    tradeType?: 'buying' | 'selling'
  } | null
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

  try {
    const account = await ensurePaperAccount(env, userId)
    const entryPricePaise = toPaise(entryPrice)
    const entryValuePaise = Math.round(entryPricePaise * quantity)
    const tradeType = metadataObj?.tradeType ?? 'buying'
    const isSelling = tradeType === 'selling'
    const charges = calculateOptionCharges(entryValuePaise, isSelling)

    const marginPerLotPaise = toPaise(body.marginPerLot ?? 100000)
    const marginBlockedPaise = isSelling
      ? (quantity / lotSize) * marginPerLotPaise
      : 0

    const netChangePaise = isSelling
      ? entryValuePaise - charges.totalCharges - marginBlockedPaise
      : -(entryValuePaise + charges.totalCharges)

    const tradeId = makeId('paper_trade')
    const createdAt = nowIso()

    const tradeMetadata = {
      ...(typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata
        : {}),
      entryCharges: charges,
      marginBlocked: toRupees(marginBlockedPaise),
      lotSize,
    }

    const results = await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_trades (id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, opened_at, metadata_json)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ? >= 0 OR (SELECT balance FROM paper_accounts WHERE id = ?) >= ?`,
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
        netChangePaise,
        account.id,
        -netChangePaise,
      ),
      env.PAPER_TRADING_DB.prepare(
        `INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at)
         SELECT ?, ?, ?, ?, balance, balance + ?, ?, ?, ?
         FROM paper_accounts
         WHERE id = ? AND (? >= 0 OR balance >= ?)`,
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
        netChangePaise,
        -netChangePaise,
      ),
      env.PAPER_TRADING_DB.prepare(
        `UPDATE paper_accounts SET balance = balance + ?, updated_at = ?
         WHERE id = ? AND (? >= 0 OR balance >= ?)`,
      ).bind(
        netChangePaise,
        createdAt,
        account.id,
        netChangePaise,
        -netChangePaise,
      ),
    ])

    if (results[0].meta.changes === 0) {
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
    return Response.json({
      trade: trade ? toResponseTrade(trade) : null,
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

    let tradeType = 'buying'
    let entryCharges = { totalCharges: 0, brokerage: 0, statutoryTaxes: 0 }
    let marginBlockedPaise = 0
    if (trade.metadata_json) {
      try {
        const meta = JSON.parse(trade.metadata_json) as {
          tradeType?: string
          entryCharges?: {
            totalCharges: number
            brokerage?: number
            statutoryTaxes?: number
          }
          marginBlocked?: number
        }
        if (meta?.tradeType === 'selling') tradeType = 'selling'
        if (meta?.entryCharges)
          entryCharges = meta.entryCharges as typeof entryCharges
        if (typeof meta?.marginBlocked === 'number')
          marginBlockedPaise = toPaise(meta.marginBlocked)
      } catch {
        /* ignore invalid metadata */
      }
    }

    const isSelling = tradeType === 'selling'
    const closedAt = nowIso()
    const exitPricePaise = toPaise(exitPrice)
    const exitValuePaise = Math.round(exitPricePaise * trade.quantity)
    const exitCharges = calculateOptionCharges(exitValuePaise, !isSelling)

    const totalTradeFeesPaise = Math.round(
      entryCharges.totalCharges + exitCharges.totalCharges,
    )

    const grossPnlPaise = isSelling
      ? trade.entry_value - exitValuePaise
      : exitValuePaise - trade.entry_value
    const realizedPnlPaise = grossPnlPaise - totalTradeFeesPaise

    const netChangePaise = isSelling
      ? -exitValuePaise - exitCharges.totalCharges + marginBlockedPaise
      : exitValuePaise - exitCharges.totalCharges

    const mergedMetadata = {
      ...(trade.metadata_json
        ? (JSON.parse(trade.metadata_json) as Record<string, unknown>)
        : {}),
      ...(typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata
        : {}),
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
        `Paper EXIT ${trade.direction} (Fee: ₹${toRupees(exitCharges.totalCharges)})`,
        JSON.stringify({
          tradeId: trade.id,
          instrumentKey: trade.instrument_key,
          quantity: trade.quantity,
          exitPrice: toRupees(exitPricePaise),
          exitValue: toRupees(exitValuePaise),
          grossPnl: toRupees(grossPnlPaise),
          totalTradeFees: toRupees(totalTradeFeesPaise),
          realizedPnl: toRupees(realizedPnlPaise),
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
        'CLOSED',
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
