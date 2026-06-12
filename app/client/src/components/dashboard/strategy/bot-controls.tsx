import type { ExecutionMode, ActivePosition } from '@/lib/types'
import { useEffect, useState } from 'react'
import { Play, Square, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import type { BotState } from '@/hooks/useStrategyBot'

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

export function BotControls({
  state,
  position,
  tradesCount,
  lastUpdated,
  error,
  pollingIntervalSec,
  start,
  stop,
  executionMode,
  paperBalance,
}: {
  state: BotState
  position: ActivePosition | null
  tradesCount: number
  lastUpdated: string | null
  error: string | null
  pollingIntervalSec: number
  start: () => void
  stop: () => void
  executionMode: ExecutionMode
  paperBalance: number | null
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
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${STATE_DOT[state]}`}
          />
          Bot {STATE_LABEL[state]}
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {tradesCount} trade{tradesCount !== 1 ? 's' : ''} today
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Action button */}
        <div className="flex gap-2">
          {state === 'IDLE' || state === 'STOPPED' ? (
            <Button size="sm" className="flex-1" onClick={start}>
              <Play size={13} className="mr-1.5" /> Start Bot
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={stop}
            >
              <Square size={13} className="mr-1.5" /> Stop Bot
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Mode</span>
          <Badge
            variant={executionMode === 'paper' ? 'secondary' : 'outline'}
            className="text-xs"
          >
            {executionMode === 'paper' ? 'Paper Trade' : 'Live Orders'}
          </Badge>
          {executionMode === 'paper' && paperBalance !== null && (
            <span className="ml-auto font-mono text-foreground">
              Credit ₹{paperBalance.toFixed(2)}
            </span>
          )}
        </div>

        {/* Countdown */}
        {(state === 'RUNNING' || state === 'ORDERED') && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock size={12} />
            Next tick in {secsUntilTick}s
            {lastUpdated && (
              <span className="ml-auto">Last: {lastUpdated}</span>
            )}
          </div>
        )}

        {/* Active position */}
        {position && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              {position.tradeType === 'both' ? (
                position.direction === 'CE' ? (
                  <TrendingUp size={13} className="text-success" />
                ) : (
                  <TrendingDown size={13} className="text-destructive" />
                )
              ) : (position.tradeType === 'selling' &&
                  position.direction === 'PE') ||
                (position.tradeType !== 'selling' &&
                  position.direction === 'CE') ? (
                <TrendingUp size={13} className="text-success" />
              ) : (
                <TrendingDown size={13} className="text-destructive" />
              )}
              <span className="text-xs font-medium">
                {position.tradeType === 'both'
                  ? 'Long & Short Combo'
                  : `${position.tradeType === 'selling' ? 'Short' : 'Long'} ${position.direction} Option`}
              </span>
              {position.executionMode === 'paper' && (
                <Badge variant="secondary" className="text-xs">
                  Paper
                </Badge>
              )}
              <Badge variant="outline" className="ml-auto text-xs">
                qty {position.quantity}
              </Badge>
            </div>

            {position.legs && position.legs.length > 0 && (
              <div className="space-y-1.5 border-t border-border/40 pt-2 text-xs">
                {position.legs.map((leg, idx) => {
                  const legCurrentPrice = leg.currentPrice ?? leg.entryPrice
                  const legPct =
                    leg.tradeType === 'selling'
                      ? ((leg.entryPrice - legCurrentPrice) / leg.entryPrice) *
                        100
                      : ((legCurrentPrice - leg.entryPrice) / leg.entryPrice) *
                        100
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between text-[11px] font-mono bg-muted/20 px-2 py-1 rounded"
                    >
                      <span className="text-muted-foreground">
                        {leg.tradeType === 'selling' ? 'Short' : 'Long'}{' '}
                        {leg.direction}
                      </span>
                      <span className="text-foreground">
                        {leg.entryPrice.toFixed(2)} →{' '}
                        {legCurrentPrice.toFixed(2)}
                      </span>
                      <span
                        className={`font-semibold ${legPct >= 0 ? 'text-success' : 'text-destructive'}`}
                      >
                        {legPct >= 0 ? '+' : ''}
                        {legPct.toFixed(1)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 text-xs pt-1.5 border-t border-border/40">
              {(!position.legs || position.legs.length === 0) && (
                <>
                  <span className="text-muted-foreground">Entry</span>
                  <span className="font-mono">
                    {position.entryPrice.toFixed(2)}
                  </span>
                </>
              )}
              {pct !== null && (
                <>
                  <span className="text-muted-foreground">Total P&L</span>
                  <span
                    className={`font-mono font-semibold ${pct >= 0 ? 'text-success' : 'text-destructive'}`}
                  >
                    {pct >= 0 ? '+' : ''}
                    {pct.toFixed(2)}%
                  </span>
                </>
              )}
              <span className="text-muted-foreground">Time</span>
              <span className="font-mono">
                {new Date(position.entryTime).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive/80 border border-destructive/20 rounded p-2 bg-destructive/5">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
