import type { ExecutionMode, ActivePosition } from '@/lib/types'
import type { BotState } from '@/hooks/useStrategyBot'
import { useEffect, useState } from 'react'
import {
  Play,
  Square,
  Clock,
  TrendingUp,
  TrendingDown,
  Terminal,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoTooltip } from '@/components/ui/tooltip'
import { getUpcomingIndexExpiry } from '@/lib/utils'
import { getLotSizeForSymbol } from '@/utils/tradeUtils'

const STATE_DOT: Record<BotState, string> = {
  IDLE: 'bg-muted-foreground',
  RUNNING: 'bg-success animate-pulse',
  ORDERED: 'bg-warning animate-pulse',
  STOPPED: 'bg-destructive',
}

const STATE_LABEL: Record<BotState, string> = {
  IDLE: 'Idle',
  RUNNING: 'Running',
  ORDERED: 'Position Open',
  STOPPED: 'Stopped',
}

export function StrategyHeaderBar({
  state,
  position,
  tradesCount,
  lastUpdated,
  pollingIntervalSec,
  start,
  stop,
  executionMode,
  paperBalance,
  token,
  activeTab,
  onTabChange,
  logErrorCount,
}: {
  state: BotState
  position: ActivePosition | null
  tradesCount: number
  lastUpdated: string | null
  pollingIntervalSec: number
  start: () => void
  stop: () => void
  executionMode: ExecutionMode
  paperBalance: number | null
  token: string | null
  activeTab: string
  onTabChange: (tab: string) => void
  logErrorCount?: number
}) {
  const [secsUntilTick, setSecsUntilTick] = useState(pollingIntervalSec)

  useEffect(() => {
    if (state !== 'RUNNING' && state !== 'ORDERED') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSecsUntilTick(pollingIntervalSec)
    const id = setInterval(
      () => setSecsUntilTick((s) => (s <= 1 ? pollingIntervalSec : s - 1)),
      1000,
    )
    return () => clearInterval(id)
  }, [state, pollingIntervalSec, lastUpdated])

  const pct = position
    ? (() => {
        if (position.legs && position.legs.length > 0) {
          let totalPnl = 0
          let totalEntryValue = 0
          for (const leg of position.legs) {
            const legCurrentPrice = leg.currentPrice ?? leg.entryPrice
            const legPnl =
              leg.tradeType === 'selling'
                ? (leg.entryPrice - legCurrentPrice) * leg.quantity
                : (legCurrentPrice - leg.entryPrice) * leg.quantity
            totalPnl += legPnl
            totalEntryValue += leg.entryPrice * leg.quantity
          }
          return totalEntryValue > 0 ? (totalPnl / totalEntryValue) * 100 : 0
        }

        const pos = position as ActivePosition & {
          currentPrice?: number
          tradeType?: 'buying' | 'selling' | 'both'
        }
        if (pos.currentPrice === undefined) return null
        const isSelling = pos.tradeType === 'selling'
        return isSelling
          ? ((pos.entryPrice - pos.currentPrice) / pos.entryPrice) * 100
          : ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100
      })()
    : null

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border pb-3 pt-2 -mx-4 px-4 shadow-sm mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Strategy Info & Status */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">
                Nifty Strategy V5
              </h1>
              <span className="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-muted border border-border">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${STATE_DOT[state]}`}
                />
                {STATE_LABEL[state]}
              </span>
              <Badge
                variant={executionMode === 'paper' ? 'secondary' : 'outline'}
                className="text-[11px]"
              >
                {executionMode === 'paper' ? 'Paper' : 'Live'}
              </Badge>
              {(() => {
                const niftyExp = getUpcomingIndexExpiry('NIFTY 50')
                const bankExp = getUpcomingIndexExpiry('BANKNIFTY')
                const finExp = getUpcomingIndexExpiry('FINNIFTY')
                return (
                  <span className="hidden sm:flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-card border border-border text-muted-foreground">
                    📅 Expiries: NIFTY ({niftyExp.formattedExpiry.slice(0, 6)})
                    <InfoTooltip
                      content={
                        <div className="space-y-1">
                          <p className="font-semibold border-b pb-0.5 text-foreground">
                            Weekly Option Expiries (IST)
                          </p>
                          <p>
                            • NIFTY 50: {niftyExp.fullLabel} (
                            {niftyExp.relativeText})
                          </p>
                          <p>
                            • BANK NIFTY: {bankExp.fullLabel} (
                            {bankExp.relativeText})
                          </p>
                          <p>
                            • FIN NIFTY: {finExp.fullLabel} (
                            {finExp.relativeText})
                          </p>
                        </div>
                      }
                      iconSize={11}
                    />
                  </span>
                )
              })()}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>
                {tradesCount} trade{tradesCount !== 1 ? 's' : ''} today
              </span>
              {executionMode === 'paper' && paperBalance !== null && (
                <>
                  <span>•</span>
                  <span className="font-mono">
                    Credit: ₹{paperBalance.toFixed(2)}
                  </span>
                </>
              )}
              {(state === 'RUNNING' || state === 'ORDERED') && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> Next tick: {secsUntilTick}s
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Active Position Chip (if any) */}
        {position && (
          <div className="hidden md:flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-xs">
            {position.direction === 'CE' ? (
              <TrendingUp size={14} className="text-success" />
            ) : (
              <TrendingDown size={14} className="text-destructive" />
            )}
            <span className="font-medium">
              {position.tradeType === 'both'
                ? 'Combo'
                : `${position.tradeType === 'selling' ? 'Short' : 'Long'} ${position.direction}`}
            </span>
            <span className="text-muted-foreground font-mono">
              {(() => {
                const symbol = position.legs?.[0]?.instrumentKey ?? 'NIFTY'
                const lotSize = getLotSizeForSymbol(symbol)
                const lots =
                  lotSize > 1 ? Math.round(position.quantity / lotSize) : null
                return `${position.quantity} qty${lots !== null ? ` (${lots} ${lots > 1 ? 'lots' : 'lot'})` : ''}`
              })()}
            </span>
            {pct !== null && (
              <span
                className={`font-mono font-semibold ${pct >= 0 ? 'text-success' : 'text-destructive'}`}
              >
                {pct >= 0 ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
            )}
          </div>
        )}

        {/* Right: Primary Controls & Action Shortcuts */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Start/Stop Button */}
          {state === 'IDLE' || state === 'STOPPED' ? (
            <Button
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90 font-medium h-9 px-4"
              onClick={start}
            >
              <Play size={14} className="mr-1.5 fill-current" /> Start Bot
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="font-medium h-9 px-4"
              onClick={stop}
            >
              <Square size={14} className="mr-1.5 fill-current" /> Stop Bot
            </Button>
          )}

          {/* Quick Tab Shortcuts */}
          <Button
            size="sm"
            variant={activeTab === 'operations' ? 'secondary' : 'ghost'}
            className="h-9 text-xs gap-1.5"
            onClick={() => onTabChange('operations')}
            title="Live Operations & Logs"
          >
            <Terminal size={14} />
            <span className="hidden sm:inline">Logs</span>
            {(logErrorCount ?? 0) > 0 && (
              <Badge
                variant="destructive"
                className="px-1 py-0 text-[10px] h-4 min-w-4 justify-center"
              >
                {logErrorCount}
              </Badge>
            )}
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'config' ? 'secondary' : 'ghost'}
            className="h-9 text-xs gap-1.5"
            onClick={() => onTabChange('config')}
            title="Strategy Config"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Config</span>
          </Button>
        </div>
      </div>

      {!token && (
        <div className="mt-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-1">
          ⚠️ No active broker token — add Upstox account first to execute
          trades.
        </div>
      )}
    </div>
  )
}
