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

export function fmtCurrency(value: number, signed = false): string {
  const formatted = Math.abs(value).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  })
  if (!signed) {
    return value < 0 ? `-${formatted}` : formatted
  }
  return value > 0
    ? `+${formatted}`
    : value < 0
      ? `-${formatted}`
      : formatted
}

export function fmtPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

export interface IndexExpiryInfo {
  expiryDateStr: string // "2026-07-23"
  formattedExpiry: string // "23 Jul 2026"
  dayOfWeek: string // "Thursday"
  fullLabel: string // "23 Jul 2026 (Thursday)"
  relativeText: string // "Today (Expiry Day)", "Tomorrow", "in 2 days"
}

/**
 * Calculates the next weekly option expiry date for Indian equity indices in IST:
 * - FIN NIFTY: Tuesday (Day 2)
 * - BANK NIFTY: Wednesday (Day 3)
 * - NIFTY 50: Thursday (Day 4)
 * - MIDCAP NIFTY: Monday (Day 1)
 * - SENSEX: Friday (Day 5)
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

  const s = String(symbolOrName).toUpperCase()
  let targetDay = 4 // Default: Nifty 50 Thursday (Day 4)

  if (s.includes('FIN') || s.includes('FINANCIAL')) {
    targetDay = 2 // Tuesday
  } else if (s.includes('BANK')) {
    targetDay = 3 // Wednesday
  } else if (s.includes('MID')) {
    targetDay = 1 // Monday
  } else if (s.includes('SENSEX')) {
    targetDay = 5 // Friday
  } else if (s.includes('NIFTY')) {
    targetDay = 4 // Thursday
  }

  // Calculate IST Date
  const nowUtc = Date.now()
  const istOffsetMs = 5.5 * 60 * 60 * 1000
  const nowIst = new Date(nowUtc + istOffsetMs)
  const currentDay = nowIst.getUTCDay()
  const currentHour = nowIst.getUTCHours()
  const currentMinute = nowIst.getUTCMinutes()

  let diff = targetDay - currentDay
  if (diff < 0) {
    diff += 7
  } else if (diff === 0) {
    // If today is expiry day & time is past 15:30 IST, rollover to next week
    const totalMinutes = currentHour * 60 + currentMinute
    if (totalMinutes >= 15 * 60 + 30) {
      diff = 7
    }
  }

  const expiryIst = new Date(nowIst.getTime() + diff * 86400000)
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
  const dayOfWeek = days[targetDay]
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
