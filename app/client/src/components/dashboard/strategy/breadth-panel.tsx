import { Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { scoreADRatio, scoreStraddleIV } from '@/lib/vrdSignals'
import type { VrdData } from '@/lib/vrdSignals'

function PcrZoneBadge({ zone }: { zone: string | null | undefined }) {
  if (!zone) return <Badge variant="secondary">—</Badge>
  const v: Record<string, string> = {
    Bullish: 'bg-success/20 text-success border-success/30',
    Neutral: '',
    MildBear: 'bg-warning/20 text-warning border-warning/30',
    Bearish: 'bg-destructive/20 text-destructive border-destructive/30',
  }
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${v[zone] ?? ''}`}
    >
      {zone}
    </span>
  )
}

export function BreadthPanel({ vrdData }: { vrdData: VrdData | null }) {
  if (!vrdData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity size={14} className="text-primary" />
            Market Breadth
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">Fetching data…</p>
        </CardContent>
      </Card>
    )
  }

  const ad = vrdData.advancesDeclines
  const adS = scoreADRatio(
    ad?.advances ?? null,
    ad?.declines ?? null,
    ad?.ratio ?? null,
  )
  const ivS = scoreStraddleIV(vrdData.straddleIv?.percentAboveAvg ?? null)

  const pct =
    adS.max > 0
      ? Math.max(0, Math.min(100, (Math.abs(adS.score) / adS.max) * 100))
      : 0
  const barColor =
    adS.direction === 'BULL'
      ? 'bg-success'
      : adS.direction === 'BEAR'
        ? 'bg-destructive'
        : 'bg-muted-foreground/30'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity size={14} className="text-primary" />
          Market Breadth
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* A/D Ratio */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Advances / Declines
            </span>
            <span className="text-xs font-medium tabular-nums">
              {ad?.advances ?? '—'}↑ {ad?.declines ?? '—'}↓
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground/70">{adS.label}</p>
        </div>

        {/* PCR Zone */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Put Call Ratio</p>
            <p className="text-sm font-semibold mt-0.5">
              {vrdData.pcr?.value ?? '—'}
            </p>
          </div>
          <PcrZoneBadge zone={vrdData.pcr?.zone} />
        </div>

        {/* Straddle IV */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Straddle IV</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {ivS.label}
            </p>
          </div>
          <Badge
            variant={ivS.preferBuy ? 'outline' : 'secondary'}
            className="text-xs"
          >
            {ivS.preferBuy ? 'Buy Options' : 'Sell Options'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
