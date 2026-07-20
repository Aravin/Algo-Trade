import type { StrategyConfig } from '@/lib/types'
import { DEFAULT_CONFIG } from '@/lib/types'
import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoTooltip } from '@/components/ui/tooltip'
import { saveStrategyConfig } from '@/lib/strategyConfig'

function Field({
  label,
  value,
  onChange,
  type = 'number',
  step,
  min,
  max,
  tooltip,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  step?: number
  min?: number
  max?: number
  tooltip?: string
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Field
            label="Strong Threshold"
            value={local.strongThreshold}
            min={1}
            onChange={(v) => set('strongThreshold', Number(v))}
            tooltip="Minimum total score points needed to trigger a Strong signal (executes 100% position size)."
          />
          <Field
            label="Moderate Threshold"
            value={local.moderateThreshold}
            min={1}
            onChange={(v) => set('moderateThreshold', Number(v))}
            tooltip="Minimum total score points needed to trigger a Moderate signal (executes 50% position size)."
          />
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
