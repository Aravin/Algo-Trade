import React, { useState, useMemo } from 'react'
import {
  Calendar,
  TrendingUp,
  DollarSign,
  PieChart,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoTooltip } from '@/components/ui/tooltip'
import { getWoWComparison } from '@/lib/dailyBacktestEngine'
import type { DailyReport, BacktestTrade } from '@/lib/dailyBacktestEngine'

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted'
}) {
  const styles = {
    default: 'bg-primary/10 text-primary border-primary/20',
    success:
      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    warning:
      'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
    danger:
      'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    muted: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${styles[variant]}`}
    >
      {children}
    </span>
  )
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  const isWin = trade.status === 'WIN'
  return (
    <tr className="border-b border-border/40 text-xs hover:bg-muted/40 transition-colors">
      <td className="py-2.5 px-3 font-mono font-medium text-muted-foreground">
        {trade.tradeId}
      </td>
      <td className="py-2.5 px-3 tabular-nums font-mono text-muted-foreground flex items-center gap-1">
        <Clock size={12} className="text-muted-foreground" />
        {trade.entryTime}
        <span className="text-muted-foreground/60">→</span>
        {trade.exitTime}
      </td>
      <td className="py-2.5 px-3 font-semibold font-mono">{trade.strike}</td>
      <td className="py-2.5 px-3">
        {trade.direction === 'BUY_CE' ? (
          <Badge variant="success">BUY CE</Badge>
        ) : (
          <Badge variant="danger">BUY PE</Badge>
        )}
      </td>
      <td className="py-2.5 px-3 tabular-nums font-mono">
        {trade.lots} Lots ({trade.quantity} Qty)
      </td>
      <td className="py-2.5 px-3 tabular-nums font-mono">
        ₹{trade.entryPrice.toFixed(2)}
      </td>
      <td className="py-2.5 px-3 tabular-nums font-mono">
        ₹{trade.exitPrice.toFixed(2)}
      </td>
      <td className="py-2.5 px-3">
        {trade.exitReason === 'TARGET_HIT' ? (
          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 size={13} /> Target Hit (+18%)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
            <XCircle size={13} /> Stop Loss (-10%)
          </span>
        )}
      </td>
      <td className="py-2.5 px-3 tabular-nums font-mono text-muted-foreground">
        ₹{trade.statutoryFees.toFixed(2)}
      </td>
      <td className="py-2.5 px-3 text-right tabular-nums font-mono font-bold">
        <span
          className={
            isWin
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          }
        >
          {isWin ? '+' : ''}₹{trade.netPnl.toFixed(2)}
        </span>
        <span className="text-[10px] text-muted-foreground block font-normal">
          ({trade.pnlPct >= 0 ? '+' : ''}
          {trade.pnlPct}%)
        </span>
      </td>
    </tr>
  )
}

function getYesterdayDateIso(): string {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  // If yesterday was Sunday (0), go back to Friday (2 days prior)
  if (date.getDay() === 0) date.setDate(date.getDate() - 2)
  // If yesterday was Saturday (6), go back to Friday (1 day prior)
  if (date.getDay() === 6) date.setDate(date.getDate() - 1)
  return date.toISOString().split('T')[0]
}

function getWoWSameDayIso(selectedIso: string): string {
  const d = new Date(`${selectedIso}T00:00:00.000Z`)
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

export function DailyBacktestReport() {
  const [selectedDate, setSelectedDate] = useState(() => getYesterdayDateIso())
  const [accountCapitalInput, setAccountCapitalInput] = useState('15000')

  const accountCapital = useMemo(() => {
    const parsed = parseFloat(accountCapitalInput)
    return Number.isFinite(parsed) && parsed >= 1000 ? parsed : 15000
  }, [accountCapitalInput])

  // Calculate Daily Backtest & WoW Comparison
  const wowData = useMemo(() => {
    return getWoWComparison(selectedDate, accountCapital)
  }, [selectedDate, accountCapital])

  const report: DailyReport = wowData.selectedReport
  const wowReport: DailyReport = wowData.wowReport

  const isNetPositive = report.netPnl >= 0

  function handlePresetYesterday() {
    setSelectedDate(getYesterdayDateIso())
  }

  function handlePresetWoW() {
    const wowDate = getWoWSameDayIso(getYesterdayDateIso())
    setSelectedDate(wowDate)
  }

  return (
    <Card className="w-full border-border shadow-sm">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary" />
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                Daily Strategy Backtest Report
                <InfoTooltip content="Evaluates current V5 Strategy rules on historical trading sessions. Evaluates daily signal counts, account capital sizing capacity, net PnL (₹), ROI %, and Week-over-Week (WoW) same-day comparative performance." />
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Replaying intraday sessions with realistic option margin &amp;
                statutory tax deductions
              </p>
            </div>
          </div>

          {/* Quick Day Presets & Date Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={
                selectedDate === getYesterdayDateIso() ? 'default' : 'outline'
              }
              onClick={handlePresetYesterday}
              className="h-7 text-xs px-2.5 gap-1 cursor-pointer"
            >
              <Sparkles size={12} /> Last Working Day
            </Button>
            <Button
              size="sm"
              variant={
                selectedDate === getWoWSameDayIso(getYesterdayDateIso())
                  ? 'default'
                  : 'outline'
              }
              onClick={handlePresetWoW}
              className="h-7 text-xs px-2.5 gap-1 cursor-pointer"
            >
              <Layers size={12} /> Same Day Last Week (WoW)
            </Button>
            <div className="flex items-center gap-1 text-xs">
              <input
                type="date"
                value={selectedDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  e.target.value && setSelectedDate(e.target.value)
                }
                className="h-7 w-[135px] text-xs font-mono px-2 rounded-md border border-input bg-background"
              />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Row 1: Capital Sizing & Order Placement Capacity Bar */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="text-primary" />
            <span className="font-semibold">Account Value Sizing:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Capital ₹</span>
              <input
                type="number"
                value={accountCapitalInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAccountCapitalInput(e.target.value)
                }
                className="h-6 w-24 text-xs font-mono font-bold px-2 py-0 rounded border border-input bg-background"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
            <span>
              Order Size:{' '}
              <strong className="text-foreground font-semibold">
                {report.sizing.maxLotsAllowedPerTrade} Lots (
                {report.sizing.maxLotsAllowedPerTrade * report.sizing.lotSize}{' '}
                Qty)
              </strong>
            </span>
            <span>·</span>
            <span>
              Margin Required:{' '}
              <strong className="text-foreground font-semibold">
                ₹
                {(
                  report.sizing.maxLotsAllowedPerTrade *
                  report.sizing.costPerLot
                ).toLocaleString('en-IN')}
              </strong>
            </span>
            <span>·</span>
            <span>
              Max Open Trades:{' '}
              <strong className="text-foreground font-semibold">
                {report.sizing.maxSimultaneousTrades} Trade
              </strong>
            </span>
            <span>·</span>
            <span>
              Capital Deployed:{' '}
              <strong className="text-primary font-semibold">
                ₹{report.sizing.maxCapitalDeployed.toLocaleString('en-IN')} (
                {report.sizing.utilizationPct}%)
              </strong>
            </span>
            <span>·</span>
            <span>
              Cash Reserve:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ₹{report.sizing.cashBuffer.toLocaleString('en-IN')}
              </strong>
            </span>
          </div>
        </div>

        {/* Row 2: Headline Daily Performance Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Card 1: Net PnL */}
          <div
            className={`p-3.5 rounded-lg border flex flex-col justify-between ${
              isNetPositive
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-rose-500/10 border-rose-500/30'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Total Net PnL</span>
              {isNetPositive ? (
                <ArrowUpRight size={16} className="text-emerald-500" />
              ) : (
                <ArrowDownRight size={16} className="text-rose-500" />
              )}
            </div>
            <div className="mt-2">
              <div
                className={`text-xl font-bold font-mono ${
                  isNetPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {isNetPositive ? '+' : ''}₹{report.netPnl.toFixed(2)}
              </div>
              <div className="text-xs font-semibold mt-0.5 text-muted-foreground">
                {report.roiPct >= 0 ? '+' : ''}
                {report.roiPct}% ROI on Account
              </div>
            </div>
          </div>

          {/* Card 2: Win Rate & Trade Count */}
          <div className="p-3.5 rounded-lg border border-border bg-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Trades &amp; Win Rate</span>
              <PieChart size={16} className="text-primary" />
            </div>
            <div className="mt-2">
              <div className="text-xl font-bold font-mono">
                {report.winRatePct}%{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  Win Rate
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {report.winningTrades} Wins
                </span>{' '}
                /{' '}
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  {report.losingTrades} Loss
                </span>{' '}
                ({report.totalTrades} Total)
              </div>
            </div>
          </div>

          {/* Card 3: Signal Breakdown */}
          <div className="p-3.5 rounded-lg border border-border bg-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Intraday Signal Split</span>
              <TrendingUp size={16} className="text-primary" />
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold font-mono flex items-center gap-2">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {report.ceSignalsCount} BUY CE
                </span>
                <span>/</span>
                <span className="text-rose-600 dark:text-rose-400">
                  {report.peSignalsCount} BUY PE
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {report.waitSignalsCount} WAIT / No-Trade Periods
              </div>
            </div>
          </div>

          {/* Card 4: Profit Factor & Statutory Fees */}
          <div className="p-3.5 rounded-lg border border-border bg-card flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>Risk Metrics &amp; Fees</span>
              <ShieldAlert size={16} className="text-primary" />
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold font-mono">
                Profit Factor:{' '}
                <span className="text-primary">{report.profitFactor}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Brokerage &amp; Taxes:{' '}
                <strong className="text-foreground">
                  ₹{report.statutoryFeesTotal.toFixed(2)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: Week-over-Week (WoW) Same Day Comparison Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 border-b border-border flex items-center justify-between text-xs">
            <span className="font-bold flex items-center gap-1.5">
              <Layers size={14} className="text-primary" />
              Week-over-Week (WoW) Same Day Comparison
            </span>
            <span className="text-[11px] text-muted-foreground">
              Comparing {report.dayLabel} vs {wowReport.dayLabel}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground text-[11px]">
                  <th className="py-2 px-3 text-left">Comparison Metric</th>
                  <th className="py-2 px-3 text-right">
                    Selected Day ({report.dateStr})
                  </th>
                  <th className="py-2 px-3 text-right">
                    Same Day Last Week ({wowReport.dateStr})
                  </th>
                  <th className="py-2 px-3 text-right">WoW Delta ($\Delta$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">
                    Net Realized PnL (₹)
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    +₹{report.netPnl.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    +₹{wowReport.netPnl.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-bold">
                    <span
                      className={
                        wowData.pnlDelta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {wowData.pnlDelta >= 0 ? '+' : ''}₹
                      {wowData.pnlDelta.toFixed(2)}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">
                    Return on Capital (ROI %)
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    +{report.roiPct}%
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    +{wowReport.roiPct}%
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    <span
                      className={
                        wowData.roiDeltaPct >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }
                    >
                      {wowData.roiDeltaPct >= 0 ? '+' : ''}
                      {wowData.roiDeltaPct}%
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">
                    Strategy Win Rate %
                  </td>
                  <td className="py-2 px-3 text-right">{report.winRatePct}%</td>
                  <td className="py-2 px-3 text-right">
                    {wowReport.winRatePct}%
                  </td>
                  <td className="py-2 px-3 text-right">
                    {wowData.winRateDeltaPct >= 0 ? '+' : ''}
                    {wowData.winRateDeltaPct}%
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-medium text-foreground">
                    Executed Trades Count
                  </td>
                  <td className="py-2 px-3 text-right">
                    {report.totalTrades} Trades
                  </td>
                  <td className="py-2 px-3 text-right">
                    {wowReport.totalTrades} Trades
                  </td>
                  <td className="py-2 px-3 text-right">
                    {wowData.tradesDelta >= 0 ? '+' : ''}
                    {wowData.tradesDelta} Trades
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Row 4: Detailed Trade Execution Timeline */}
        <div>
          <h4 className="text-xs font-bold mb-2 text-foreground flex items-center justify-between">
            <span>
              Daily Executed Trades Timeline ({report.trades.length} Orders)
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">
              Target: +18% | Stop Loss: -10% | Max 3 Trades / Day
            </span>
          </h4>

          {report.trades.length === 0 ? (
            <div className="p-6 text-center border border-dashed rounded-lg text-xs text-muted-foreground">
              No strategy trade entries triggered for this day. Signals remained
              in WAIT / No-Trade state.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-medium text-muted-foreground text-left">
                    <th className="py-2 px-3">Trade ID</th>
                    <th className="py-2 px-3">Time Range</th>
                    <th className="py-2 px-3">Instrument</th>
                    <th className="py-2 px-3">Signal</th>
                    <th className="py-2 px-3">Order Size</th>
                    <th className="py-2 px-3">Entry Price</th>
                    <th className="py-2 px-3">Exit Price</th>
                    <th className="py-2 px-3">Exit Trigger</th>
                    <th className="py-2 px-3">Statutory Fees</th>
                    <th className="py-2 px-3 text-right">Net Realized PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {report.trades.map((trade) => (
                    <TradeRow key={trade.tradeId} trade={trade} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
