import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Link2Off,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Wallet,
  Zap,
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
import {
  fetchPaperHistory,
  type ExecutionMode,
  type PaperAccountSummary,
} from '@/lib/paperTrading'
import { getStrategyConfig } from '@/lib/strategyConfig'
import { cn } from '@/lib/utils'

type OverviewMode = ExecutionMode
type TradeRowStatus =
  | 'ACTIVE'
  | 'CLOSED'
  | 'SL_HIT'
  | 'TARGET_HIT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'

interface UpstoxFundsV3 {
  available_to_trade: {
    total: number
    cash_available_to_trade: {
      total: number
      margin_used: {
        total: number
        loss?: {
          total: number
          realised: number
          unrealised: number
        }
      }
    }
    pledge_available_to_trade: {
      margin_used: {
        total: number
      }
    }
  }
  unavailable_to_trade?: {
    cash_unavailable_to_trade?: {
      unsettled_profit?: {
        todays_profit: number
        previous_days: number
      }
    }
  }
}

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

interface OverviewStat {
  title: string
  value: string
  subValue?: string
  change?: string
  changeUp?: boolean
  icon: React.ReactNode
  iconClassName: string
}

interface OverviewTradeRow {
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

interface PnlPoint {
  time: string
  pnl: number
}

interface OverviewDataset {
  mode: OverviewMode
  stats: OverviewStat[]
  openRows: OverviewTradeRow[]
  closedRows: OverviewTradeRow[]
  pnlPoints: PnlPoint[]
  pnlTotal: number
  tradesTodayLabel: string
  sourceNote: string
}

const MODE_STORAGE_KEY = 'algo-trade:overview-mode'

const typeVariant: Record<
  OverviewTradeRow['type'],
  'default' | 'destructive' | 'secondary' | 'warning'
> = {
  CE: 'default',
  PE: 'destructive',
  EQ: 'secondary',
  FUT: 'warning',
}

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

function fmtCompactCurrency(value: number) {
  return value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 2,
  })
}

function fmtPct(value: number) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(2)}%`
}

function isToday(isoLike: string | null | undefined) {
  if (!isoLike) return false
  const today = new Date().toISOString().slice(0, 10)
  return isoLike.slice(0, 10) === today
}

function timeLabel(isoLike: string | null | undefined) {
  if (!isoLike) return '—'
  const date = new Date(isoLike)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function inferTradeType(symbol: string): OverviewTradeRow['type'] {
  const upper = symbol.toUpperCase()
  if (upper.includes(' CE')) return 'CE'
  if (upper.includes(' PE')) return 'PE'
  if (upper.includes(' FUT')) return 'FUT'
  return 'EQ'
}

function activeModeDefault(): OverviewMode {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY)
    if (stored === 'live' || stored === 'paper') return stored
  } catch {
    // Ignore storage failures and fall back to config.
  }

  return getStrategyConfig().executionMode
}

async function fetchUpstoxFunds(token: string): Promise<UpstoxFundsV3> {
  const response = await fetch('/api/broker/upstox/funds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const payload = (await response.json()) as {
    status?: string
    data?: UpstoxFundsV3
    errors?: { message?: string }[]
    error?: string
  }
  if (!response.ok || payload.status !== 'success' || !payload.data) {
    throw new Error(
      payload.errors?.[0]?.message ??
        payload.error ??
        'Failed to load live funds',
    )
  }
  return payload.data
}

async function fetchUpstoxOrders(token: string): Promise<LiveOrder[]> {
  const response = await fetch('/api/order/list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const payload = (await response.json()) as {
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
    !response.ok ||
    (payload.status && payload.status !== 'success' && rows.length === 0)
  ) {
    throw new Error(
      payload.errors?.[0]?.message ??
        payload.error ??
        'Failed to load live orders',
    )
  }

  return rows as LiveOrder[]
}

function buildPaperDataset(summary: PaperAccountSummary): OverviewDataset {
  const trades = summary.trades ?? []
  const openTrades = trades.filter((trade) => trade.status === 'OPEN')
  const closedTrades = trades.filter((trade) => trade.status === 'CLOSED')
  const todayClosedTrades = closedTrades.filter((trade) =>
    isToday(trade.closed_at),
  )
  const realizedToday = todayClosedTrades.reduce(
    (sum, trade) => sum + (trade.realized_pnl ?? 0),
    0,
  )
  const committedCapital = openTrades.reduce(
    (sum, trade) => sum + trade.entry_value,
    0,
  )
  const portfolioValue = summary.account.balance + committedCapital
  const closedWins = todayClosedTrades.filter(
    (trade) => (trade.realized_pnl ?? 0) > 0,
  ).length
  const closedLosses = todayClosedTrades.filter(
    (trade) => (trade.realized_pnl ?? 0) < 0,
  ).length
  const winRate =
    todayClosedTrades.length > 0
      ? (closedWins / todayClosedTrades.length) * 100
      : 0
  const openDirections = openTrades.reduce<Record<string, number>>(
    (counts, trade) => {
      counts[trade.direction] = (counts[trade.direction] ?? 0) + 1
      return counts
    },
    {},
  )

  const openRows: OverviewTradeRow[] = openTrades.map((trade) => ({
    id: trade.id,
    symbol: trade.instrument_key,
    type: inferTradeType(trade.instrument_key),
    side: trade.direction === 'PE' ? 'BUY' : 'BUY',
    qty: trade.quantity,
    entryPrice: trade.entry_price,
    ltp: null,
    pnl: null,
    pnlPct: null,
    status: 'ACTIVE',
    entryTime: timeLabel(trade.opened_at),
  }))

  const closedRows: OverviewTradeRow[] = todayClosedTrades.map((trade) => {
    const pnl = trade.realized_pnl ?? 0
    const pnlPct = trade.entry_value > 0 ? (pnl / trade.entry_value) * 100 : 0
    return {
      id: trade.id,
      symbol: trade.instrument_key,
      type: inferTradeType(trade.instrument_key),
      side: trade.direction === 'PE' ? 'BUY' : 'BUY',
      qty: trade.quantity,
      entryPrice: trade.entry_price,
      ltp: trade.exit_price,
      pnl,
      pnlPct,
      status: pnl > 0 ? 'TARGET_HIT' : pnl < 0 ? 'SL_HIT' : 'CLOSED',
      entryTime: timeLabel(trade.closed_at ?? trade.opened_at),
    }
  })

  const intradayEntries = summary.recentEntries
    .filter((entry) => isToday(entry.created_at))
    .sort((left, right) => left.created_at.localeCompare(right.created_at))

  let runningPnl = 0
  const pnlPoints: PnlPoint[] = intradayEntries.length
    ? intradayEntries.map((entry) => {
        runningPnl += entry.amount
        return { time: timeLabel(entry.created_at), pnl: runningPnl }
      })
    : [{ time: timeLabel(new Date().toISOString()), pnl: realizedToday }]

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
        changeUp: committedCapital >= 0,
        icon: <Wallet size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
      {
        title: 'Day P&L',
        value: fmtCurrency(realizedToday, true),
        subValue: `Realised: ${fmtCurrency(realizedToday, true)}`,
        change:
          portfolioValue > 0
            ? `${fmtPct((realizedToday / portfolioValue) * 100)} of portfolio`
            : 'No portfolio value yet',
        changeUp: realizedToday >= 0,
        icon: <TrendingUp size={18} />,
        iconClassName:
          realizedToday >= 0
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
                .map(([direction, count]) => `${count} ${direction}`)
                .join(' · ')
            : 'Waiting for paper entries',
        changeUp: true,
        icon: <Zap size={18} />,
        iconClassName: 'text-warning bg-warning/15',
      },
      {
        title: 'Win Rate',
        value: todayClosedTrades.length > 0 ? `${winRate.toFixed(1)}%` : '—',
        subValue: `${todayClosedTrades.length} closed paper trades today`,
        change:
          todayClosedTrades.length > 0
            ? `${closedWins}W · ${closedLosses}L`
            : 'No paper exits today',
        changeUp: winRate >= 50,
        icon: <BarChart2 size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
    ],
    openRows,
    closedRows,
    pnlPoints,
    pnlTotal: realizedToday,
    tradesTodayLabel: `${openTrades.length + todayClosedTrades.length} paper trades`,
    sourceNote:
      'Paper overview uses D1-backed simulated account and trade history.',
  }
}

function normalizeLiveStatus(status: string | undefined): TradeRowStatus {
  const upper = String(status ?? '').toUpperCase()
  if (upper.includes('REJECT')) return 'REJECTED'
  if (upper.includes('CANCEL')) return 'CANCELLED'
  if (upper.includes('COMPLETE')) return 'COMPLETED'
  return 'ACTIVE'
}

function isLiveOpenStatus(status: string | undefined) {
  return normalizeLiveStatus(status) === 'ACTIVE'
}

function buildLiveTradeRow(order: LiveOrder): OverviewTradeRow {
  const symbol =
    order.trading_symbol ??
    order.tradingsymbol ??
    order.instrument_key ??
    order.instrument_token ??
    'Unknown'
  const entryPrice =
    numberValue(order.average_price) ??
    numberValue(order.price) ??
    numberValue(order.trigger_price)
  const qty =
    numberValue(order.filled_quantity) ?? numberValue(order.quantity) ?? 0
  const status = normalizeLiveStatus(order.status)
  return {
    id: order.order_id ?? `${symbol}-${order.order_timestamp ?? ''}`,
    symbol,
    type: inferTradeType(symbol),
    side:
      String(order.transaction_type).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    qty,
    entryPrice,
    ltp: entryPrice,
    pnl: null,
    pnlPct: null,
    status,
    entryTime: timeLabel(order.exchange_timestamp ?? order.order_timestamp),
  }
}

function buildLivePnlPoints(totalPnl: number, orders: LiveOrder[]): PnlPoint[] {
  const todayOrders = orders
    .filter((order) =>
      isToday(order.exchange_timestamp ?? order.order_timestamp),
    )
    .sort((left, right) =>
      String(
        left.exchange_timestamp ?? left.order_timestamp ?? '',
      ).localeCompare(
        String(right.exchange_timestamp ?? right.order_timestamp ?? ''),
      ),
    )

  if (todayOrders.length === 0) {
    return [
      { time: '09:15', pnl: 0 },
      { time: timeLabel(new Date().toISOString()), pnl: totalPnl },
    ]
  }

  return todayOrders.map((order, index) => ({
    time: timeLabel(order.exchange_timestamp ?? order.order_timestamp),
    pnl: Number((((index + 1) / todayOrders.length) * totalPnl).toFixed(2)),
  }))
}

function buildLiveDataset(
  funds: UpstoxFundsV3,
  orders: LiveOrder[],
): OverviewDataset {
  const cash = funds.available_to_trade.cash_available_to_trade
  const pledge = funds.available_to_trade.pledge_available_to_trade
  const losses = cash.margin_used.loss
  const realised = losses?.realised ?? 0
  const unrealised = losses?.unrealised ?? 0
  const totalPnl = losses?.total ?? realised + unrealised
  const todayOrders = orders.filter((order) =>
    isToday(order.exchange_timestamp ?? order.order_timestamp),
  )
  const openRows = todayOrders
    .filter((order) => isLiveOpenStatus(order.status))
    .map(buildLiveTradeRow)
  const closedRows = todayOrders
    .filter((order) => !isLiveOpenStatus(order.status))
    .map(buildLiveTradeRow)
  const completedCount = closedRows.filter(
    (row) => row.status === 'COMPLETED',
  ).length
  const failedCount = closedRows.filter(
    (row) => row.status === 'CANCELLED' || row.status === 'REJECTED',
  ).length
  const openTypeBreakdown = openRows.reduce<Record<string, number>>(
    (counts, row) => {
      counts[row.type] = (counts[row.type] ?? 0) + 1
      return counts
    },
    {},
  )
  const orderSuccessRate =
    closedRows.length > 0 ? (completedCount / closedRows.length) * 100 : 0
  const portfolioValue =
    funds.available_to_trade.total +
    cash.margin_used.total +
    pledge.margin_used.total

  return {
    mode: 'live',
    stats: [
      {
        title: 'Portfolio Value',
        value: fmtCurrency(portfolioValue),
        subValue: `Available: ${fmtCurrency(funds.available_to_trade.total)}`,
        change:
          pledge.margin_used.total > 0
            ? `Margin in use: ${fmtCurrency(cash.margin_used.total + pledge.margin_used.total)}`
            : `Cash margin used: ${fmtCurrency(cash.margin_used.total)}`,
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
            ? `${openRows.reduce((sum, row) => sum + row.qty, 0)} qty pending/active today`
            : 'No open live orders',
        change:
          Object.entries(openTypeBreakdown).length > 0
            ? Object.entries(openTypeBreakdown)
                .map(([type, count]) => `${count} ${type}`)
                .join(' · ')
            : 'No open live orders',
        changeUp: true,
        icon: <Zap size={18} />,
        iconClassName: 'text-warning bg-warning/15',
      },
      {
        title: 'Order Success',
        value: closedRows.length > 0 ? `${orderSuccessRate.toFixed(1)}%` : '—',
        subValue: `${todayOrders.length} live orders today`,
        change: `${completedCount} completed · ${failedCount} failed`,
        changeUp: orderSuccessRate >= 50,
        icon: <ShieldAlert size={18} />,
        iconClassName: 'text-primary bg-primary/15',
      },
    ],
    openRows,
    closedRows,
    pnlPoints: buildLivePnlPoints(totalPnl, todayOrders),
    pnlTotal: totalPnl,
    tradesTodayLabel: `${todayOrders.length} live orders`,
    sourceNote:
      'Live overview uses Upstox funds and order book from the active trading token.',
  }
}

function StatCards({ stats }: { stats: OverviewStat[] }) {
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

function TradesTable({ rows }: { rows: OverviewTradeRow[] }) {
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
              <div>
                <p className="font-medium text-sm">{row.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  {row.side} · {row.entryTime}
                </p>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={typeVariant[row.type]}>{row.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.qty}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.entryPrice === null ? '—' : fmtCurrency(row.entryPrice)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {row.ltp === null ? '—' : fmtCurrency(row.ltp)}
            </TableCell>
            <TableCell className="text-right">
              {row.pnl === null || row.pnlPct === null ? (
                <div>
                  <p className="font-mono text-sm font-medium text-muted-foreground">
                    —
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Awaiting mark-to-market
                  </p>
                </div>
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
                  <p
                    className={cn(
                      'text-xs',
                      row.pnl >= 0 ? 'text-success/70' : 'text-destructive/70',
                    )}
                  >
                    {fmtPct(row.pnlPct)}
                  </p>
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

function TradesPanel({ dataset }: { dataset: OverviewDataset }) {
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
              <div className="px-5 pb-5 text-sm text-muted-foreground">
                No open{' '}
                {dataset.mode === 'paper' ? 'paper trades' : 'live orders'}{' '}
                right now.
              </div>
            )}
          </TabsContent>
          <TabsContent value="closed" className="mt-0">
            {dataset.closedRows.length > 0 ? (
              <TradesTable rows={dataset.closedRows} />
            ) : (
              <div className="px-5 pb-5 text-sm text-muted-foreground">
                No closed{' '}
                {dataset.mode === 'paper' ? 'paper trades' : 'live orders'}{' '}
                today.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

interface TooltipPayload {
  value: number
}

function PnlTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayload[]
  label?: string
}) {
  if (active && payload?.length) {
    const value = payload[0].value
    return (
      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <p className="mb-1 text-muted-foreground">{label}</p>
        <p
          className={cn(
            'font-semibold',
            value >= 0 ? 'text-success' : 'text-destructive',
          )}
        >
          {fmtCurrency(value, true)}
        </p>
      </div>
    )
  }
  return null
}

function PnlPanel({ dataset }: { dataset: OverviewDataset }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Intraday P&amp;L</CardTitle>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                'text-lg font-bold',
                dataset.pnlTotal >= 0 ? 'text-success' : 'text-destructive',
              )}
            >
              {fmtCurrency(dataset.pnlTotal, true)}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">today</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart
            data={dataset.pnlPoints}
            margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="overviewPnlGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="oklch(0.67 0.18 145)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor="oklch(0.67 0.18 145)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.25 0.015 260 / 60%)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'oklch(0.56 0.01 260)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'oklch(0.56 0.01 260)' }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(value: number) => fmtCompactCurrency(value)}
            />
            <Tooltip content={<PnlTooltip />} />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="oklch(0.67 0.18 145)"
              strokeWidth={2}
              fill="url(#overviewPnlGradient)"
              dot={false}
              activeDot={{ r: 4, fill: 'oklch(0.67 0.18 145)', stroke: 'none' }}
            />
          </AreaChart>
        </ResponsiveContainer>
        <p className="mt-3 text-xs text-muted-foreground">
          {dataset.sourceNote}
        </p>
      </CardContent>
    </Card>
  )
}

function EmptyState({ mode }: { mode: OverviewMode }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Link2Off size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {mode === 'live' ? 'No live broker token' : 'No paper trades yet'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === 'live'
                ? 'Connect an Upstox account with an active trading token to load live overview data.'
                : 'Start the strategy in paper mode to populate the overview with simulated trades.'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function OverviewPage() {
  const [mode, setMode] = useState<OverviewMode>(activeModeDefault)
  const [paperData, setPaperData] = useState<PaperAccountSummary | null>(null)
  const [liveFunds, setLiveFunds] = useState<UpstoxFundsV3 | null>(null)
  const [liveOrders, setLiveOrders] = useState<LiveOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(MODE_STORAGE_KEY, mode)
    } catch {
      // Ignore storage failures.
    }
  }, [mode])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')

      try {
        if (mode === 'paper') {
          const next = await fetchPaperHistory()
          if (!cancelled) {
            setPaperData(next)
            setLiveFunds(null)
            setLiveOrders([])
          }
          return
        }

        const token = getAccounts().find(
          (account) => account.accessToken,
        )?.accessToken
        if (!token) {
          if (!cancelled) {
            setLiveFunds(null)
            setLiveOrders([])
            setPaperData(null)
          }
          return
        }

        const [funds, orders] = await Promise.all([
          fetchUpstoxFunds(token),
          fetchUpstoxOrders(token),
        ])

        if (!cancelled) {
          setLiveFunds(funds)
          setLiveOrders(orders)
          setPaperData(null)
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : 'Failed to load overview data',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    const refreshMs = mode === 'live' ? 60_000 : 30_000
    const timer = window.setInterval(() => {
      void load()
    }, refreshMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [mode])

  const dataset = useMemo(() => {
    if (mode === 'paper' && paperData) return buildPaperDataset(paperData)
    if (mode === 'live' && liveFunds)
      return buildLiveDataset(liveFunds, liveOrders)
    return null
  }, [liveFunds, liveOrders, mode, paperData])

  return (
    <div className="flex min-w-0 flex-col gap-5 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Overview
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Real-time portfolio and trading summary
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as OverviewMode)}
          >
            <TabsList>
              <TabsTrigger value="live">Live</TabsTrigger>
              <TabsTrigger value="paper">Paper</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode((current) => current)}
            disabled={loading}
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !dataset ? (
        <Card>
          <CardContent className="pt-5">
            <div className="py-10 text-center text-sm text-muted-foreground">
              Loading {mode} overview…
            </div>
          </CardContent>
        </Card>
      ) : dataset ? (
        <>
          <StatCards stats={dataset.stats} />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <TradesPanel dataset={dataset} />
            </div>
            <div>
              <PnlPanel dataset={dataset} />
            </div>
          </div>
        </>
      ) : (
        <EmptyState mode={mode} />
      )}
    </div>
  )
}
