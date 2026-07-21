export function getLotSizeForSymbol(symbol: string): number {
  const upper = symbol.toUpperCase()
  if (upper.includes('BANKNIFTY') || upper.includes('NIFTY BANK')) return 15
  if (upper.includes('FINNIFTY')) return 40
  if (upper.includes('NIFTY 50') || upper.includes('NIFTY')) return 25
  return 1
}
