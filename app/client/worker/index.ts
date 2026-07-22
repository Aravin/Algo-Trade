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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // ── Public proxy routes (no Auth0 token required) ──────────────
    // These forward requests to Upstox/market APIs on behalf of the browser.
    // They must remain unauthenticated because the OAuth callback popup does
    // not have an Auth0 session when it calls /api/broker/upstox/token.
    if (
      url.pathname === '/api/broker/upstox/token' &&
      request.method === 'POST'
    ) {
      return handleUpstoxToken(request)
    }
    if (
      url.pathname === '/api/broker/upstox/profile' &&
      request.method === 'POST'
    ) {
      return handleUpstoxProfile(request)
    }
    if (url.pathname === '/api/market/indices' && request.method === 'POST') {
      return handleMarketIndices(request)
    }
    if (url.pathname === '/api/market/quotes' && request.method === 'POST') {
      return handleMarketQuotes(request)
    }
    if (
      url.pathname === '/api/broker/upstox/funds' &&
      request.method === 'POST'
    ) {
      return handleUpstoxFunds(request)
    }
    if (
      url.pathname === '/api/market/candles/intraday' &&
      request.method === 'POST'
    ) {
      return handleIntraday(request)
    }
    if (
      url.pathname === '/api/market/candles/historical' &&
      request.method === 'POST'
    ) {
      return handleHistoricalCandles(request)
    }
    if (
      url.pathname === '/api/market/option-chain' &&
      request.method === 'POST'
    ) {
      return handleOptionChain(request)
    }
    if (
      url.pathname === '/api/market/option-contracts' &&
      request.method === 'POST'
    ) {
      return handleOptionContracts(request)
    }
    if (
      url.pathname === '/api/market/upstox/pcr' &&
      request.method === 'POST'
    ) {
      return handleUpstoxPcr(request)
    }

    // ── New Upstox-based market data ──────────────────────────────────────────
    if (url.pathname === '/api/market/vix' && request.method === 'POST') {
      return handleVix(request)
    }
    if (url.pathname === '/api/market/breadth' && request.method === 'POST') {
      return handleBreadth(request)
    }

    if (
      url.pathname === '/api/market/upstox/fii' &&
      request.method === 'POST'
    ) {
      return handleUpstoxFii(request)
    }
    if (
      url.pathname === '/api/market/upstox/dii' &&
      request.method === 'POST'
    ) {
      return handleUpstoxDii(request)
    }
    if (
      url.pathname === '/api/market/upstox/max-pain' &&
      request.method === 'POST'
    ) {
      return handleUpstoxMaxPain(request)
    }
    if (url.pathname === '/api/market/upstox/oi' && request.method === 'POST') {
      return handleUpstoxOi(request)
    }
    if (
      url.pathname === '/api/market/upstox/change-oi' &&
      request.method === 'POST'
    ) {
      return handleUpstoxChangeOi(request)
    }
    if (
      url.pathname === '/api/market/upstox/smartlist/futures' &&
      request.method === 'POST'
    ) {
      return handleUpstoxSmartlistFutures(request)
    }
    if (
      url.pathname === '/api/market/upstox/news' &&
      request.method === 'POST'
    ) {
      return handleUpstoxNews(request)
    }
    if (
      (url.pathname === '/api/market/upstox/global-indices' ||
        url.pathname === '/api/market/global-sentiment') &&
      (request.method === 'POST' || request.method === 'GET')
    ) {
      return handleGlobalIndices()
    }

    // ── Authenticated routes (Auth0 token required) ────────────────
    let userId = 'local-dev-user'
    if (url.pathname.startsWith('/api/')) {
      const tokenUser = await verifyAuth0Token(request, env)
      if (!tokenUser) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized. Invalid or missing token.' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }
      userId = tokenUser
    }

    if (url.pathname === '/api/order/place' && request.method === 'POST') {
      return handlePlaceOrder(request)
    }
    if (url.pathname === '/api/order/list' && request.method === 'POST') {
      return handleOrderList(request)
    }

    if (url.pathname === '/api/client-state' && request.method === 'GET') {
      return handleClientStateGet(request, env, userId)
    }
    if (url.pathname === '/api/client-state' && request.method === 'PUT') {
      return handleClientStatePut(request, env, userId)
    }
    if (url.pathname === '/api/paper/account' && request.method === 'GET') {
      return handlePaperAccount(env, userId)
    }
    if (url.pathname === '/api/paper/history' && request.method === 'GET') {
      return handlePaperHistory(env, userId)
    }
    if (
      url.pathname === '/api/paper/account/adjust' &&
      request.method === 'POST'
    ) {
      return handlePaperAccountAdjust(request, env, userId)
    }
    if (
      url.pathname === '/api/paper/trades/enter' &&
      request.method === 'POST'
    ) {
      return handlePaperTradeEnter(request, env, userId)
    }
    if (
      url.pathname === '/api/paper/trades/exit' &&
      request.method === 'POST'
    ) {
      return handlePaperTradeExit(request, env, userId)
    }
    if (url.pathname === '/api/paper/reset' && request.method === 'POST') {
      return handlePaperReset(env, userId)
    }

    return Response.json({ error: 'Unknown API route' }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
