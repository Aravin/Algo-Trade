import type { StrategyConfig } from '@/lib/types'
import { DEFAULT_CONFIG } from '@/lib/types'
import { useState } from 'react'
import { Settings, Zap, Shield, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoTooltip } from '@/components/ui/tooltip'
import { saveStrategyConfig } from '@/lib/strategyConfig'

// ─── Score max reference (dynamic, but ~27 when all VRD sources up) ──────────
const APPROX_MAX = 27

const PRESETS: Record<
  string,
  {
    label: string
    icon: React.ReactNode
    description: string
    values: Pick<
      StrategyConfig,
      'strongThreshold' | 'moderateThreshold' | 'strongGap' | 'moderateGap'
    >
  }
> = {
  conservative: {
    label: 'Conservative',
    icon: <Shield size={11} />,
    description: 'High-quality signals only. Fewer trades, lower noise.',
    values: {
      strongThreshold: 17,
      moderateThreshold: 12,
      strongGap: 7,
      moderateGap: 4,
    },
  },
  balanced: {
    label: 'Balanced',
    icon: <TrendingUp size={11} />,
    description: 'Recommended. Good signal quality with reasonable frequency.',
    values: {
      strongThreshold: 14,
      moderateThreshold: 10,
      strongGap: 6,
      moderateGap: 3,
    },
  },
  aggressive: {
    label: 'Aggressive',
    icon: <Zap size={11} />,
    description: 'More signals, higher trade frequency, increased risk.',
    values: {
      strongThreshold: 12,
      moderateThreshold: 8,
      strongGap: 4,
      moderateGap: 2,
    },
  },
}

function Field({
  label,
  value,
  onChange,
  type = 'number',
  step,
  min,
  max,
  tooltip,
  hint,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  step?: number
  min?: number
  max?: number
  tooltip?: string
  hint?: string
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </label>
      <input
        type={type}
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {hint && (
        <p className="text-[10px] text-muted-foreground/70 tabular-nums">
          {hint}
        </p>
      )}
    </div>
  )
}

export function StrategyConfig({
  config,
  onSave,
}: {
  config: StrategyConfig
  onSave: (c: StrategyConfig) => void
}) {
  const [local, setLocal] = useState<StrategyConfig>(config)
  const [saved, setSaved] = useState(false)

  function set<K extends keyof StrategyConfig>(k: K, v: StrategyConfig[K]) {
    setLocal((prev) => ({ ...prev, [k]: v }))
  }

  function handleSave() {
    saveStrategyConfig(local)
    onSave(local)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    setLocal(DEFAULT_CONFIG)
  }

  function applyPreset(key: string) {
    const preset = PRESETS[key]
    if (!preset) return
    setLocal((prev) => ({ ...prev, ...preset.values }))
  }

  const strongPct = Math.round((local.strongThreshold / APPROX_MAX) * 100)
  const modPct = Math.round((local.moderateThreshold / APPROX_MAX) * 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings size={14} className="text-primary" />
          Strategy Config
          <InfoTooltip content="Adjust algorithmic strategy signal thresholds, risk management parameters, trade cutoffs, and execution mode." />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* ── Threshold presets ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Threshold Presets
          </p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PRESETS).map(([key, preset]) => {
              const isActive =
                local.strongThreshold === preset.values.strongThreshold &&
                local.moderateThreshold === preset.values.moderateThreshold &&
                local.strongGap === preset.values.strongGap &&
                local.moderateGap === preset.values.moderateGap
              return (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  title={preset.description}
                  className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer
                    ${
                      isActive
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-primary/50 hover:bg-muted text-muted-foreground'
                    }`}
                >
                  {preset.icon}
                  {preset.label}
                </button>
              )
            })}
          </div>
          {Object.entries(PRESETS).map(([key, preset]) => {
            const isActive =
              local.strongThreshold === preset.values.strongThreshold &&
              local.moderateThreshold === preset.values.moderateThreshold &&
              local.strongGap === preset.values.strongGap &&
              local.moderateGap === preset.values.moderateGap
            if (!isActive) return null
            return (
              <p key={key} className="text-[10px] text-muted-foreground">
                {preset.description}
              </p>
            )
          })}
        </div>

        {/* ── Score thresholds ───────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            Score Thresholds
            <InfoTooltip content="Minimum combined score required to trigger each confidence level. Effective max score is ~27 when all VRD data sources are available." />
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Strong Threshold"
              value={local.strongThreshold}
              min={1}
              onChange={(v) => set('strongThreshold', Number(v))}
              tooltip="Minimum total score points needed to trigger a Strong signal (executes 100% position size)."
              hint={`≈ ${strongPct}% of theoretical max (~${APPROX_MAX} pts)`}
            />
            <Field
              label="Moderate Threshold"
              value={local.moderateThreshold}
              min={1}
              onChange={(v) => set('moderateThreshold', Number(v))}
              tooltip="Minimum total score points needed to trigger a Moderate signal (executes 50% position size)."
              hint={`≈ ${modPct}% of theoretical max (~${APPROX_MAX} pts)`}
            />
          </div>
        </div>

        {/* ── Gap thresholds ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
            Gap Thresholds
            <InfoTooltip content="The bull−bear score difference must also exceed these values. This prevents close-contest signals where the market direction is ambiguous." />
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Strong Gap"
              value={local.strongGap}
              min={1}
              max={15}
              onChange={(v) => set('strongGap', Number(v))}
              tooltip={`Bull−bear score gap required for Strong confidence. Higher = more decisive market alignment needed before a Strong signal fires.`}
              hint="Recommended: 5–7"
            />
            <Field
              label="Moderate Gap"
              value={local.moderateGap}
              min={1}
              max={10}
              onChange={(v) => set('moderateGap', Number(v))}
              tooltip="Bull−bear score gap required for Moderate confidence."
              hint="Recommended: 2–4"
            />
          </div>
        </div>

        {/* ── Risk management ────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Risk Management
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Field
              label="Max Profit %"
              value={local.maxProfitPct}
              min={1}
              step={0.5}
              onChange={(v) => set('maxProfitPct', Number(v))}
              tooltip="Take-profit percentage target to trigger order exit or trailing stop initialization."
            />
            <Field
              label="Max Loss %"
              value={local.maxLossPct}
              min={1}
              step={0.5}
              onChange={(v) => set('maxLossPct', Number(v))}
              tooltip="Hard stop-loss percentage limit to close trade and prevent catastrophic loss."
            />
            <Field
              label="Max Trades/Day"
              value={local.maxTradesPerDay}
              min={1}
              max={10}
              onChange={(v) => set('maxTradesPerDay', Number(v))}
              tooltip="Maximum trade executions allowed per trading day to control overtrading."
            />
            <Field
              label="Last Entry Time"
              value={local.lastEntryTime}
              type="text"
              onChange={(v) => set('lastEntryTime', v)}
              tooltip="Daily trading cutoff time (HH:MM). No new positions will be taken after this time."
            />
            <Field
              label="Polling Interval (s)"
              value={local.pollingIntervalSec}
              min={30}
              onChange={(v) => set('pollingIntervalSec', Number(v))}
              tooltip="Refresh frequency in seconds for strategy ticks, technical indicators, and market breadth updates."
            />
            <Field
              label="OTM Skip Strikes"
              value={local.otmSkip}
              min={0}
              max={10}
              onChange={(v) => set('otmSkip', Number(v))}
              tooltip="Number of Out-of-the-Money strikes away from ATM to select when generating orders."
            />
          </div>
        </div>

        {/* ── Selects ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              Minimum Confidence
              <InfoTooltip content="Minimum signal confidence required before executing automated orders." />
            </label>
            <select
              value={local.minConfidence}
              onChange={(e) =>
                set(
                  'minConfidence',
                  e.target.value as StrategyConfig['minConfidence'],
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="strong">Strong only</option>
              <option value="moderate">Moderate or above</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              Execution Mode
              <InfoTooltip content="Switch between real Upstox broker order placement (Live) and virtual simulated execution (Paper)." />
            </label>
            <select
              value={local.executionMode}
              onChange={(e) =>
                set(
                  'executionMode',
                  e.target.value as StrategyConfig['executionMode'],
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="live">Live Orders</option>
              <option value="paper">Paper Trade</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              Trade Type
              <InfoTooltip content="Configure whether the strategy algorithm enters Option Buying, Option Selling, or Both." />
            </label>
            <select
              value={local.tradeType}
              onChange={(e) =>
                set('tradeType', e.target.value as StrategyConfig['tradeType'])
              }
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="buying">Option Buying (Long CE/PE)</option>
              <option value="selling">Option Selling (Short CE/PE)</option>
              <option value="both">Both (Long & Short)</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} className="flex-1">
            {saved ? 'Saved ✓' : 'Save Config'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleReset}>
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
