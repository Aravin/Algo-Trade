import { useState } from 'react'
import { Settings } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_CONFIG,
  saveStrategyConfig,
  type StrategyConfig,
} from '@/lib/strategyConfig'

function Field({
  label,
  value,
  onChange,
  type = 'number',
  step,
  min,
  max,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
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
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Field
            label="Strong Threshold"
            value={local.strongThreshold}
            min={1}
            onChange={(v) => set('strongThreshold', Number(v))}
          />
          <Field
            label="Moderate Threshold"
            value={local.moderateThreshold}
            min={1}
            onChange={(v) => set('moderateThreshold', Number(v))}
          />
          <Field
            label="Max Profit %"
            value={local.maxProfitPct}
            min={1}
            step={0.5}
            onChange={(v) => set('maxProfitPct', Number(v))}
          />
          <Field
            label="Max Loss %"
            value={local.maxLossPct}
            min={1}
            step={0.5}
            onChange={(v) => set('maxLossPct', Number(v))}
          />
          <Field
            label="Max Trades/Day"
            value={local.maxTradesPerDay}
            min={1}
            max={10}
            onChange={(v) => set('maxTradesPerDay', Number(v))}
          />
          <Field
            label="Last Entry Time"
            value={local.lastEntryTime}
            type="text"
            onChange={(v) => set('lastEntryTime', v)}
          />
          <Field
            label="Polling Interval (s)"
            value={local.pollingIntervalSec}
            min={30}
            onChange={(v) => set('pollingIntervalSec', Number(v))}
          />
          <Field
            label="OTM Skip Strikes"
            value={local.otmSkip}
            min={0}
            max={10}
            onChange={(v) => set('otmSkip', Number(v))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Minimum Confidence
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
          <label className="text-xs text-muted-foreground">
            Execution Mode
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
