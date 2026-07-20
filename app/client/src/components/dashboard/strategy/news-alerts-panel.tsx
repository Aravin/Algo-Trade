import type { NewsAlert } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { InfoTooltip } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Calendar, ShieldAlert } from 'lucide-react'

export function NewsAlertsPanel({
  alerts,
}: {
  alerts: NewsAlert[] | null | undefined
}) {
  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert size={14} className="text-primary" />
            Macro & Nifty Earnings Guard
            <InfoTooltip content="Real-time news alerts classified dynamically for high-impact macro risks and corporate earnings announcements." />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground/80 italic">
            No high-impact macro or earnings alerts classified in the last 24
            hours.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldAlert size={14} className="text-primary" />
          Macro & Nifty Earnings Guard
          <InfoTooltip content="Real-time news alerts classified dynamically for high-impact macro risks and corporate earnings announcements." />
          <Badge variant="secondary" className="ml-auto text-xs">
            {alerts.length} ALERTS ACTIVE
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
        {alerts.map((alert) => {
          const typeColor =
            alert.type === 'MACRO'
              ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
              : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'

          const severityColor =
            alert.severity === 'HIGH'
              ? 'bg-destructive/10 text-destructive border-destructive/20 font-bold'
              : alert.severity === 'MEDIUM'
                ? 'bg-warning/10 text-warning border-warning/20 font-medium'
                : 'text-muted-foreground border-border/40 bg-accent/20'

          return (
            <div
              key={alert.id}
              className="flex flex-col gap-1.5 p-3 rounded-lg border border-border/40 bg-accent/20 last:mb-0 transition-all hover:bg-accent/40"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${typeColor}`}
                  >
                    {alert.type}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] ${severityColor}`}
                  >
                    {alert.severity} RISK
                  </span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar size={10} />
                  <span>
                    {new Date(alert.timestamp).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-foreground flex items-start gap-1.5 leading-snug">
                  {alert.severity === 'HIGH' && (
                    <AlertCircle
                      size={12}
                      className="text-destructive shrink-0 mt-0.5"
                    />
                  )}
                  {alert.headline}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-1 leading-normal">
                  {alert.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {alert.matchedKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[9px] px-1.5 py-0.5 rounded bg-muted/65 text-muted-foreground border border-border/40 font-mono"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
