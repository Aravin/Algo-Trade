import { ACCOUNTS_CHANGED_EVENT } from '@/lib/types'
import { useEffect, useState } from 'react'
import {
  Clock,
  LineChart,
  Link2,
  Settings,
  TrendingUp,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { getAccounts } from '@/lib/accounts'

function useBrokerStatus() {
  const [summary, setSummary] = useState(() => derive())

  function derive() {
    const connected = getAccounts().filter((a) => a.status === 'connected')
    if (connected.length === 0)
      return { dot: 'bg-muted-foreground', text: 'No broker connected' }
    if (connected.length === 1)
      return {
        dot: 'bg-success animate-pulse',
        text: `Connected · ${connected[0].label}`,
      }
    return {
      dot: 'bg-success animate-pulse',
      text: `${connected.length} brokers connected`,
    }
  }

  useEffect(() => {
    const refresh = () => setSummary(derive())
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  return summary
}

interface NavItem {
  icon: React.ReactNode
  label: string
  id: string
  badge?: string
}

interface LocalLiveOrder {
  status?: string
  exchange_timestamp?: string
  order_timestamp?: string
}

interface OrderListResponse {
  data?: LocalLiveOrder[]
}

function useActiveTradesCount() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    function getCurrentMode(): 'live' | 'paper' {
      try {
        const stored = localStorage.getItem('algo-trade:livetradespage-mode')
        if (stored === 'live' || stored === 'paper') return stored
      } catch {
        // ignore
      }
      try {
        const configRaw = localStorage.getItem('algo-trade:strategy-config')
        if (configRaw) {
          const parsed = JSON.parse(configRaw) as {
            executionMode?: string
          } | null
          if (
            parsed?.executionMode === 'live' ||
            parsed?.executionMode === 'paper'
          ) {
            return parsed.executionMode
          }
        }
      } catch {
        // ignore
      }
      return 'paper'
    }

    function isToday(isoLike: string | null | undefined) {
      if (!isoLike) return false
      return isoLike.slice(0, 10) === new Date().toISOString().slice(0, 10)
    }

    function normalizeLiveStatus(s: string | undefined): string {
      const u = String(s ?? '').toUpperCase()
      if (u.includes('REJECT')) return 'REJECTED'
      if (u.includes('CANCEL')) return 'CANCELLED'
      if (u.includes('COMPLETE')) return 'COMPLETED'
      return 'ACTIVE'
    }

    async function updateCount() {
      try {
        const mode = getCurrentMode()
        if (mode === 'paper') {
          const res = await fetch('/api/paper/account')
          if (!res.ok) return
          const summary = (await res.json()) as { openTradeCount?: number }
          if (active && typeof summary?.openTradeCount === 'number') {
            setCount(summary.openTradeCount)
          }
        } else {
          const token =
            getAccounts().find((a) => a.accessToken)?.accessToken ?? null
          if (!token) {
            if (active) setCount(0)
            return
          }
          const res = await fetch('/api/order/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          })
          if (!res.ok) return
          const payload = (await res.json()) as unknown
          const rows = Array.isArray(payload)
            ? (payload as LocalLiveOrder[])
            : ((payload as OrderListResponse).data ?? [])
          const todayOrders = rows.filter((o) =>
            isToday(o.exchange_timestamp ?? o.order_timestamp),
          )
          const activeCount = todayOrders.filter(
            (o) => normalizeLiveStatus(o.status) === 'ACTIVE',
          ).length
          if (active) setCount(activeCount)
        }
      } catch (err) {
        console.error('Failed to update active trades count:', err)
      }
    }

    void updateCount()
    const interval = setInterval(updateCount, 5000)

    const onStorageChange = () => {
      void updateCount()
    }

    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onStorageChange)
    window.addEventListener('storage', onStorageChange)

    return () => {
      active = false
      clearInterval(interval)
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onStorageChange)
      window.removeEventListener('storage', onStorageChange)
    }
  }, [])

  return count
}

const navItems: NavItem[] = [
  {
    icon: <TrendingUp size={16} />,
    label: 'Live Trades',
    id: 'live-trades',
  },
  { icon: <LineChart size={16} />, label: 'Strategies', id: 'strategies' },
  { icon: <Clock size={16} />, label: 'Trade History', id: 'history' },
]

const bottomItems: NavItem[] = [
  { icon: <Link2 size={16} />, label: 'Brokers', id: 'broker-accounts' },
  { icon: <User size={16} />, label: 'Profile', id: 'profile' },
  { icon: <Settings size={16} />, label: 'Settings', id: 'settings' },
]

interface SidebarProps {
  activeItem: string
  onSelect: (id: string) => void
}

export function Sidebar({ activeItem, onSelect }: SidebarProps) {
  const brokerStatus = useBrokerStatus()
  const activeTradesCount = useActiveTradesCount()
  return (
    <aside className="flex flex-col w-[220px] min-h-dvh bg-sidebar border-r border-sidebar-border shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 h-14">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary">
          <TrendingUp size={14} className="text-primary-foreground" />
        </div>
        <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">
          AlgoTrade
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const badge =
            item.id === 'live-trades'
              ? activeTradesCount !== null && activeTradesCount > 0
                ? String(activeTradesCount)
                : undefined
              : item.badge
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer',
                activeItem === item.id
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              )}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {badge && (
                <span className="flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-primary/20 text-primary">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom nav */}
      <nav className="px-2 py-3 space-y-0.5">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer',
              activeItem === item.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Broker status */}
      <div className="px-4 py-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <span className={cn('w-2 h-2 rounded-full', brokerStatus.dot)} />
          <span className="text-xs text-muted-foreground">
            {brokerStatus.text}
          </span>
        </div>
      </div>
    </aside>
  )
}
