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
import { ACCOUNTS_CHANGED_EVENT, getAccounts } from '@/lib/accounts'

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

const navItems: NavItem[] = [
  {
    icon: <TrendingUp size={16} />,
    label: 'Live Trades',
    id: 'live-trades',
    badge: '4',
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
        {navItems.map((item) => (
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
            {item.badge && (
              <span className="flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold rounded-full bg-primary/20 text-primary">
                {item.badge}
              </span>
            )}
          </button>
        ))}
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
