export type ExecutionMode = 'live' | 'paper'

export interface PaperAccount {
  id: string
  mode: string
  balance: number
  currency: string
  updated_at: string
}

export interface PaperStatementEntry {
  id: string
  entry_type: string
  amount: number
  balance_before: number
  balance_after: number
  note: string | null
  metadata_json: string | null
  created_at: string
}

export interface PaperTrade {
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

export interface PaperAccountSummary {
  account: PaperAccount
  recentEntries: PaperStatementEntry[]
  openTradeCount: number
  trades?: PaperTrade[]
}

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T | { error?: string }
  if (!res.ok) {
    const err =
      data && typeof data === 'object' && 'error' in data
        ? data.error
        : `HTTP ${res.status}`
    throw new Error(err ?? `HTTP ${res.status}`)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(data.error)
  }
  return data as T
}

export async function fetchPaperAccount(): Promise<PaperAccountSummary> {
  const res = await fetch('/api/paper/account')
  return parseJson<PaperAccountSummary>(res)
}

export async function fetchPaperHistory(): Promise<PaperAccountSummary> {
  const res = await fetch('/api/paper/history')
  return parseJson<PaperAccountSummary>(res)
}

export async function adjustPaperAccount(input: {
  amount: number
  mode?: 'set' | 'adjust'
  note?: string
}): Promise<PaperAccountSummary> {
  const res = await fetch('/api/paper/account/adjust', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson<PaperAccountSummary>(res)
}

export async function resetPaperAccount(): Promise<PaperAccountSummary> {
  const res = await fetch('/api/paper/reset', {
    method: 'POST',
  })
  return parseJson<PaperAccountSummary>(res)
}
