import type { VrdData } from '@/lib/types'
import { Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { InfoTooltip } from '@/components/ui/tooltip'
import {
  scoreMMI,
  scoreFiiLongShort,
  scoreFiiPositioning,
  scoreNiftyPE,
} from '@/lib/vrdSignals'

function ScoreRow({
  label,
  score,
  max,
  detail,
  tooltip,
}: {
  label: string
  score: number
  max: number
  detail?: string
  tooltip?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0
  const color =
    score > 0
      ? 'bg-success'
      : score < 0
        ? 'bg-destructive'
        : 'bg-muted-foreground/30'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip && <InfoTooltip content={tooltip} />}
        </span>
        <span className="text-xs font-medium tabular-nums">
          {score > 0 ? '+' : ''}
          {score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {detail && <p className="text-xs text-muted-foreground/70">{detail}</p>}
    </div>
  )
}

export function InstitutionalPanel({ vrdData }: { vrdData: VrdData | null }) {
  if (!vrdData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 size={14} className="text-primary" />
            Institutional Flow
            <InfoTooltip content="Macro & institutional score breakdown using Market Mood Index, FII derivatives, and Nifty PE valuation." />
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">Fetching data…</p>
        </CardContent>
      </Card>
    )
  }

  const mmi = scoreMMI(vrdData.mmi?.score ?? null)
  const fiiLS = scoreFiiLongShort(
    vrdData.fiiLongShort?.longPct ?? null,
    vrdData.fiiLongShort?.shortPct ?? null,
  )
  const fiiPos = scoreFiiPositioning(
    vrdData.fiiPositioning?.netPosition ?? null,
    vrdData.fiiPositioning?.consecutiveShortDays ?? null,
  )
  const pe = scoreNiftyPE(vrdData.niftyPe?.pe ?? null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 size={14} className="text-primary" />
          Institutional Flow
          <InfoTooltip content="Macro & institutional score breakdown. Calculates contrarian sentiment points and institutional positioning signals for strategy entry decisions." />
          {mmi.contrarian && (
            <Badge variant="destructive" className="ml-auto text-xs">
              CONTRARIAN SIGNAL
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <ScoreRow
          label="Market Mood Index"
          score={mmi.score}
          max={mmi.max}
          detail={mmi.detail}
          tooltip="Contrarian sentiment scoring model based on MMI. Extreme Greed (>70) deducts points due to downside risk; Extreme Fear (<30) adds points."
        />
        <ScoreRow
          label="FII Long/Short %"
          score={fiiLS.score}
          max={fiiLS.max}
          detail={fiiLS.label}
          tooltip="Scores FII derivative futures ratio. Heavy short ratio (>70-90%) adds points (+3) anticipating a short-covering squeeze."
        />
        <ScoreRow
          label="FII Net Positioning"
          score={fiiPos.score}
          max={fiiPos.max}
          detail={fiiPos.label}
          tooltip="Evaluates total net FII open contract volume and streak of consecutive short/long accumulation days."
        />
        <ScoreRow
          label="Nifty PE Valuation"
          score={pe.score}
          max={pe.max}
          detail={pe.label}
          tooltip="Valuation scoring component. Nifty PE below historical baseline (<24) adds points (+1); high PE yields 0 points."
        />
      </CardContent>
    </Card>
  )
}
