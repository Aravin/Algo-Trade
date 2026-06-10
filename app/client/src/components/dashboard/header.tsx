import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getAccounts } from '@/lib/accounts'

interface IndexData {
  name: string
  value: string
  change: string
  pct: string
  up: boolean
}

const BLANK: IndexData[] = [
  { name: 'NIFTY 50', value: '—', change: '—', pct: '', up: true },
  { name: 'BANK NIFTY', value: '—', change: '—', pct: '', up: true },
  { name: 'SENSEX', value: '—', change: '—', pct: '', up: true },
  { name: 'INDIA VIX', value: '—', change: '—', pct: '', up: true },
]

const KEY_MAP = [
  { key: 'NSE_INDEX:Nifty 50', name: 'NIFTY 50' },
  { key: 'NSE_INDEX:Nifty Bank', name: 'BANK NIFTY' },
  { key: 'BSE_INDEX:SENSEX', name: 'SENSEX' },
  { key: 'NSE_INDEX:India VIX', name: 'INDIA VIX' },
] as const

function fmt(n: number) {
  return n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseIndices(data: Record<string, unknown>): IndexData[] {
  return KEY_MAP.map(({ key, name }) => {
    const d = data[key] as
      | Record<string, number & { ohlc?: { close: number } }>
      | undefined
    if (!d) return BLANK.find((b) => b.name === name)!
    const last = d.last_price as unknown as number
    const change = d.net_change as unknown as number
    const close =
      (d.ohlc as unknown as { close: number } | undefined)?.close ??
      last - change
    const pct = close ? (change / close) * 100 : 0
    const sign = change >= 0 ? '+' : ''
    return {
      name,
      value: fmt(last),
      change: `${sign}${fmt(change)}`,
      pct: `${sign}${pct.toFixed(2)}%`,
      up: change >= 0,
    }
  })
}

function useIndices(isMarketOpen: boolean) {
  const [indices, setIndices] = useState<IndexData[]>(BLANK)
  const [isLive, setIsLive] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fetchedOnce = useRef(false)

  const load = useCallback(async () => {
    const account = getAccounts().find((a) => a.accessToken)
    if (!account?.accessToken) return
    try {
      const res = await fetch('/api/market/indices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: account.accessToken }),
      })
      const json = (await res.json()) as {
        status: string
        data: Record<string, unknown>
      }
      if (json.status === 'success' && json.data) {
        setIndices(parseIndices(json.data))
        setIsLive(isMarketOpen)
        fetchedOnce.current = true
      }
    } catch {
      // keep previous values
    }
  }, [isMarketOpen])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    if (timerRef.current) clearInterval(timerRef.current)
    if (isMarketOpen) {
      timerRef.current = setInterval(() => void load(), 60_000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isMarketOpen, load])

  return { indices, isLive, refresh: load }
}

// NSE: 9:15–15:30 IST on weekdays
function getMarketInfo() {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 6=Sat
  const total = now.getHours() * 60 + now.getMinutes()
  const isWeekday = day >= 1 && day <= 5
  const isOpen = isWeekday && total >= 555 && total <= 930

  let hint: string
  if (isOpen) {
    const closeAt = new Date(now)
    closeAt.setHours(15, 30, 0, 0)
    const diff = closeAt.getTime() - now.getTime()
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    hint = h > 0 ? `closes in ${h}h ${m}m` : `closes in ${m}m`
  } else {
    // find next 9:15 on a weekday
    const next = new Date(now)
    next.setSeconds(0, 0)
    if (total >= 930 || !isWeekday) next.setDate(next.getDate() + 1)
    while (next.getDay() === 0 || next.getDay() === 6)
      next.setDate(next.getDate() + 1)
    next.setHours(9, 15, 0, 0)
    const diff = next.getTime() - now.getTime()
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    hint =
      h >= 24
        ? `opens ${next.toLocaleDateString('en-IN', { weekday: 'short' })} 9:15 AM`
        : h > 0
          ? `opens in ${h}h ${m}m`
          : `opens in ${m}m`
  }
  return { isOpen, hint }
}

function useMarketStatus() {
  const [info, setInfo] = useState(getMarketInfo)
  useEffect(() => {
    const t = setInterval(() => setInfo(getMarketInfo()), 60_000)
    return () => clearInterval(t)
  }, [])
  return info
}

export function Header() {
  const { isOpen: isMarketOpen, hint: marketHint } = useMarketStatus()
  const { indices, isLive, refresh } = useIndices(isMarketOpen)
  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const dateStr = now.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const tickerItems = [...indices, ...indices]

  return (
    <header className="flex flex-col border-b border-border bg-card shrink-0">
      {/* Indices ticker */}
      <div className="ticker-marquee border-b border-border px-4 py-2 sm:px-6">
        <div className="ticker-marquee__track">
          {tickerItems.map((idx, index) => (
            <div
              key={`${idx.name}-${index}`}
              className="flex items-center gap-2 shrink-0 whitespace-nowrap"
            >
              <span className="text-xs text-muted-foreground font-medium">
                {idx.name}
              </span>
              <span className="text-xs font-semibold text-foreground">
                {idx.value}
              </span>
              {idx.pct && (
                <span
                  className={`text-xs font-medium ${idx.up ? 'text-success' : 'text-destructive'}`}
                >
                  {idx.change} ({idx.pct})
                </span>
              )}
            </div>
          ))}
          {isLive && (
            <span className="shrink-0 whitespace-nowrap flex items-center gap-1 text-xs text-muted-foreground pl-1 pr-5 sm:pr-6">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              live
            </span>
          )}
          {isLive && (
            <span className="shrink-0 whitespace-nowrap flex items-center gap-1 text-xs text-muted-foreground pl-1 pr-5 sm:pr-6">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              live
            </span>
          )}
        </div>
      </div>

      {/* Main header bar */}
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-3">
          <Badge
            variant={isMarketOpen ? 'success' : 'secondary'}
            className="text-xs"
          >
            {isMarketOpen ? '● NSE OPEN' : '○ NSE CLOSED'}
          </Badge>
          {marketHint && (
            <span className="text-xs text-muted-foreground">{marketHint}</span>
          )}
          <span className="text-sm text-muted-foreground">{dateStr}</span>
          <span className="text-sm font-mono font-medium text-foreground">
            {timeStr}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            title="Refresh data"
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Notifications"
            className="relative"
          >
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
          </Button>
          <div className="flex items-center gap-2 ml-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
              AA
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
