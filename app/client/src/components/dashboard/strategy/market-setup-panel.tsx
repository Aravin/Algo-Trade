import type { VrdData } from '@/lib/types'
import { Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoTooltip } from '@/components/ui/tooltip'

function Item({
  label,
  value,
  positive,
  tooltip,
}: {
  label: string
  value: string | null
  positive?: boolean | null
  tooltip?: string
}) {
  const color =
    positive === true
      ? 'text-success'
      : positive === false
        ? 'text-destructive'
        : 'text-foreground'
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </span>
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
          <InfoTooltip content="Macro & sentiment setup including India VIX volatility, FII derivatives positioning, Nifty PE valuation, and Market Mood Index." />
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
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-x-6 gap-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Volatility
            </p>
            <Item
              label="India VIX"
              value={vixLabel}
              positive={vixOk}
              tooltip="India Volatility Index. Measures 30-day expected market volatility from option prices. 10-25 is normal; >25 signals high volatility/fear; <10 signals low volatility."
            />
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
              tooltip="Percentage of Index Futures contracts held long by Foreign Institutional Investors. >50% indicates bullish institutional bias."
            />
            <Item
              label="Short %"
              value={
                fii?.shortPct !== null && fii?.shortPct !== undefined
                  ? `${fii.shortPct}%`
                  : null
              }
              positive={null}
              tooltip="Percentage of Index Futures contracts held short by FIIs. >70-90% signals extreme short overhang with potential for short-covering rallies."
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
              tooltip="Nifty 50 Price-to-Earnings Ratio. Indicates overall market valuation relative to trailing earnings."
            />
            <Item
              label="PE Label"
              value={vrdData?.niftyPe?.label ?? null}
              positive={null}
              tooltip="Qualitative market valuation regime (e.g., Fair Valuation, Overvalued, Synthetic Overvaluation)."
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
              tooltip="Market Mood Index score (0-100). Aggregates sentiment indicators. <30 = Fear/Extreme Fear; >70 = Greed/Extreme Greed."
            />
            <Item
              label="MMI Label"
              value={vrdData?.mmi?.label ?? null}
              positive={null}
              tooltip="Current Market Mood Index sentiment classification."
            />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Pre-Market
            </p>
            <Item
              label="Gift Nifty"
              value={
                vrdData?.giftNifty?.price !== null &&
                vrdData?.giftNifty?.price !== undefined
                  ? vrdData.giftNifty.price.toLocaleString('en-IN', {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 2,
                    })
                  : null
              }
              positive={null}
              tooltip="Gift Nifty spot/future index price traded on NSE IX."
            />
            <Item
              label="Gap Points"
              value={
                vrdData?.giftNifty?.changePts !== null &&
                vrdData?.giftNifty?.changePts !== undefined
                  ? `${vrdData.giftNifty.changePts > 0 ? '+' : ''}${vrdData.giftNifty.changePts} (${vrdData.giftNifty.changePct?.toFixed(2)}%)`
                  : null
              }
              positive={
                vrdData?.giftNifty?.changePts !== null &&
                vrdData?.giftNifty?.changePts !== undefined
                  ? vrdData.giftNifty.changePts > 0
                  : null
              }
              tooltip="Expected index opening gap points and percentage based on Gift Nifty index premium/discount."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
