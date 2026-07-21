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

/** Renders a colour-coded distance-to-threshold pill */
function ThresholdPill({
  label,
  threshold,
  gap,
  gapNeeded,
  top,
  tooltip,
}: {
  label: string
  threshold: number
  gap: number
  gapNeeded: number
  top: number
  tooltip: string
}) {
  const scoreOk = top >= threshold
  const gapOk = gap >= gapNeeded
  const wouldFire = scoreOk && gapOk
  const ptsMissing = Math.max(0, threshold - top)
  const gapMissing = Math.max(0, gapNeeded - gap)

  let badgeClass = 'bg-muted text-muted-foreground'
  let icon = '–'
  if (wouldFire) {
    badgeClass = 'bg-success/15 text-success border border-success/30'
    icon = '✓'
  } else if (scoreOk && !gapOk) {
    badgeClass = 'bg-warning/15 text-warning border border-warning/30'
    icon = '~'
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {label} ≥ {threshold}
        <InfoTooltip content={tooltip} />
      </span>
      <span
        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${badgeClass}`}
      >
        {icon}{' '}
        {wouldFire
          ? 'fires'
          : scoreOk
            ? `gap −${gapMissing}`
            : `−${ptsMissing} pts`}
      </span>
    </div>
  )
}

/** Progress bar showing top score vs Strong threshold */
function ThresholdProgress({
  top,
  scoreMax,
  strongThreshold,
  moderateThreshold,
}: {
  top: number
  scoreMax: number
  strongThreshold: number
  moderateThreshold: number
}) {
  const cappedMax = Math.max(scoreMax, strongThreshold)
  const topPct = Math.min(100, (top / cappedMax) * 100)
  const strongPct = Math.min(100, (strongThreshold / cappedMax) * 100)
  const modPct = Math.min(100, (moderateThreshold / cappedMax) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Score progress to Strong</span>
        <span className="tabular-nums font-medium">
          {top} / {cappedMax} ({Math.round(topPct)}%)
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-visible">
        {/* Score fill */}
        <div
          className="h-full rounded-full bg-primary/70 transition-all duration-500"
          style={{ width: `${topPct}%` }}
        />
        {/* Moderate threshold marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-warning/80"
          style={{ left: `${modPct}%` }}
          title={`Moderate threshold: ${moderateThreshold}`}
        />
        {/* Strong threshold marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-success/80"
          style={{ left: `${strongPct}%` }}
          title={`Strong threshold: ${strongThreshold}`}
        />
      </div>
      <div className="flex gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-2 h-0.5 bg-warning/80 rounded-full" />
          Mod {moderateThreshold}
        </span>
        <span className="flex items-center gap-0.5">
          <span className="inline-block w-2 h-0.5 bg-success/80 rounded-full" />
          Strong {strongThreshold}
        </span>
      </div>
    </div>
  )
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

  const top = finalSignal
    ? Math.max(finalSignal.bullScore, finalSignal.bearScore)
    : 0
  const gap = finalSignal
    ? Math.abs(finalSignal.bullScore - finalSignal.bearScore)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp size={14} className="text-primary" />
          Signal Scores
          <InfoTooltip content="Aggregated quantitative scoring engine combining Macro/Institutional setup and 1-min Technical indicators into actionable trades." />
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

            {/* Score-to-threshold progress */}
            <ThresholdProgress
              top={top}
              scoreMax={finalSignal.scoreMax}
              strongThreshold={config.strongThreshold}
              moderateThreshold={config.moderateThreshold}
            />

            {/* Threshold fire indicators */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <ThresholdPill
                label="Strong"
                threshold={config.strongThreshold}
                gap={gap}
                gapNeeded={config.strongGap}
                top={top}
                tooltip={`Score ≥ ${config.strongThreshold} AND bull−bear gap ≥ ${config.strongGap} → Strong signal (full position).`}
              />
              <ThresholdPill
                label="Moderate"
                threshold={config.moderateThreshold}
                gap={gap}
                gapNeeded={config.moderateGap}
                top={top}
                tooltip={`Score ≥ ${config.moderateThreshold} AND bull−bear gap ≥ ${config.moderateGap} → Moderate signal (half position).`}
              />
              <span
                className="flex items-center gap-1 ml-auto text-[10px] tabular-nums"
                title="Current bull−bear score gap"
              >
                Gap:{' '}
                <span className="font-semibold text-foreground">{gap}</span>
                <InfoTooltip content="Absolute difference between Bullish and Bearish scores. Must exceed the gap threshold for a trade to fire — prevents close-contest signals." />
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
                  Macro:{' '}
                  <span className="font-medium text-foreground">
                    {finalSignal.v3}
                  </span>
                  <InfoTooltip content="Macro &amp; Institutional layer bias signal derived from global markets, FII positioning, and market breadth." />
                </span>
                <span className="flex items-center gap-1">
                  Technical:{' '}
                  <span className="font-medium text-foreground">
                    {finalSignal.v4}
                  </span>
                  <InfoTooltip content="1-minute Technical Indicator layer bias signal (EMA, ADX, RSI, Bollinger, PCR)." />
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
