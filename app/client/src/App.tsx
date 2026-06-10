import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { BrokerAccountsPage } from '@/pages/broker-accounts'
import { BrokerCallbackPage } from '@/pages/broker-callback'
import { ProfilePage } from '@/pages/profile'
import { HistoryPage } from '@/pages/history'
import { StrategiesPage } from '@/pages/strategies'
import { LiveTradesPage } from '@/pages/live-trades'
import { hydrateAccounts } from '@/lib/accounts'
import { hydrateStrategyConfig } from '@/lib/strategyConfig'
import './App.css'

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm p-6">
      {title} — coming soon
    </div>
  )
}

function App() {
  const isBrokerCallback = window.location.pathname === '/broker/callback'
  const urlParams = new URLSearchParams(window.location.search)
  const initialPage = !isBrokerCallback
    ? (urlParams.get('page') ?? 'live-trades')
    : 'live-trades'

  const [activeItem, setActiveItem] = useState(initialPage)
  const [isHydrated, setIsHydrated] = useState(isBrokerCallback)

  useEffect(() => {
    if (!isBrokerCallback && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [isBrokerCallback])

  useEffect(() => {
    if (isBrokerCallback) return

    let cancelled = false
    void Promise.allSettled([
      hydrateAccounts(),
      hydrateStrategyConfig(),
    ]).finally(() => {
      if (!cancelled) setIsHydrated(true)
    })

    return () => {
      cancelled = true
    }
  }, [isBrokerCallback])

  if (isBrokerCallback) {
    return <BrokerCallbackPage />
  }

  if (!isHydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring saved setup…
      </div>
    )
  }

  const renderPage = () => {
    switch (activeItem) {
      case 'broker-accounts':
        return <BrokerAccountsPage />
      case 'profile':
        return <ProfilePage />
      case 'live-trades':
        return <LiveTradesPage />
      case 'strategies':
        return <StrategiesPage />
      case 'history':
        return <HistoryPage />
      case 'settings':
        return <Placeholder title="Settings" />
      default:
        return <LiveTradesPage />
    }
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar activeItem={activeItem} onSelect={setActiveItem} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto">{renderPage()}</main>
      </div>
    </div>
  )
}

export default App
