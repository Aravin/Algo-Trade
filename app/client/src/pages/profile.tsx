import type { BrokerAccount, PaperAccountSummary } from '@/lib/types'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Trash2, User, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAccounts, isAccountConnected } from '@/lib/accounts'
import {
  adjustPaperAccount,
  fetchPaperAccount,
  resetPaperAccount,
} from '@/lib/paperTrading'

// ─── Types ───────────────────────────────────────────────────────
interface UpstoxProfile {
  user_id: string
  name: string
  email: string
  mobile_number: string
  broker: string
  exchanges: string[]
  products: string[]
  order_types: string[]
  is_active?: boolean
}

interface MarginUsed {
  total: number
  span_exposure: number
  cash_margin_var_elm: number
  premium_present: number
  mtf: number
  delivery_margin: { total: number; equity: number; fo_settlement: number }
  loss?: { total: number; realised: number; unrealised: number }
}

interface CashAvailableToTrade {
  total: number
  cash: {
    opening_balance: number
    added_today: number
    withdrawn_today: number
    amount_from_stock_sale: number
    unpaid_charges: number
  }
  margin_used: MarginUsed
}

interface PledgeAvailableToTrade {
  total: number
  margin_from_pledge: { total: number; equity: number; mutual_funds: number }
  margin_used: MarginUsed
}

interface UpstoxFundsV3 {
  available_to_trade: {
    total: number
    cash_available_to_trade: CashAvailableToTrade
    pledge_available_to_trade: PledgeAvailableToTrade
  }
  unavailable_to_trade: {
    cash_unavailable_to_trade: {
      unsettled_profit: { todays_profit: number; previous_days: number }
    }
    pledge_unavailable_to_trade: { equity: number; mutual_funds: number }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────
function fmtCurrency(n: number) {
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  })
}

async function fetchProfile(token: string) {
  const res = await fetch('/api/broker/upstox/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const json = (await res.json()) as { status: string; data: UpstoxProfile }
  if (json.status !== 'success') throw new Error('Failed to load profile')
  return json.data
}

async function fetchFunds(token: string) {
  const res = await fetch('/api/broker/upstox/funds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const json = (await res.json()) as {
    status: string
    data: UpstoxFundsV3
    errors?: { message: string }[]
  }
  if (json.status !== 'success') {
    const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json.data
}

// ─── Funds card ───────────────────────────────────────────────────
function Row({
  label,
  value,
  highlight,
  sub,
}: {
  label: string
  value: number
  highlight?: boolean
  sub?: boolean
}) {
  if (value === 0 && !highlight) return null
  return (
    <div className={`flex items-center justify-between ${sub ? 'pl-3' : ''}`}>
      <span
        className={`text-xs ${sub ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}
      >
        {label}
      </span>
      <span
        className={`text-xs tabular-nums ${
          highlight
            ? 'text-success font-semibold text-sm'
            : sub
              ? 'text-foreground/70'
              : 'text-foreground font-medium'
        }`}
      >
        {fmtCurrency(value)}
      </span>
    </div>
  )
}

function FundsSection({ funds }: { funds: UpstoxFundsV3 }) {
  const { available_to_trade: avail, unavailable_to_trade: unavail } = funds
  const cash = avail.cash_available_to_trade
  const pledge = avail.pledge_available_to_trade
  const unsettled = unavail.cash_unavailable_to_trade.unsettled_profit

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Total available */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet size={14} className="text-primary" />
            Available to Trade
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <Row label="Total Available" value={avail.total} highlight />
          <div className="border-t border-border pt-2 mt-2">
            <p className="text-xs font-medium text-foreground mb-1.5">Cash</p>
            <div className="space-y-1.5">
              <Row label="Available" value={cash.total} />
              <Row
                label="Opening Balance"
                value={cash.cash.opening_balance}
                sub
              />
              <Row label="Added Today" value={cash.cash.added_today} sub />
              <Row
                label="Withdrawn Today"
                value={cash.cash.withdrawn_today}
                sub
              />
              <Row
                label="From Stock Sale"
                value={cash.cash.amount_from_stock_sale}
                sub
              />
              {cash.cash.unpaid_charges !== 0 && (
                <Row
                  label="Unpaid Charges"
                  value={cash.cash.unpaid_charges}
                  sub
                />
              )}
            </div>
          </div>
          {cash.margin_used.total > 0 && (
            <div className="border-t border-border pt-2 mt-2">
              <p className="text-xs font-medium text-foreground mb-1.5">
                Cash Margin Used
              </p>
              <div className="space-y-1.5">
                <Row label="Total Used" value={cash.margin_used.total} />
                <Row
                  label="SPAN + Exposure"
                  value={cash.margin_used.span_exposure}
                  sub
                />
                <Row
                  label="VAR + ELM"
                  value={cash.margin_used.cash_margin_var_elm}
                  sub
                />
                <Row
                  label="Premium"
                  value={cash.margin_used.premium_present}
                  sub
                />
                <Row
                  label="Delivery Margin"
                  value={cash.margin_used.delivery_margin.total}
                  sub
                />
                <Row label="MTF" value={cash.margin_used.mtf} sub />
                {cash.margin_used.loss && (
                  <Row
                    label="Unrealised Loss"
                    value={cash.margin_used.loss.unrealised}
                    sub
                  />
                )}
              </div>
            </div>
          )}
          {pledge.total > 0 && (
            <div className="border-t border-border pt-2 mt-2">
              <p className="text-xs font-medium text-foreground mb-1.5">
                Pledge Collateral
              </p>
              <div className="space-y-1.5">
                <Row label="Available" value={pledge.total} />
                <Row
                  label="From Stocks"
                  value={pledge.margin_from_pledge.equity}
                  sub
                />
                <Row
                  label="From Mutual Funds"
                  value={pledge.margin_from_pledge.mutual_funds}
                  sub
                />
                <Row
                  label="Pledge Margin Used"
                  value={pledge.margin_used.total}
                  sub
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unavailable */}
      {(unsettled.todays_profit !== 0 || unsettled.previous_days !== 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Wallet size={14} />
              Unavailable to Trade
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1.5">
            <Row
              label="Today's Unsettled P&L"
              value={unsettled.todays_profit}
            />
            <Row label="Previous Days" value={unsettled.previous_days} sub />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── No account state ─────────────────────────────────────────────
function NoAccount() {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
            <User size={20} className="text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              No broker connected
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect a broker account with a trading token to view profile and
              funds
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PaperCreditSection() {
  const [summary, setSummary] = useState<PaperAccountSummary | null>(null)
  const [amount, setAmount] = useState('15000')
  const [note, setNote] = useState('Manual paper credit set')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadPaper = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await fetchPaperAccount()
      setSummary(next)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load paper credit',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPaper()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loadPaper])

  const handleSet = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await adjustPaperAccount({
        amount: Number(amount),
        mode: 'set',
        note,
      })
      setSummary(next)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update paper credit',
      )
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    setLoading(true)
    setError('')
    try {
      const next = await resetPaperAccount()
      setSummary(next)
      setAmount('15000')
      setNote('Manual paper credit set')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to reset paper account',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet size={14} className="text-primary" />
          Paper Trading Credit
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Current Balance</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {summary ? fmtCurrency(summary.account.balance) : '—'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Balance Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void handleSet()} disabled={loading}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : null}
            Set Paper Credit
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleReset()}
            disabled={loading}
          >
            Reset To 15000
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadPaper()}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Reset clears paper trades and statement history from the client D1
          database, then restores the paper balance to ₹15000.
        </p>
        {error && <p className="text-xs text-destructive/80">{error}</p>}
      </CardContent>
    </Card>
  )
}

function BotResetSection() {
  const [loading, setLoading] = useState(false)

  const handleReset = async () => {
    if (
      !confirm(
        "Are you sure you want to reset all strategy bot logs, active position state, today's trade count, indicator cache, and paper trading database history?",
      )
    ) {
      return
    }
    setLoading(true)
    try {
      // Clear database paper trades and statement entries
      await resetPaperAccount()
    } catch (err) {
      console.error('Failed to reset paper trading database:', err)
    }

    // Clear localStorage keys
    localStorage.removeItem('algo-trade:bot-state')
    localStorage.removeItem('algo-trade:bot-position')
    localStorage.removeItem('algo-trade:bot-trades-today')
    localStorage.removeItem('algo-trade:bot-trades-date')
    localStorage.removeItem('algo-trade:vrd-cache')
    localStorage.removeItem('algo-trade:bot-logs')
    localStorage.removeItem('algo-trade:bot-snapshot')
    localStorage.removeItem('algo-trade:proxy-history')

    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
          <Trash2 size={14} />
          Reset Bot, Logs &amp; Paper History
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-xs text-muted-foreground">
          This will permanently clear all strategy bot logs, active position
          state, today's trade count, and indicator cache from the browser, as
          well as all paper trading database history. The bot will return to its
          default IDLE state.
        </p>
        <div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => void handleReset()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 size={12} className="animate-spin mr-1.5" />
            ) : null}
            Reset Bot &amp; Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────
export function ProfilePage() {
  const [account] = useState<BrokerAccount | null>(
    () => getAccounts().find(isAccountConnected) ?? null,
  )
  const [profile, setProfile] = useState<UpstoxProfile | null>(null)
  const [funds, setFunds] = useState<UpstoxFundsV3 | null>(null)
  const [loading, setLoading] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [fundsError, setFundsError] = useState('')

  const load = async (acc: BrokerAccount) => {
    if (!acc.accessToken) return
    setLoading(true)
    setProfileError('')
    setFundsError('')
    const [pResult, fResult] = await Promise.allSettled([
      fetchProfile(acc.accessToken),
      fetchFunds(acc.accessToken),
    ])
    if (pResult.status === 'fulfilled') setProfile(pResult.value)
    else
      setProfileError(
        pResult.reason instanceof Error
          ? pResult.reason.message
          : 'Failed to load profile',
      )
    if (fResult.status === 'fulfilled') setFunds(fResult.value)
    else
      setFundsError(
        fResult.reason instanceof Error
          ? fResult.reason.message
          : 'Failed to load funds',
      )
    setLoading(false)
  }

  useEffect(() => {
    if (!account) return

    const timer = window.setTimeout(() => {
      void load(account)
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [account])

  return (
    <div className="flex flex-col gap-5 p-6 min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Account details and fund balances from your connected broker
          </p>
        </div>
        {account && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void load(account)}
            disabled={loading}
            className="shrink-0"
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Refresh
          </Button>
        )}
      </div>

      {!account && <NoAccount />}

      {account && loading && !profile && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
          <Loader2 size={15} className="animate-spin" />
          Loading account data…
        </div>
      )}

      {profileError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-2xl">
          Profile: {profileError}
        </div>
      )}

      <div className="max-w-2xl space-y-4">
        <PaperCreditSection />
        <BotResetSection />
      </div>

      {profile && (
        <div className="grid grid-cols-1 gap-4 max-w-2xl">
          {/* Identity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <User size={14} className="text-primary" />
                Account Info
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-lg shrink-0">
                  {profile.name?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {profile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {profile.mobile_number}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">User ID</span>
                  <span className="text-xs font-mono text-foreground">
                    {profile.user_id}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Broker</span>
                  <span className="text-xs font-medium text-foreground">
                    {profile.broker}
                  </span>
                </div>
              </div>

              {/* Exchanges */}
              {profile.exchanges?.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    Enabled Segments
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.exchanges.map((ex) => (
                      <Badge
                        key={ex}
                        variant="secondary"
                        className="text-xs font-mono"
                      >
                        {ex}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {profile.products?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">Products</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.products.map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Order types */}
              {profile.order_types?.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    Order Types
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.order_types.map((o) => (
                      <Badge key={o} variant="secondary" className="text-xs">
                        {o}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Funds */}
          {funds && <FundsSection funds={funds} />}
          {!funds && fundsError && (
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-destructive/80 text-center py-2">
                  {fundsError}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
