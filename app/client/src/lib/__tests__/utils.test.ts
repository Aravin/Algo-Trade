import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  isNseMarketOpen,
  isToday,
  normalizeLiveStatus,
  getUpcomingIndexExpiry,
  getSensibullUrl,
  getSensibullOptionChainUrl,
  extractCleanTradingSymbol,
} from '../utils'

describe('cn', () => {
  it('merges tailwind classes', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2')
  })

  it('handles conditional classes', () => {
    const showHidden = false
    expect(cn('base', showHidden && 'hidden', 'visible')).toBe('base visible')
  })

  it('resolves tailwind conflicts', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2')
  })

  it('accepts array inputs', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })

  it('handles object syntax', () => {
    expect(cn('foo', { bar: true, baz: false })).toBe('foo bar')
  })
})

describe('isNseMarketOpen', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns false on Saturday', () => {
    vi.setSystemTime(new Date('2026-07-25T10:00:00+05:30'))
    expect(isNseMarketOpen()).toBe(false)
  })

  it('returns false on Sunday', () => {
    vi.setSystemTime(new Date('2026-07-26T10:00:00+05:30'))
    expect(isNseMarketOpen()).toBe(false)
  })

  it('returns false before 09:15 IST', () => {
    vi.setSystemTime(new Date('2026-07-24T08:00:00+05:30'))
    expect(isNseMarketOpen()).toBe(false)
  })

  it('returns false after 15:30 IST', () => {
    vi.setSystemTime(new Date('2026-07-24T16:00:00+05:30'))
    expect(isNseMarketOpen()).toBe(false)
  })

  it('returns true during trading hours on a weekday', () => {
    vi.setSystemTime(new Date('2026-07-24T12:00:00+05:30'))
    expect(isNseMarketOpen()).toBe(true)
  })

  it('returns true at exactly 09:15 IST', () => {
    vi.setSystemTime(new Date('2026-07-24T09:15:00+05:30'))
    expect(isNseMarketOpen()).toBe(true)
  })

  it('returns false at exactly 15:30 IST', () => {
    vi.setSystemTime(new Date('2026-07-24T15:30:00+05:30'))
    expect(isNseMarketOpen()).toBe(false)
  })
})

describe('isToday', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns true for today date string', () => {
    vi.setSystemTime(new Date('2026-07-24T12:00:00+05:30'))
    expect(isToday('2026-07-24')).toBe(true)
  })

  it('returns false for a different date', () => {
    vi.setSystemTime(new Date('2026-07-24T12:00:00+05:30'))
    expect(isToday('2026-07-25')).toBe(false)
  })

  it('returns false for null', () => {
    expect(isToday(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isToday(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isToday('')).toBe(false)
  })

  it('matches date strings that include time portion', () => {
    vi.setSystemTime(new Date('2026-07-24T12:00:00+05:30'))
    expect(isToday('2026-07-24T15:30:00+05:30')).toBe(true)
  })
})

describe('normalizeLiveStatus', () => {
  it('returns REJECTED for status containing REJECT', () => {
    expect(normalizeLiveStatus('rejected')).toBe('REJECTED')
    expect(normalizeLiveStatus('ORDER_REJECTED')).toBe('REJECTED')
  })

  it('returns CANCELLED for status containing CANCEL', () => {
    expect(normalizeLiveStatus('cancelled')).toBe('CANCELLED')
    expect(normalizeLiveStatus('CANCEL')).toBe('CANCELLED')
  })

  it('returns COMPLETED for status containing COMPLETE', () => {
    expect(normalizeLiveStatus('complete')).toBe('COMPLETED')
    expect(normalizeLiveStatus('COMPLETED')).toBe('COMPLETED')
  })

  it('returns ACTIVE for unknown status', () => {
    expect(normalizeLiveStatus('pending')).toBe('ACTIVE')
    expect(normalizeLiveStatus('trigger')).toBe('ACTIVE')
  })

  it('returns ACTIVE for undefined or empty', () => {
    expect(normalizeLiveStatus(undefined)).toBe('ACTIVE')
    expect(normalizeLiveStatus('')).toBe('ACTIVE')
  })

  it('is case-insensitive', () => {
    expect(normalizeLiveStatus('ReJeCtEd')).toBe('REJECTED')
    expect(normalizeLiveStatus('cOmPlEtE')).toBe('COMPLETED')
  })
})

describe('getUpcomingIndexExpiry', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses Tuesday weekly expiry for NIFTY 50', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('NIFTY 50')
    expect(r.dayOfWeek).toBe('Tuesday')
    expect(r.expiryDateStr).toBe('2026-07-28')
  })

  it('uses the last Tuesday of the month for FINNIFTY', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('FINNIFTY')
    expect(r.dayOfWeek).toBe('Tuesday')
    expect(r.expiryDateStr).toBe('2026-07-28')
  })

  it('uses the last Tuesday of the month for BANKNIFTY', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('BANKNIFTY')
    expect(r.dayOfWeek).toBe('Tuesday')
    expect(r.expiryDateStr).toBe('2026-07-28')
    expect(r.relativeText).toBe('in 6 days')
  })

  it('uses the last Tuesday of the month for MIDCAP NIFTY', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('MIDCAP NIFTY')
    expect(r.dayOfWeek).toBe('Tuesday')
    expect(r.expiryDateStr).toBe('2026-07-28')
  })

  it('returns Friday for SENSEX', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('SENSEX')
    expect(r.dayOfWeek).toBe('Friday')
  })

  it('uses liveExpiryOverride when provided', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('NIFTY 50', '2026-08-13')
    expect(r.expiryDateStr).toBe('2026-08-13')
    expect(r.formattedExpiry).toContain('Aug')
  })

  it('rolls over to next week after 15:30 on expiry day', () => {
    vi.setSystemTime(new Date('2026-07-28T16:00:00+05:30'))
    const r = getUpcomingIndexExpiry('NIFTY 50')
    expect(r.dayOfWeek).toBe('Tuesday')
    expect(r.relativeText).toBe('in 7 days')
  })

  it('returns Today on expiry day before 15:30', () => {
    vi.setSystemTime(new Date('2026-07-28T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('NIFTY 50')
    expect(r.relativeText).toBe('Today (Expiry Day)')
  })

  it('returns Tomorrow when expiry is next day', () => {
    vi.setSystemTime(new Date('2026-07-27T12:00:00+05:30')) // Mon
    const r = getUpcomingIndexExpiry('NIFTY 50') // Tue
    expect(r.relativeText).toBe('Tomorrow')
  })

  it('rolls monthly contracts into the next month after expiry close', () => {
    vi.setSystemTime(new Date('2026-07-28T16:00:00+05:30'))
    const r = getUpcomingIndexExpiry('BANKNIFTY')
    expect(r.expiryDateStr).toBe('2026-08-25')
  })

  it('includes fullLabel in the result', () => {
    vi.setSystemTime(new Date('2026-07-22T12:00:00+05:30'))
    const r = getUpcomingIndexExpiry('NIFTY 50')
    expect(r.fullLabel).toMatch(/^\d{1,2} \w{3} \d{4} \(Tuesday\)$/)
  })
})

describe('extractCleanTradingSymbol', () => {
  it('strips broker prefixes like NSE_FO:', () => {
    expect(extractCleanTradingSymbol('NSE_FO:NIFTY26AUG24400CE')).toBe(
      'NIFTY26AUG24400CE',
    )
    expect(extractCleanTradingSymbol('NSE_FO|NIFTY26AUG24400CE')).toBe(
      'NIFTY26AUG24400CE',
    )
  })

  it('returns undefined for numeric Upstox tokens', () => {
    expect(extractCleanTradingSymbol('NSE_FO|65854')).toBeUndefined()
    expect(extractCleanTradingSymbol('65854')).toBeUndefined()
  })

  it('returns clean symbol for index or equity', () => {
    expect(extractCleanTradingSymbol('NIFTY')).toBe('NIFTY')
  })
})

describe('getSensibullUrl', () => {
  it('returns undefined if no valid symbol or fallback is provided', () => {
    expect(getSensibullUrl(undefined, undefined)).toBeUndefined()
  })

  it('returns correct chart URL for option contract symbol', () => {
    expect(getSensibullUrl('NIFTY26AUG24400CE')).toBe(
      'https://web.sensibull.com/chart?tradingSymbol=NIFTY26AUG24400CE',
    )
  })

  it('strips NSE_FO: prefix and returns clean chart URL', () => {
    expect(getSensibullUrl('NSE_FO:NIFTY26AUG24400CE')).toBe(
      'https://web.sensibull.com/chart?tradingSymbol=NIFTY26AUG24400CE',
    )
  })

  it('falls back to option-chain for index underlying symbol', () => {
    expect(getSensibullUrl('NIFTY')).toBe(
      'https://web.sensibull.com/option-chain?tradingsymbol=NIFTY',
    )
    expect(getSensibullUrl('NSE_FO|65854', 'NIFTY')).toBe(
      'https://web.sensibull.com/option-chain?tradingsymbol=NIFTY',
    )
  })

  it('encodes symbols before adding them to the query string', () => {
    expect(getSensibullUrl('NIFTY 50&AUG=CE')).toBe(
      'https://web.sensibull.com/chart?tradingSymbol=NIFTY%2050%26AUG%3DCE',
    )
  })
})

describe('getSensibullOptionChainUrl', () => {
  it('returns Sensibull option chain URL for index underlying', () => {
    expect(getSensibullOptionChainUrl('NIFTY')).toBe(
      'https://web.sensibull.com/option-chain?tradingsymbol=NIFTY',
    )
    expect(getSensibullOptionChainUrl('BANKNIFTY')).toBe(
      'https://web.sensibull.com/option-chain?tradingsymbol=BANKNIFTY',
    )
  })

  it('defaults to NIFTY option chain if empty', () => {
    expect(getSensibullOptionChainUrl(undefined)).toBe(
      'https://web.sensibull.com/option-chain?tradingsymbol=NIFTY',
    )
  })
})
