import type {
  ActivePosition,
  PaperAccountSummary,
  PaperTrade,
  UnderlyingSymbol,
} from './types'
import { getLotSizeForSymbol } from './syntheticCalculators'
import {
  API_PAPER_ACCOUNT,
  API_PAPER_HISTORY,
  API_PAPER_ACCOUNT_ADJUST,
  API_PAPER_RESET,
} from './constants'

export function getIndiaDateString(date = new Date()): string {
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

export function paperTradeToActivePosition(
  trade: PaperTrade,
  currentIndiaDate: string,
): { symbol: UnderlyingSymbol; position: ActivePosition } | null {
  if (
    trade.status !== 'OPEN' ||
    (trade.direction !== 'CE' && trade.direction !== 'PE')
  ) {
    return null
  }
  const direction: 'CE' | 'PE' = trade.direction

  let metadata: {
    underlyingSymbol?: string
    expiry?: string
    lotSize?: number
    tradeType?: 'buying' | 'selling'
  } = {}
  try {
    metadata = trade.metadata_json
      ? (JSON.parse(trade.metadata_json) as typeof metadata)
      : {}
  } catch {
    return null
  }

  const symbol = metadata.underlyingSymbol
  if (
    symbol !== 'NIFTY 50' &&
    symbol !== 'BANKNIFTY' &&
    symbol !== 'FINNIFTY'
  ) {
    return null
  }
  if (metadata.expiry && metadata.expiry < currentIndiaDate) return null

  const lotSize =
    typeof metadata.lotSize === 'number' && metadata.lotSize > 0
      ? metadata.lotSize
      : getLotSizeForSymbol(trade.instrument_key)
  const tradeType = metadata.tradeType ?? 'buying'
  const leg = {
    instrumentKey: trade.instrument_key,
    direction,
    entryPrice: trade.entry_price,
    currentPrice: trade.entry_price,
    unrealizedPnl: 0,
    quantity: trade.quantity,
    lotSize,
    tradeType,
    paperTradeId: trade.id,
    status: 'OPEN' as const,
  }

  return {
    symbol,
    position: {
      instrumentKey: trade.instrument_key,
      direction,
      entryPrice: trade.entry_price,
      currentPrice: trade.entry_price,
      unrealizedPnl: 0,
      quantity: trade.quantity,
      lotSize,
      entryTime: trade.opened_at,
      tradeId: Date.parse(trade.opened_at) || Date.now(),
      executionMode: 'paper',
      tradeType,
      paperTradeId: trade.id,
      legs: [leg],
      underlyingSymbol: symbol,
    },
  }
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
