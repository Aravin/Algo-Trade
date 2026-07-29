import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TradeRowStatus } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns true only if the current wall-clock time (in IST) falls within
 * NSE regular trading hours: Monday–Friday, 09:15–15:30 IST.
 */
export function isNseMarketOpen(): boolean {
  // IST = UTC+5:30
  const nowUtc = Date.now()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIst = new Date(nowUtc + istOffsetMs)
  const dayOfWeek = nowIst.getUTCDay() // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) return false
  const hh = nowIst.getUTCHours()
  const mm = nowIst.getUTCMinutes()
  const totalMinutes = hh * 60 + mm
  const marketOpen = 9 * 60 + 15 // 09:15
  const marketClose = 15 * 60 + 30 // 15:30
  return totalMinutes >= marketOpen && totalMinutes < marketClose
}

/**
 * Returns true if the given date matches today's calendar date.
 */
export function isToday(isoLike: string | null | undefined): boolean {
  if (!isoLike) return false
  const nowUtc = Date.now()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const todayIst = new Date(nowUtc + istOffsetMs)
  const yyyy = todayIst.getUTCFullYear()
  const mm = String(todayIst.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(todayIst.getUTCDate()).padStart(2, '0')
  return isoLike.slice(0, 10) === `${yyyy}-${mm}-${dd}`
}

/**
 * Maps raw Upstox status string to TradeRowStatus.
 */
export function normalizeLiveStatus(s: string | undefined): TradeRowStatus {
  const u = String(s ?? '').toUpperCase()
  if (u.includes('REJECT')) return 'REJECTED'
  if (u.includes('CANCEL')) return 'CANCELLED'
  if (u.includes('COMPLETE')) return 'COMPLETED'
  return 'ACTIVE'
}

export interface IndexExpiryInfo {
  expiryDateStr: string // "2026-07-28"
  formattedExpiry: string // "28 Jul 2026"
  dayOfWeek: string // "Tuesday"
  fullLabel: string // "28 Jul 2026 (Tuesday)"
  relativeText: string // "Today (Expiry Day)", "Tomorrow", "in 2 days"
}

export function extractCleanTradingSymbol(
  symbolOrKey?: string,
): string | undefined {
  if (!symbolOrKey) return undefined
  const cleaned = symbolOrKey
    .replace(/^(NSE_FO|NSE_INDEX|BSE_FO|BSE_INDEX|MCX_FO)[:|]/i, '')
    .trim()
  if (!cleaned) return undefined
  if (/^\d+$/.test(cleaned)) return undefined
  return cleaned
}

export function getSensibullUrl(
  tradingSymbol?: string,
  underlyingSymbol?: string,
): string | undefined {
  const cleanSym =
    extractCleanTradingSymbol(tradingSymbol) ??
    extractCleanTradingSymbol(underlyingSymbol)
  if (!cleanSym) return undefined

  const upper = cleanSym.toUpperCase()
  const isIndex = [
    'NIFTY',
    'NIFTY 50',
    'BANKNIFTY',
    'FINNIFTY',
    'MIDCPNIFTY',
    'SENSEX',
  ].includes(upper)

  if (isIndex) {
    const sym = upper === 'NIFTY 50' ? 'NIFTY' : upper
    return `https://web.sensibull.com/option-chain?tradingsymbol=${encodeURIComponent(sym)}`
  }

  return `https://web.sensibull.com/chart?tradingSymbol=${encodeURIComponent(cleanSym)}`
}

export function getSensibullOptionChainUrl(underlyingSymbol?: string): string {
  const cleanSym = extractCleanTradingSymbol(underlyingSymbol) ?? 'NIFTY'
  const upper = cleanSym.toUpperCase()
  const sym = upper === 'NIFTY 50' ? 'NIFTY' : upper
  return `https://web.sensibull.com/option-chain?tradingsymbol=${encodeURIComponent(sym)}`
}

/**
 * Calculates a display-only fallback option expiry in IST.
 *
 * Live Upstox contract metadata must be preferred for trading because exchange
 * holidays can move an expiry. NSE index derivatives expire on Tuesday:
 * NIFTY has weekly expiries, while BANKNIFTY, FINNIFTY and MIDCPNIFTY use the
 * last Tuesday of the expiry month. SENSEX retains its Friday fallback.
 */
export function getUpcomingIndexExpiry(
  symbolOrName: string,
  liveExpiryOverride?: string | null,
): IndexExpiryInfo {
  if (liveExpiryOverride && liveExpiryOverride.length >= 10) {
    const iso = liveExpiryOverride.slice(0, 10)
    const d = new Date(`${iso}T00:00:00Z`)
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ]
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    const dayName = days[d.getUTCDay()]
    const formatted = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    return {
      expiryDateStr: iso,
      formattedExpiry: formatted,
      dayOfWeek: dayName,
      fullLabel: `${formatted} (${dayName})`,
      relativeText: `Live Expiry: ${formatted}`,
    }
  }

  // Calculate IST Date
  const nowUtc = Date.now()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIst = new Date(nowUtc + istOffsetMs)
  const s = String(symbolOrName).toUpperCase()
  const currentDay = nowIst.getUTCDay()
  const currentHour = nowIst.getUTCHours()
  const currentMinute = nowIst.getUTCMinutes()
  const afterMarketClose = currentHour * 60 + currentMinute >= 15 * 60 + 30
  const currentDateUtc = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate(),
  )
  const monthlyOnly =
    s.includes('BANK') ||
    s.includes('FIN') ||
    s.includes('FINANCIAL') ||
    s.includes('MID')

  let expiryIst: Date
  if (monthlyOnly) {
    const lastTuesday = (year: number, month: number) => {
      const lastDay = new Date(Date.UTC(year, month + 1, 0))
      const daysBack = (lastDay.getUTCDay() - 2 + 7) % 7
      return new Date(Date.UTC(year, month, lastDay.getUTCDate() - daysBack))
    }

    expiryIst = lastTuesday(nowIst.getUTCFullYear(), nowIst.getUTCMonth())
    if (
      expiryIst.getTime() < currentDateUtc ||
      (expiryIst.getTime() === currentDateUtc && afterMarketClose)
    ) {
      expiryIst = lastTuesday(nowIst.getUTCFullYear(), nowIst.getUTCMonth() + 1)
    }
  } else {
    const targetDay = s.includes('SENSEX') ? 5 : 2
    let diffToTarget = targetDay - currentDay
    if (diffToTarget < 0) {
      diffToTarget += 7
    } else if (diffToTarget === 0 && afterMarketClose) {
      diffToTarget = 7
    }
    expiryIst = new Date(currentDateUtc + diffToTarget * 86400000)
  }

  const diff = Math.round((expiryIst.getTime() - currentDateUtc) / 86400000)
  const yyyy = expiryIst.getUTCFullYear()
  const mmNum = expiryIst.getUTCMonth()
  const ddNum = expiryIst.getUTCDate()

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]

  const isoMonth = String(mmNum + 1).padStart(2, '0')
  const isoDay = String(ddNum).padStart(2, '0')
  const expiryDateStr = `${yyyy}-${isoMonth}-${isoDay}`
  const formattedExpiry = `${ddNum} ${months[mmNum]} ${yyyy}`
  const dayOfWeek = days[expiryIst.getUTCDay()]
  const fullLabel = `${formattedExpiry} (${dayOfWeek})`

  let relativeText = `in ${diff} days`
  if (diff === 0) relativeText = 'Today (Expiry Day)'
  else if (diff === 1) relativeText = 'Tomorrow'

  return {
    expiryDateStr,
    formattedExpiry,
    dayOfWeek,
    fullLabel,
    relativeText,
  }
}
