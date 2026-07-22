import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, RefreshCw, CheckCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getAccounts } from '@/lib/accounts'
import {
  useNotifications,
  requestNotificationPermission,
} from '@/lib/notifications'
import { useAuth0 } from '@auth0/auth0-react'
import { isAuth0Enabled } from '@/lib/auth0-config'

import { InfoTooltip } from '@/components/ui/tooltip'
import { getUpcomingIndexExpiry } from '@/lib/utils'

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
  { name: 'FIN NIFTY', value: '—', change: '—', pct: '', up: true },
  { name: 'SENSEX', value: '—', change: '—', pct: '', up: true },
  { name: 'INDIA VIX', value: '—', change: '—', pct: '', up: true },
]

const KEY_MAP = [
  { key: 'NSE_INDEX:Nifty 50', name: 'NIFTY 50' },
  { key: 'NSE_INDEX:Nifty Bank', name: 'BANK NIFTY' },
  { key: 'NSE_INDEX:Nifty Fin Service', name: 'FIN NIFTY' },
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
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { notifications, markAllAsRead, clearNotifications, markAsRead } =
    useNotifications()
  const unreadCount = notifications.filter((n) => !n.read).length
  const popupRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const { user, logout } = useAuth0()
  const auth0Enabled = isAuth0Enabled()

  useEffect(() => {
    requestNotificationPermission()

    function handleClickOutside(event: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false)
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
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
          {tickerItems.map((idx, index) => {
            const expiry = getUpcomingIndexExpiry(idx.name)
            const showExpiry = idx.name !== 'INDIA VIX'
            return (
              <div
                key={`${idx.name}-${index}`}
                className="flex items-center gap-2 shrink-0 whitespace-nowrap"
              >
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  {idx.name}
                  {showExpiry && (
                    <InfoTooltip
                      content={`${idx.name} Expiry: ${expiry.fullLabel} (${expiry.relativeText})`}
                      iconSize={11}
                    />
                  )}
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
            )
          })}
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

          <div className="relative" ref={popupRef}>
            <Button
              variant="ghost"
              size="icon"
              title="Notifications"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell size={15} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
              )}
            </Button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-popover text-popover-foreground border border-border rounded-md shadow-md z-50 overflow-hidden flex flex-col">
                <div className="p-3 font-semibold border-b border-border flex justify-between items-center text-sm">
                  <span>Notifications</span>
                  <div className="flex gap-2">
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={markAllAsRead}
                        title="Mark all as read"
                      >
                        <CheckCheck size={14} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={clearNotifications}
                      title="Clear notifications"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      No notifications
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`p-3 border-b border-border last:border-b-0 text-sm hover:bg-accent cursor-pointer transition-colors ${!n.read ? 'bg-accent/50 font-medium' : ''}`}
                        onClick={() => markAsRead(n.id)}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <span
                            className={`font-semibold ${n.type === 'error' ? 'text-destructive' : n.type === 'success' ? 'text-success' : 'text-foreground'}`}
                          >
                            {n.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {new Date(n.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-1 text-xs">
                          {n.message}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div
            className="flex items-center gap-2 ml-2 relative"
            ref={userMenuRef}
          >
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-8 h-8 rounded-full overflow-hidden border border-border bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary hover:opacity-85 transition-opacity cursor-pointer focus:outline-none"
            >
              {auth0Enabled && user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name ?? 'User'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>
                  {auth0Enabled && user?.name
                    ? user.name.substring(0, 2).toUpperCase()
                    : 'AA'}
                </span>
              )}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-10 w-56 bg-popover text-popover-foreground border border-border rounded-md shadow-md z-50 overflow-hidden flex flex-col p-2">
                {auth0Enabled ? (
                  <>
                    <div className="px-3 py-2 border-b border-border mb-1 text-left">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {user?.name ?? 'User'}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {user?.email ?? ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start text-xs text-destructive hover:bg-destructive/10 hover:text-destructive w-full cursor-pointer"
                      onClick={() => {
                        void logout({
                          logoutParams: { returnTo: window.location.origin },
                        })
                      }}
                    >
                      Log Out
                    </Button>
                  </>
                ) : (
                  <div className="px-3 py-2 text-left">
                    <p className="text-xs font-semibold text-foreground">
                      Local Developer Mode
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Auth0 environment variables are not configured.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
