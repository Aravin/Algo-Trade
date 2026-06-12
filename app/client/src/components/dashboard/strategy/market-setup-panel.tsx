import type { VrdData } from '@/lib/types'
import { Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function Item({
  label,
  value,
  positive,
}: {
  label: string
  value: string | null
  positive?: boolean | null
}) {
  const color =
    positive === true
      ? 'text-success'
      : positive === false
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${color}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function MarketSetupPanel({ vrdData }: { vrdData: VrdData | null }) {
  const fii = vrdData?.fiiLongShort
  const vix = vrdData?.vix
  const vixLabel = vix !== null && vix !== undefined ? `${vix}` : null
  const vixOk = vix !== null && vix !== undefined && vix >= 10 && vix <= 25

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe size={14} className="text-primary" />
          Market Setup
          {vrdData && (
            <span className="ml-auto text-xs text-muted-foreground font-normal">
              {new Date(vrdData.fetchedAt).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Volatility
            </p>
            <Item label="India VIX" value={vixLabel} positive={vixOk} />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              FII
            </p>
            <Item
              label="Long %"
              value={
                fii?.longPct !== null && fii?.longPct !== undefined
                  ? `${fii.longPct}%`
                  : null
              }
              positive={
                fii?.longPct !== null &&
                fii?.longPct !== undefined &&
                fii.longPct > 50
              }
            />
            <Item
              label="Short %"
              value={
                fii?.shortPct !== null && fii?.shortPct !== undefined
                  ? `${fii.shortPct}%`
                  : null
              }
              positive={null}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Valuation
            </p>
            <Item
              label="Nifty PE"
              value={
                vrdData?.niftyPe?.pe !== null &&
                vrdData?.niftyPe?.pe !== undefined
                  ? `${vrdData.niftyPe.pe}`
                  : null
              }
              positive={
                vrdData?.niftyPe?.pe !== null &&
                vrdData?.niftyPe?.pe !== undefined &&
                vrdData.niftyPe.pe < 24
              }
            />
            <Item
              label="PE Label"
              value={vrdData?.niftyPe?.label ?? null}
              positive={null}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Mood
            </p>
            <Item
              label="MMI Score"
              value={
                vrdData?.mmi?.score !== null &&
                vrdData?.mmi?.score !== undefined
                  ? `${vrdData.mmi.score}`
                  : null
              }
              positive={
                vrdData?.mmi?.score !== null &&
                vrdData?.mmi?.score !== undefined &&
                vrdData.mmi.score < 50
              }
            />
            <Item
              label="MMI Label"
              value={vrdData?.mmi?.label ?? null}
              positive={null}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
