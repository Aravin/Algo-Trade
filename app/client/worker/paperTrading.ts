import type {
  Env,
  PaperAccountRow,
  PaperStatementRow,
  PaperTradeRow,
} from './types'
import { nowIso, makeId, getLotSizeForSymbol } from './utils'

const PAPER_STARTING_CREDIT = 15000_00 // in paise (₹15000)

export function calculateOptionCharges(
  tradeValuePaise: number,
  isSelling: boolean,
): { totalCharges: number; brokerage: number; statutoryTaxes: number } {
  const brokerage = 20_00 // ₹20 in paise
  const stt = isSelling ? Math.round(tradeValuePaise * 0.001) : 0
  const stampDuty = !isSelling ? Math.round(tradeValuePaise * 0.00003) : 0
  const exchangeFee = Math.round(tradeValuePaise * 0.0005)
  const gst = Math.round((brokerage + exchangeFee) * 0.18)
  const statutoryTaxes = stt + stampDuty + exchangeFee + gst
  const totalCharges = brokerage + statutoryTaxes
  return { totalCharges, brokerage, statutoryTaxes }
}

function toRupees(paise: number): number {
  return Math.round(paise) / 100
}

export async function ensurePaperAccount(
  env: Env,
  userId: string,
): Promise<PaperAccountRow> {
  const createdAt = nowIso()

  const accountResult = await env.PAPER_TRADING_DB.prepare(
    'INSERT OR IGNORE INTO paper_accounts (id, mode, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(userId, 'paper', toRupees(PAPER_STARTING_CREDIT), 'INR', createdAt)
    .run()

  if (accountResult.meta.changes === 1) {
    await env.PAPER_TRADING_DB.prepare(
      'INSERT OR IGNORE INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        makeId('stmt'),
        userId,
        'seed',
        toRupees(PAPER_STARTING_CREDIT),
        0,
        toRupees(PAPER_STARTING_CREDIT),
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

export async function getPaperAccountSummary(
  env: Env,
  userId: string,
): Promise<{
  account: PaperAccountRow
  recentEntries: PaperStatementRow[]
  openTradeCount: number
}> {
  const account = await ensurePaperAccount(env, userId)
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
    return Response.json(summary)
  } catch (error) {
    return Response.json(
      { error: `Failed to load paper account: ${String(error)}` },
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
    return Response.json({ ...summary, trades })
  } catch (error) {
    return Response.json(
      { error: `Failed to load paper history: ${String(error)}` },
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
    const balanceBeforePaise = Math.round(account.balance * 100)
    const amountPaise = Math.round(amount * 100)
    const balanceAfterPaise =
      mode === 'set' ? amountPaise : balanceBeforePaise + amountPaise
    if (balanceAfterPaise < 0) {
      return Response.json(
        { error: 'Paper credit cannot go below zero' },
        { status: 400 },
      )
    }

    const updatedAt = nowIso()
    const delta =
      mode === 'set' ? balanceAfterPaise - balanceBeforePaise : amountPaise
    const result = await env.PAPER_TRADING_DB.prepare(
      'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
    )
      .bind(toRupees(balanceAfterPaise), updatedAt, account.id)
      .run()

    if (result.meta.changes === 0) {
      return Response.json({ error: 'Account not found' }, { status: 404 })
    }

    await env.PAPER_TRADING_DB.prepare(
      'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        makeId('stmt'),
        account.id,
        mode === 'set' ? 'manual_set' : 'manual_adjust',
        toRupees(delta),
        account.balance,
        toRupees(balanceAfterPaise),
        body.note ??
          (mode === 'set'
            ? 'Manual paper credit set'
            : 'Manual paper credit adjustment'),
        JSON.stringify({ source: 'admin-ui', requestedAmount: amount, mode }),
        updatedAt,
      )
      .run()

    const summary = await getPaperAccountSummary(env, userId)
    return Response.json(summary)
  } catch (error) {
    return Response.json(
      { error: `Failed to update paper account: ${String(error)}` },
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
        'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
      ).bind(toRupees(PAPER_STARTING_CREDIT), updatedAt, account.id),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        'reset',
        toRupees(PAPER_STARTING_CREDIT - Math.round(account.balance * 100)),
        account.balance,
        toRupees(PAPER_STARTING_CREDIT),
        'Paper account reset to starting credit',
        JSON.stringify({ source: 'admin-ui-reset' }),
        updatedAt,
      ),
    ])

    const [summary, trades] = await Promise.all([
      getPaperAccountSummary(env, userId),
      listPaperTrades(env, userId),
    ])
    return Response.json({ ...summary, trades })
  } catch (error) {
    return Response.json(
      { error: `Failed to reset paper account: ${String(error)}` },
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
  const lotSize = getLotSizeForSymbol(lotSymbol)
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
    const entryValuePaise = Math.round(entryPrice * quantity * 100)
    const tradeType = metadataObj?.tradeType ?? 'buying'
    const isSelling = tradeType === 'selling'
    const charges = calculateOptionCharges(entryValuePaise, isSelling)

    const marginPerLotPaise = Math.round((body.marginPerLot ?? 4000) * 100)
    const marginBlocked = isSelling
      ? (quantity / lotSize) * marginPerLotPaise
      : 0

    const netChangePaise = isSelling
      ? entryValuePaise - charges.totalCharges - marginBlocked
      : -(entryValuePaise + charges.totalCharges)

    if (netChangePaise >= 0) {
      const result = await env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
      )
        .bind(toRupees(netChangePaise), nowIso(), account.id)
        .run()
      if (result.meta.changes === 0) {
        return Response.json({ error: 'Account not found' }, { status: 404 })
      }
    } else {
      const deductPaise = -netChangePaise
      const result = await env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND balance >= ?',
      )
        .bind(
          toRupees(deductPaise),
          nowIso(),
          account.id,
          toRupees(deductPaise),
        )
        .run()
      if (result.meta.changes === 0) {
        const current = await env.PAPER_TRADING_DB.prepare(
          'SELECT balance FROM paper_accounts WHERE id = ?',
        )
          .bind(account.id)
          .first<{ balance: number }>()
        return Response.json(
          {
            error: `Insufficient paper credit. Required ${toRupees(deductPaise)}, available ${current?.balance ?? account.balance}`,
          },
          { status: 400 },
        )
      }
    }

    const tradeId = makeId('paper_trade')
    const createdAt = nowIso()
    const balanceAfter = await env.PAPER_TRADING_DB.prepare(
      'SELECT balance FROM paper_accounts WHERE id = ?',
    )
      .bind(account.id)
      .first<{ balance: number }>()

    const tradeMetadata = {
      ...(typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata
        : {}),
      entryCharges: charges,
      marginBlocked: toRupees(marginBlocked),
    }

    await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_trades (id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, opened_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        tradeId,
        account.id,
        'OPEN',
        body.instrumentKey,
        body.direction,
        quantity,
        entryPrice,
        toRupees(entryValuePaise),
        createdAt,
        JSON.stringify(tradeMetadata),
      ),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        'paper_entry',
        toRupees(netChangePaise),
        account.balance,
        balanceAfter?.balance ?? toRupees(PAPER_STARTING_CREDIT),
        isSelling
          ? `Paper SELL ${body.direction} (Fee: ₹${toRupees(charges.totalCharges)})`
          : `Paper BUY ${body.direction} (Fee: ₹${toRupees(charges.totalCharges)})`,
        JSON.stringify({
          tradeId,
          instrumentKey: body.instrumentKey,
          quantity,
          entryPrice,
          entryValue: toRupees(entryValuePaise),
          charges,
        }),
        createdAt,
      ),
    ])

    const trade = await env.PAPER_TRADING_DB.prepare(
      'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE id = ?',
    )
      .bind(tradeId)
      .first<PaperTradeRow>()
    const summary = await getPaperAccountSummary(env, userId)
    return Response.json({ trade, ...summary })
  } catch (error) {
    return Response.json(
      { error: `Failed to enter paper trade: ${String(error)}` },
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
    isRollback?: boolean
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

  const isRollback =
    Boolean(body.isRollback) ||
    Boolean(
      typeof body.metadata === 'object' &&
      body.metadata !== null &&
      (body.metadata as Record<string, unknown>).isRollback,
    )

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
          marginBlockedPaise = Math.round(meta.marginBlocked * 100)
      } catch {
        /* ignore invalid metadata */
      }
    }

    const isSelling = tradeType === 'selling'
    const closedAt = nowIso()
    const exitValuePaise = Math.round(exitPrice * trade.quantity * 100)
    const exitCharges = isRollback
      ? { totalCharges: 0, brokerage: 0, statutoryTaxes: 0 }
      : calculateOptionCharges(exitValuePaise, !isSelling)

    const totalTradeFees = isRollback
      ? 0
      : Math.round(entryCharges.totalCharges + exitCharges.totalCharges)

    const entryValuePaise = Math.round(trade.entry_value * 100)
    const grossPnlPaise = isRollback
      ? 0
      : isSelling
        ? entryValuePaise - exitValuePaise
        : exitValuePaise - entryValuePaise
    const realizedPnlPaise = isRollback ? 0 : grossPnlPaise - totalTradeFees

    const netChangePaise = isRollback
      ? isSelling
        ? -entryValuePaise + entryCharges.totalCharges + marginBlockedPaise
        : entryValuePaise + entryCharges.totalCharges
      : isSelling
        ? -exitValuePaise - exitCharges.totalCharges + marginBlockedPaise
        : exitValuePaise - exitCharges.totalCharges

    if (netChangePaise < 0) {
      const deductPaise = -netChangePaise
      const result = await env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = balance - ?, updated_at = ? WHERE id = ? AND balance >= ?',
      )
        .bind(
          toRupees(deductPaise),
          closedAt,
          account.id,
          toRupees(deductPaise),
        )
        .run()
      if (result.meta.changes === 0) {
        return Response.json(
          { error: 'Insufficient paper credit for exit charges' },
          { status: 400 },
        )
      }
    } else {
      const result = await env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = balance + ?, updated_at = ? WHERE id = ?',
      )
        .bind(toRupees(netChangePaise), closedAt, account.id)
        .run()
      if (result.meta.changes === 0) {
        return Response.json({ error: 'Account not found' }, { status: 404 })
      }
    }

    const balanceAfter = await env.PAPER_TRADING_DB.prepare(
      'SELECT balance FROM paper_accounts WHERE id = ?',
    )
      .bind(account.id)
      .first<{ balance: number }>()

    const mergedMetadata = {
      ...(trade.metadata_json
        ? (JSON.parse(trade.metadata_json) as Record<string, unknown>)
        : {}),
      ...(typeof body.metadata === 'object' && body.metadata !== null
        ? body.metadata
        : {}),
      exitCharges,
      totalTradeFees: toRupees(totalTradeFees),
      grossPnl: toRupees(grossPnlPaise),
    }

    await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_trades SET status = ?, exit_price = ?, exit_value = ?, realized_pnl = ?, closed_at = ?, metadata_json = ? WHERE id = ?',
      ).bind(
        'CLOSED',
        exitPrice,
        toRupees(exitValuePaise),
        toRupees(realizedPnlPaise),
        closedAt,
        JSON.stringify(mergedMetadata),
        trade.id,
      ),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        'paper_exit',
        toRupees(netChangePaise),
        account.balance,
        balanceAfter?.balance ?? toRupees(PAPER_STARTING_CREDIT),
        `Paper EXIT ${trade.direction} (Fee: ₹${toRupees(exitCharges.totalCharges)})`,
        JSON.stringify({
          tradeId: trade.id,
          instrumentKey: trade.instrument_key,
          quantity: trade.quantity,
          exitPrice,
          exitValue: toRupees(exitValuePaise),
          grossPnl: toRupees(grossPnlPaise),
          totalTradeFees: toRupees(totalTradeFees),
          realizedPnl: toRupees(realizedPnlPaise),
          exitCharges,
        }),
        closedAt,
      ),
    ])

    const updatedTrade = await env.PAPER_TRADING_DB.prepare(
      'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE id = ?',
    )
      .bind(trade.id)
      .first<PaperTradeRow>()
    const summary = await getPaperAccountSummary(env, userId)
    return Response.json({ trade: updatedTrade, ...summary })
  } catch (error) {
    return Response.json(
      { error: `Failed to exit paper trade: ${String(error)}` },
      { status: 500 },
    )
  }
}
