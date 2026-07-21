export function nowIso(): string {
  return new Date().toISOString()
}

export function getLotSizeForSymbol(instrumentKey: string): number {
  const upper = instrumentKey.toUpperCase()
  if (upper.includes('BANKNIFTY') || upper.includes('NIFTY BANK')) return 15
  if (upper.includes('FINNIFTY')) return 40
  if (upper.includes('NIFTY 50') || upper.includes('NIFTY')) return 25
  return 1
}

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}
