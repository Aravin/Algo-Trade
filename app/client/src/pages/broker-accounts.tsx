import type { BrokerAccount, BrokerPurpose } from '@/lib/types'
import { useEffect, useRef, useState } from 'react'
import {
  BarChart2,
  Bot,
  Check,
  ChevronRight,
  Copy,
  FlaskConical,
  Link2,
  Link2Off,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  addAccount,
  getAccounts,
  getAccountConnectionState,
  removeAccount,
  updateAccount,
} from '@/lib/accounts'

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function openAuthPopup(url: string) {
  const w = Math.round(window.screen.width * 0.9)
  const h = Math.round(window.screen.height * 0.9)
  const left = Math.round((window.screen.width - w) / 2)
  const top = Math.round((window.screen.height - h) / 2)
  window.open(
    url,
    'BrokerAuth',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  )
}

const MCP_CONFIG = JSON.stringify(
  {
    mcpServers: {
      'Upstox MCP': {
        command: 'npx',
        args: ['mcp-remote', 'https://mcp.upstox.com/mcp'],
      },
    },
  },
  null,
  2,
)

// ─── Copy button ─────────────────────────────────────────────────
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
        copied
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ─── MCP section ─────────────────────────────────────────────────
function McpSection() {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardContent className="pt-5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary shrink-0">
            <Bot size={15} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Upstox MCP Integration
            </p>
            <p className="text-xs text-muted-foreground">
              Connect Upstox to Claude, Cursor, VS Code or ChatGPT
            </p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {open ? 'Hide' : 'Show config'}
          </span>
        </button>

        {open && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Add this to your AI client config file. Authorization happens in
              the browser when the AI client first connects — no token needed
              here. Re-auth required daily.
            </p>
            <div className="rounded-md bg-muted border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/60">
                <span className="text-xs font-mono text-muted-foreground">
                  JSON
                </span>
                <CopyButton text={MCP_CONFIG} />
              </div>
              <pre className="p-3 text-xs font-mono text-foreground overflow-x-auto whitespace-pre">
                {MCP_CONFIG}
              </pre>
            </div>
            <p className="text-xs text-muted-foreground">
              Full setup guide:{' '}
              <a
                href="https://upstox.com/developer/api-documentation/mcp-integration"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                upstox.com/developer/api-documentation/mcp-integration
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Re-authorize inline ──────────────────────────────────────────
function ReauthorizeInline({ account }: { account: BrokerAccount }) {
  const [open, setOpen] = useState(false)
  const [secret, setSecret] = useState('')

  const handleReauth = () => {
    if (!secret.trim() || !account.apiKey) return
    const redirectUri = `${window.location.origin}/broker/callback`
    const pending = {
      id: account.id,
      label: account.label,
      apiKey: account.apiKey,
      apiSecret: secret.trim(),
      redirectUri,
      purpose: account.purpose.filter((p) => p !== 'analytics'),
      analyticsToken: account.analyticsToken,
      mode: 'reauth' as const,
    }
    localStorage.setItem(
      `upstox-pending-${account.id}`,
      JSON.stringify(pending),
    )
    const oauthUrl = new URL(
      'https://api.upstox.com/v2/login/authorization/dialog',
    )
    oauthUrl.searchParams.set('response_type', 'code')
    oauthUrl.searchParams.set('client_id', account.apiKey)
    oauthUrl.searchParams.set('redirect_uri', redirectUri)
    oauthUrl.searchParams.set('state', account.id)
    openAuthPopup(oauthUrl.toString())
  }

  if (!account.apiKey) return null

  return (
    <div className="mt-3 border-t border-border pt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={11} />
          Re-authorize trading token
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Enter your API Secret to refresh the trading token.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="API Secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              className="h-8 flex-1 px-3 rounded-md border border-border bg-background text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button
              size="sm"
              className="h-8 text-xs px-3"
              onClick={handleReauth}
              disabled={!secret.trim()}
            >
              <RefreshCw size={11} />
              Re-authorize
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs px-3"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Test connection ─────────────────────────────────────────────────
interface ProfileData {
  user_id?: string
  name?: string
  email?: string
  mobile_number?: string
  broker?: string
}

function TestConnection({ account }: { account: BrokerAccount }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [errMsg, setErrMsg] = useState('')

  const token = account.accessToken ?? account.analyticsToken
  if (!token) return null

  const handleTest = () => {
    setStatus('loading')
    setProfile(null)
    setErrMsg('')
    fetch('/api/broker/upstox/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then(
        (data: {
          status?: string
          data?: ProfileData
          errors?: { message: string }[]
        }) => {
          if (data.status === 'success' && data.data) {
            setProfile(data.data)
            setStatus('ok')
          } else {
            setErrMsg(
              data.errors?.[0]?.message ?? 'Unexpected response from Upstox',
            )
            setStatus('error')
          }
        },
      )
      .catch(() => {
        setErrMsg('Network error reaching proxy')
        setStatus('error')
      })
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleTest}
          disabled={status === 'loading'}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {status === 'loading' ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <FlaskConical size={11} />
          )}
          Test connection
        </button>
        {status === 'ok' && (
          <span className="text-xs text-success">✓ API working</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-destructive">{errMsg}</span>
        )}
      </div>
      {status === 'ok' && profile && (
        <div className="mt-2 rounded-md bg-muted/60 border border-border px-3 py-2 text-xs space-y-0.5">
          {profile.name && (
            <p>
              <span className="text-muted-foreground">Name: </span>
              <span className="text-foreground font-medium">
                {profile.name}
              </span>
            </p>
          )}
          {profile.email && (
            <p>
              <span className="text-muted-foreground">Email: </span>
              <span className="text-foreground">{profile.email}</span>
            </p>
          )}
          {profile.mobile_number && (
            <p>
              <span className="text-muted-foreground">Mobile: </span>
              <span className="text-foreground">{profile.mobile_number}</span>
            </p>
          )}
          {profile.user_id && (
            <p>
              <span className="text-muted-foreground">User ID: </span>
              <span className="text-foreground font-mono">
                {profile.user_id}
              </span>
            </p>
          )}
          {profile.broker && (
            <p>
              <span className="text-muted-foreground">Broker: </span>
              <span className="text-foreground">{profile.broker}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Account card ─────────────────────────────────────────────────
const PURPOSE_META = {
  analytics: { label: 'Portfolio Analytics', Icon: BarChart2 },
  'market-data': { label: 'Market Data', Icon: BarChart2 },
  orders: { label: 'Order Placing', Icon: ShoppingCart },
} as const

function AccountCard({
  account,
  onRemove,
  onEdit,
}: {
  account: BrokerAccount
  onRemove: (id: string) => void
  onEdit: (account: BrokerAccount) => void
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary font-bold text-sm shrink-0">
              U
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">
                  {account.label}
                </span>
                <Badge
                  variant={
                    getAccountConnectionState(account) === 'connected'
                      ? 'success'
                      : getAccountConnectionState(account) === 'expired'
                        ? 'destructive'
                        : 'warning'
                  }
                >
                  {getAccountConnectionState(account) === 'connected'
                    ? 'connected'
                    : getAccountConnectionState(account) === 'expired'
                      ? 'expired'
                      : 'need auth'}
                </Badge>
              </div>
              {account.apiKey && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  Upstox · {account.apiKey.slice(0, 8)}…
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onEdit(account)}
              title="Edit account"
            >
              <Pencil size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(account.id)}
              title="Remove account"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {/* Token type badges */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {account.analyticsToken && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-medium">
              <BarChart2 size={10} />
              Analytics Token
            </div>
          )}
          {account.accessToken && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <Zap size={10} />
              Trading Token
            </div>
          )}
        </div>

        {/* Purpose tags */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {account.purpose.map((p) => {
            const { label, Icon } = PURPOSE_META[p]
            const active =
              p === 'analytics'
                ? !!account.analyticsToken
                : !!account.accessToken
            return (
              <div
                key={p}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  active
                    ? 'bg-success/10 text-success'
                    : 'bg-muted text-muted-foreground opacity-40'
                }`}
              >
                <Icon size={10} />
                {label}
              </div>
            )
          })}
        </div>

        {account.connectedAt && (
          <p className="text-xs text-muted-foreground mt-2">
            Connected{' '}
            {new Date(account.connectedAt).toLocaleDateString('en-IN', {
              dateStyle: 'medium',
            })}
          </p>
        )}

        <ReauthorizeInline account={account} />
        <TestConnection account={account} />
      </CardContent>
    </Card>
  )
}

// ─── Broker registry ─────────────────────────────────────────────
interface BrokerMeta {
  id: 'upstox'
  name: string
  description: string
  available: boolean
}

const BROKERS: BrokerMeta[] = [
  {
    id: 'upstox',
    name: 'Upstox',
    description: 'Free API · Analytics + Trading tokens · MCP support',
    available: true,
  },
]

// ─── Upstox form ─────────────────────────────────────────────────
function UpstoxForm({
  label,
  onClose,
  existing,
}: {
  label: string
  onClose: () => void
  existing?: BrokerAccount
}) {
  const [analyticsToken, setAnalyticsToken] = useState(
    existing?.analyticsToken ?? '',
  )
  const [apiKey, setApiKey] = useState(existing?.apiKey ?? '')
  const [apiSecret, setApiSecret] = useState('')
  const [directAccessToken, setDirectAccessToken] = useState('')
  const [redirectUri, setRedirectUri] = useState(
    `${window.location.origin}/broker/callback`,
  )
  const [marketData, setMarketData] = useState(
    existing ? existing.purpose.includes('market-data') : true,
  )
  const [orders, setOrders] = useState(
    existing ? existing.purpose.includes('orders') : false,
  )

  const isEditing = !!existing
  const hasAnalytics = analyticsToken.trim().length > 0
  const hasTradingPurpose = marketData || orders
  const hasDirectTradingToken = !!(
    directAccessToken.trim() && hasTradingPurpose
  )
  const hasTradingOauth = !!(
    apiKey.trim() &&
    apiSecret.trim() &&
    redirectUri.trim() &&
    hasTradingPurpose
  )
  const hasTrading = hasDirectTradingToken || hasTradingOauth
  const isValid = isEditing ? true : hasAnalytics || hasTrading

  const handleSave = () => {
    if (!isValid) return

    const resolvedLabel = (label.trim() || existing?.label) ?? 'Upstox Account'
    const newPurposes: BrokerPurpose[] = [
      ...(analyticsToken.trim() ? ['analytics' as const] : []),
      ...(marketData ? ['market-data' as const] : []),
      ...(orders ? ['orders' as const] : []),
    ]

    if (isEditing) {
      // Always save metadata changes immediately
      updateAccount(existing.id, {
        label: resolvedLabel,
        analyticsToken: analyticsToken.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
        purpose: newPurposes.length > 0 ? newPurposes : existing.purpose,
        ...(directAccessToken.trim()
          ? {
              accessToken: directAccessToken.trim(),
              status: 'connected' as const,
              connectedAt: new Date().toISOString(),
            }
          : {}),
      })
      // If a direct access token was entered, use it immediately and skip OAuth.
      if (directAccessToken.trim()) {
        onClose()
        // Otherwise, if a new API secret was entered, refresh the trading token via OAuth.
      } else if (apiSecret.trim() && apiKey.trim()) {
        const pending = {
          id: existing.id,
          label: resolvedLabel,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          redirectUri: redirectUri.trim(),
          purpose: newPurposes.filter((p) => p !== 'analytics'),
          analyticsToken: analyticsToken.trim() || undefined,
          mode: 'reauth' as const,
        }
        localStorage.setItem(
          `upstox-pending-${existing.id}`,
          JSON.stringify(pending),
        )
        const oauthUrl = new URL(
          'https://api.upstox.com/v2/login/authorization/dialog',
        )
        oauthUrl.searchParams.set('response_type', 'code')
        oauthUrl.searchParams.set('client_id', apiKey.trim())
        oauthUrl.searchParams.set('redirect_uri', redirectUri.trim())
        oauthUrl.searchParams.set('state', existing.id)
        openAuthPopup(oauthUrl.toString())
      } else {
        onClose()
      }
      return
    }

    // Create mode
    if (hasDirectTradingToken) {
      addAccount({
        id: generateId(),
        label: resolvedLabel,
        broker: 'upstox',
        apiKey: apiKey.trim() || undefined,
        accessToken: directAccessToken.trim(),
        analyticsToken: hasAnalytics ? analyticsToken.trim() : undefined,
        purpose:
          newPurposes.filter((p) => p !== 'analytics').length > 0
            ? newPurposes
            : ['analytics'],
        status: 'connected',
        connectedAt: new Date().toISOString(),
      })
      onClose()
    } else if (hasTradingOauth) {
      const id = generateId()
      const tradingPurposes = [
        ...(marketData ? ['market-data' as const] : []),
        ...(orders ? ['orders' as const] : []),
      ]
      const pending = {
        id,
        label: resolvedLabel,
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        redirectUri: redirectUri.trim(),
        purpose: [
          ...(hasAnalytics ? ['analytics' as const] : []),
          ...tradingPurposes,
        ],
        analyticsToken: hasAnalytics ? analyticsToken.trim() : undefined,
        mode: 'create' as const,
      }
      localStorage.setItem(`upstox-pending-${id}`, JSON.stringify(pending))
      const oauthUrl = new URL(
        'https://api.upstox.com/v2/login/authorization/dialog',
      )
      oauthUrl.searchParams.set('response_type', 'code')
      oauthUrl.searchParams.set('client_id', apiKey.trim())
      oauthUrl.searchParams.set('redirect_uri', redirectUri.trim())
      oauthUrl.searchParams.set('state', id)
      openAuthPopup(oauthUrl.toString())
    } else {
      addAccount({
        id: generateId(),
        label: resolvedLabel,
        broker: 'upstox',
        analyticsToken: analyticsToken.trim(),
        purpose: ['analytics'],
        status: 'connected',
        connectedAt: new Date().toISOString(),
      })
      onClose()
    }
  }

  const inputClass =
    'h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  const purposeBtn = (
    active: boolean,
    onClick: () => void,
    Icon: React.ElementType,
    lbl: string,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon size={12} />
      {lbl}
    </button>
  )

  return (
    <>
      <Tabs defaultValue="analytics">
        <TabsList className="w-full">
          <TabsTrigger value="analytics" className="flex-1 gap-1.5">
            <BarChart2 size={13} />
            Analytics Token
          </TabsTrigger>
          <TabsTrigger value="trading" className="flex-1 gap-1.5">
            <Zap size={13} />
            Trading Token
          </TabsTrigger>
        </TabsList>

        {/* Analytics tab */}
        <TabsContent value="analytics">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Long-lived read-only token (1 year). Generated once from{' '}
              <a
                href="https://account.upstox.com/developer/apps#analytics"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Upstox Developer Apps → Analytics tab
              </a>
              . No daily re-auth needed.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Analytics Token
              </label>
              <textarea
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                placeholder="Paste your analytics token here…"
                value={analyticsToken}
                onChange={(e) => setAnalyticsToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="rounded-md bg-muted/60 border border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                What this token supports
              </p>
              <p>
                ✓ &nbsp;Portfolio, Holdings, Positions, Orders (read), P&amp;L,
                Mutual Funds
              </p>
              <p className="mt-0.5 opacity-70">
                ✗ &nbsp;Market Quotes, Historical Data, Option Chain, WebSocket,
                Order Placing
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Trading tab */}
        <TabsContent value="trading">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Market data, historical candles and order placement require a
              daily Upstox access token. You can either paste a token directly
              below or generate one with the OAuth flow.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Direct Access Token
              </label>
              <textarea
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                rows={3}
                placeholder="Paste a valid Upstox access token to skip browser login…"
                value={directAccessToken}
                onChange={(e) => setDirectAccessToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                If this field is filled, the account will use the pasted token
                directly and skip the callback-based OAuth login.
              </p>
            </div>
            <div className="rounded-md bg-muted/60 border border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                OAuth alternative
              </p>
              <p>
                Leave the direct token blank if you want the app to open the
                Upstox login flow and fetch a fresh token through the callback.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                API Key <span className="text-destructive">*</span>
              </label>
              <input
                className={inputClass}
                placeholder="client_id from your Upstox developer app"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                API Secret <span className="text-destructive">*</span>
              </label>
              <input
                type="password"
                className={inputClass}
                placeholder="client_secret from your Upstox developer app"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Redirect URI <span className="text-destructive">*</span>
              </label>
              <input
                className={cn(inputClass, 'font-mono text-xs')}
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must match the Redirect URL in your{' '}
                <a
                  href="https://account.upstox.com/developer/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Upstox developer app
                </a>
                .
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Purposes
              </label>
              <div className="flex gap-2">
                {purposeBtn(
                  marketData,
                  () => setMarketData((v) => !v),
                  BarChart2,
                  'Market Data',
                )}
                {purposeBtn(
                  orders,
                  () => setOrders((v) => !v),
                  ShoppingCart,
                  'Order Placing',
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              OAuth redirect is only used when you provide API key and secret
              without a direct access token. Your API secret is used only once
              during the token exchange and is never stored.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={!isValid} size="sm">
          <Link2 size={14} />
          {isEditing
            ? 'Save Changes'
            : hasTradingOauth && !hasDirectTradingToken
              ? 'Connect via Upstox'
              : 'Save Account'}
        </Button>
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </>
  )
}

// ─── Add account panel ────────────────────────────────────────────
function AddAccountPanel({
  onClose,
  existing,
}: {
  onClose: () => void
  existing?: BrokerAccount
}) {
  const isEditing = !!existing
  const [selectedBroker, setSelectedBroker] = useState<BrokerMeta | null>(
    isEditing ? (BROKERS.find((b) => b.id === existing.broker) ?? null) : null,
  )
  const [label, setLabel] = useState(existing?.label ?? '')

  const inputClass =
    'h-9 w-full px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {selectedBroker ? (
            <div className="flex items-center gap-2">
              {!isEditing && (
                <>
                  <button
                    onClick={() => setSelectedBroker(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors text-xs font-normal"
                  >
                    ← Brokers
                  </button>
                  <span className="text-muted-foreground">/</span>
                </>
              )}
              <span>
                {isEditing
                  ? `Edit · ${selectedBroker.name}`
                  : selectedBroker.name}
              </span>
            </div>
          ) : (
            'Add Broker Account'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!selectedBroker ? (
          <div className="flex flex-col gap-2 max-w-lg">
            <p className="text-xs text-muted-foreground mb-1">
              Select a broker to connect
            </p>
            {BROKERS.map((broker) => (
              <button
                key={broker.id}
                onClick={() => broker.available && setSelectedBroker(broker)}
                disabled={!broker.available}
                className={cn(
                  'flex items-center gap-3 w-full px-4 py-3 rounded-md border text-left transition-colors',
                  broker.available
                    ? 'border-border hover:border-primary/50 hover:bg-accent cursor-pointer'
                    : 'border-border opacity-40 cursor-not-allowed',
                )}
              >
                <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 text-primary font-bold text-sm shrink-0">
                  {broker.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {broker.name}
                    </span>
                    {!broker.available && (
                      <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {broker.description}
                  </p>
                </div>
                {broker.available && (
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground shrink-0"
                  />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4 max-w-lg">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground">
                Account Label
              </label>
              <input
                className={inputClass}
                placeholder={`e.g. My ${selectedBroker.name} Account`}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <UpstoxForm label={label} onClose={onClose} existing={existing} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────
export function BrokerAccountsPage() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>(() => getAccounts())
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BrokerAccount | null>(
    null,
  )

  const reload = () => setAccounts(getAccounts())

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data === 'upstox-auth-success') {
        reload()
        setShowAddPanel(false)
        setEditingAccount(null)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleRemove = (id: string) => {
    removeAccount(id)
    reload()
  }

  const handlePanelClose = () => {
    setShowAddPanel(false)
    setEditingAccount(null)
    reload()
  }

  const showPanel = showAddPanel || editingAccount !== null
  const isEmpty = accounts.length === 0

  return (
    <div className="flex flex-col gap-5 p-6 min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Broker Accounts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Connect broker accounts to enable trading and market data access
          </p>
        </div>
        {!showPanel && (
          <Button
            size="sm"
            onClick={() => setShowAddPanel(true)}
            className="shrink-0"
          >
            <Plus size={14} />
            Add Account
          </Button>
        )}
      </div>

      {showPanel && (
        <AddAccountPanel
          onClose={handlePanelClose}
          existing={editingAccount ?? undefined}
        />
      )}

      {isEmpty && !showPanel ? (
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                <Link2Off size={20} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  No accounts connected
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a broker account to start trading and accessing market
                  data
                </p>
              </div>
              <Button size="sm" onClick={() => setShowAddPanel(true)}>
                <Plus size={14} />
                Add Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        !isEmpty && (
          <div className="flex flex-col gap-3 max-w-2xl">
            {accounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onRemove={handleRemove}
                onEdit={(a) => {
                  setShowAddPanel(false)
                  setEditingAccount(a)
                }}
              />
            ))}
            <McpSection />
          </div>
        )
      )}
    </div>
  )
}
