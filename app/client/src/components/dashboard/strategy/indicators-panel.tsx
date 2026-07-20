import type { IndicatorsResult, SignalType, MomentumType } from '@/lib/types'
import { BarChart2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoTooltip } from '@/components/ui/tooltip'

function signalColor(s: SignalType | MomentumType) {
  if (s === 'Buy' || s === 'Oversold') return 'text-success'
  if (s === 'Sell' || s === 'Overbought') return 'text-destructive'
  return 'text-warning'
}

function signalBg(s: SignalType | MomentumType) {
  if (s === 'Buy' || s === 'Oversold') return 'bg-success/10 border-success/30'
  if (s === 'Sell' || s === 'Overbought')
    return 'bg-destructive/10 border-destructive/30'
  return 'bg-muted border-border'
}

function IndicatorCard({
  label,
  signal,
  value,
  sub,
  tooltip,
}: {
  label: string
  signal: SignalType | MomentumType
  value?: string
  sub?: string
  tooltip?: string
}) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${signalBg(signal)}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      <p className={`text-sm font-semibold mt-0.5 ${signalColor(signal)}`}>
        {signal}
      </p>
      {value && (
        <p className="text-xs font-mono mt-0.5 text-foreground">{value}</p>
      )}
      {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  )
}

export function IndicatorsPanel({
  indicators,
}: {
  indicators: IndicatorsResult | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 size={14} className="text-primary" />
          Technical Indicators (V4 — 1-min OHLC)
          <InfoTooltip content="Real-time 1-minute OHLC technical analysis engine (V4). Aggregates EMA crossover, ADX trend strength, RSI, Stochastic, Bollinger Bands, ATR, and OI PCR." />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {!indicators ? (
          <p className="text-xs text-muted-foreground">
            Waiting for candle data…
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <IndicatorCard
              label="EMA (10/42)"
              signal={indicators.ema}
              tooltip="Exponential Moving Average crossover. Fast EMA (10) above Slow EMA (42) generates a Buy (Bullish) signal, below generates Sell (Bearish)."
            />
            <IndicatorCard
              label="ADX (14)"
              signal={indicators.adx}
              sub={indicators.adx === 'Hold' ? 'ADX < 25' : undefined}
              tooltip="Average Directional Index (14-period). Measures trend strength regardless of direction. ADX ≥ 25 confirms trend strength; ADX < 25 signals non-trending/ranging market (Hold)."
            />
            <IndicatorCard
              label="RSI (14)"
              signal={indicators.rsi.signal}
              value={indicators.rsi.value.toFixed(1)}
              tooltip="Relative Strength Index. RSI > 70 indicates Overbought conditions (Sell / downside risk); RSI < 30 indicates Oversold conditions (Buy opportunity)."
            />
            <IndicatorCard
              label="Stochastic"
              signal={indicators.stochastic.signal}
              value={`K:${indicators.stochastic.k.toFixed(1)} D:${indicators.stochastic.d.toFixed(1)}`}
              tooltip="Stochastic Oscillator (%K and %D lines). Crossovers in extreme momentum zones (K > 80 Overbought, K < 20 Oversold) indicate reversal or momentum direction."
            />
            <IndicatorCard
              label="Bollinger (20)"
              signal={indicators.bollinger.signal}
              sub={`Trend: ${indicators.bollinger.trend}`}
              tooltip="Bollinger Bands (20-period, 2 std dev). Price breaking above upper band indicates strong Up trend (Buy CE bias); breaking below lower band indicates Down trend (Buy PE bias)."
            />
            <IndicatorCard
              label="ATR (14)"
              signal={
                indicators.atr.level === 'High'
                  ? 'Buy'
                  : indicators.atr.level === 'Low'
                    ? 'Sell'
                    : 'Hold'
              }
              value={indicators.atr.value.toFixed(2)}
              sub={indicators.atr.level}
              tooltip="Average True Range (14-period). Measures price volatility per 1-min candle in index points. High ATR indicates wider price swings."
            />
          </div>
        )}
        {indicators && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              OI PCR:
              <InfoTooltip content="Intraday Options Chain Put/Call Ratio calculated dynamically from active strike open interest." />
            </span>
            <span
              className={`text-xs font-semibold ${signalColor(indicators.pcr)}`}
            >
              {indicators.pcr}
            </span>
            <span className="text-xs text-muted-foreground ml-1">
              ({indicators.pcrValue.toFixed(3)})
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
