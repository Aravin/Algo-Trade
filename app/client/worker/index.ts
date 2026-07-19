import * as jose from 'jose'

interface PaperTradeEnv {
  PAPER_TRADING_DB: D1Database
  AUTH0_DOMAIN?: string
  AUTH0_AUDIENCE?: string
}

type Env = PaperTradeEnv

let _jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null

function getJWKS(domain: string) {
  return (_jwks ??= jose.createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`),
  ))
}

async function verifyAuth0Token(
  request: Request,
  env: Env,
): Promise<string | null> {
  const domain = env.AUTH0_DOMAIN
  const audience = env.AUTH0_AUDIENCE

  if (!domain || !audience) {
    // If not configured, bypass authentication for local dev
    return 'local-dev-user'
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7).trim()
  try {
    const JWKS = getJWKS(domain)
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `https://${domain}/`,
      audience: audience,
    })

    return payload.sub ?? null
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}

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
    'CREATE TABLE IF NOT EXISTS client_state (user_id TEXT NOT NULL, state_key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, state_key))',
  ).run()
}

async function readClientState<T>(
  env: PaperTradeEnv,
  userId: string,
  key: string,
): Promise<T | null> {
  await ensureClientStateTable(env)
  const row = await env.PAPER_TRADING_DB.prepare(
    'SELECT value_json FROM client_state WHERE user_id = ? AND state_key = ?',
  )
    .bind(userId, key)
    .first<{ value_json: string }>()

  if (!row) return null

  return JSON.parse(row.value_json) as T
}

async function writeClientState(
  env: PaperTradeEnv,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  await ensureClientStateTable(env)
  await env.PAPER_TRADING_DB.prepare(
    `
      INSERT INTO client_state (user_id, state_key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, state_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
  )
    .bind(userId, key, JSON.stringify(value), nowIso())
    .run()
}

async function ensurePaperAccount(
  env: PaperTradeEnv,
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

async function getPaperAccountSummary(
  env: PaperTradeEnv,
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

async function listPaperTrades(
  env: PaperTradeEnv,
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

async function handlePaperAccount(
  env: PaperTradeEnv,
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

async function handleClientStateGet(
  request: Request,
  env: PaperTradeEnv,
  userId: string,
): Promise<Response> {
  const key = new URL(request.url).searchParams.get('key')?.trim()
  if (!key) {
    return Response.json(
      { error: 'Missing client state key.' },
      { status: 400 },
    )
  }

  try {
    const value = await readClientState<unknown>(env, userId, key)
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
  userId: string,
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
    await writeClientState(env, userId, key, body?.value ?? null)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      { error: `Failed to save client state: ${String(error)}` },
      { status: 500 },
    )
  }
}

async function handlePaperHistory(
  env: PaperTradeEnv,
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

async function handlePaperAccountAdjust(
  request: Request,
  env: PaperTradeEnv,
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

async function handlePaperReset(
  env: PaperTradeEnv,
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

async function handlePaperTradeEnter(
  request: Request,
  env: PaperTradeEnv,
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

async function handlePaperTradeExit(
  request: Request,
  env: PaperTradeEnv,
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
  'NSE_EQ|INE423A01024',
  'NSE_EQ|INE742F01042',
  'NSE_EQ|INE437A01024',
  'NSE_EQ|INE021A01026',
  'NSE_EQ|INE238A01034',
  'NSE_EQ|INE917I01010',
  'NSE_EQ|INE296A01032',
  'NSE_EQ|INE918I01026',
  'NSE_EQ|INE029A01011',
  'NSE_EQ|INE397D01024',
  'NSE_EQ|INE216A01030',
  'NSE_EQ|INE059A01026',
  'NSE_EQ|INE522F01014',
  'NSE_EQ|INE361B01024',
  'NSE_EQ|INE089A01031',
  'NSE_EQ|INE066A01021',
  'NSE_EQ|INE047A01021',
  'NSE_EQ|INE860A01027',
  'NSE_EQ|INE040A01034',
  'NSE_EQ|INE795G01014',
  'NSE_EQ|INE158A01026',
  'NSE_EQ|INE038A01020',
  'NSE_EQ|INE030A01027',
  'NSE_EQ|INE090A01021',
  'NSE_EQ|INE095A01012',
  'NSE_EQ|INE009A01021',
  'NSE_EQ|INE154A01025',
  'NSE_EQ|INE019A01038',
  'NSE_EQ|INE237A01036',
  'NSE_EQ|INE018A01030',
  'NSE_EQ|INE214T01019',
  'NSE_EQ|INE101A01026',
  'NSE_EQ|INE585B01010',
  'NSE_EQ|INE239A01024',
  'NSE_EQ|INE733E01010',
  'NSE_EQ|INE213A01029',
  'NSE_EQ|INE752E01010',
  'NSE_EQ|INE002A01018',
  'NSE_EQ|INE123W01016',
  'NSE_EQ|INE721A01047',
  'NSE_EQ|INE062A01020',
  'NSE_EQ|INE044A01036',
  'NSE_EQ|INE467B01029',
  'NSE_EQ|INE192A01025',
  'NSE_EQ|INE155A01022',
  'NSE_EQ|INE081A01020',
  'NSE_EQ|INE669C01036',
  'NSE_EQ|INE280A01028',
  'NSE_EQ|INE849A01020',
  'NSE_EQ|INE481G01011',
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

// ─── FII/DII/OI/Max Pain/Smartlist via Upstox ─────────────────────────────────
async function handleUpstoxFii(request: Request): Promise<Response> {
  let body: { token: string; from?: string; interval?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  const qs = new URLSearchParams({
    data_type: 'NSE_FO|INDEX_FUTURES,NSE_FO|INDEX_OPTIONS,NSE_EQ|CASH',
    interval: body.interval ?? '1D',
  })
  if (body.from) {
    qs.set('from', body.from)
  } else {
    const date = new Date()
    date.setDate(date.getDate() - 15)
    qs.set('from', formatIsoDate(date))
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/fii?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxDii(request: Request): Promise<Response> {
  let body: { token: string; from?: string; interval?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  const qs = new URLSearchParams({
    data_type: 'NSE_EQ|CASH',
    interval: body.interval ?? '1D',
  })
  if (body.from) {
    qs.set('from', body.from)
  } else {
    const date = new Date()
    date.setDate(date.getDate() - 15)
    qs.set('from', formatIsoDate(date))
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/dii?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxMaxPain(request: Request): Promise<Response> {
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
      `https://api.upstox.com/v2/market/max-pain?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxOi(request: Request): Promise<Response> {
  let body: { token: string; expiry: string; date?: string }
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
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/oi?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxChangeOi(request: Request): Promise<Response> {
  let body: {
    token: string
    expiry: string
    date?: string
    interval?: number
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
    interval: String(body.interval ?? 1),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/change-oi?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

async function handleUpstoxSmartlistFutures(
  request: Request,
): Promise<Response> {
  let body: {
    token: string
    assetType?: string
    category?: string
    pageNumber?: number
    pageSize?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  const qs = new URLSearchParams({
    asset_type: body.assetType ?? 'INDEX',
    category: body.category ?? 'TOP_TRADED',
    page_number: String(body.pageNumber ?? 1),
    page_size: String(body.pageSize ?? 20),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/smartlist/futures?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

// ─── Global Indices (market data feed) ──────────────────────────────────────
const GLOBAL_INDICES_URL = 'https://www.vrdnation.com/pulse/api/dashboard'

async function handleGlobalIndices(): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(GLOBAL_INDICES_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    })
  } catch (e) {
    return Response.json(
      { error: `Failed to reach global indices feed: ${String(e)}` },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `Global indices feed returned ${upstream.status}` },
      { status: 502 },
    )
  }

  const raw = await upstream.json<{
    globalIndicesByRegion?: {
      US?: { displayName: string; price: number; change: number }[]
      ASIA?: { displayName: string; price: number; change: number }[]
      Commodities?: { displayName: string; price: number; change: number }[]
    }
  }>()

  const regions = raw?.globalIndicesByRegion
  if (!regions) {
    return Response.json(
      { error: 'No globalIndicesByRegion in response', raw },
      { status: 502 },
    )
  }

  // Flatten all regions into a single array of GlobalIndexItem
  const allItems = [
    ...(regions.US ?? []),
    ...(regions.ASIA ?? []),
    ...(regions.Commodities ?? []),
  ]

  const normalized = allItems.map((item) => ({
    symbol: item.displayName,
    last_price: item.price ?? 0,
    change_per: item.change ?? 0,
  }))

  return Response.json({ status: 'success', data: normalized })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // ── Public proxy routes (no Auth0 token required) ──────────────
    // These forward requests to Upstox/market APIs on behalf of the browser.
    // They must remain unauthenticated because the OAuth callback popup does
    // not have an Auth0 session when it calls /api/broker/upstox/token.
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

    // ── New Upstox-based market data ──────────────────────────────────────────
    if (url.pathname === '/api/market/vix' && request.method === 'POST') {
      return handleVix(request)
    }
    if (url.pathname === '/api/market/breadth' && request.method === 'POST') {
      return handleBreadth(request)
    }

    if (
      url.pathname === '/api/market/upstox/fii' &&
      request.method === 'POST'
    ) {
      return handleUpstoxFii(request)
    }
    if (
      url.pathname === '/api/market/upstox/dii' &&
      request.method === 'POST'
    ) {
      return handleUpstoxDii(request)
    }
    if (
      url.pathname === '/api/market/upstox/max-pain' &&
      request.method === 'POST'
    ) {
      return handleUpstoxMaxPain(request)
    }
    if (url.pathname === '/api/market/upstox/oi' && request.method === 'POST') {
      return handleUpstoxOi(request)
    }
    if (
      url.pathname === '/api/market/upstox/change-oi' &&
      request.method === 'POST'
    ) {
      return handleUpstoxChangeOi(request)
    }
    if (
      url.pathname === '/api/market/upstox/smartlist/futures' &&
      request.method === 'POST'
    ) {
      return handleUpstoxSmartlistFutures(request)
    }
    if (
      (url.pathname === '/api/market/upstox/global-indices' ||
        url.pathname === '/api/market/global-sentiment') &&
      (request.method === 'POST' || request.method === 'GET')
    ) {
      return handleGlobalIndices()
    }

    // ── Authenticated routes (Auth0 token required) ────────────────
    let userId = 'local-dev-user'
    if (url.pathname.startsWith('/api/')) {
      const tokenUser = await verifyAuth0Token(request, env)
      if (!tokenUser) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized. Invalid or missing token.' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      userId = tokenUser
    }

    if (url.pathname === '/api/client-state' && request.method === 'GET') {
      return handleClientStateGet(request, env, userId)
    }
    if (url.pathname === '/api/client-state' && request.method === 'PUT') {
      return handleClientStatePut(request, env, userId)
    }
    if (url.pathname === '/api/paper/account' && request.method === 'GET') {
      return handlePaperAccount(env, userId)
    }
    if (url.pathname === '/api/paper/history' && request.method === 'GET') {
      return handlePaperHistory(env, userId)
    }
    if (
      url.pathname === '/api/paper/account/adjust' &&
      request.method === 'POST'
    ) {
      return handlePaperAccountAdjust(request, env, userId)
    }
    if (
      url.pathname === '/api/paper/trades/enter' &&
      request.method === 'POST'
    ) {
      return handlePaperTradeEnter(request, env, userId)
    }
    if (
      url.pathname === '/api/paper/trades/exit' &&
      request.method === 'POST'
    ) {
      return handlePaperTradeExit(request, env, userId)
    }
    if (url.pathname === '/api/paper/reset' && request.method === 'POST') {
      return handlePaperReset(env, userId)
    }

    return Response.json({ error: 'Unknown API route' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
