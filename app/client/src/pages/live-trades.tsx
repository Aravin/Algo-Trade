import type {
  ExecutionMode,
  PaperAccountSummary,
  TradeRowStatus,
} from '@/lib/types'
import { useEffect, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Wallet,
  Zap,
  Info,
  Power,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAccounts } from '@/lib/accounts'
import { fetchPaperHistory } from '@/lib/paperTrading'
import { getStrategyConfig } from '@/lib/strategyConfig'
import { cn, isToday, normalizeLiveStatus } from '@/lib/utils'
import { getLotSizeForSymbol } from '@/utils/tradeUtils'

// ─── Types ────────────────────────────────────────────────────────────────────

type TradeMode = ExecutionMode

interface LiveOrder {
  order_id?: string
  status?: string
  transaction_type?: string
  quantity?: number | string
  filled_quantity?: number | string
  average_price?: number | string
  price?: number | string
  trigger_price?: number | string
  order_timestamp?: string
  exchange_timestamp?: string
  trading_symbol?: string
  tradingsymbol?: string
  instrument_token?: string
  instrument_key?: string
}

interface UpstoxFundsV3 {
  available_to_trade: {
    total: number
    cash_available_to_trade: {
      total: number
      margin_used: {
        total: number
        loss?: { total: number; realised: number; unrealised: number }
      }
    }
    pledge_available_to_trade: { margin_used: { total: number } }
  }
}

interface TradeRow {
  id: string
  symbol: string
  type: 'CE' | 'PE' | 'EQ' | 'FUT'
  side: 'BUY' | 'SELL'
  qty: number
  entryPrice: number | null
  ltp: number | null
  pnl: number | null
  pnlPct: number | null
  status: TradeRowStatus
  entryTime: string
}

interface StatCard {
  title: string
  value: string
  subValue?: string
  change?: string
  changeUp?: boolean
  icon: React.ReactNode
  iconClassName: string
}

interface Dataset {
  mode: TradeMode
  stats: StatCard[]
  openRows: TradeRow[]
  closedRows: TradeRow[]
  pnlTotal: number
  tradesTodayLabel: string
  sourceNote: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MODE_STORAGE_KEY = 'algo-trade:livetradespage-mode'

function activeModeDefault(): TradeMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY)
    if (stored === 'live' || stored === 'paper') return stored
  } catch {
    // ignore
  }
  return getStrategyConfig().executionMode
}

function fmtCurrency(value: number, signed = false) {
  const absolute = Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  if (!signed) return `₹${absolute}`
  if (value > 0) return `+₹${absolute}`
  if (value < 0) return `-₹${absolute}`
  return `₹${absolute}`
}

function fmtPct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function timeLabel(isoLike: string | null | undefined) {
  if (!isoLike) return '—'
  const d = new Date(isoLike)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function numberValue(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function inferType(symbol: string): TradeRow['type'] {
  const u = symbol.toUpperCase()
  if (u.includes(' CE')) return 'CE'
  if (u.includes(' PE')) return 'PE'
  if (u.includes(' FUT')) return 'FUT'
  return 'EQ'
}

const typeVariant: Record<
  TradeRow['type'],
  'default' | 'destructive' | 'secondary' | 'warning'
> = { CE: 'default', PE: 'destructive', EQ: 'secondary', FUT: 'warning' }

const statusVariant: Record<
  TradeRowStatus,
  'default' | 'destructive' | 'secondary' | 'success' | 'warning'
> = {
  ACTIVE: 'default',
  CLOSED: 'secondary',
  SL_HIT: 'destructive',
  TARGET_HIT: 'success',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
  REJECTED: 'destructive',
}

const statusLabel: Record<TradeRowStatus, string> = {
  ACTIVE: 'Active',
  CLOSED: 'Closed',
  SL_HIT: 'SL Hit',
  TARGET_HIT: 'Target',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
}

// ─── API calls ────────────────────────────────────────────────────────────────

async function fetchFunds(token: string): Promise<UpstoxFundsV3> {
  const res = await fetch('/api/broker/upstox/funds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const payload = (await res.json()) as {
    status?: string
    data?: UpstoxFundsV3
    errors?: { message?: string }[]
    error?: string
  }
  if (!res.ok || payload.status !== 'success' || !payload.data) {
    throw new Error(
      payload.errors?.[0]?.message ?? payload.error ?? 'Failed to load funds',
    )
  }
  return payload.data
}

async function fetchOrders(token: string): Promise<LiveOrder[]> {
  const res = await fetch('/api/order/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const payload = (await res.json()) as {
    status?: string
    data?: unknown
    error?: string
    errors?: { message?: string }[]
  }
  const rows = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : []
  if (
    !res.ok ||
    (payload.status && payload.status !== 'success' && rows.length === 0)
  ) {
    throw new Error(
      payload.errors?.[0]?.message ?? payload.error ?? 'Failed to load orders',
    )
  }
  return rows as LiveOrder[]
}

async function fetchQuotes(
  token: string,
  instrumentKeys: string,
): Promise<Record<string, { last_price?: number }>> {
  const res = await fetch('/api/market/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, instrumentKeys }),
  })
  const payload = (await res.json()) as {
    status?: string
    data?: Record<string, { last_price?: number }>
    errors?: { message?: string }[]
    error?: string
  }
  if (!res.ok || payload.status !== 'success' || !payload.data) {
    throw new Error(
      payload.errors?.[0]?.message ?? payload.error ?? 'Failed to load quotes',
    )
  }
  return payload.data
}

// ─── Dataset builders ─────────────────────────────────────────────────────────

function buildPaperDataset(
  summary: PaperAccountSummary,
  quotes?: Record<string, { last_price?: number }>,
): Dataset {
  const trades = summary.trades ?? []
  const openTrades = trades.filter((t) => t.status === 'OPEN')
  const closedTrades = trades.filter(
    (t) => t.status === 'CLOSED' && isToday(t.closed_at),
  )
  const realizedToday = closedTrades.reduce(
    (s, t) => s + (t.realized_pnl ?? 0),
    0,
  )

  let unrealizedToday = 0

  const openRows: TradeRow[] = openTrades.map((t) => {
    let tradeType = 'buying'
    try {
      const meta = JSON.parse(t.metadata_json ?? '{}') as {
        tradeType?: string
      } | null
      if (meta?.tradeType) {
        tradeType = meta.tradeType
      }
    } catch {
      // ignore
    }
    const isSelling = tradeType === 'selling'

    const quote = quotes ? quotes[t.instrument_key] : undefined
    let ltp: number | null = quote?.last_price ?? null

    if (ltp === null) {
      try {
        const rawPos = localStorage.getItem('algo-trade:bot-position')
        if (rawPos) {
          const botPos = JSON.parse(rawPos) as {
            instrumentKey?: string
            currentPrice?: number
            legs?: { instrumentKey?: string; currentPrice?: number }[]
          }
          if (botPos.legs?.length) {
            const legMatch = botPos.legs.find(
              (l) => l.instrumentKey === t.instrument_key,
            )
            if (legMatch?.currentPrice) ltp = legMatch.currentPrice
          }
          if (ltp === null && botPos.currentPrice) {
            ltp = botPos.currentPrice
          }
        }
      } catch {
        // ignore
      }
    }

    if (ltp === null && t.entry_price > 0) {
      ltp = t.entry_price
    }

    let pnl: number | null = null
    let pnlPct: number | null = null

    if (ltp !== null) {
      pnl = isSelling
        ? (t.entry_price - ltp) * t.quantity
        : (ltp - t.entry_price) * t.quantity
      pnlPct = t.entry_value > 0 ? (pnl / t.entry_value) * 100 : 0
      unrealizedToday += pnl
    }

    const tradeRowType: TradeRow['type'] =
      t.direction === 'CE' || t.direction === 'PE'
        ? t.direction
        : inferType(t.instrument_key)

    return {
      id: t.id,
      symbol: t.instrument_key,
      type: tradeRowType,
      side: isSelling ? 'SELL' : 'BUY',
      qty: t.quantity,
      entryPrice: t.entry_price,
      ltp,
      pnl,
      pnlPct,
      status: 'ACTIVE',
      entryTime: timeLabel(t.opened_at),
    }
  })

  const committedCapital = openTrades.reduce((s, t) => s + t.entry_value, 0)
  const portfolioValue =
    summary.account.balance + committedCapital + unrealizedToday
  const totalPaperPnl = realizedToday + unrealizedToday

  const wins = closedTrades.filter((t) => (t.realized_pnl ?? 0) > 0).length
  const losses = closedTrades.filter((t) => (t.realized_pnl ?? 0) < 0).length
  const winRate =
    closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0
  const openDirections = openTrades.reduce<Record<string, number>>((acc, t) => {
    acc[t.direction] = (acc[t.direction] ?? 0) + 1
    return acc
  }, {})

  const closedRows: TradeRow[] = closedTrades.map((t) => {
    const pnl = t.realized_pnl ?? 0
    const pnlPct = t.entry_value > 0 ? (pnl / t.entry_value) * 100 : 0
    return {
      id: t.id,
      symbol: t.instrument_key,
      type: inferType(t.instrument_key),
      side: 'BUY',
      qty: t.quantity,
      entryPrice: t.entry_price,
      ltp: t.exit_price,
      pnl,
      pnlPct,
      status: pnl > 0 ? 'TARGET_HIT' : pnl < 0 ? 'SL_HIT' : 'CLOSED',
      entryTime: timeLabel(t.closed_at ?? t.opened_at),
    }
  })

  return {
    mode: 'paper',
    stats: [
      {
        title: 'Portfolio Value',
        value: fmtCurrency(portfolioValue),
        subValue: `Available: ${fmtCurrency(summary.account.balance)}`,
        change:
          committedCapital > 0
            ? `Committed: ${fmtCurrency(committedCapital)}`
            : 'No open capital committed',
        changeUp: true,
        icon: <Wallet size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
      {
        title: 'Day P&L',
        value: fmtCurrency(totalPaperPnl, true),
        subValue: `Realised: ${fmtCurrency(realizedToday, true)}`,
        change:
          portfolioValue > 0
            ? `${fmtPct((totalPaperPnl / portfolioValue) * 100)} of portfolio`
            : '',
        changeUp: totalPaperPnl >= 0,
        icon: <TrendingUp size={18} />,
        iconClassName:
          totalPaperPnl >= 0
            ? 'text-success bg-success/15'
            : 'text-destructive bg-destructive/15',
      },
      {
        title: 'Open Positions',
        value: String(openTrades.length),
        subValue:
          committedCapital > 0
            ? `At cost: ${fmtCurrency(committedCapital)}`
            : 'No open paper trades',
        change:
          Object.entries(openDirections).length > 0
            ? Object.entries(openDirections)
                .map(([d, c]) => `${c} ${d}`)
                .join(' · ')
            : 'Waiting for paper entries',
        changeUp: true,
        icon: <Zap size={18} />,
        iconClassName: 'text-warning bg-warning/15',
      },
      {
        title: 'Win Rate',
        value: closedTrades.length > 0 ? `${winRate.toFixed(1)}%` : '—',
        subValue: `${closedTrades.length} closed today`,
        change: closedTrades.length > 0 ? `${wins}W · ${losses}L` : '',
        changeUp: winRate >= 50,
        icon: <BarChart2 size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
    ],
    openRows,
    closedRows,
    pnlTotal: totalPaperPnl,
    tradesTodayLabel: `${openTrades.length + closedTrades.length} paper trades`,
    sourceNote: quotes
      ? 'Paper mode uses D1-backed simulated account. Marked-to-market using live quotes.'
      : 'Paper mode uses D1-backed simulated account. LTP is not marked-to-market.',
  }
}

function buildLiveDataset(funds: UpstoxFundsV3, orders: LiveOrder[]): Dataset {
  const cash = funds.available_to_trade.cash_available_to_trade
  const pledge = funds.available_to_trade.pledge_available_to_trade
  const losses = cash.margin_used.loss
  const realised = losses?.realised ?? 0
  const unrealised = losses?.unrealised ?? 0
  const totalPnl = losses?.total ?? realised + unrealised
  const portfolioValue =
    funds.available_to_trade.total +
    cash.margin_used.total +
    pledge.margin_used.total

  const todayOrders = orders.filter((o) =>
    isToday(o.exchange_timestamp ?? o.order_timestamp),
  )
  const openRows: TradeRow[] = todayOrders
    .filter((o) => normalizeLiveStatus(o.status) === 'ACTIVE')
    .map((o) => {
      const symbol =
        o.trading_symbol ??
        o.tradingsymbol ??
        o.instrument_key ??
        o.instrument_token ??
        'Unknown'
      const entryPrice =
        numberValue(o.average_price) ??
        numberValue(o.price) ??
        numberValue(o.trigger_price)
      const qty = numberValue(o.filled_quantity) ?? numberValue(o.quantity) ?? 0
      return {
        id: o.order_id ?? symbol,
        symbol,
        type: inferType(symbol),
        side:
          String(o.transaction_type ?? '').toUpperCase() === 'SELL'
            ? 'SELL'
            : 'BUY',
        qty,
        entryPrice,
        ltp: entryPrice,
        pnl: null,
        pnlPct: null,
        status: 'ACTIVE',
        entryTime: timeLabel(o.exchange_timestamp ?? o.order_timestamp),
      } satisfies TradeRow
    })

  const closedRows: TradeRow[] = todayOrders
    .filter((o) => normalizeLiveStatus(o.status) !== 'ACTIVE')
    .map((o) => {
      const symbol =
        o.trading_symbol ??
        o.tradingsymbol ??
        o.instrument_key ??
        o.instrument_token ??
        'Unknown'
      const entryPrice =
        numberValue(o.average_price) ??
        numberValue(o.price) ??
        numberValue(o.trigger_price)
      const qty = numberValue(o.filled_quantity) ?? numberValue(o.quantity) ?? 0
      const status = normalizeLiveStatus(o.status)
      return {
        id: o.order_id ?? symbol,
        symbol,
        type: inferType(symbol),
        side:
          String(o.transaction_type ?? '').toUpperCase() === 'SELL'
            ? 'SELL'
            : 'BUY',
        qty,
        entryPrice,
        ltp: entryPrice,
        pnl: null,
        pnlPct: null,
        status,
        entryTime: timeLabel(o.exchange_timestamp ?? o.order_timestamp),
      } satisfies TradeRow
    })

  const completed = closedRows.filter((r) => r.status === 'COMPLETED').length
  const failed = closedRows.filter(
    (r) => r.status === 'CANCELLED' || r.status === 'REJECTED',
  ).length
  const successRate =
    closedRows.length > 0 ? (completed / closedRows.length) * 100 : 0
  const openTypeBreakdown = openRows.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1
      return acc
    },
    {},
  )

  return {
    mode: 'live',
    stats: [
      {
        title: 'Portfolio Value',
        value: fmtCurrency(portfolioValue),
        subValue: `Available: ${fmtCurrency(funds.available_to_trade.total)}`,
        change: `Cash margin used: ${fmtCurrency(cash.margin_used.total)}`,
        changeUp: true,
        icon: <Wallet size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
      {
        title: 'Day P&L',
        value: fmtCurrency(totalPnl, true),
        subValue: `Realised: ${fmtCurrency(realised, true)}`,
        change: `${fmtCurrency(unrealised, true)} unrealised`,
        changeUp: totalPnl >= 0,
        icon: <TrendingUp size={18} />,
        iconClassName:
          totalPnl >= 0
            ? 'text-success bg-success/15'
            : 'text-destructive bg-destructive/15',
      },
      {
        title: 'Open Orders',
        value: String(openRows.length),
        subValue:
          openRows.length > 0
            ? `${openRows.reduce((s, r) => s + r.qty, 0)} qty active today`
            : 'No open live orders',
        change:
          Object.entries(openTypeBreakdown).length > 0
            ? Object.entries(openTypeBreakdown)
                .map(([t, c]) => `${c} ${t}`)
                .join(' · ')
            : '',
        changeUp: true,
        icon: <Zap size={18} />,
        iconClassName: 'text-warning bg-warning/15',
      },
      {
        title: 'Order Success',
        value: closedRows.length > 0 ? `${successRate.toFixed(1)}%` : '—',
        subValue: `${todayOrders.length} live orders today`,
        change: `${completed} completed · ${failed} failed`,
        changeUp: successRate >= 50,
        icon: <ShieldAlert size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
    ],
    openRows,
    closedRows,
    pnlTotal: totalPnl,
    tradesTodayLabel: `${todayOrders.length} live orders`,
    sourceNote:
      'Live mode uses Upstox funds and order book. P&L from broker margin data.',
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCards({ stats }: { stats: StatCard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="relative overflow-hidden">
          <CardHeader>
            <CardTitle>{stat.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p
                  className={cn(
                    'text-2xl font-bold tracking-tight',
                    stat.title === 'Day P&L'
                      ? stat.changeUp
                        ? 'text-success'
                        : 'text-destructive'
                      : 'text-foreground',
                  )}
                >
                  {stat.value}
                </p>
                {stat.subValue && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.subValue}
                  </p>
                )}
                {stat.change && (
                  <div
                    className={cn(
                      'flex items-center gap-0.5 mt-2 text-xs font-medium',
                      stat.changeUp ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {stat.changeUp ? (
                      <ArrowUpRight size={12} />
                    ) : (
                      <ArrowDownRight size={12} />
                    )}
                    {stat.change}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
                  stat.iconClassName,
                )}
              >
                {stat.icon}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TradesTable({ rows }: { rows: TradeRow[] }) {
  if (rows.length === 0) return null
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Entry</TableHead>
          <TableHead className="text-right">LTP</TableHead>
          <TableHead className="text-right">P&amp;L</TableHead>
          <TableHead className="text-right">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <p className="font-medium text-sm">{row.symbol}</p>
              <p className="text-xs text-muted-foreground">
                {row.side} · {row.entryTime}
              </p>
            </TableCell>
            <TableCell>
              <Badge variant={typeVariant[row.type]}>{row.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              <div>
                <span>{row.qty}</span>
                {(() => {
                  const lotSize = getLotSizeForSymbol(row.symbol)
                  if (lotSize > 1 && row.type !== 'EQ') {
                    const lots = Math.round(row.qty / lotSize)
                    return (
                      <span className="text-[10px] text-muted-foreground ml-1.5 font-normal">
                        ({lots} {lots > 1 ? 'lots' : 'lot'})
                      </span>
                    )
                  }
                  return null
                })()}
              </div>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.entryPrice === null ? '—' : fmtCurrency(row.entryPrice)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.ltp === null ? '—' : fmtCurrency(row.ltp)}
            </TableCell>
            <TableCell className="text-right">
              {row.pnl === null ? (
                <span className="text-xs text-muted-foreground">
                  {row.status === 'ACTIVE' ? 'MTM pending' : '—'}
                </span>
              ) : (
                <div>
                  <p
                    className={cn(
                      'font-mono text-sm font-medium',
                      row.pnl >= 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {fmtCurrency(row.pnl, true)}
                  </p>
                  {row.pnlPct !== null && (
                    <p
                      className={cn(
                        'text-xs',
                        row.pnl >= 0
                          ? 'text-success/70'
                          : 'text-destructive/70',
                      )}
                    >
                      {fmtPct(row.pnlPct)}
                    </p>
                  )}
                </div>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Badge variant={statusVariant[row.status]}>
                {statusLabel[row.status]}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function TradesPanel({ dataset }: { dataset: Dataset }) {
  const label = dataset.mode === 'paper' ? 'paper trades' : 'live orders'
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {dataset.mode === 'paper' ? 'Paper Trades' : 'Live Orders'}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {dataset.tradesTodayLabel} today
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-0">
        <Tabs defaultValue="open">
          <div className="px-5 mb-2">
            <TabsList>
              <TabsTrigger value="open">
                Open
                <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-xs text-primary">
                  {dataset.openRows.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="closed">
                Closed
                <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                  {dataset.closedRows.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="open" className="mt-0">
            {dataset.openRows.length > 0 ? (
              <TradesTable rows={dataset.openRows} />
            ) : (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                No open {label} right now.
              </p>
            )}
          </TabsContent>
          <TabsContent value="closed" className="mt-0">
            {dataset.closedRows.length > 0 ? (
              <TradesTable rows={dataset.closedRows} />
            ) : (
              <p className="px-5 pb-5 text-sm text-muted-foreground">
                No closed {label} today.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LiveTradesPage() {
  const [mode, setMode] = useState<TradeMode>(activeModeDefault)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = getAccounts().find((a) => a.accessToken)?.accessToken ?? null

  const [botState, setBotState] = useState<string | null>(() =>
    localStorage.getItem('algo-trade:bot-state'),
  )
  const [activeConfigMode, setActiveConfigMode] = useState<TradeMode>(
    () => getStrategyConfig().executionMode,
  )

  useEffect(() => {
    const handleStorage = () => {
      setBotState(localStorage.getItem('algo-trade:bot-state'))
      setActiveConfigMode(getStrategyConfig().executionMode)
    }
    window.addEventListener('storage', handleStorage)
    const interval = setInterval(handleStorage, 2000)
    return () => {
      window.removeEventListener('storage', handleStorage)
      clearInterval(interval)
    }
  }, [])

  async function load(m: TradeMode) {
    setLoading(true)
    setError(null)
    try {
      if (m === 'paper') {
        const summary = await fetchPaperHistory()
        const openTrades = (summary.trades ?? []).filter(
          (t) => t.status === 'OPEN',
        )
        let quotes: Record<string, { last_price?: number }> | undefined
        if (openTrades.length > 0 && token) {
          const keys = Array.from(
            new Set(openTrades.map((t) => t.instrument_key)),
          ).join(',')
          try {
            quotes = await fetchQuotes(token, keys)
          } catch (e) {
            console.error('Failed to fetch quotes for open paper trades:', e)
          }
        }
        setDataset(buildPaperDataset(summary, quotes))
      } else {
        // Guard 1: no broker token
        if (!token)
          throw new Error('No active broker token — connect Upstox first.')
        const [funds, orders] = await Promise.all([
          fetchFunds(token),
          fetchOrders(token),
        ])
        setDataset(buildLiveDataset(funds, orders))
      }
    } catch (err) {
      setError((err as Error).message)
      setDataset(null)
    } finally {
      setLoading(false)
    }
  }

  function switchMode(m: TradeMode) {
    setMode(m)
    try {
      localStorage.setItem(MODE_STORAGE_KEY, m)
    } catch {
      // ignore
    }
    void load(m)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(mode)
    const interval = setInterval(() => {
      void load(mode)
    }, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return (
    <div className="flex flex-col gap-5 p-6 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Live Trades
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Today's open positions and executed orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            <button
              className={cn(
                'px-3 py-1.5 transition-colors',
                mode === 'paper'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50',
              )}
              onClick={() => switchMode('paper')}
            >
              Paper
            </button>
            <button
              className={cn(
                'px-3 py-1.5 transition-colors',
                mode === 'live'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50',
              )}
              onClick={() => switchMode('live')}
            >
              Live
            </button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load(mode)}
            disabled={loading}
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Bot Status Banner */}
      {botState === 'RUNNING' || botState === 'ORDERED' ? (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 flex items-center justify-between gap-3 text-sm text-foreground max-w-full">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-primary animate-pulse" />
            <span>
              Strategy engine is actively running in{' '}
              <span className="font-semibold uppercase">
                {activeConfigMode}
              </span>{' '}
              mode.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => (window.location.href = '/?page=strategies')}
          >
            Manage Strategy
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 flex items-center justify-between gap-3 text-sm text-foreground max-w-full">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-warning" />
            <span>
              Automated trading is currently stopped. No live or paper trades
              are being executed.
            </span>
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-8 bg-warning hover:bg-warning/90 text-warning-foreground"
            onClick={() => (window.location.href = '/?page=strategies')}
          >
            <Power size={14} className="mr-1.5" />
            Start Strategies
          </Button>
        </div>
      )}

      {/* No token warning (live only) */}
      {mode === 'live' && !token && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-2xl">
          No active broker token. Connect an Upstox account from the Brokers
          page first.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-2xl">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !dataset && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 w-28 rounded bg-muted" />
              </CardHeader>
              <CardContent>
                <div className="h-7 w-24 rounded bg-muted mb-2" />
                <div className="h-3 w-36 rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Data */}
      {dataset && (
        <>
          <StatCards stats={dataset.stats} />

          {/* Day P&L summary bar */}
          <div
            className={cn(
              'rounded-md border px-4 py-3 flex items-center justify-between gap-4 text-sm',
              dataset.pnlTotal >= 0
                ? 'border-success/30 bg-success/5'
                : 'border-destructive/30 bg-destructive/5',
            )}
          >
            <div className="flex items-center gap-2">
              {dataset.pnlTotal >= 0 ? (
                <ArrowUpRight size={16} className="text-success" />
              ) : (
                <ArrowDownRight size={16} className="text-destructive" />
              )}
              <span
                className={cn(
                  'font-semibold',
                  dataset.pnlTotal >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {fmtCurrency(dataset.pnlTotal, true)}
              </span>
              <span className="text-muted-foreground">realized today</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {dataset.sourceNote}
            </span>
          </div>

          <TradesPanel dataset={dataset} />
        </>
      )}
    </div>
  )
}
