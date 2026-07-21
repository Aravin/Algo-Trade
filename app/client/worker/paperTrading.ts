import type {
  Env,
  PaperAccountRow,
  PaperStatementRow,
  PaperTradeRow,
} from './types'
import { nowIso, makeId, getLotSizeForSymbol } from './utils'

const PAPER_STARTING_CREDIT = 5000

export async function ensurePaperAccount(
  env: Env,
  userId: string,
): Promise<PaperAccountRow> {
  const createdAt = nowIso()

  // Use INSERT OR IGNORE to safely handle concurrent first-time requests
  // without throwing a UNIQUE constraint error.
  const accountResult = await env.PAPER_TRADING_DB.prepare(
    'INSERT OR IGNORE INTO paper_accounts (id, mode, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(userId, 'paper', PAPER_STARTING_CREDIT, 'INR', createdAt)
    .run()

  // Seed the initial statement entry only when the row was actually new.
  // D1 meta.changes === 1 means a row was inserted (not ignored).
  if (accountResult.meta.changes === 1) {
    const insertResult = await env.PAPER_TRADING_DB.prepare(
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

    void insertResult // seed entry is best-effort; ignore duplicate
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
    const balanceBefore = Number(account.balance)
    const balanceAfter = mode === 'set' ? amount : balanceBefore + amount
    if (balanceAfter < 0) {
      return Response.json(
        { error: 'Paper credit cannot go below zero' },
        { status: 400 },
      )
    }

    const updatedAt = nowIso()
    const delta = mode === 'set' ? balanceAfter - balanceBefore : amount
    await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
      ).bind(balanceAfter, updatedAt, account.id),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        mode === 'set' ? 'manual_set' : 'manual_adjust',
        delta,
        balanceBefore,
        balanceAfter,
        body.note ??
          (mode === 'set'
            ? 'Manual paper credit set'
            : 'Manual paper credit adjustment'),
        JSON.stringify({ source: 'admin-ui', requestedAmount: amount, mode }),
        updatedAt,
      ),
    ])

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
      ).bind(PAPER_STARTING_CREDIT, updatedAt, account.id),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        'reset',
        PAPER_STARTING_CREDIT - Number(account.balance),
        account.balance,
        PAPER_STARTING_CREDIT,
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

  const lotSize = getLotSizeForSymbol(body.instrumentKey)
  if (quantity % lotSize !== 0) {
    return Response.json(
      {
        error: `Quantity must be a multiple of lot size (${lotSize}) for ${body.instrumentKey}`,
      },
      { status: 400 },
    )
  }

  try {
    const account = await ensurePaperAccount(env, userId)
    const entryValue = Number((entryPrice * quantity).toFixed(2))
    const metadataObj = body.metadata as {
      tradeType?: 'buying' | 'selling'
    } | null
    const tradeType = metadataObj?.tradeType ?? 'buying'
    const isSelling = tradeType === 'selling'

    if (isSelling) {
      const requiredMargin = quantity * 4000
      if (requiredMargin > account.balance) {
        return Response.json(
          {
            error: `Insufficient paper credit for margin. Required ${requiredMargin}, available ${account.balance}`,
          },
          { status: 400 },
        )
      }
    } else {
      if (entryValue > account.balance) {
        return Response.json(
          {
            error: `Insufficient paper credit. Required ${entryValue}, available ${account.balance}`,
          },
          { status: 400 },
        )
      }
    }

    const tradeId = makeId('paper_trade')
    const createdAt = nowIso()
    const balanceAfter = isSelling
      ? Number((account.balance + entryValue).toFixed(2))
      : Number((account.balance - entryValue).toFixed(2))

    const amountChange = isSelling ? entryValue : -entryValue
    const noteStr = isSelling
      ? `Paper SELL ${body.direction}`
      : `Paper BUY ${body.direction}`

    await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
      ).bind(balanceAfter, createdAt, account.id),
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
        entryValue,
        createdAt,
        JSON.stringify(body.metadata ?? null),
      ),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        'paper_entry',
        amountChange,
        account.balance,
        balanceAfter,
        noteStr,
        JSON.stringify({
          tradeId,
          instrumentKey: body.instrumentKey,
          quantity,
          entryPrice,
          entryValue,
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
  let body: { tradeId?: string; exitPrice?: number; metadata?: unknown }
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
      return Response.json({ error: 'Paper trade not found' }, { status: 404 })
    if (trade.status !== 'OPEN')
      return Response.json(
        { error: 'Paper trade is already closed' },
        { status: 400 },
      )

    let tradeType = 'buying'
    if (trade.metadata_json) {
      try {
        const meta = JSON.parse(trade.metadata_json) as { tradeType?: string }
        if (meta?.tradeType === 'selling') {
          tradeType = 'selling'
        }
      } catch {
        /* ignore invalid metadata */
      }
    }
    const isSelling = tradeType === 'selling'

    const closedAt = nowIso()
    const exitValue = Number((exitPrice * trade.quantity).toFixed(2))
    const realizedPnl = isSelling
      ? Number((trade.entry_value - exitValue).toFixed(2))
      : Number((exitValue - trade.entry_value).toFixed(2))
    const balanceAfter = isSelling
      ? Number((account.balance - exitValue).toFixed(2))
      : Number((account.balance + exitValue).toFixed(2))
    const amountChange = isSelling ? -exitValue : exitValue

    await env.PAPER_TRADING_DB.batch([
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_accounts SET balance = ?, updated_at = ? WHERE id = ?',
      ).bind(balanceAfter, closedAt, account.id),
      env.PAPER_TRADING_DB.prepare(
        'UPDATE paper_trades SET status = ?, exit_price = ?, exit_value = ?, realized_pnl = ?, closed_at = ?, metadata_json = ? WHERE id = ?',
      ).bind(
        'CLOSED',
        exitPrice,
        exitValue,
        realizedPnl,
        closedAt,
        JSON.stringify(body.metadata ?? trade.metadata_json ?? null),
        trade.id,
      ),
      env.PAPER_TRADING_DB.prepare(
        'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(
        makeId('stmt'),
        account.id,
        'paper_exit',
        amountChange,
        account.balance,
        balanceAfter,
        `Paper EXIT ${trade.direction}`,
        JSON.stringify({
          tradeId: trade.id,
          instrumentKey: trade.instrument_key,
          quantity: trade.quantity,
          exitPrice,
          exitValue,
          realizedPnl,
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
