/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeProxyFlow,
  computeProxyValuation,
  computeMMI,
  computeStraddleIV,
  isStaticIpRestrictionError,
  clamp,
  evaluateNiftySentimentFromAdvanceCount,
  getAtmWindow,
} from '../syntheticCalculators'
import type { OptionData, IndicatorsResult } from '../types'
import { STORAGE_KEY_PROXY_HISTORY } from '../constants'

const mockOptionChain: OptionData[] = [
  {
    expiry: '2026-08-06',
    strike_price: 24500,
    underlying_spot_price: 24550,
    call_options: {
      instrument_key: 'NSE_OPT|C',
      market_data: { ltp: 200, volume: 1000, oi: 5000 },
      option_greeks: {
        iv: 0.14,
        delta: 0.5,
        theta: -0.1,
        vega: 0.2,
        gamma: 0.01,
      },
    },
    put_options: {
      instrument_key: 'NSE_OPT|P',
      market_data: { ltp: 180, volume: 900, oi: 8000 },
      option_greeks: {
        iv: 0.16,
        delta: -0.5,
        theta: -0.1,
        vega: 0.2,
        gamma: 0.01,
      },
    },
  },
  {
    expiry: '2026-08-06',
    strike_price: 24600,
    underlying_spot_price: 24550,
    call_options: {
      instrument_key: 'NSE_OPT|C',
      market_data: { ltp: 150, volume: 800, oi: 3000 },
      option_greeks: {
        iv: 0.13,
        delta: 0.4,
        theta: -0.1,
        vega: 0.2,
        gamma: 0.01,
      },
    },
    put_options: {
      instrument_key: 'NSE_OPT|P',
      market_data: { ltp: 220, volume: 700, oi: 6000 },
      option_greeks: {
        iv: 0.17,
        delta: -0.6,
        theta: -0.1,
        vega: 0.2,
        gamma: 0.01,
      },
    },
  },
]

const mockIndicators: IndicatorsResult = {
  ema: 'Buy',
  adx: 'Buy',
  rsi: { value: 55, signal: 'Hold' },
  stochastic: { k: 50, d: 45, signal: 'Hold' },
  bollinger: {
    upper: 25000,
    middle: 24500,
    lower: 24000,
    signal: 'Hold',
    trend: 'Neutral',
  },
  atr: { value: 200, level: 'Neutral' },
  pcr: 'Hold',
  pcrValue: 1.0,
}

beforeEach(() => {
  localStorage.clear()
})

describe('computeProxyFlow', () => {
  it('returns nulls for empty option chain', () => {
    const result = computeProxyFlow([], 24550)
    expect(result.longPct).toBeNull()
    expect(result.shortPct).toBeNull()
    expect(result.netPosition).toBeNull()
    expect(result.consecutiveShortDays).toBeNull()
  })

  it('returns nulls when niftyLtp is 0', () => {
    const result = computeProxyFlow(mockOptionChain, 0)
    expect(result.longPct).toBeNull()
    expect(result.shortPct).toBeNull()
  })

  it('calculates OI percentages from ATM window', () => {
    const result = computeProxyFlow(mockOptionChain, 24550)
    expect(result.longPct).not.toBeNull()
    expect(result.shortPct).not.toBeNull()
    const total = (result.longPct ?? 0) + (result.shortPct ?? 0)
    expect(total).toBeCloseTo(100, 0)
  })

  it('returns nulls when total OI is 0', () => {
    const zeroOiChain: OptionData[] = [
      {
        ...mockOptionChain[0],
        call_options: {
          ...mockOptionChain[0].call_options,
          market_data: { ltp: 0, volume: 0, oi: 0 },
        },
        put_options: {
          ...mockOptionChain[0].put_options,
          market_data: { ltp: 0, volume: 0, oi: 0 },
        },
      },
    ]
    const result = computeProxyFlow(zeroOiChain, 24550)
    expect(result.longPct).toBeNull()
    expect(result.shortPct).toBeNull()
  })

  it('writes to proxy history in localStorage', () => {
    computeProxyFlow(mockOptionChain, 24550)
    const history = JSON.parse(localStorage.getItem(STORAGE_KEY_PROXY_HISTORY)!)
    expect(history).toHaveLength(1)
    expect(history[0].netPosition).toBeDefined()
  })
})

describe('computeProxyValuation', () => {
  it('returns a PE value within clamped range', () => {
    const result = computeProxyValuation(24550, mockIndicators, 15, 1.2)
    expect(result.pe).toBeGreaterThanOrEqual(16)
    expect(result.pe).toBeLessThanOrEqual(30)
  })

  it('returns fair value label for mid-range PE', () => {
    const result = computeProxyValuation(24550, mockIndicators, 15, 1.2)
    expect(result.label).toBe('Synthetic fair value')
  })

  it('handles null vix gracefully', () => {
    const result = computeProxyValuation(24550, mockIndicators, null, 1.2)
    expect(result.pe).toBeGreaterThanOrEqual(16)
  })

  it('handles null adRatio gracefully', () => {
    const result = computeProxyValuation(24550, mockIndicators, 15, null)
    expect(result.pe).toBeGreaterThanOrEqual(16)
  })

  it('returns undervaluation for low PE', () => {
    const lowRsiIndicators: IndicatorsResult = {
      ...mockIndicators,
      rsi: { value: 30, signal: 'Oversold' },
      bollinger: { ...mockIndicators.bollinger, trend: 'Down' },
      pcrValue: 0.5,
    }
    const result = computeProxyValuation(24550, lowRsiIndicators, 25, 0.5)
    expect(result.pe).toBeLessThan(18)
    expect(result.label).toBe('Synthetic undervaluation')
  })
})

describe('computeMMI', () => {
  it('returns a score between 0 and 100', () => {
    const result = computeMMI(15, 55, 1.0)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('labels Extreme Fear for score < 25', () => {
    // vix > 25 → vixScore=10, rsi < 30 → rsiScore=15, pcr > 1.5 → pcrScore=20
    // score = round(10*0.4 + 15*0.3 + 20*0.3) = round(4 + 4.5 + 6) = round(14.5) = 15
    const result = computeMMI(30, 25, 1.6)
    expect(result.score).toBeLessThan(25)
    expect(result.label).toBe('Extreme Fear')
  })

  it('labels Extreme Greed for score >= 70', () => {
    // vix < 10 → vixScore=80, rsi > 70 → rsiScore=80, pcr < 0.6 → pcrScore=80
    // score = round(80*0.4 + 80*0.3 + 80*0.3) = round(32+24+24) = 80
    const result = computeMMI(8, 75, 0.5)
    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(result.label).toBe('Extreme Greed')
  })

  it('handles null vix by defaulting to 50', () => {
    const result = computeMMI(null, 50, 1.0)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})

describe('computeStraddleIV', () => {
  it('returns nulls for empty option chain', () => {
    const result = computeStraddleIV([], 24550, 15)
    expect(result.currentIv).toBeNull()
    expect(result.averageIv).toBeNull()
    expect(result.percentAboveAvg).toBeNull()
  })

  it('returns nulls when niftyLtp is 0', () => {
    const result = computeStraddleIV(mockOptionChain, 0, 15)
    expect(result.currentIv).toBeNull()
  })

  it('computes ATM straddle IV from option greeks', () => {
    const result = computeStraddleIV(mockOptionChain, 24550, 15)
    expect(result.currentIv).not.toBeNull()
    expect(result.currentIv).toBeGreaterThan(0)
  })

  it('compares to VIX when available', () => {
    const result = computeStraddleIV(mockOptionChain, 24550, 15)
    expect(result.percentAboveAvg).not.toBeNull()
  })

  it('returns percentAboveAvg null when vix is null', () => {
    const result = computeStraddleIV(mockOptionChain, 24550, null)
    expect(result.percentAboveAvg).toBeNull()
  })
})

describe('isStaticIpRestrictionError', () => {
  it('returns true for static ip restrictions message', () => {
    expect(isStaticIpRestrictionError('Static IP restrictions apply')).toBe(
      true,
    )
  })

  it('returns true for no static ip configured message', () => {
    expect(isStaticIpRestrictionError('No static IP has been configured')).toBe(
      true,
    )
  })

  it('returns true regardless of case', () => {
    expect(isStaticIpRestrictionError('STATIC IP RESTRICTIONS ENABLED')).toBe(
      true,
    )
  })

  it('returns false for null input', () => {
    expect(isStaticIpRestrictionError(null)).toBe(false)
  })

  it('returns false for undefined input', () => {
    expect(isStaticIpRestrictionError(undefined)).toBe(false)
  })

  it('returns false for unrelated error message', () => {
    expect(isStaticIpRestrictionError('Network timeout')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isStaticIpRestrictionError('')).toBe(false)
  })
})

describe('clamp', () => {
  it('returns value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('returns min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  it('returns max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
})

describe('evaluateNiftySentimentFromAdvanceCount', () => {
  it('returns very bullish for advances >= 39', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(42)).toBe('very bullish')
  })

  it('returns bullish for advances 29-38', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(30)).toBe('bullish')
  })

  it('returns neutral for advances 23-28', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(25)).toBe('neutral')
  })

  it('returns bearish for advances 13-22', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(15)).toBe('bearish')
  })

  it('returns very bearish for advances < 13', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(5)).toBe('very bearish')
  })

  it('returns neutral for null advances', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(null)).toBe('neutral')
  })

  it('returns neutral for NaN advances', () => {
    expect(evaluateNiftySentimentFromAdvanceCount(NaN)).toBe('neutral')
  })
})

describe('getAtmWindow', () => {
  it('returns 5 closest strikes by default', () => {
    const chain = [...mockOptionChain, ...mockOptionChain, ...mockOptionChain]
    const result = getAtmWindow(chain, 24550)
    expect(result).toHaveLength(5)
  })

  it('returns all strikes if chain is smaller than window', () => {
    const result = getAtmWindow(mockOptionChain, 24550)
    expect(result).toHaveLength(2)
  })

  it('sorts strikes by distance from niftyLtp', () => {
    const chain = [
      { ...mockOptionChain[0], strike_price: 25000 },
      { ...mockOptionChain[0], strike_price: 24500 },
    ]
    const result = getAtmWindow(chain, 24550)
    expect(result[0].strike_price).toBe(24500)
  })

  it('returns empty array for empty chain', () => {
    expect(getAtmWindow([], 24550)).toEqual([])
  })
})
