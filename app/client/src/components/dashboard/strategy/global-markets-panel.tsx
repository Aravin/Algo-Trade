import { Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GlobalIndexItem } from '@/hooks/useStrategyBot'
import { evaluateGlobalSentiment } from '@/lib/v3Sentiment'

interface MarketConfig {
  key: string | null
  label: string
  fallbackValue?: number
  fallbackChange?: number
  isIndicator?: boolean
}

// VRD Nation displayName values (as returned in globalIndicesByRegion)
const US_MARKETS: MarketConfig[] = [
  { key: 'Dow Jones', label: 'Dow Jones' },
  { key: 'Nasdaq', label: 'Nasdaq' },
  { key: 'S&P 500', label: 'S&P 500' },
  { key: 'Dow Future', label: 'Dow Future' },
]

const ASIAN_MARKETS: MarketConfig[] = [
  { key: 'Hang Seng', label: 'Hang Seng' },
  { key: 'Nikkei ', label: 'Nikkei 225' },
  { key: 'Shanghai', label: 'Shanghai' },
  { key: 'KOSPI', label: 'KOSPI' },
]

const COMMODITIES_FOREX: MarketConfig[] = [
  { key: 'USD/INR', label: 'USD/INR', isIndicator: true },
  { key: 'Brent oil', label: 'Brent Oil', isIndicator: true },
  { key: 'Gold', label: 'Gold', isIndicator: true },
  { key: 'Bitcoin/INR', label: 'Bitcoin/INR', isIndicator: true },
]

function MarketItemRow({
  config,
  liveData,
}: {
  config: MarketConfig
  liveData?: GlobalIndexItem
}) {
  const isStatic = config.key === null || !liveData
  // MoneyControl provides `ltp` or `current` for price; fall back through known field names
  const rawPrice = liveData
    ? Number(liveData.ltp ?? liveData.current ?? liveData.last_price ?? 0)
    : 0
  const price = !isStatic && liveData ? rawPrice : (config.fallbackValue ?? 0)
  const change =
    !isStatic && liveData
      ? Number(liveData.change_per ?? 0)
      : (config.fallbackChange ?? 0)

  const formattedPrice = price.toLocaleString('en-IN', {
    minimumFractionDigits: price % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })

  const isPositive = change > 0
  const isNegative = change < 0
  const badgeColor = isPositive
    ? 'bg-success/15 text-success border-success/30'
    : isNegative
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : 'bg-muted text-muted-foreground border-border'

  const sign = isPositive ? '▲ +' : isNegative ? '▼ ' : ''

  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 hover:bg-muted/30 px-2 rounded-md transition-colors duration-150">
      <div className="flex flex-col">
        <span className="text-xs font-semibold text-foreground">
          {config.label}
        </span>
        {isStatic && (
          <span className="text-[10px] text-muted-foreground/80 font-mono tracking-wider uppercase">
            Static Fallback
          </span>
        )}
        {!isStatic && liveData && (
          <span className="text-[10px] text-muted-foreground font-mono">
            {liveData.symbol}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono font-bold text-foreground">
          {formattedPrice}
        </span>
        <span
          className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${badgeColor}`}
        >
          {sign}
          {change.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

export function GlobalMarketsPanel({
  globalIndices,
}: {
  globalIndices: GlobalIndexItem[] | null
}) {
  const findLive = (key: string | null) => {
    if (!key || !globalIndices) return undefined
    return globalIndices.find(
      (item) => item.symbol.toLowerCase() === key.toLowerCase(),
    )
  }

  // Compute the live global sentiment for display
  const globalSentiment = globalIndices?.length
    ? evaluateGlobalSentiment(
        globalIndices.map((item) => ({
          symbol: item.symbol,
          change_per: item.change_per,
        })),
      )
    : null

  const sentimentColor =
    globalSentiment === 'bullish'
      ? 'bg-success/15 text-success border-success/30'
      : globalSentiment === 'bearish'
        ? 'bg-destructive/15 text-destructive border-destructive/30'
        : 'bg-muted text-muted-foreground border-border'

  return (
    <Card className="border border-border/80 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Globe size={15} className="text-primary animate-pulse" />
          Global Markets & Indicators
          {globalSentiment && (
            <span
              className={`ml-auto text-[11px] font-mono px-2 py-0.5 rounded-full border ${sentimentColor}`}
            >
              {globalSentiment.toUpperCase()}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* US Markets */}
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-muted-foreground px-2 pb-1 border-b border-border/60">
              US MARKETS
            </h4>
            <div className="flex flex-col">
              {US_MARKETS.map((config) => (
                <MarketItemRow
                  key={config.label}
                  config={config}
                  liveData={findLive(config.key)}
                />
              ))}
            </div>
          </div>

          {/* Asian Indices */}
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-muted-foreground px-2 pb-1 border-b border-border/60">
              ASIAN INDICES
            </h4>
            <div className="flex flex-col">
              {ASIAN_MARKETS.map((config) => (
                <MarketItemRow
                  key={config.label}
                  config={config}
                  liveData={findLive(config.key)}
                />
              ))}
            </div>
          </div>

          {/* Commodities & Forex */}
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-muted-foreground px-2 pb-1 border-b border-border/60">
              COMMODITIES & FOREX
            </h4>
            <div className="flex flex-col">
              {COMMODITIES_FOREX.map((config) => (
                <MarketItemRow
                  key={config.label}
                  config={config}
                  liveData={findLive(config.key)}
                />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
