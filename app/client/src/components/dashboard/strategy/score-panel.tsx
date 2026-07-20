import type { AllSignalData, FinalSignal, StrategyConfig } from '@/lib/types'
import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoTooltip } from '@/components/ui/tooltip'
import { scoreBullish, scoreBearish } from '@/lib/strategyEngine'

function ScoreBar({
  label,
  score,
  max,
  color,
  tooltip,
}: {
  label: string
  score: number
  max: number
  color: string
  tooltip?: string
}) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip && <InfoTooltip content={tooltip} />}
        </span>
        <span className="text-xs font-semibold tabular-nums">
          {score} / {max}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%`, transition: 'width 0.4s ease' }}
        />
      </div>
    </div>
  )
}

const SIGNAL_STYLES: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  BUY_CE: {
    label: 'BUY CE',
    color: 'text-success',
    bg: 'bg-success/10 border-success/40',
  },
  BUY_PE: {
    label: 'BUY PE',
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/40',
  },
  WAIT: {
    label: 'WAIT',
    color: 'text-warning',
    bg: 'bg-warning/10 border-warning/40',
  },
  NO_TRADE: {
    label: 'NO TRADE',
    color: 'text-muted-foreground',
    bg: 'bg-muted border-border',
  },
}
const CONF_STYLES: Record<string, string> = {
  strong: 'text-success',
  moderate: 'text-warning',
  weak: 'text-muted-foreground',
  none: 'text-muted-foreground',
}

export function ScorePanel({
  allSignalData,
  finalSignal,
  config,
}: {
  allSignalData: AllSignalData | null
  finalSignal: FinalSignal | null
  config: StrategyConfig
}) {
  const style = finalSignal
    ? (SIGNAL_STYLES[finalSignal.signal] ?? SIGNAL_STYLES.NO_TRADE)
    : SIGNAL_STYLES.NO_TRADE
  const bull = allSignalData ? scoreBullish(allSignalData) : null
  const bear = allSignalData ? scoreBearish(allSignalData) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp size={14} className="text-primary" />
          Signal Scores
          <InfoTooltip content="Aggregated quantitative scoring engine combining V3 Macro/Institutional setup and V4 1-min Technical indicators into actionable trades." />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {finalSignal ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ScoreBar
                label="Bullish (CE)"
                score={finalSignal.bullScore}
                max={finalSignal.scoreMax}
                color="bg-success"
                tooltip="Combined bullish score points across Macro, FII positioning, Advances/Declines, and Technical indicators for Buying Call Options (CE)."
              />
              <ScoreBar
                label="Bearish (PE)"
                score={finalSignal.bearScore}
                max={finalSignal.scoreMax}
                color="bg-destructive"
                tooltip="Combined bearish score points across Macro, FII positioning, Advances/Declines, and Technical indicators for Buying Put Options (PE)."
              />
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                Strong ≥ {config.strongThreshold}
                <InfoTooltip content="Score threshold required for a Strong confidence trade trigger (executes full position size)." />
              </span>
              <span className="flex items-center gap-1">
                Moderate ≥ {config.moderateThreshold}
                <InfoTooltip content="Score threshold required for a Moderate confidence trade trigger (executes half position size)." />
              </span>
            </div>
            <div className={`rounded-lg border p-4 text-center ${style.bg}`}>
              <div className="flex items-center justify-center gap-1 mb-1">
                <p className="text-xs text-muted-foreground">Final Signal</p>
                <InfoTooltip content="Final automated trading decision after scoring threshold validation, confidence calculation, and hard-stop safety checks." />
              </div>
              <p className={`text-2xl font-bold ${style.color}`}>
                {style.label}
              </p>
              <p
                className={`text-xs mt-1 font-medium ${CONF_STYLES[finalSignal.confidence]}`}
              >
                {finalSignal.confidence.toUpperCase()} confidence
                {finalSignal.positionSize !== 'none' &&
                  ` · ${finalSignal.positionSize} position`}
              </p>
              <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  V3:{' '}
                  <span className="font-medium text-foreground">
                    {finalSignal.v3}
                  </span>
                  <InfoTooltip content="V3 Macro & Institutional layer bias signal (Hold, Bullish, or Bearish)." />
                </span>
                <span className="flex items-center gap-1">
                  V4:{' '}
                  <span className="font-medium text-foreground">
                    {finalSignal.v4}
                  </span>
                  <InfoTooltip content="V4 1-minute Technical Indicator layer bias signal (Hold, Bullish, or Bearish)." />
                </span>
              </div>
            </div>
            {bull && bear && (
              <details className="group">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                  Score breakdown ▾
                </summary>
                <div className="mt-2 space-y-3 max-h-60 overflow-y-auto pr-1">
                  {(finalSignal?.bearScore > finalSignal?.bullScore
                    ? bear.breakdown
                    : bull.breakdown
                  ).map((row, i) => (
                    <div key={i} className="flex flex-col text-xs space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">
                          [{row.layer}] {row.indicator}
                        </span>
                        <span
                          className={
                            row.points > 0
                              ? 'text-success font-medium tabular-nums'
                              : row.points < 0
                                ? 'text-destructive font-medium tabular-nums'
                                : 'text-muted-foreground font-medium tabular-nums'
                          }
                        >
                          {row.points > 0 ? '+' : ''}
                          {row.points}
                          {row.max > 0 ? ` / ${row.max}` : ''}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {row.condition}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Start the bot or wait for the first tick to see scores.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
