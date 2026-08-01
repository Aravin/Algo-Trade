import '@testing-library/jest-dom/vitest'
import { it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

const appMocks = vi.hoisted(() => ({
  getAccounts: vi.fn(() => []),
  hydrateAccounts: vi.fn<() => Promise<void>>(),
  botMounts: 0,
  botUnmounts: 0,
}))

// auth.ts has a syntax issue with esbuild — mock it entirely
vi.mock('@/lib/auth', () => ({
  AuthService: {
    registerTokenGetter: vi.fn(),
    getToken: vi.fn(),
  },
}))

vi.mock('@/lib/accounts', () => ({
  getAccounts: appMocks.getAccounts,
  hydrateAccounts: appMocks.hydrateAccounts,
}))

vi.mock('@/lib/strategyConfig', () => ({
  hydrateStrategyConfig: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/hooks/useStrategyBot', async () => {
  const { useEffect } = await import('react')
  return {
    useStrategyBot: () => {
      useEffect(() => {
        appMocks.botMounts += 1
        return () => {
          appMocks.botUnmounts += 1
        }
      }, [])
      return { marker: 'root-bot' }
    },
  }
})

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(() => ({
    isAuthenticated: false,
    isLoading: false,
    user: undefined,
    getAccessTokenSilently: vi.fn(),
    loginWithRedirect: vi.fn(),
  })),
}))

vi.mock('@/components/dashboard/sidebar', () => ({
  Sidebar: ({ onSelect }: { onSelect: (item: string) => void }) => (
    <div data-testid="sidebar">
      <button onClick={() => onSelect('strategies')}>Strategies nav</button>
      <button onClick={() => onSelect('live-trades')}>Live nav</button>
    </div>
  ),
}))

vi.mock('@/components/dashboard/header', () => ({
  Header: () => <div data-testid="header">Header</div>,
}))

vi.mock('@/components/ui/app-logo', () => ({
  AppLogo: () => <div data-testid="app-logo">Logo</div>,
}))

vi.mock('@/pages/live-trades', () => ({
  LiveTradesPage: () => <div data-testid="live-trades">Live Trades</div>,
}))

vi.mock('@/pages/broker-accounts', () => ({
  BrokerAccountsPage: () => <div>Broker Accounts</div>,
}))

vi.mock('@/pages/broker-callback', () => ({
  BrokerCallbackPage: () => <div>Broker Callback</div>,
}))

vi.mock('@/pages/profile', () => ({
  ProfilePage: () => <div>Profile</div>,
}))

vi.mock('@/pages/strategies', () => ({
  StrategiesPage: () => <div>Strategies</div>,
}))

vi.mock('@/pages/history', () => ({
  HistoryPage: () => <div>History</div>,
}))

vi.mock('@/lib/auth0-config', () => ({
  isAuth0Enabled: () => false,
  auth0Config: { domain: '', clientId: '', audience: '' },
}))

import App from '@/App'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/')
  appMocks.getAccounts.mockReturnValue([])
  appMocks.hydrateAccounts.mockReset()
  appMocks.hydrateAccounts.mockResolvedValue()
  appMocks.botMounts = 0
  appMocks.botUnmounts = 0
})

it('keeps the dashboard gated until saved state hydration completes', async () => {
  let finishHydration: (() => void) | undefined
  appMocks.hydrateAccounts.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishHydration = resolve
      }),
  )

  render(<App />)
  expect(screen.getByText('Restoring saved setup\u2026')).toBeInTheDocument()

  act(() => {
    finishHydration?.()
  })
  expect(await screen.findByTestId('live-trades')).toBeInTheDocument()
})

it('keeps one bot controller mounted while dashboard pages change', async () => {
  render(<App />)
  expect(await screen.findByTestId('live-trades')).toBeInTheDocument()
  expect(appMocks.botMounts).toBe(1)

  fireEvent.click(screen.getByText('Strategies nav'))
  expect(await screen.findByText('Strategies')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Live nav'))
  expect(await screen.findByTestId('live-trades')).toBeInTheDocument()

  expect(appMocks.botMounts).toBe(1)
  expect(appMocks.botUnmounts).toBe(0)
})

it('loads directly on path route like /strategies and syncs pushState on navigation', async () => {
  window.history.replaceState({}, '', '/strategies')
  const pushSpy = vi.spyOn(window.history, 'pushState')

  render(<App />)
  expect(await screen.findByText('Strategies')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Live nav'))
  expect(await screen.findByTestId('live-trades')).toBeInTheDocument()
  expect(pushSpy).toHaveBeenCalledWith({}, '', '/live-trades')

  pushSpy.mockRestore()
})

it('handles popstate event when navigating back in browser history', async () => {
  window.history.replaceState({}, '', '/live-trades')

  render(<App />)
  expect(await screen.findByTestId('live-trades')).toBeInTheDocument()

  act(() => {
    window.history.replaceState({}, '', '/strategies')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  expect(await screen.findByText('Strategies')).toBeInTheDocument()
})

it('cleans up legacy ?page= parameter while preserving remaining search parameters', async () => {
  window.history.replaceState({}, '', '/?page=strategies&symbol=NIFTY')
  const replaceSpy = vi.spyOn(window.history, 'replaceState')

  render(<App />)
  expect(await screen.findByText('Strategies')).toBeInTheDocument()
  expect(replaceSpy).toHaveBeenCalledWith({}, '', '/strategies?symbol=NIFTY')

  replaceSpy.mockRestore()
})

it('normalizes unmapped path to default route in window.history', async () => {
  window.history.replaceState({}, '', '/invalid-route')
  const replaceSpy = vi.spyOn(window.history, 'replaceState')

  render(<App />)
  expect(await screen.findByTestId('live-trades')).toBeInTheDocument()
  expect(replaceSpy).toHaveBeenCalledWith({}, '', '/live-trades')

  replaceSpy.mockRestore()
})
