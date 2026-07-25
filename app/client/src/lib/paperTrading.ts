import type { PaperAccountSummary } from './types'
import {
  API_PAPER_ACCOUNT,
  API_PAPER_HISTORY,
  API_PAPER_ACCOUNT_ADJUST,
  API_PAPER_RESET,
} from './constants'

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
  const res = await fetch(API_PAPER_ACCOUNT)
  return parseJson<PaperAccountSummary>(res)
}

export async function fetchPaperHistory(): Promise<PaperAccountSummary> {
  const res = await fetch(API_PAPER_HISTORY)
  return parseJson<PaperAccountSummary>(res)
}

export async function adjustPaperAccount(input: {
  amount: number
  mode?: 'set' | 'adjust'
  note?: string
}): Promise<PaperAccountSummary> {
  const res = await fetch(API_PAPER_ACCOUNT_ADJUST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJson<PaperAccountSummary>(res)
}

export async function resetPaperAccount(): Promise<PaperAccountSummary> {
  const res = await fetch(API_PAPER_RESET, {
    method: 'POST',
  })
  return parseJson<PaperAccountSummary>(res)
}
