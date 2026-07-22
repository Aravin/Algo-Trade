import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { hydrateAccounts } from '@/lib/accounts'
import { hydrateStrategyConfig } from '@/lib/strategyConfig'
import { useAuth0 } from '@auth0/auth0-react'
import { AuthService } from '@/lib/auth'
import { isAuth0Enabled } from '@/lib/auth0-config'
import { ArrowRight } from 'lucide-react'
import { AppLogo } from '@/components/ui/app-logo'
import './App.css'

const BrokerAccountsPage = lazy(() =>
  import('@/pages/broker-accounts').then((m) => ({
    default: m.BrokerAccountsPage,
  })),
)
const BrokerCallbackPage = lazy(() =>
  import('@/pages/broker-callback').then((m) => ({
    default: m.BrokerCallbackPage,
  })),
)
const ProfilePage = lazy(() =>
  import('@/pages/profile').then((m) => ({ default: m.ProfilePage })),
)
const HistoryPage = lazy(() =>
  import('@/pages/history').then((m) => ({ default: m.HistoryPage })),
)
const StrategiesPage = lazy(() =>
  import('@/pages/strategies').then((m) => ({ default: m.StrategiesPage })),
)
const LiveTradesPage = lazy(() =>
  import('@/pages/live-trades').then((m) => ({ default: m.LiveTradesPage })),
)

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
  const isLoggingInRef = useRef(false)

  const auth0Enabled = isAuth0Enabled()
  const {
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    user,
  } = useAuth0()

  // Register Auth0 token getter if enabled
  useEffect(() => {
    if (auth0Enabled) {
      AuthService.registerTokenGetter(async () => {
        try {
          return await getAccessTokenSilently()
        } catch (e) {
          console.error('Error fetching access token silently:', e)
          return null
        }
      })
    }
  }, [auth0Enabled, getAccessTokenSilently])

  useEffect(() => {
    if (isBrokerCallback) return

    const search = window.location.search
    const isAuth0Callback =
      search.includes('code=') && search.includes('state=')

    if (isAuth0Callback) {
      if (!isLoading) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    } else if (search) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [isBrokerCallback, isLoading])

  useEffect(() => {
    // If Auth0 is enabled, wait until authenticated to run hydration
    if (isBrokerCallback || (auth0Enabled && !isAuthenticated)) return

    // Prevent cross-user local storage state leaks by clearing keys on user change
    const currentUserId = auth0Enabled
      ? (user?.sub ?? 'local-dev-user')
      : 'local-dev-user'
    const storedUser = localStorage.getItem('algo-trade:active-user')
    if (storedUser !== currentUserId) {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith('algo-trade:')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
      localStorage.setItem('algo-trade:active-user', currentUserId)
    }

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
  }, [isBrokerCallback, auth0Enabled, isAuthenticated, user, isLoading])

  useEffect(() => {
    return () => {
      isLoggingInRef.current = false
    }
  }, [])

  if (isBrokerCallback) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
            Loading broker connection…
          </div>
        }
      >
        <BrokerCallbackPage />
      </Suspense>
    )
  }

  // Handle Auth0 loading state
  if (auth0Enabled && isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Connecting to session…
      </div>
    )
  }

  // Handle Unauthenticated state (simple dark-themed Auth0 Login page)
  if (auth0Enabled && !isAuthenticated) {
    return (
      <div className="relative flex flex-col items-center justify-center min-h-dvh bg-zinc-950 font-sans text-foreground">
        <div className="w-full max-w-sm p-6 flex flex-col items-center text-center">
          {/* Logo / Icon */}
          <div className="mb-6">
            <AppLogo size="lg" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">
            AlgoTrade
          </h1>
          <p className="text-xs text-zinc-400 mb-8">
            Algorithmic Trading Dashboard
          </p>

          {/* Call to Action */}
          <button
            onClick={() => {
              if (isLoggingInRef.current) return
              isLoggingInRef.current = true
              void loginWithRedirect()
            }}
            disabled={isLoggingInRef.current}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-all cursor-pointer shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Log In <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
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
        <main className="flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                Loading view…
              </div>
            }
          >
            {renderPage()}
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default App
