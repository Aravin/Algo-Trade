const GLOBAL_INDICES_URL = 'https://www.vrdnation.com/pulse/api/dashboard'

export async function handleGlobalIndices(): Promise<Response> {
  let upstream: Response
  try {
    upstream = await fetch(GLOBAL_INDICES_URL, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
    })
  } catch (e) {
    return Response.json(
      { error: `Failed to reach global indices feed: ${String(e)}` },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    return Response.json(
      { error: `Global indices feed returned ${upstream.status}` },
      { status: 502 },
    )
  }

  const raw = await upstream.json<{
    globalIndicesByRegion?: {
      US?: { displayName: string; price: number; change: number }[]
      ASIA?: { displayName: string; price: number; change: number }[]
      Commodities?: { displayName: string; price: number; change: number }[]
    }
  }>()

  const regions = raw?.globalIndicesByRegion
  if (!regions) {
    return Response.json(
      { error: 'No globalIndicesByRegion in response', raw },
      { status: 502 },
    )
  }

  // Flatten all regions into a single array of GlobalIndexItem
  const allItems = [
    ...(regions.US ?? []),
    ...(regions.ASIA ?? []),
    ...(regions.Commodities ?? []),
  ]

  const normalized = allItems.map((item) => ({
    symbol: item.displayName,
    last_price: item.price ?? 0,
    change_per: item.change ?? 0,
  }))

  const rawGift = regions.ASIA?.find(
    (item) =>
      item.displayName.toLowerCase().includes('gift') ||
      item.displayName.toLowerCase().includes('sgx'),
  )

  let giftNifty: {
    price: number | null
    changePts: number | null
    changePct: number | null
    openingSignal: 'Gap Up' | 'Gap Down' | 'Flat' | null
  } | null

  if (rawGift) {
    const price = Number(rawGift.price ?? 0)
    const changePct = Number(rawGift.change ?? 0)
    const changePts = parseFloat((price * (changePct / 100)).toFixed(2))
    const openingSignal =
      changePct > 0.1 ? 'Gap Up' : changePct < -0.1 ? 'Gap Down' : 'Flat'
    giftNifty = {
      price,
      changePts,
      changePct,
      openingSignal,
    }
  } else {
    // If not found in upstream API, fallback to signal derived from Dow Futures only.
    // Price is intentionally null so the UI renders "—" instead of a stale invented level.
    const dowFuture = regions.US?.find((item) =>
      item.displayName.toLowerCase().includes('future'),
    )
    const changePct = dowFuture ? Number(dowFuture.change ?? 0) : null
    const openingSignal =
      changePct !== null
        ? changePct > 0.1
          ? 'Gap Up'
          : changePct < -0.1
            ? 'Gap Down'
            : 'Flat'
        : null
    giftNifty = {
      price: null,
      changePts: null,
      changePct,
      openingSignal,
    }
  }

  return Response.json({
    status: 'success',
    data: normalized,
    giftNifty,
  })
}
