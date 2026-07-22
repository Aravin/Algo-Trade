import type { PaperAccountSummary } from '@/lib/types'
import { useEffect, useState } from 'react'
import { Clock3, Wallet, BarChart3 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { fetchPaperHistory } from '@/lib/paperTrading'
import { getLotSizeForSymbol } from '@/utils/tradeUtils'

function fmtCurrency(value: number, signed = false) {
  const formatted = Math.abs(value).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  })
  if (!signed) {
    return value < 0 ? `-${formatted}` : formatted
  }
  return value > 0 ? `+${formatted}` : value < 0 ? `-${formatted}` : formatted
}

export function HistoryPage() {
  const [data, setData] = useState<PaperAccountSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchPaperHistory()
      .then((summary) => {
        if (!cancelled) {
          setData(summary)
          setError('')
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const trades = data?.trades ?? []

  return (
    <div className="flex flex-col gap-5 p-6 min-w-0">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Trade History
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Paper trading ledger and simulated trade statement
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-2xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet size={14} className="text-primary" />
              Paper Credit
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {data ? fmtCurrency(data.account.balance) : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              Open simulated trades: {data?.openTradeCount ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock3 size={14} className="text-primary" />
              Recent Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentEntries ?? []).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {entry.entry_type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-xs font-mono ${entry.amount >= 0 ? 'text-success' : 'text-destructive'}`}
                    >
                      {fmtCurrency(entry.amount, true)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {fmtCurrency(entry.balance_after)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {entry.note ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 size={14} className="text-primary" />
              Completed Trades
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {trades.length} trades
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Entry</TableHead>
                <TableHead className="text-right">Exit / MTM</TableHead>
                <TableHead className="text-right">P&amp;L</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Opened</TableHead>
                <TableHead className="text-right">Closed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-sm text-muted-foreground py-6"
                  >
                    No trades found
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => {
                  const pnl = trade.realized_pnl
                  let currentMtmPrice: number | null = null
                  let mtmUrPnl: number | null = null

                  if (trade.status === 'OPEN') {
                    try {
                      const rawPos = localStorage.getItem(
                        'algo-trade:bot-position',
                      )
                      if (rawPos) {
                        const botPos = JSON.parse(rawPos) as {
                          instrumentKey?: string
                          currentPrice?: number
                          legs?: {
                            instrumentKey?: string
                            currentPrice?: number
                          }[]
                        }
                        if (botPos.legs?.length) {
                          const legMatch = botPos.legs.find(
                            (l) => l.instrumentKey === trade.instrument_key,
                          )
                          if (legMatch?.currentPrice)
                            currentMtmPrice = legMatch.currentPrice
                        }
                        if (currentMtmPrice === null && botPos.currentPrice) {
                          currentMtmPrice = botPos.currentPrice
                        }
                      }
                    } catch {
                      // ignore
                    }

                    if (currentMtmPrice !== null) {
                      let isSelling = false
                      try {
                        const meta = JSON.parse(
                          trade.metadata_json ?? '{}',
                        ) as { tradeType?: string }
                        if (meta?.tradeType === 'selling') isSelling = true
                      } catch {
                        // ignore
                      }
                      mtmUrPnl = isSelling
                        ? (trade.entry_price - currentMtmPrice) * trade.quantity
                        : (currentMtmPrice - trade.entry_price) * trade.quantity
                    }
                  }

                  let displaySymbol = trade.instrument_key
                  let metaSubtext: string | null = null
                  try {
                    const meta = JSON.parse(trade.metadata_json ?? '{}') as {
                      tradingSymbol?: string
                      strikePrice?: number
                      expiry?: string
                      underlyingSymbol?: string
                    } | null
                    if (meta?.tradingSymbol || meta?.strikePrice) {
                      const underlying = meta.underlyingSymbol ?? 'NIFTY'
                      const strikeStr = meta.strikePrice
                        ? `${meta.strikePrice}`
                        : ''
                      displaySymbol =
                        meta.tradingSymbol ??
                        `${underlying} ${strikeStr} ${trade.direction}`
                      metaSubtext = `${trade.instrument_key}${meta.expiry ? ` · Exp: ${meta.expiry}` : ''}`
                    }
                  } catch {
                    // ignore
                  }

                  return (
                    <TableRow key={trade.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{displaySymbol}</p>
                        {metaSubtext && (
                          <p className="text-[11px] font-mono text-muted-foreground">
                            {metaSubtext}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {trade.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <div>
                          <span>{trade.quantity}</span>
                          {(() => {
                            const lotSize = getLotSizeForSymbol(
                              trade.instrument_key,
                            )
                            if (lotSize > 1) {
                              const lots = Math.round(trade.quantity / lotSize)
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
                        {fmtCurrency(trade.entry_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {trade.exit_price !== null
                          ? fmtCurrency(trade.exit_price)
                          : currentMtmPrice !== null
                            ? fmtCurrency(currentMtmPrice)
                            : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {pnl !== null ? (
                          <span
                            className={`font-mono text-sm font-medium ${pnl >= 0 ? 'text-success' : 'text-destructive'}`}
                          >
                            {fmtCurrency(pnl, true)}
                          </span>
                        ) : mtmUrPnl !== null ? (
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-mono text-sm font-medium ${mtmUrPnl >= 0 ? 'text-success' : 'text-destructive'}`}
                            >
                              {fmtCurrency(mtmUrPnl, true)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              (MTM)
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={
                            trade.status === 'CLOSED'
                              ? 'secondary'
                              : trade.status === 'OPEN'
                                ? 'default'
                                : 'outline'
                          }
                        >
                          {trade.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(trade.opened_at).toLocaleString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: 'short',
                        })}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {trade.closed_at
                          ? new Date(trade.closed_at).toLocaleString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              day: '2-digit',
                              month: 'short',
                            })
                          : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
