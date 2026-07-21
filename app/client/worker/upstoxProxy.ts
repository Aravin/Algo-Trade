import type { UpstoxTokenRequest } from './types'

export function formatIsoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function extractLatestPcrValue(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as {
    data?:
      | {
          pcr?: number
          value?: number
          put_call_ratio?: number
          timestamp?: string
          date?: string
        }[]
      | {
          pcr?: number
          value?: number
          put_call_ratio?: number
          candles?: {
            pcr?: number
            value?: number
            put_call_ratio?: number
            timestamp?: string
            date?: string
          }[]
        }
  }
  const data = record.data

  const series = Array.isArray(data)
    ? data
    : Array.isArray(data?.candles)
      ? data.candles
      : []

  const latest = [...series].sort((left, right) =>
    String(right.timestamp ?? right.date ?? '').localeCompare(
      String(left.timestamp ?? left.date ?? ''),
    ),
  )[0]
  const objectValue = !Array.isArray(data)
    ? (data?.pcr ?? data?.value ?? data?.put_call_ratio)
    : undefined
  const value =
    latest?.pcr ?? latest?.value ?? latest?.put_call_ratio ?? objectValue
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function handleUpstoxToken(request: Request): Promise<Response> {
  let body: UpstoxTokenRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { code, apiKey, apiSecret, redirectUri } = body
  if (!code || !apiKey || !apiSecret || !redirectUri) {
    return Response.json(
      {
        error: 'Missing required fields: code, apiKey, apiSecret, redirectUri',
      },
      { status: 400 },
    )
  }

  const params = new URLSearchParams({
    code,
    client_id: apiKey,
    client_secret: apiSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.upstox.com/v2/login/authorization/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox token endpoint' },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxProfile(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token) {
    return Response.json({ error: 'Missing token' }, { status: 400 })
  }
  let upstream: Response
  try {
    upstream = await fetch('https://api.upstox.com/v2/user/profile', {
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
      },
    })
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

const INSTRUMENT_KEYS = [
  'NSE_INDEX|Nifty 50',
  'NSE_INDEX|Nifty Bank',
  'BSE_INDEX|SENSEX',
  'NSE_INDEX|India VIX',
].join(',')

export async function handleMarketIndices(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(INSTRUMENT_KEYS)}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxFunds(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.upstox.com/v3/user/get-funds-and-margin',
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
          'Api-Version': '3.0',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleIntraday(request: Request): Promise<Response> {
  let body: { token: string; instrumentKey: string; interval?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.instrumentKey)
    return Response.json(
      { error: 'Missing token or instrumentKey' },
      { status: 400 },
    )
  const interval = body.interval ?? '1minute'
  const key = encodeURIComponent(body.instrumentKey)
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/historical-candle/intraday/${key}/${interval}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleOptionContracts(
  request: Request,
): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  let upstream: Response
  try {
    upstream = await fetch(
      'https://api.upstox.com/v2/option/contract?instrument_key=NSE_INDEX|Nifty 50',
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }

  const raw = await upstream.json<{ data?: { expiry?: string }[] }>()
  const today = formatIsoDate()
  const expiries = [
    ...new Set(
      (raw.data ?? [])
        .map((item) => item.expiry)
        .filter(
          (value): value is string =>
            typeof value === 'string' && value >= today,
        ),
    ),
  ].sort()
  return Response.json(
    { data: raw.data ?? [], expiries },
    { status: upstream.status },
  )
}

export async function handleMarketQuotes(request: Request): Promise<Response> {
  let body: { token: string; instrumentKeys: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.token || !body.instrumentKeys)
    return Response.json(
      { error: 'Missing token or instrumentKeys' },
      { status: 400 },
    )
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(body.instrumentKeys)}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleOptionChain(request: Request): Promise<Response> {
  let body: { token: string; expiryDate: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiryDate)
    return Response.json(
      { error: 'Missing token or expiryDate' },
      { status: 400 },
    )
  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry_date: body.expiryDate,
  })
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/option/chain?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxPcr(request: Request): Promise<Response> {
  let body: {
    token: string
    expiry: string
    date?: string
    bucketInterval?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiry)
    return Response.json({ error: 'Missing token or expiry' }, { status: 400 })

  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry: body.expiry,
    date: body.date ?? formatIsoDate(),
    bucket_interval: String(body.bucketInterval ?? 60),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/pcr?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }

  const raw = await upstream.json()
  return Response.json(
    { value: extractLatestPcrValue(raw), raw },
    { status: upstream.status },
  )
}

export async function handlePlaceOrder(request: Request): Promise<Response> {
  let body: {
    token: string
    instrumentKey: string
    transactionType: 'BUY' | 'SELL'
    quantity: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (
    !body.token ||
    !body.instrumentKey ||
    !body.transactionType ||
    !body.quantity
  ) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const orderPayload = {
    instrument_token: body.instrumentKey,
    quantity: body.quantity,
    transaction_type: body.transactionType,
    order_type: 'MARKET',
    product: 'I',
    validity: 'DAY',
    price: 0,
    trigger_price: 0,
    disclosed_quantity: 0,
    is_amo: false,
    tag: 'algo-v5',
  }
  let upstream: Response
  try {
    upstream = await fetch('https://api.upstox.com/v2/order/place', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    })
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleOrderList(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch('https://api.upstox.com/v2/order/retrieve-all', {
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
      },
    })
  } catch {
    return Response.json(
      { error: 'Failed to reach Upstox API' },
      { status: 502 },
    )
  }
  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleVix(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  const key = encodeURIComponent('NSE_INDEX|India VIX')
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${key}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json({ error: 'Failed to reach Upstox' }, { status: 502 })
  }
  const raw = await upstream.json<{
    status?: string
    data?: Record<string, { last_price?: number }>
  }>()
  const entry = Object.values(raw?.data ?? {})[0]
  return Response.json({ vix: entry?.last_price ?? null })
}

const NIFTY50_KEYS = [
  'NSE_EQ|INE423A01024',
  'NSE_EQ|INE742F01042',
  'NSE_EQ|INE437A01024',
  'NSE_EQ|INE021A01026',
  'NSE_EQ|INE238A01034',
  'NSE_EQ|INE917I01010',
  'NSE_EQ|INE296A01032',
  'NSE_EQ|INE918I01026',
  'NSE_EQ|INE029A01011',
  'NSE_EQ|INE397D01024',
  'NSE_EQ|INE216A01030',
  'NSE_EQ|INE059A01026',
  'NSE_EQ|INE522F01014',
  'NSE_EQ|INE361B01024',
  'NSE_EQ|INE089A01031',
  'NSE_EQ|INE066A01021',
  'NSE_EQ|INE047A01021',
  'NSE_EQ|INE860A01027',
  'NSE_EQ|INE040A01034',
  'NSE_EQ|INE795G01014',
  'NSE_EQ|INE158A01026',
  'NSE_EQ|INE038A01020',
  'NSE_EQ|INE030A01027',
  'NSE_EQ|INE090A01021',
  'NSE_EQ|INE095A01012',
  'NSE_EQ|INE009A01021',
  'NSE_EQ|INE154A01025',
  'NSE_EQ|INE019A01038',
  'NSE_EQ|INE237A01036',
  'NSE_EQ|INE018A01030',
  'NSE_EQ|INE214T01019',
  'NSE_EQ|INE101A01026',
  'NSE_EQ|INE585B01010',
  'NSE_EQ|INE239A01024',
  'NSE_EQ|INE733E01010',
  'NSE_EQ|INE213A01029',
  'NSE_EQ|INE752E01010',
  'NSE_EQ|INE002A01018',
  'NSE_EQ|INE123W01016',
  'NSE_EQ|INE721A01047',
  'NSE_EQ|INE062A01020',
  'NSE_EQ|INE044A01036',
  'NSE_EQ|INE467B01029',
  'NSE_EQ|INE192A01025',
  'NSE_EQ|INE155A01022',
  'NSE_EQ|INE081A01020',
  'NSE_EQ|INE669C01036',
  'NSE_EQ|INE280A01028',
  'NSE_EQ|INE849A01020',
  'NSE_EQ|INE481G01011',
]

export async function handleBreadth(request: Request): Promise<Response> {
  let body: { token: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })
  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(NIFTY50_KEYS.join(','))}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch {
    return Response.json({ error: 'Failed to reach Upstox' }, { status: 502 })
  }
  const raw = await upstream.json<{
    status?: string
    data?: Record<string, { net_change?: number; last_price?: number }>
  }>()
  if (!raw?.data)
    return Response.json({ error: 'No data from Upstox', raw }, { status: 502 })
  const stocks = Object.values(raw.data)
  const advances = stocks.filter((s) => (s.net_change ?? 0) > 0).length
  const declines = stocks.filter((s) => (s.net_change ?? 0) < 0).length
  const ratio =
    declines > 0
      ? parseFloat((advances / declines).toFixed(3))
      : advances > 0
        ? 3.0
        : 1.0
  return Response.json({
    advances,
    declines,
    unchanged: stocks.length - advances - declines,
    ratio,
    total: stocks.length,
  })
}

export async function handleUpstoxFii(request: Request): Promise<Response> {
  let body: { token: string; from?: string; interval?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  const qs = new URLSearchParams({
    data_type: 'NSE_FO|INDEX_FUTURES,NSE_FO|INDEX_OPTIONS,NSE_EQ|CASH',
    interval: body.interval ?? '1D',
  })
  if (body.from) {
    qs.set('from', body.from)
  } else {
    const date = new Date()
    date.setDate(date.getDate() - 15)
    qs.set('from', formatIsoDate(date))
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/fii?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxDii(request: Request): Promise<Response> {
  let body: { token: string; from?: string; interval?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  const qs = new URLSearchParams({
    data_type: 'NSE_EQ|CASH',
    interval: body.interval ?? '1D',
  })
  if (body.from) {
    qs.set('from', body.from)
  } else {
    const date = new Date()
    date.setDate(date.getDate() - 15)
    qs.set('from', formatIsoDate(date))
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/dii?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxMaxPain(request: Request): Promise<Response> {
  let body: {
    token: string
    expiry: string
    date?: string
    bucketInterval?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiry)
    return Response.json({ error: 'Missing token or expiry' }, { status: 400 })

  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry: body.expiry,
    date: body.date ?? formatIsoDate(),
    bucket_interval: String(body.bucketInterval ?? 60),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/max-pain?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxNews(request: Request): Promise<Response> {
  let body: {
    token: string
    category: string
    instrumentKeys?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.category)
    return Response.json(
      { error: 'Missing token or category' },
      { status: 400 },
    )

  const qs = new URLSearchParams({
    category: body.category,
  })
  if (body.instrumentKeys) {
    qs.append('instrument_keys', body.instrumentKeys)
  }

  let upstream: Response
  try {
    upstream = await fetch(`https://api.upstox.com/v2/news?${qs.toString()}`, {
      headers: {
        Authorization: `Bearer ${body.token}`,
        Accept: 'application/json',
      },
    })
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox news: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxOi(request: Request): Promise<Response> {
  let body: { token: string; expiry: string; date?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiry)
    return Response.json({ error: 'Missing token or expiry' }, { status: 400 })

  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry: body.expiry,
    date: body.date ?? formatIsoDate(),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/oi?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxChangeOi(
  request: Request,
): Promise<Response> {
  let body: {
    token: string
    expiry: string
    date?: string
    interval?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token || !body.expiry)
    return Response.json({ error: 'Missing token or expiry' }, { status: 400 })

  const qs = new URLSearchParams({
    instrument_key: 'NSE_INDEX|Nifty 50',
    expiry: body.expiry,
    date: body.date ?? formatIsoDate(),
    interval: String(body.interval ?? 1),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/change-oi?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}

export async function handleUpstoxSmartlistFutures(
  request: Request,
): Promise<Response> {
  let body: {
    token: string
    assetType?: string
    category?: string
    pageNumber?: number
    pageSize?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (!body.token)
    return Response.json({ error: 'Missing token' }, { status: 400 })

  const qs = new URLSearchParams({
    asset_type: body.assetType ?? 'INDEX',
    category: body.category ?? 'TOP_TRADED',
    page_number: String(body.pageNumber ?? 1),
    page_size: String(body.pageSize ?? 20),
  })

  let upstream: Response
  try {
    upstream = await fetch(
      `https://api.upstox.com/v2/market/smartlist/futures?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${body.token}`,
          Accept: 'application/json',
        },
      },
    )
  } catch (e) {
    return Response.json(
      { error: `Failed to reach Upstox: ${String(e)}` },
      { status: 502 },
    )
  }

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}
