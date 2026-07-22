export function getLotSizeForSymbol(
  symbol: string,
  defaultHint?: number,
): number {
  if (defaultHint && defaultHint > 0) return defaultHint
  if (!symbol) return 1

  const upper = symbol.toUpperCase()

  // 1. Index Options & Futures (ordered specific -> general to prevent substring collision)
  if (upper.includes('BANKNIFTY') || upper.includes('NIFTY BANK')) return 15
  if (
    upper.includes('FINNIFTY') ||
    upper.includes('NIFTY FIN SERVICE') ||
    upper.includes('FIN SERVICE')
  )
    return 40
  if (
    upper.includes('MIDCPNIFTY') ||
    upper.includes('NIFTY MID SELECT') ||
    upper.includes('MIDCAP')
  )
    return 50
  if (upper.includes('NIFTYNXT50') || upper.includes('NEXT50')) return 10
  if (upper.includes('SENSEX') || upper.includes('BSX')) return 10
  if (upper.includes('BANKEX')) return 15
  if (upper.includes('NIFTY 50') || upper.includes('NIFTY')) return 25

  // 2. High-volume NSE Stock F&O Symbols
  if (upper.includes('RELIANCE')) return 250
  if (upper.includes('INFY') || upper.includes('INFOSYS')) return 400
  if (upper.includes('TCS')) return 175
  if (upper.includes('HDFCBANK')) return 550
  if (upper.includes('ICICIBANK')) return 700
  if (upper.includes('SBIN')) return 1500
  if (upper.includes('AXISBANK')) return 625
  if (upper.includes('KOTAKBANK')) return 400
  if (upper.includes('TATAMOTORS')) return 1425
  if (upper.includes('TATASTEEL')) return 5500
  if (upper.includes('BHARTIARTL')) return 475
  if (upper.includes('LT') || upper.includes('LARSEN')) return 300
  if (upper.includes('ITC')) return 1600
  if (upper.includes('MARUTI')) return 100
  if (upper.includes('BAJFINANCE')) return 125
  if (upper.includes('BAJAJFINSV')) return 500
  if (upper.includes('WIPRO')) return 1500
  if (upper.includes('HCLTECH')) return 700
  if (upper.includes('TECHM')) return 600
  if (upper.includes('SUNPHARMA')) return 700
  if (upper.includes('TITAN')) return 175
  if (upper.includes('ULTRACEMCO')) return 100
  if (upper.includes('ASIANPAINT')) return 200
  if (upper.includes('NESTLEIND')) return 250
  if (upper.includes('POWERGRID')) return 3600
  if (upper.includes('NTPC')) return 3000
  if (upper.includes('ONGC')) return 3850
  if (upper.includes('COALINDIA')) return 2100

  return defaultHint && defaultHint > 0 ? defaultHint : 1
}
