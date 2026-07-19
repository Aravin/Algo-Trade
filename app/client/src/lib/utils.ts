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
  return isoLike.slice(0, 10) === new Date().toISOString().slice(0, 10)
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
