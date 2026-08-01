import { useEffect, useState, lazy, Suspense, Component } from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { getAccounts, hydrateAccounts } from '@/lib/accounts'
import { hydrateStrategyConfig } from '@/lib/strategyConfig'
import { useStrategyBot } from '@/hooks/useStrategyBot'
import { ACCOUNTS_CHANGED_EVENT } from '@/lib/types'
import { useAuth0 } from '@auth0/auth0-react'
import { AuthService } from '@/lib/auth'
import { isAuth0Enabled } from '@/lib/auth0-config'
import { ArrowRight } from 'lucide-react'
import { AppLogo } from '@/components/ui/app-logo'
import { ALGO_TRADE_PREFIX, STORAGE_KEY_ACTIVE_USER } from '@/lib/constants'
import './App.css'

interface ErrorBoundaryProps {
  children: React.ReactNode
}
interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
          <div>
            <h1 className="text-lg font-semibold text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium"
            >
              Reload application
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

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

function AuthGate() {
  const auth0Enabled = isAuth0Enabled()
  if (!auth0Enabled) {
    return <AppContent auth0Props={null} />
  }
  return <Auth0AppContent />
}

function Auth0AppContent() {
  const auth0 = useAuth0()
  const auth0Props: Auth0Props = {
    getAccessTokenSilently: auth0.getAccessTokenSilently,
    isAuthenticated: auth0.isAuthenticated,
    isLoading: auth0.isLoading,
    loginWithRedirect: auth0.loginWithRedirect,
    user: auth0.user,
  }
  return <AppContent auth0Props={auth0Props} />
}

interface Auth0Props {
  getAccessTokenSilently: () => Promise<string>
  isAuthenticated: boolean
  isLoading: boolean
  loginWithRedirect: () => Promise<void>
  user?: { sub?: string }
}

const PAGE_PATH_MAP: Record<string, string> = {
  'live-trades': '/live-trades',
  strategies: '/strategies',
  history: '/history',
  'broker-accounts': '/broker-accounts',
  profile: '/profile',
  settings: '/settings',
}

const PATH_PAGE_MAP: Record<string, string> = {
  '/': 'live-trades',
  '/live-trades': 'live-trades',
  '/strategies': 'strategies',
  '/history': 'history',
  '/broker-accounts': 'broker-accounts',
  '/profile': 'profile',
  '/settings': 'settings',
}

function getPageFromLocation(): string {
  const searchParams = new URLSearchParams(window.location.search)
  const pageParam = searchParams.get('page')
  if (pageParam && PAGE_PATH_MAP[pageParam]) {
    return pageParam
  }

  const pathname = window.location.pathname
  const normalized =
    pathname.length > 1 && pathname.endsWith('/')
      ? pathname.slice(0, -1)
      : pathname

  if (PATH_PAGE_MAP[normalized]) {
    return PATH_PAGE_MAP[normalized]
  }

  return 'live-trades'
}

function getPathFromPage(pageId: string): string {
  return PAGE_PATH_MAP[pageId] ?? '/'
}

function AppContent({ auth0Props }: { auth0Props: Auth0Props | null }) {
  const isBrokerCallback =
    window.location.pathname === '/broker/callback' ||
    window.location.pathname === '/broker-callback'
  const initialPage = !isBrokerCallback ? getPageFromLocation() : 'live-trades'

  const [activeItem, setActiveItem] = useState(initialPage)
  const [isHydrated, setIsHydrated] = useState(isBrokerCallback)
  const [brokerToken, setBrokerToken] = useState<string | null>(null)
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null)

  const handleSelectPage = (id: string) => {
    setActiveItem(id)
    if (!isBrokerCallback) {
      const targetPath = getPathFromPage(id)
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath)
      }
    }
  }

  useEffect(() => {
    if (isBrokerCallback) return
    const onPopState = () => {
      const page = getPageFromLocation()
      setActiveItem(page)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [isBrokerCallback])

  const auth0Enabled = isAuth0Enabled()
  const {
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    loginWithRedirect,
    user,
  } = auth0Props ?? {
    getAccessTokenSilently: () => Promise.resolve(''),
    isAuthenticated: false,
    isLoading: false,
    loginWithRedirect: () => Promise.resolve(),
    user: undefined,
  }
  const currentUserId = auth0Enabled ? (user?.sub ?? null) : 'local-dev-user'
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
    } else if (search?.includes('page=')) {
      const searchParams = new URLSearchParams(window.location.search)
      searchParams.delete('page')
      const remaining = searchParams.toString()
      const basePath = getPathFromPage(initialPage)
      const targetPath = basePath + (remaining ? `?${remaining}` : '')
      if (window.location.pathname + window.location.search !== targetPath) {
        window.history.replaceState({}, '', targetPath)
      }
    } else {
      const pathname = window.location.pathname
      const normalized =
        pathname.length > 1 && pathname.endsWith('/')
          ? pathname.slice(0, -1)
          : pathname
      if (!PATH_PAGE_MAP[normalized]) {
        const targetPath = getPathFromPage(initialPage) + search
        if (window.location.pathname + window.location.search !== targetPath) {
          window.history.replaceState({}, '', targetPath)
        }
      }
    }
  }, [isBrokerCallback, isLoading, initialPage])

  useEffect(() => {
    // If Auth0 is enabled, wait until authenticated to run hydration
    if (
      isBrokerCallback ||
      (auth0Enabled && (!isAuthenticated || !currentUserId))
    )
      return
    if (!currentUserId) return
    const hydratingUserId = currentUserId

    // Prevent cross-user local storage state leaks by clearing keys on user change
    const storedUser = localStorage.getItem(STORAGE_KEY_ACTIVE_USER)
    if (storedUser !== hydratingUserId) {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(ALGO_TRADE_PREFIX + ':')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
      localStorage.setItem(STORAGE_KEY_ACTIVE_USER, hydratingUserId)
    }

    let cancelled = false
    void Promise.allSettled([
      hydrateAccounts(),
      hydrateStrategyConfig(),
    ]).finally(() => {
      if (!cancelled) {
        setBrokerToken(
          getAccounts().find((account) => account.accessToken)?.accessToken ??
            null,
        )
        setHydratedUserId(hydratingUserId)
        setIsHydrated(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [isBrokerCallback, auth0Enabled, isAuthenticated, currentUserId])

  useEffect(() => {
    if (isBrokerCallback) return
    const refreshToken = () => {
      setBrokerToken(
        getAccounts().find((account) => account.accessToken)?.accessToken ??
          null,
      )
    }
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, refreshToken)
    window.addEventListener('storage', refreshToken)
    return () => {
      window.removeEventListener(ACCOUNTS_CHANGED_EVENT, refreshToken)
      window.removeEventListener('storage', refreshToken)
    }
  }, [isBrokerCallback])

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
  if (auth0Enabled && (isLoading || (isAuthenticated && !currentUserId))) {
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
              void loginWithRedirect()
            }}
            className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-all cursor-pointer shadow-sm active:scale-[0.98]"
          >
            Log In <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  if (!isHydrated || hydratedUserId !== currentUserId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Restoring saved setup…
      </div>
    )
  }

  return (
    <DashboardShell
      activeItem={activeItem}
      onSelect={handleSelectPage}
      brokerToken={brokerToken}
    />
  )
}

interface DashboardShellProps {
  activeItem: string
  onSelect: (item: string) => void
  brokerToken: string | null
}

function DashboardShell({
  activeItem,
  onSelect,
  brokerToken,
}: DashboardShellProps) {
  const strategyBot = useStrategyBot(brokerToken)

  const renderPage = () => {
    switch (activeItem) {
      case 'broker-accounts':
        return <BrokerAccountsPage />
      case 'profile':
        return <ProfilePage />
      case 'live-trades':
        return <LiveTradesPage />
      case 'strategies':
        return <StrategiesPage bot={strategyBot} token={brokerToken} />
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
      <Sidebar activeItem={activeItem} onSelect={onSelect} />
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

function App() {
  return (
    <ErrorBoundary>
      <AuthGate />
    </ErrorBoundary>
  )
}

export default App
