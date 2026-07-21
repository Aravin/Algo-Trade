import { useState, useMemo } from 'react'
import { BarChart2, RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoTooltip } from '@/components/ui/tooltip'
import { getTickLog, clearTickLog, sweepThresholds } from '@/lib/tickLog'
import type { ThresholdResult } from '@/lib/tickLog'
import type { StrategyConfig } from '@/lib/types'

function Badge({
  children,
  variant = 'default',
}: {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'muted'
}) {
  const styles = {
    default: 'bg-primary/10 text-primary border-primary/20',
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    muted: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${styles[variant]}`}
    >
      {children}
    </span>
  )
}

function ResultRow({
  row,
  rank,
  isActive,
  onApply,
}: {
  row: ThresholdResult
  rank: number
  isActive: boolean
  onApply: (row: ThresholdResult) => void
}) {
  const tradePct =
    row.totalTicks > 0 ? Math.round((row.tradeTicks / row.totalTicks) * 100) : 0
  const strongPct =
    row.tradeTicks > 0
      ? Math.round((row.strongTicks / row.tradeTicks) * 100)
      : 0

  return (
    <tr
      className={`border-b border-border/40 text-xs transition-colors ${isActive ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
    >
      <td className="py-1.5 px-2 text-muted-foreground tabular-nums">{rank}</td>
      <td className="py-1.5 px-2 tabular-nums font-mono">
        <span className="font-semibold">{row.strongThreshold}</span>
        <span className="text-muted-foreground">
          {' '}
          / {row.moderateThreshold}
        </span>
      </td>
      <td className="py-1.5 px-2 tabular-nums font-mono text-muted-foreground">
        {row.strongGap} / {row.moderateGap}
      </td>
      <td className="py-1.5 px-2 tabular-nums">
        {row.tradeTicks}
        <span className="text-muted-foreground"> ({tradePct}%)</span>
      </td>
      <td className="py-1.5 px-2 tabular-nums">
        <span className="text-success">{row.strongTicks}S</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-warning">{row.moderateTicks}M</span>
        <span className="text-muted-foreground text-[10px]">
          {' '}
          ({strongPct}%↑)
        </span>
      </td>
      <td className="py-1.5 px-2 tabular-nums text-[10px] text-muted-foreground">
        {row.cePct}% CE / {row.pePct}% PE
      </td>
      <td className="py-1.5 px-2">
        {isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <button
            onClick={() => onApply(row)}
            className="text-[10px] text-primary hover:underline cursor-pointer"
          >
            Apply
          </button>
        )}
      </td>
    </tr>
  )
}

export function ThresholdOptimizer({
  config,
  onApply,
}: {
  config: StrategyConfig
  onApply: (
    values: Pick<
      StrategyConfig,
      'strongThreshold' | 'moderateThreshold' | 'strongGap' | 'moderateGap'
    >,
  ) => void
}) {
  const [ticks, setTicks] = useState(() => getTickLog())
  const [sortBy, setSortBy] = useState<'tradePct' | 'strongPct'>('tradePct')

  const results = useMemo(() => {
    if (ticks.length === 0) return []
    return sweepThresholds(ticks)
  }, [ticks])

  const sorted = useMemo(() => {
    if (results.length === 0) return []
    return [...results].sort((a, b) => {
      if (sortBy === 'strongPct') {
        // More strong signals = better quality
        const aS = a.tradeTicks > 0 ? a.strongTicks / a.tradeTicks : 0
        const bS = b.tradeTicks > 0 ? b.strongTicks / b.tradeTicks : 0
        // If strong percentages are equal, break tie by trade volume
        if (bS === aS) return b.tradeTicks - a.tradeTicks
        return bS - aS
      }

      // Fewest trades (least noisy) first, BUT ignore 0-trade setups (push to bottom)
      if (a.tradeTicks === 0 && b.tradeTicks > 0) return 1
      if (b.tradeTicks === 0 && a.tradeTicks > 0) return -1

      return a.tradeTicks - b.tradeTicks
    })
  }, [results, sortBy])

  function handleRefresh() {
    setTicks(getTickLog())
  }

  function handleClear() {
    clearTickLog()
    setTicks([])
  }

  function handleApply(row: ThresholdResult) {
    onApply({
      strongThreshold: row.strongThreshold,
      moderateThreshold: row.moderateThreshold,
      strongGap: row.strongGap,
      moderateGap: row.moderateGap,
    })
  }

  const oldest = ticks.length > 0 ? new Date(ticks[0].ts) : null
  const newest = ticks.length > 0 ? new Date(ticks[ticks.length - 1].ts) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 size={14} className="text-primary" />
          Threshold Optimizer
          <InfoTooltip content="Replays stored tick history with different threshold combinations to show how many trades each setting would have generated. Lower trade count = fewer but higher-quality signals." />
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              className="h-6 px-2 text-xs gap-1"
            >
              <RefreshCw size={10} /> Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleClear}
              className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 size={10} /> Clear
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {ticks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <BarChart2
              size={24}
              className="mx-auto text-muted-foreground mb-2"
            />
            <p className="text-sm font-medium">No tick data yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start the bot and let it run for a few ticks. Each polling cycle
              stores a score record here (up to 500 ticks, rolling).
            </p>
          </div>
        ) : (
          <>
            {/* Tick metadata */}
            <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
              <span>{ticks.length} ticks recorded</span>
              {oldest && newest && (
                <>
                  <span>·</span>
                  <span>
                    {oldest.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}{' '}
                    {oldest.toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' → '}
                    {newest.toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </>
              )}
            </div>

            {/* Current config summary */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Active config:</span>
              <Badge variant="default">
                S≥{config.strongThreshold} M≥{config.moderateThreshold}
              </Badge>
              <Badge variant="muted">
                Gap {config.strongGap}/{config.moderateGap}
              </Badge>
            </div>

            {/* Sort control */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Sort by:</span>
              <button
                onClick={() => setSortBy('tradePct')}
                className={`px-2 py-0.5 rounded border text-[10px] cursor-pointer ${sortBy === 'tradePct' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
              >
                Fewest trades (least noisy)
              </button>
              <button
                onClick={() => setSortBy('strongPct')}
                className={`px-2 py-0.5 rounded border text-[10px] cursor-pointer ${sortBy === 'strongPct' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}
              >
                Most Strong signals
              </button>
            </div>

            {/* Results table */}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-1.5 px-2 text-left text-[10px] font-medium text-muted-foreground">
                      #
                    </th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-medium text-muted-foreground">
                      Strong / Mod
                      <InfoTooltip content="Score thresholds for Strong and Moderate confidence." />
                    </th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-medium text-muted-foreground">
                      Gap S/M
                      <InfoTooltip content="Bull−bear gap required for Strong/Moderate." />
                    </th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-medium text-muted-foreground">
                      Trades
                      <InfoTooltip content="Ticks that would have triggered a trade signal (% of total ticks)." />
                    </th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-medium text-muted-foreground">
                      S / M breakdown
                      <InfoTooltip content="Strong vs Moderate signal count. Higher Strong% = better quality." />
                    </th>
                    <th className="py-1.5 px-2 text-left text-[10px] font-medium text-muted-foreground">
                      Direction
                      <InfoTooltip content="CE (bullish) vs PE (bearish) split of trade signals." />
                    </th>
                    <th className="py-1.5 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, 20).map((row, i) => {
                    const isActive =
                      row.strongThreshold === config.strongThreshold &&
                      row.moderateThreshold === config.moderateThreshold &&
                      row.strongGap === config.strongGap &&
                      row.moderateGap === config.moderateGap
                    return (
                      <ResultRow
                        key={`${row.strongThreshold}-${row.moderateThreshold}-${row.strongGap}-${row.moderateGap}`}
                        row={row}
                        rank={i + 1}
                        isActive={isActive}
                        onApply={handleApply}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Showing top 20 combinations of {results.length} total.{' '}
              <span className="text-warning">Note:</span> This counts signal
              frequency only — win rate requires price outcome data from paper
              trades.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
