import '@testing-library/jest-dom/vitest'
import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// auth.ts has a syntax issue with esbuild — mock it entirely
vi.mock('@/lib/auth', () => ({
  AuthService: {
    registerTokenGetter: vi.fn(),
    getToken: vi.fn(),
  },
}))

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
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
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
})

it('renders loading state on mount', async () => {
  render(<App />)
  expect(
    await screen.findByText('Restoring saved setup\u2026'),
  ).toBeInTheDocument()
})
