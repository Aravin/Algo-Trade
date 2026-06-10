interface PaperTradeEnv {
  PAPER_TRADING_DB: D1Database
}

type Env = PaperTradeEnv

interface ClientStateRow {
  state_key: string
  value_json: string
  updated_at: string
}

const PAPER_ACCOUNT_ID = 'default'
const PAPER_STARTING_CREDIT = 5000

interface PaperAccountRow {
  id: string
  mode: string
  balance: number
  currency: string
  updated_at: string
}

interface PaperStatementRow {
  id: string
  entry_type: string
  amount: number
  balance_before: number
  balance_after: number
  note: string | null
  metadata_json: string | null
  created_at: string
}

interface PaperTradeRow {
  id: string
  account_id: string
  status: string
  instrument_key: string
  direction: string
  quantity: number
  entry_price: number
  entry_value: number
  exit_price: number | null
  exit_value: number | null
  realized_pnl: number | null
  opened_at: string
  closed_at: string | null
  metadata_json: string | null
}

interface UpstoxTokenRequest {
  code: string
  apiKey: string
  apiSecret: string
  redirectUri: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

async function ensureClientStateTable(env: PaperTradeEnv): Promise<void> {
  await env.PAPER_TRADING_DB.prepare(
    'CREATE TABLE IF NOT EXISTS client_state (state_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)',
  ).run()
}

async function readClientState<T>(
  env: PaperTradeEnv,
  key: string,
): Promise<T | null> {
  await ensureClientStateTable(env)
  const row = await env.PAPER_TRADING_DB.prepare(
    'SELECT state_key, value_json, updated_at FROM client_state WHERE state_key = ?',
  )
    .bind(key)
    .first<ClientStateRow>()

  if (!row) return null

  return JSON.parse(row.value_json) as T
}

async function writeClientState(
  env: PaperTradeEnv,
  key: string,
  value: unknown,
): Promise<void> {
  await ensureClientStateTable(env)
  await env.PAPER_TRADING_DB.prepare(
    `
      INSERT INTO client_state (state_key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(state_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
  )
    .bind(key, JSON.stringify(value), nowIso())
    .run()
}

async function ensurePaperAccount(
  env: PaperTradeEnv,
): Promise<PaperAccountRow> {
  const existing = await env.PAPER_TRADING_DB.prepare(
    'SELECT id, mode, balance, currency, updated_at FROM paper_accounts WHERE id = ?',
  )
    .bind(PAPER_ACCOUNT_ID)
    .first<PaperAccountRow>()

  if (existing) return existing

  const createdAt = nowIso()
  await env.PAPER_TRADING_DB.batch([
    env.PAPER_TRADING_DB.prepare(
      'INSERT INTO paper_accounts (id, mode, balance, currency, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).bind(PAPER_ACCOUNT_ID, 'paper', PAPER_STARTING_CREDIT, 'INR', createdAt),
    env.PAPER_TRADING_DB.prepare(
      'INSERT INTO paper_statement_entries (id, account_id, entry_type, amount, balance_before, balance_after, note, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(
      makeId('stmt'),
      PAPER_ACCOUNT_ID,
      'seed',
      PAPER_STARTING_CREDIT,
      0,
      PAPER_STARTING_CREDIT,
      'Initial paper trading credit',
      JSON.stringify({ source: 'system-seed' }),
      createdAt,
    ),
  ])

  return {
    id: PAPER_ACCOUNT_ID,
    mode: 'paper',
    balance: PAPER_STARTING_CREDIT,
    currency: 'INR',
    updated_at: createdAt,
  }
}

async function getPaperAccountSummary(env: PaperTradeEnv): Promise<{
  account: PaperAccountRow
  recentEntries: PaperStatementRow[]
  openTradeCount: number
}> {
  const account = await ensurePaperAccount(env)
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

async function listPaperTrades(
  env: PaperTradeEnv,
  limit = 50,
): Promise<PaperTradeRow[]> {
  const trades = await env.PAPER_TRADING_DB.prepare(
    'SELECT id, account_id, status, instrument_key, direction, quantity, entry_price, entry_value, exit_price, exit_value, realized_pnl, opened_at, closed_at, metadata_json FROM paper_trades WHERE account_id = ? ORDER BY opened_at DESC LIMIT ?',
  )
    .bind(PAPER_ACCOUNT_ID, limit)
    .all<PaperTradeRow>()
  return trades.results ?? []
}

async function handlePaperAccount(env: PaperTradeEnv): Promise<Response> {
  try {
    const summary = await getPaperAccountSummary(env)
    return Response.json(summary)
  } catch (error) {
    return Response.json(
      { error: `Failed to load paper account: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handleClientStateGet(
  request: Request,
  env: PaperTradeEnv,
): Promise<Response> {
  const key = new URL(request.url).searchParams.get('key')?.trim()
  if (!key) {
    return Response.json(
      { error: 'Missing client state key.' },
      { status: 400 },
    )
  }

  try {
    const value = await readClientState<unknown>(env, key)
    return Response.json({ value })
  } catch (error) {
    return Response.json(
      { error: `Failed to load client state: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handleClientStatePut(
  request: Request,
  env: PaperTradeEnv,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    key?: string
    value?: unknown
  } | null
  const key = body?.key?.trim()

  if (!key) {
    return Response.json(
      { error: 'Missing client state key.' },
      { status: 400 },
    )
  }

  try {
    await writeClientState(env, key, body?.value ?? null)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      { error: `Failed to save client state: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handlePaperHistory(env: PaperTradeEnv): Promise<Response> {
  try {
    const [summary, trades] = await Promise.all([
      getPaperAccountSummary(env),
      listPaperTrades(env),
    ])
    return Response.json({ ...summary, trades })
  } catch (error) {
    return Response.json(
      { error: `Failed to load paper history: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handlePaperAccountAdjust(
  request: Request,
  env: PaperTradeEnv,
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
    const account = await ensurePaperAccount(env)
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

    const summary = await getPaperAccountSummary(env)
    return Response.json(summary)
  } catch (error) {
    return Response.json(
      { error: `Failed to update paper account: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handlePaperReset(env: PaperTradeEnv): Promise<Response> {
  try {
    const account = await ensurePaperAccount(env)
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
      getPaperAccountSummary(env),
      listPaperTrades(env),
    ])
    return Response.json({ ...summary, trades })
  } catch (error) {
    return Response.json(
      { error: `Failed to reset paper account: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handlePaperTradeEnter(
  request: Request,
  env: PaperTradeEnv,
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

  try {
    const account = await ensurePaperAccount(env)
    const entryValue = Number((entryPrice * quantity).toFixed(2))
    if (entryValue > account.balance) {
      return Response.json(
        {
          error: `Insufficient paper credit. Required ${entryValue}, available ${account.balance}`,
        },
        { status: 400 },
      )
    }

    const tradeId = makeId('paper_trade')
    const createdAt = nowIso()
    const balanceAfter = Number((account.balance - entryValue).toFixed(2))
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
        -entryValue,
        account.balance,
        balanceAfter,
        `Paper BUY ${body.direction}`,
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
    const summary = await getPaperAccountSummary(env)
    return Response.json({ trade, ...summary })
  } catch (error) {
    return Response.json(
      { error: `Failed to enter paper trade: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handlePaperTradeExit(
  request: Request,
  env: PaperTradeEnv,
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
    const account = await ensurePaperAccount(env)
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

    const closedAt = nowIso()
    const exitValue = Number((exitPrice * trade.quantity).toFixed(2))
    const realizedPnl = Number((exitValue - trade.entry_value).toFixed(2))
    const balanceAfter = Number((account.balance + exitValue).toFixed(2))
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
        exitValue,
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
    const summary = await getPaperAccountSummary(env)
    return Response.json({ trade: updatedTrade, ...summary })
  } catch (error) {
    return Response.json(
      { error: `Failed to exit paper trade: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handleUpstoxToken(request: Request): Promise<Response> {
  let body: UpstoxTokenRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { code, apiKey, apiSecret, redirectUri } = body
  if (!code || !apiKey || !apiSecret || !redirectUri) {
    return Response.json(
      {
        error: 'Missing required fields: code, apiKey, apiSecret, redirectUri',
      },
      { status: 400 },
    )
  }

  const params = new URLSearchParams({
    code,
    client_id: apiKey,
    client_secret: apiSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.upstox.com/v2/login/authorization/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox token endpoint' },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxProfile(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token) {
    return Response.json({ error: 'Missing token' }, { status: 400 })
  }
  let upstream: Response
  try {
    upstream = await fetch('https://api.upstox.com/v2/user/profile', {
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
      },
    })
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

const INSTRUMENT_KEYS = [
  'NSE_INDEX|Nifty 50',
  'NSE_INDEX|Nifty Bank',
  'BSE_INDEX|SENSEX',
  'NSE_INDEX|India VIX',
].join(',')

async function handleMarketIndices(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(INSTRUMENT_KEYS)}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxFunds(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.upstox.com/v3/user/get-funds-and-margin',
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
          'Api-Version': '3.0',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── Intraday candles ─────────────────────────────────────────────────────────
async function handleIntraday(request: Request): Promise<Response> {
  let body: { token: string; instrumentKey: string; interval?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.instrumentKey)
    return Response.json(
      { error: 'Missing token or instrumentKey' },
      { status: 400 },
    )
  const interval = body.interval ?? '1minute'
  const key = encodeURIComponent(body.instrumentKey)
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/historical-candle/intraday/${key}/${interval}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

function formatIsoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function extractLatestPcrValue(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as {
    data?:
      | {
          pcr?: number
          value?: number
          put_call_ratio?: number
          timestamp?: string
          date?: string
        }[]
      | {
          pcr?: number
          value?: number
          put_call_ratio?: number
          candles?: {
            pcr?: number
            value?: number
            put_call_ratio?: number
            timestamp?: string
            date?: string
          }[]
        }
  }
  const data = record.data

  const series = Array.isArray(data)
    ? data
    : Array.isArray(data?.candles)
      ? data.candles
      : []

  const latest = [...series].sort((left, right) =>
    String(right.timestamp ?? right.date ?? '').localeCompare(
      String(left.timestamp ?? left.date ?? ''),
    ),
  )[0]
  const objectValue = !Array.isArray(data)
    ? (data?.pcr ?? data?.value ?? data?.put_call_ratio)
    : undefined
  const value =
    latest?.pcr ?? latest?.value ?? latest?.put_call_ratio ?? objectValue
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

// ─── Option contracts / expiries ─────────────────────────────────────────────
async function handleOptionContracts(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.upstox.com/v2/option/contract?instrument_key=NSE_INDEX|Nifty 50',
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }

  const raw = await upstream.json<{ data?: { expiry?: string }[] }>()
  const today = formatIsoDate()
  const expiries = [
    ...new Set(
      (raw.data ?? [])
        .map((item) => item.expiry)
        .filter(
          (value): value is string =>
            typeof value === 'string' && value >= today,
        ),
    ),
  ].sort()
  return Response.json(
    { data: raw.data ?? [], expiries },
    { status: upstream.status },
  )
}

// ─── Option chain ──────────────────────────────────────────────────────────────
async function handleOptionChain(request: Request): Promise<Response> {
  let body: { token: string; expiryDate: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiryDate)
    return Response.json(
      { error: 'Missing token or expiryDate' },
      { status: 400 },
    )
  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry_date: body.expiryDate,
  })
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/option/chain?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── Option PCR via Upstox ───────────────────────────────────────────────────
async function handleUpstoxPcr(request: Request): Promise<Response> {
  let body: {
    token: string
    expiry: string
    date?: string
    bucketInterval?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiry)
    return Response.json({ error: 'Missing token or expiry' }, { status: 400 })

  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry: body.expiry,
    date: body.date ?? formatIsoDate(),
    bucket_interval: String(body.bucketInterval ?? 60),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/pcr?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }

  const raw = await upstream.json()
  return Response.json(
    { value: extractLatestPcrValue(raw), raw },
    { status: upstream.status },
  )
}

// ─── Place order ───────────────────────────────────────────────────────────────
async function handlePlaceOrder(request: Request): Promise<Response> {
  let body: {
    token: string
    instrumentKey: string
    transactionType: 'BUY' | 'SELL'
    quantity: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (
    !body.token ||
    !body.instrumentKey ||
    !body.transactionType ||
    !body.quantity
  ) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const orderPayload = {
    instrument_token: body.instrumentKey,
    quantity: body.quantity,
    transaction_type: body.transactionType,
    order_type: 'MARKET',
    product: 'I',
    validity: 'DAY',
    price: 0,
    trigger_price: 0,
    disclosed_quantity: 0,
    is_amo: false,
    tag: 'algo-v5',
  }
  let upstream: Response
  try {
    upstream = await fetch('https://api.upstox.com/v2/order/place', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── Order list ────────────────────────────────────────────────────────────────
async function handleOrderList(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch('https://api.upstox.com/v2/order/retrieve-all', {
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
      },
    })
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── Global sentiment (MoneyControl) ──────────────────────────────────────────
async function handleGlobalSentiment(): Promise<Response> {
  const url =
    'https://priceapi.moneycontrol.com/technicalCompanyData/globalMarket?deviceType=W&sortOrder=desc&sortBy=weight&count=100&type=IT'
  let upstream: Response
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    return Response.json(
      { error: 'Failed to reach MoneyControl API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── Nifty sentiment (NiftyTrader) ────────────────────────────────────────────
async function handleNiftySentiment(): Promise<Response> {
  const url = 'https://webapi.niftytrader.in/webapi/Resource/nifty50-data'
  let upstream: Response
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    return Response.json(
      { error: 'Failed to reach NiftyTrader API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── VRD fallback APIs ───────────────────────────────────────────────────────
const VRD_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; AlgoTrade/1.0)',
}

async function fetchVrdJson<T>(path: string): Promise<T> {
  const res = await fetch(`https://www.vrdnation.com${path}`, {
    headers: VRD_HEADERS,
  })
  if (!res.ok) throw new Error(`VRD returned ${res.status}`)
  return res.json()
}

async function handleVrdMarketMood(): Promise<Response> {
  try {
    const data = await fetchVrdJson<{ date?: string; marketMood?: number }>(
      '/pulse/api/market-mood',
    )
    return Response.json({
      score: data.marketMood ?? null,
      date: data.date ?? null,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleVrdFiiRatio(): Promise<Response> {
  try {
    const rows = await fetchVrdJson<
      {
        date?: string
        fiiLong?: number
        fiiShort?: number
        indexLong?: number
        indexShort?: number
      }[]
    >('/pulse/api/fii-ratio')
    const latest = rows.at(-1) ?? null
    return Response.json({
      date: latest?.date ?? null,
      longPct: latest?.fiiLong ?? null,
      shortPct: latest?.fiiShort ?? null,
      indexLong: latest?.indexLong ?? null,
      indexShort: latest?.indexShort ?? null,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleVrdDashboard(): Promise<Response> {
  try {
    const data = await fetchVrdJson<{
      indiaVix?: { price?: number; date?: string }
      pcr?: { NF50?: { putCallRatio?: number; date?: string } }
      giftNifty?: {
        lastData?: { close?: number; change?: number; date?: string }
      }
      Asia?: {
        displayName?: string
        change?: number
        price?: number
        date?: string
        region?: string
      }[]
      US?: {
        displayName?: string
        change?: number
        price?: number
        date?: string
        region?: string
      }[]
      Commodities?: {
        displayName?: string
        change?: number
        price?: number
        date?: string
        region?: string
      }[]
    }>('/pulse/api/dashboard')
    return Response.json({
      vix: data.indiaVix?.price ?? null,
      vixDate: data.indiaVix?.date ?? null,
      pcr: data.pcr?.NF50?.putCallRatio ?? null,
      pcrDate: data.pcr?.NF50?.date ?? null,
      giftNifty: data.giftNifty?.lastData?.close ?? null,
      giftNiftyChange: data.giftNifty?.lastData?.change ?? null,
      giftNiftyDate: data.giftNifty?.lastData?.date ?? null,
      asia: data.Asia ?? [],
      us: data.US ?? [],
      commodities: data.Commodities ?? [],
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleVrdAdvanceDecline(): Promise<Response> {
  try {
    const rows = await fetchVrdJson<
      { date?: string; advances?: number; declines?: number }[]
    >('/pulse/api/advance-decline/details/1')
    const latest = rows.at(-1) ?? null
    const advances = latest?.advances ?? null
    const declines = latest?.declines ?? null
    return Response.json({
      date: latest?.date ?? null,
      advances,
      declines,
      ratio:
        advances !== null && declines !== null && declines > 0
          ? Number((advances / declines).toFixed(3))
          : null,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleVrdPcr(): Promise<Response> {
  try {
    const rows = await fetchVrdJson<
      { date?: string; putCallRatio?: number; price?: number }[]
    >('/pulse/api/put-call-ratio/details/NF50')
    const latest = rows.at(-1) ?? null
    return Response.json({
      value: latest?.putCallRatio ?? null,
      date: latest?.date ?? null,
      price: latest?.price ?? null,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleVrdPe(): Promise<Response> {
  try {
    const rows = await fetchVrdJson<
      {
        date?: string
        priceEarnings?: number
        priceToBook?: number
        dividendYield?: number
      }[]
    >('/pulse/api/price-earnings/day-wise-details/NF50')
    const latest = rows.at(-1) ?? null
    const pe = latest?.priceEarnings ?? null
    return Response.json({
      pe,
      pb: latest?.priceToBook ?? null,
      dividendYield: latest?.dividendYield ?? null,
      date: latest?.date ?? null,
      label:
        pe === null
          ? null
          : pe < 18
            ? 'Undervalued'
            : pe > 24
              ? 'Overvalued'
              : 'Fair Value',
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleVrdFiiPositioning(): Promise<Response> {
  try {
    const months = await fetchVrdJson<{ month?: number; year?: number }[]>(
      '/pulse/api/fii/date',
    )
    const latestMonth = months[0]
    if (!latestMonth?.month || !latestMonth?.year) {
      return Response.json(
        { error: 'VRD FII month list empty' },
        { status: 502 },
      )
    }
    const rows = await fetchVrdJson<{ date?: string; netFutIndex?: number }[]>(
      `/pulse/api/fii/${latestMonth.month}/${latestMonth.year}`,
    )
    const latest = rows.at(-1) ?? null
    let consecutiveShortDays = 0
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if ((rows[index]?.netFutIndex ?? 0) < 0) consecutiveShortDays += 1
      else break
    }
    return Response.json({
      date: latest?.date ?? null,
      netPosition: latest?.netFutIndex ?? null,
      consecutiveShortDays: consecutiveShortDays || null,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

// ─── VIX via Upstox ───────────────────────────────────────────────────────────
async function handleVix(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  const key = encodeURIComponent('NSE_INDEX|India VIX')
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${key}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json({ error: 'Failed to reach Upstox' }, { status: 502 })
  }
  const raw = await upstream.json<{
    status?: string
    data?: Record<string, { last_price?: number }>
  }>()
  const entry = Object.values(raw?.data ?? {})[0]
  return Response.json({ vix: entry?.last_price ?? null })
}

// ─── Nifty50 breadth (A/D) via Upstox batch quotes ───────────────────────────
const NIFTY50_KEYS = [
  'NSE_EQ|ADANIENT',
  'NSE_EQ|ADANIPORTS',
  'NSE_EQ|APOLLOHOSP',
  'NSE_EQ|ASIANPAINT',
  'NSE_EQ|AXISBANK',
  'NSE_EQ|BAJAJ-AUTO',
  'NSE_EQ|BAJFINANCE',
  'NSE_EQ|BAJAJFINSV',
  'NSE_EQ|BPCL',
  'NSE_EQ|BHARTIARTL',
  'NSE_EQ|BRITANNIA',
  'NSE_EQ|CIPLA',
  'NSE_EQ|COALINDIA',
  'NSE_EQ|DIVISLAB',
  'NSE_EQ|DRREDDY',
  'NSE_EQ|EICHERMOT',
  'NSE_EQ|GRASIM',
  'NSE_EQ|HCLTECH',
  'NSE_EQ|HDFCBANK',
  'NSE_EQ|HDFCLIFE',
  'NSE_EQ|HEROMOTOCO',
  'NSE_EQ|HINDALCO',
  'NSE_EQ|HINDUNILVR',
  'NSE_EQ|ICICIBANK',
  'NSE_EQ|INDUSINDBK',
  'NSE_EQ|INFY',
  'NSE_EQ|ITC',
  'NSE_EQ|JSWSTEEL',
  'NSE_EQ|KOTAKBANK',
  'NSE_EQ|LT',
  'NSE_EQ|LTIM',
  'NSE_EQ|M&M',
  'NSE_EQ|MARUTI',
  'NSE_EQ|NESTLEIND',
  'NSE_EQ|NTPC',
  'NSE_EQ|ONGC',
  'NSE_EQ|POWERGRID',
  'NSE_EQ|RELIANCE',
  'NSE_EQ|SBILIFE',
  'NSE_EQ|SHRIRAMFIN',
  'NSE_EQ|SBIN',
  'NSE_EQ|SUNPHARMA',
  'NSE_EQ|TCS',
  'NSE_EQ|TATACONSUM',
  'NSE_EQ|TATAMOTORS',
  'NSE_EQ|TATASTEEL',
  'NSE_EQ|TECHM',
  'NSE_EQ|TITAN',
  'NSE_EQ|TRENT',
  'NSE_EQ|ULTRACEMCO',
]

async function handleBreadth(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(NIFTY50_KEYS.join(','))}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json({ error: 'Failed to reach Upstox' }, { status: 502 })
  }
  const raw = await upstream.json<{
    status?: string
    data?: Record<string, { net_change?: number; last_price?: number }>
  }>()
  if (!raw?.data)
    return Response.json({ error: 'No data from Upstox', raw }, { status: 502 })
  const stocks = Object.values(raw.data)
  const advances = stocks.filter((s) => (s.net_change ?? 0) > 0).length
  const declines = stocks.filter((s) => (s.net_change ?? 0) < 0).length
  const ratio =
    declines > 0
      ? parseFloat((advances / declines).toFixed(3))
      : advances > 0
        ? 3.0
        : 1.0
  return Response.json({
    advances,
    declines,
    unchanged: stocks.length - advances - declines,
    ratio,
    total: stocks.length,
  })
}

// ─── NSE public data (PE + FII) ───────────────────────────────────────────────
const NSE_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
}

async function nseWithSession(path: string): Promise<Response> {
  // First try without cookie
  let res = await fetch(`https://www.nseindia.com${path}`, {
    headers: NSE_BROWSER_HEADERS,
  })
  if (res.ok) return res
  // Session-cookie fallback: hit the homepage to get valid cookies, then retry
  try {
    const homeRes = await fetch('https://www.nseindia.com/', {
      headers: {
        ...NSE_BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
    })
    const cookieHeader = homeRes.headers.get('set-cookie')
    if (cookieHeader) {
      const cookie = cookieHeader
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .join('; ')
      res = await fetch(`https://www.nseindia.com${path}`, {
        headers: { ...NSE_BROWSER_HEADERS, Cookie: cookie },
      })
    }
  } catch {
    /* fallthrough — return original failed response */
  }
  return res
}

async function handleNsePe(): Promise<Response> {
  try {
    const res = await nseWithSession('/api/allIndices')
    if (!res.ok)
      return Response.json(
        { error: `NSE returned ${res.status}` },
        { status: 502 },
      )
    const data = await res.json<{
      data?: {
        indexSymbol?: string
        pe?: string
        pb?: string
        advances?: number
        declines?: number
      }[]
    }>()
    const nifty = data?.data?.find((d) => d.indexSymbol === 'NIFTY 50')
    return Response.json({
      pe: nifty?.pe ? parseFloat(nifty.pe) : null,
      pb: nifty?.pb ? parseFloat(nifty.pb) : null,
      advances: nifty?.advances ?? null,
      declines: nifty?.declines ?? null,
      label: nifty?.pe
        ? parseFloat(nifty.pe) < 18
          ? 'Undervalued'
          : parseFloat(nifty.pe) > 24
            ? 'Overvalued'
            : 'Fair Value'
        : null,
    })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

async function handleNseFii(): Promise<Response> {
  try {
    const res = await nseWithSession('/api/fiidiiTradeReact')
    if (!res.ok)
      return Response.json(
        { error: `NSE returned ${res.status}` },
        { status: 502 },
      )
    const rows = await res.json<
      {
        category?: string
        buyValue?: number
        sellValue?: number
        netValue?: number
        date?: string
      }[]
    >()
    // Return last 5 trading days of FII data
    const fii = rows
      .filter((r) => r.category === 'FII/FPI' || r.category === 'FII')
      .slice(0, 5)
    return Response.json({ data: fii })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/client-state' && request.method === 'GET') {
      return handleClientStateGet(request, env)
    }
    if (url.pathname === '/api/client-state' && request.method === 'PUT') {
      return handleClientStatePut(request, env)
    }

    if (url.pathname === '/api/paper/account' && request.method === 'GET') {
      return handlePaperAccount(env)
    }
    if (url.pathname === '/api/paper/history' && request.method === 'GET') {
      return handlePaperHistory(env)
    }
    if (
      url.pathname === '/api/paper/account/adjust' &&
      request.method === 'POST'
    ) {
      return handlePaperAccountAdjust(request, env)
    }
    if (
      url.pathname === '/api/paper/trades/enter' &&
      request.method === 'POST'
    ) {
      return handlePaperTradeEnter(request, env)
    }
    if (
      url.pathname === '/api/paper/trades/exit' &&
      request.method === 'POST'
    ) {
      return handlePaperTradeExit(request, env)
    }
    if (url.pathname === '/api/paper/reset' && request.method === 'POST') {
      return handlePaperReset(env)
    }

    if (
      url.pathname === '/api/broker/upstox/token' &&
      request.method === 'POST'
    ) {
      return handleUpstoxToken(request)
    }
    if (
      url.pathname === '/api/broker/upstox/profile' &&
      request.method === 'POST'
    ) {
      return handleUpstoxProfile(request)
    }
    if (url.pathname === '/api/market/indices' && request.method === 'POST') {
      return handleMarketIndices(request)
    }
    if (
      url.pathname === '/api/broker/upstox/funds' &&
      request.method === 'POST'
    ) {
      return handleUpstoxFunds(request)
    }
    if (
      url.pathname === '/api/market/candles/intraday' &&
      request.method === 'POST'
    ) {
      return handleIntraday(request)
    }
    if (
      url.pathname === '/api/market/option-chain' &&
      request.method === 'POST'
    ) {
      return handleOptionChain(request)
    }
    if (
      url.pathname === '/api/market/option-contracts' &&
      request.method === 'POST'
    ) {
      return handleOptionContracts(request)
    }
    if (
      url.pathname === '/api/market/upstox/pcr' &&
      request.method === 'POST'
    ) {
      return handleUpstoxPcr(request)
    }
    if (url.pathname === '/api/order/place' && request.method === 'POST') {
      return handlePlaceOrder(request)
    }
    if (url.pathname === '/api/order/list' && request.method === 'POST') {
      return handleOrderList(request)
    }
    if (
      url.pathname === '/api/market/global-sentiment' &&
      request.method === 'GET'
    ) {
      return handleGlobalSentiment()
    }
    if (
      url.pathname === '/api/market/nifty-sentiment' &&
      request.method === 'GET'
    ) {
      return handleNiftySentiment()
    }

    if (
      url.pathname === '/api/market/vrd/market-mood' &&
      request.method === 'GET'
    ) {
      return handleVrdMarketMood()
    }
    if (
      url.pathname === '/api/market/vrd/fii-ratio' &&
      request.method === 'GET'
    ) {
      return handleVrdFiiRatio()
    }
    if (
      url.pathname === '/api/market/vrd/dashboard' &&
      request.method === 'GET'
    ) {
      return handleVrdDashboard()
    }
    if (
      url.pathname === '/api/market/vrd/advance-decline' &&
      request.method === 'GET'
    ) {
      return handleVrdAdvanceDecline()
    }
    if (url.pathname === '/api/market/vrd/pcr' && request.method === 'GET') {
      return handleVrdPcr()
    }
    if (url.pathname === '/api/market/vrd/pe' && request.method === 'GET') {
      return handleVrdPe()
    }
    if (
      url.pathname === '/api/market/vrd/fii-positioning' &&
      request.method === 'GET'
    ) {
      return handleVrdFiiPositioning()
    }

    // ── New Upstox-based market data ──────────────────────────────────────────
    if (url.pathname === '/api/market/vix' && request.method === 'POST') {
      return handleVix(request)
    }
    if (url.pathname === '/api/market/breadth' && request.method === 'POST') {
      return handleBreadth(request)
    }

    // ── NSE public data ───────────────────────────────────────────────────────
    if (url.pathname === '/api/market/nse/pe' && request.method === 'GET') {
      return handleNsePe()
    }
    if (url.pathname === '/api/market/nse/fii' && request.method === 'GET') {
      return handleNseFii()
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json({ error: 'Unknown API route' }, { status: 404 })
    }

    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Env>
