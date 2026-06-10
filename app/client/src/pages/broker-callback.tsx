import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, XCircle } from 'lucide-react'
import { addAccount, updateAccount, type BrokerPurpose } from '@/lib/accounts'

interface PendingAccount {
  id: string
  label: string
  apiKey: string
  apiSecret: string
  redirectUri: string
  purpose: BrokerPurpose[]
  analyticsToken?: string
  mode?: 'create' | 'reauth'
}

export function BrokerCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('code')) return 'error'
    if (!sessionStorage.getItem(`upstox-pending-${params.get('state')}`))
      return 'error'
    return 'loading'
  })
  const [errorMsg, setErrorMsg] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.get('code'))
      return 'No authorization code received from Upstox.'
    if (!sessionStorage.getItem(`upstox-pending-${params.get('state')}`))
      return 'Session expired or state mismatch. Please try connecting again.'
    return ''
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const stateParam = params.get('state')

    if (!code) return

    const raw = sessionStorage.getItem(`upstox-pending-${stateParam}`)
    if (!raw) return

    const pending = JSON.parse(raw) as PendingAccount
    sessionStorage.removeItem(`upstox-pending-${stateParam}`)

    fetch('/api/broker/upstox/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        apiKey: pending.apiKey,
        apiSecret: pending.apiSecret,
        redirectUri: pending.redirectUri,
      }),
    })
      .then(
        (res) =>
          res.json() as Promise<{ access_token?: string; error?: string }>,
      )
      .then((data) => {
        if (data.access_token) {
          if (pending.mode === 'reauth') {
            updateAccount(pending.id, {
              accessToken: data.access_token,
              status: 'connected',
              connectedAt: new Date().toISOString(),
            })
          } else {
            addAccount({
              id: pending.id,
              label: pending.label,
              broker: 'upstox',
              apiKey: pending.apiKey,
              purpose: pending.purpose,
              status: 'connected',
              accessToken: data.access_token,
              analyticsToken: pending.analyticsToken,
              connectedAt: new Date().toISOString(),
            })
          }
          setStatus('success')
          setTimeout(() => {
            window.location.href = '/?page=broker-accounts'
          }, 1500)
        } else {
          setStatus('error')
          setErrorMsg(
            data.error ?? 'Failed to obtain access token from Upstox.',
          )
        }
      })
      .catch(() => {
        setStatus('error')
        setErrorMsg('Network error during token exchange. Please try again.')
      })
  }, [])

  return (
    <div className="flex items-center justify-center min-h-dvh bg-background">
      <div className="flex flex-col items-center gap-4 p-8 text-center max-w-sm">
        {status === 'loading' && (
          <>
            <Loader2 size={32} className="text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Connecting your Upstox account…
            </p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={32} className="text-success" />
            <p className="text-sm font-medium text-foreground">
              Account connected successfully!
            </p>
            <p className="text-xs text-muted-foreground">
              Redirecting you back to the dashboard…
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={32} className="text-destructive" />
            <p className="text-sm font-medium text-foreground">
              Connection failed
            </p>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <button
              onClick={() => (window.location.href = '/?page=broker-accounts')}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Go back to Broker Accounts
            </button>
          </>
        )}
      </div>
    </div>
  )
}
