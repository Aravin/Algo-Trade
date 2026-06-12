import type { SourceStatus } from '@/hooks/useStrategyBot'

const DOT: Record<SourceStatus, string> = {
  ok: 'bg-success',
  error: 'bg-destructive',
  stale: 'bg-warning',
  pending: 'bg-warning animate-pulse',
  unknown: 'bg-muted-foreground/30',
}
const LABEL: Record<SourceStatus, string> = {
  ok: 'ok',
  error: 'err',
  stale: 'stale',
  pending: '…',
  unknown: '—',
}
const SOURCES: { key: string; label: string }[] = [
  { key: 'candles', label: 'Candles' },
  { key: 'option-chain', label: 'OptionChain' },
  { key: 'vix', label: 'VIX' },
  { key: 'breadth', label: 'Breadth' },
  { key: 'global-sentiment', label: 'Global Sentiment' },
  { key: 'upstox/fii', label: 'Upstox FII' },
  { key: 'upstox/dii', label: 'Upstox DII' },
  { key: 'upstox/pcr', label: 'Upstox PCR' },
  { key: 'upstox/max-pain', label: 'Max Pain' },
  { key: 'synthetic/value', label: 'Proxy Value' },
]

export function SourceStatusBar({
  sourceStatus,
}: {
  sourceStatus: Record<string, SourceStatus>
}) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-1">
      {SOURCES.map(({ key, label }) => {
        const s = sourceStatus?.[key] ?? 'unknown'
        return (
          <div
            key={key}
            className="flex items-center gap-1"
            title={`${label}: ${s}`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${DOT[s]}`}
            />
            <span className="text-xs text-muted-foreground">{label}</span>
            <span
              className={`text-xs font-medium ${s === 'ok' ? 'text-success' : s === 'error' ? 'text-destructive' : 'text-warning'}`}
            >
              {LABEL[s]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
