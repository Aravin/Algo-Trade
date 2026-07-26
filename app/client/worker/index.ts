import type { Env } from './types'
import { verifyAuth0Token } from './auth'
import { handleClientStateGet, handleClientStatePut } from './clientState'
import {
  handlePaperAccount,
  handlePaperHistory,
  handlePaperAccountAdjust,
  handlePaperReset,
  handlePaperTradeEnter,
  handlePaperTradeExit,
} from './paperTrading'
import {
  handleUpstoxToken,
  handleUpstoxProfile,
  handleMarketIndices,
  handleMarketQuotes,
  handleUpstoxFunds,
  handleIntraday,
  handleHistoricalCandles,
  handleOptionContracts,
  handleOptionChain,
  handleUpstoxPcr,
  handlePlaceOrder,
  handleOrderList,
  handleVix,
  handleBreadth,
  handleUpstoxFii,
  handleUpstoxDii,
  handleUpstoxMaxPain,
  handleUpstoxNews,
  handleUpstoxOi,
  handleUpstoxChangeOi,
  handleUpstoxSmartlistFutures,
} from './upstoxProxy'
import { handleGlobalIndices } from './globalIndices'

const MAX_BODY_BYTES = 1024 * 50

function securityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.upstox.com https://www.vrdnation.com; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  }
}

const requestCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 200

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now()
  const entry = requestCounts.get(clientIp)
  if (!entry || now > entry.resetAt) {
    requestCounts.set(clientIp, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false
  entry.count++
  return true
}

function validateContentType(
  request: Request,
  allowedTypes: string[],
): boolean {
  const ct = request.headers.get('content-type') ?? ''
  return allowedTypes.some((t) => ct.includes(t))
}

function jsonError(status: number, error: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...securityHeaders(),
  }
  return new Response(JSON.stringify({ error }), { status, headers })
}

function withSecurity(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(securityHeaders())) {
    if (!headers.has(key)) {
      headers.set(key, value)
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown'
    if (!checkRateLimit(clientIp)) {
      return jsonError(429, 'Too many requests. Please slow down.')
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      if (!validateContentType(request, ['application/json'])) {
        return jsonError(415, 'Content-Type must be application/json')
      }
      const cl = request.headers.get('content-length')
      if (cl && parseInt(cl) > MAX_BODY_BYTES) {
        return jsonError(413, 'Request body too large')
      }
    }

    const captureResponse: (resp: Response) => Response = withSecurity

    // ── Public proxy routes (no Auth0 token required) ──────────────
    if (
      url.pathname === '/api/broker/upstox/token' &&
      request.method === 'POST'
    )
      return captureResponse(await handleUpstoxToken(request))
    if (
      url.pathname === '/api/broker/upstox/profile' &&
      request.method === 'POST'
    )
      return captureResponse(await handleUpstoxProfile(request))
    if (url.pathname === '/api/market/indices' && request.method === 'POST')
      return captureResponse(await handleMarketIndices(request))
    if (url.pathname === '/api/market/quotes' && request.method === 'POST')
      return captureResponse(await handleMarketQuotes(request))
    if (
      url.pathname === '/api/broker/upstox/funds' &&
      request.method === 'POST'
    )
      return captureResponse(await handleUpstoxFunds(request))
    if (
      url.pathname === '/api/market/candles/intraday' &&
      request.method === 'POST'
    )
      return captureResponse(await handleIntraday(request))
    if (
      url.pathname === '/api/market/candles/historical' &&
      request.method === 'POST'
    )
      return captureResponse(await handleHistoricalCandles(request))
    if (
      url.pathname === '/api/market/option-chain' &&
      request.method === 'POST'
    )
      return captureResponse(await handleOptionChain(request))
    if (
      url.pathname === '/api/market/option-contracts' &&
      request.method === 'POST'
    )
      return captureResponse(await handleOptionContracts(request))
    if (url.pathname === '/api/market/upstox/pcr' && request.method === 'POST')
      return captureResponse(await handleUpstoxPcr(request))
    if (url.pathname === '/api/market/vix' && request.method === 'POST')
      return captureResponse(await handleVix(request))
    if (url.pathname === '/api/market/breadth' && request.method === 'POST')
      return captureResponse(await handleBreadth(request))
    if (url.pathname === '/api/market/upstox/fii' && request.method === 'POST')
      return captureResponse(await handleUpstoxFii(request))
    if (url.pathname === '/api/market/upstox/dii' && request.method === 'POST')
      return captureResponse(await handleUpstoxDii(request))
    if (
      url.pathname === '/api/market/upstox/max-pain' &&
      request.method === 'POST'
    )
      return captureResponse(await handleUpstoxMaxPain(request))
    if (url.pathname === '/api/market/upstox/oi' && request.method === 'POST')
      return captureResponse(await handleUpstoxOi(request))
    if (
      url.pathname === '/api/market/upstox/change-oi' &&
      request.method === 'POST'
    )
      return captureResponse(await handleUpstoxChangeOi(request))
    if (
      url.pathname === '/api/market/upstox/smartlist/futures' &&
      request.method === 'POST'
    )
      return captureResponse(await handleUpstoxSmartlistFutures(request))
    if (url.pathname === '/api/market/upstox/news' && request.method === 'POST')
      return captureResponse(await handleUpstoxNews(request))
    if (
      (url.pathname === '/api/market/upstox/global-indices' ||
        url.pathname === '/api/market/global-sentiment') &&
      (request.method === 'POST' || request.method === 'GET')
    )
      return captureResponse(await handleGlobalIndices())

    // ── Authenticated routes (Auth0 token required) ────────────────
    let userId = 'local-dev-user'
    if (url.pathname.startsWith('/api/')) {
      const tokenUser = await verifyAuth0Token(request, env)
      if (!tokenUser) {
        return jsonError(401, 'Unauthorized. Invalid or missing token.')
      }
      userId = tokenUser
    }

    if (url.pathname === '/api/order/place' && request.method === 'POST')
      return captureResponse(await handlePlaceOrder(request))
    if (url.pathname === '/api/order/list' && request.method === 'POST')
      return captureResponse(await handleOrderList(request))
    if (url.pathname === '/api/client-state' && request.method === 'GET')
      return captureResponse(await handleClientStateGet(request, env, userId))
    if (url.pathname === '/api/client-state' && request.method === 'PUT')
      return captureResponse(await handleClientStatePut(request, env, userId))
    if (url.pathname === '/api/paper/account' && request.method === 'GET')
      return captureResponse(await handlePaperAccount(env, userId))
    if (url.pathname === '/api/paper/history' && request.method === 'GET')
      return captureResponse(await handlePaperHistory(env, userId))
    if (
      url.pathname === '/api/paper/account/adjust' &&
      request.method === 'POST'
    )
      return captureResponse(
        await handlePaperAccountAdjust(request, env, userId),
      )
    if (url.pathname === '/api/paper/trades/enter' && request.method === 'POST')
      return captureResponse(await handlePaperTradeEnter(request, env, userId))
    if (url.pathname === '/api/paper/trades/exit' && request.method === 'POST')
      return captureResponse(await handlePaperTradeExit(request, env, userId))
    if (url.pathname === '/api/paper/reset' && request.method === 'POST')
      return captureResponse(await handlePaperReset(env, userId))

    return jsonError(404, 'Unknown API route')
  },
} satisfies ExportedHandler<Env>
