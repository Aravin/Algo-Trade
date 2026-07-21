import type {
  IndicatorsResult,
  SignalType,
  MomentumType,
  BollingerSqueezeMetrics,
} from '@/lib/types'
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
  squeezeMetrics,
}: {
  indicators: IndicatorsResult | null
  squeezeMetrics?: BollingerSqueezeMetrics | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart2 size={14} className="text-primary" />
          Technical Indicators & Volatility Squeeze (1-min OHLC)
          <InfoTooltip content="Real-time 1-minute OHLC technical analysis. Aggregates EMA crossover, ADX trend strength, RSI, Stochastic, Bollinger Bands, ATR, OI PCR, and Bollinger Volatility Squeeze telemetry." />
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
        {squeezeMetrics && (
          <div className="mt-3 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-500 flex items-center gap-1">
                🔥 BOLLINGER SQUEEZE TELEMETRY:
              </span>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                  squeezeMetrics.breakoutDirection === 'CE'
                    ? 'bg-success/20 border-success/40 text-success'
                    : squeezeMetrics.breakoutDirection === 'PE'
                      ? 'bg-destructive/20 border-destructive/40 text-destructive'
                      : squeezeMetrics.isSqueezing
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-500'
                        : 'bg-muted border-border text-muted-foreground'
                }`}
              >
                {squeezeMetrics.breakoutDirection === 'CE'
                  ? '🚀 BREAKOUT (BUY CE)'
                  : squeezeMetrics.breakoutDirection === 'PE'
                    ? '🔻 BREAKOUT (BUY PE)'
                    : squeezeMetrics.isSqueezing
                      ? `🔥 SQUEEZING (${squeezeMetrics.squeezeCandleCount} candles)`
                      : '🟢 NORMAL VOLATILITY'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span>
                Bandwidth:{' '}
                <strong className="text-foreground">
                  {squeezeMetrics.bandwidthPct.toFixed(2)}%
                </strong>
              </span>
              <span>
                Limit:{' '}
                <strong className="text-muted-foreground">
                  ≤{squeezeMetrics.squeezeThresholdPct.toFixed(2)}%
                </strong>
              </span>
              <span>
                ADX:{' '}
                <strong className="text-foreground">
                  {squeezeMetrics.adxValue.toFixed(1)}
                </strong>
              </span>
            </div>
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
