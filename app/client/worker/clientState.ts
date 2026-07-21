import type { Env } from './types'
import { nowIso } from './utils'

export async function ensureClientStateTable(env: Env): Promise<void> {
  await env.PAPER_TRADING_DB.prepare(
    'CREATE TABLE IF NOT EXISTS client_state (user_id TEXT NOT NULL, state_key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, state_key))',
  ).run()
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

export async function writeClientState(
  env: Env,
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
    return Response.json(
      { error: `Failed to load client state: ${String(error)}` },
      { status: 500 },
    )
  }
}

export async function handleClientStatePut(
  request: Request,
  env: Env,
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
