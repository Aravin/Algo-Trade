import type { Env } from './types'
import { nowIso } from './utils'

let _tableEnsured = false

export async function ensureClientStateTable(env: Env): Promise<void> {
  if (_tableEnsured) return
  await env.PAPER_TRADING_DB.prepare(
    'CREATE TABLE IF NOT EXISTS client_state (user_id TEXT NOT NULL, state_key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, state_key))',
  ).run()
  _tableEnsured = true
}

export async function readClientState<T>(
  env: Env,
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

const MAX_KEY_LENGTH = 128
const MAX_VALUE_BYTES = 1024 * 50
const KEY_PATTERN = /^[a-zA-Z0-9_\-./]+$/

export async function writeClientState(
  env: Env,
  userId: string,
  key: string,
  value: unknown,
): Promise<void> {
  if (!key || key.length > MAX_KEY_LENGTH) {
    throw new Error(
      `State key must be between 1 and ${MAX_KEY_LENGTH} characters`,
    )
  }
  if (!KEY_PATTERN.test(key)) {
    throw new Error('State key contains invalid characters')
  }
  await ensureClientStateTable(env)
  const valueJson = JSON.stringify(value)
  if (new TextEncoder().encode(valueJson).length > MAX_VALUE_BYTES) {
    throw new Error(
      `State value exceeds maximum size of ${MAX_VALUE_BYTES} bytes`,
    )
  }
  await env.PAPER_TRADING_DB.prepare(
    `
      INSERT INTO client_state (user_id, state_key, value_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, state_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
  )
    .bind(userId, key, valueJson, nowIso())
    .run()
}

export async function handleClientStateGet(
  request: Request,
  env: Env,
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
    console.error('Failed to load client state:', error)
    return Response.json(
      { error: 'Failed to load client state' },
      { status: 500 },
    )
  }
}

export async function handleClientStatePut(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const rawBody = await request.json().catch(() => null)
  if (typeof rawBody !== 'object' || rawBody === null) {
    return Response.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    )
  }
  const body = rawBody as { key?: string; value?: unknown }
  const key = typeof body.key === 'string' ? body.key.trim() : ''

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
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Failed to save client state:', error)
    return Response.json({ error: msg }, { status: 400 })
  }
}
