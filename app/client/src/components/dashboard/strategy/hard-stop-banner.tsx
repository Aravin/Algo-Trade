import { AlertTriangle } from 'lucide-react'

export function HardStopBanner({ reasons }: { reasons: string[] }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
      <AlertTriangle size={16} className="text-destructive mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-destructive">Trading Blocked</p>
        <ul className="mt-1 space-y-0.5">
          {reasons.map((r, i) => (
            <li key={i} className="text-xs text-destructive/80">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
