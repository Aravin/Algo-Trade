import { describe, it, expect } from 'vitest'
import { shouldExit } from '../strategyEngine'
import type { ActivePosition, AllSignalData, VrdData } from '../types'

describe('Multi-Leg Execution & EOD Exit Logic', () => {
  const dummyVrd: VrdData = {
    mmi: { score: 50, label: 'Neutral' },
    advancesDeclines: {
      advances: 25,
      declines: 25,
      ratio: 1.0,
      label: 'Neutral',
    },
    fiiLongShort: { longPct: 50, shortPct: 50, shortPctTrend: 'Stable' },
    fiiPositioning: { netPosition: 0, consecutiveShortDays: 0 },
    pcr: { value: 1.0, zone: 'neutral' },
    straddleIv: { elevated: false, percentAboveAvg: 0 },
    niftyPe: { pe: 20, label: 'Fair' },
    vix: 15,
    giftNifty: {
      price: 24000,
      changePts: 0,
      changePct: 0,
      openingSignal: 'Flat',
    },
    supportWall: 23800,
    resistanceWall: 24200,
    maxPain: 24000,
    fetchedAt: new Date().toISOString(),
  }

  const dummyData: AllSignalData = {
    v3: 'hold',
    indicators: {
      ema: 'Hold',
      adx: 'Hold',
      rsi: { signal: 'Hold', value: 50 },
      stochastic: { k: 50, d: 50, signal: 'Hold' },
      bollinger: {
        signal: 'Hold',
        upper: 24200,
        lower: 23800,
        middle: 24000,
        trend: 'Neutral',
      },
      atr: { value: 30, level: 'Neutral' },
      pcr: 'Hold',
      pcrValue: 1.0,
    },
    vrd: dummyVrd,
  }

  const config = { maxProfitPct: 20, maxLossPct: 10 }

  it('correctly evaluates shouldExit for a multi-leg short straddle position', () => {
    const multiLegPos: ActivePosition = {
      instrumentKey: 'NSE_INDEX|NIFTY 50',
      direction: 'CE',
      entryPrice: 100,
      currentPrice: 100,
      unrealizedPnl: 0,
      quantity: 50,
      entryTime: new Date().toISOString(),
      tradeId: 101,
      executionMode: 'paper',
      tradeType: 'selling',
      underlyingSymbol: 'NIFTY 50',
      legs: [
        {
          instrumentKey: 'NIFTY24JUL24000CE',
          direction: 'CE',
          entryPrice: 100,
          currentPrice: 80, // +₹20 profit per qty
          unrealizedPnl: 1000,
          quantity: 50,
          tradeType: 'selling',
        },
        {
          instrumentKey: 'NIFTY24JUL24000PE',
          direction: 'PE',
          entryPrice: 100,
          currentPrice: 90, // +₹10 profit per qty
          unrealizedPnl: 500,
          quantity: 50,
          tradeType: 'selling',
        },
      ],
    }

    // Total entry value = (100 * 50) + (100 * 50) = ₹10,000
    // Total PnL = (100 - 80)*50 + (100 - 90)*50 = ₹1000 + ₹500 = ₹1500 (+15%)
    const exitCheck = shouldExit(multiLegPos, dummyData, 24000, config)
    expect(exitCheck.exit).toBe(false) // 15% is less than 20% target
  })

  it('triggers profit exit when multi-leg total PnL percentage exceeds target', () => {
    const multiLegPos: ActivePosition = {
      instrumentKey: 'NSE_INDEX|NIFTY 50',
      direction: 'CE',
      entryPrice: 100,
      currentPrice: 100,
      unrealizedPnl: 0,
      quantity: 50,
      entryTime: new Date().toISOString(),
      tradeId: 102,
      executionMode: 'paper',
      tradeType: 'selling',
      underlyingSymbol: 'NIFTY 50',
      legs: [
        {
          instrumentKey: 'NIFTY24JUL24000CE',
          direction: 'CE',
          entryPrice: 100,
          currentPrice: 70, // +₹30 profit
          unrealizedPnl: 1500,
          quantity: 50,
          tradeType: 'selling',
        },
        {
          instrumentKey: 'NIFTY24JUL24000PE',
          direction: 'PE',
          entryPrice: 100,
          currentPrice: 80, // +₹20 profit
          unrealizedPnl: 1000,
          quantity: 50,
          tradeType: 'selling',
        },
      ],
    }

    // Total PnL % = (2500 / 10000) * 100 = 25% (> 20%)
    const exitCheck = shouldExit(multiLegPos, dummyData, 24000, config)
    expect(exitCheck.exit).toBe(true)
    expect(exitCheck.reason).toContain('Profit +25.0% reached')
  })

  it('safely manages partial single leg tracking when second leg failed entry', () => {
    const partialLegPos: ActivePosition = {
      instrumentKey: 'NSE_INDEX|NIFTY 50',
      direction: 'CE',
      entryPrice: 100,
      currentPrice: 100,
      unrealizedPnl: 0,
      quantity: 50,
      entryTime: new Date().toISOString(),
      tradeId: 103,
      executionMode: 'live',
      tradeType: 'selling',
      underlyingSymbol: 'NIFTY 50',
      legs: [
        {
          instrumentKey: 'NIFTY24JUL24000CE',
          direction: 'CE',
          entryPrice: 100,
          currentPrice: 125, // -₹25 loss on partial leg
          unrealizedPnl: -1250,
          quantity: 50,
          tradeType: 'selling',
        },
      ],
    }

    // Entry value = ₹5,000, PnL = -₹1250 (-25% <= -10% stop loss)
    const exitCheck = shouldExit(partialLegPos, dummyData, 24000, config)
    expect(exitCheck.exit).toBe(true)
    expect(exitCheck.reason).toContain('Stop loss -25.0% triggered')
  })

  it('triggers exit when V3 signal reverses against the position bias', () => {
    const multiLegPos: ActivePosition = {
      instrumentKey: 'NSE_INDEX|NIFTY 50',
      direction: 'CE', // Bullish Bias for CE Selling? No, CE Selling = Bearish Bias
      entryPrice: 100,
      currentPrice: 100,
      unrealizedPnl: 0,
      quantity: 50,
      entryTime: new Date().toISOString(),
      tradeId: 104,
      executionMode: 'paper',
      tradeType: 'selling', // SELLING CE = Bearish Bias
      underlyingSymbol: 'NIFTY 50',
    }

    // Position is Bearish Bias (Selling CE). So a Bullish ('buy') signal is a reversal.
    const reversedData: AllSignalData = {
      ...dummyData,
      v3: 'buy', // Reversal signal
    }

    const exitCheck = shouldExit(multiLegPos, reversedData, 100, config)
    expect(exitCheck.exit).toBe(true)
    expect(exitCheck.reason).toContain('V3 signal reversed to buy')
  })

  it('triggers exit when Breadth (Advances/Declines ratio) reverses against bias', () => {
    const multiLegPos: ActivePosition = {
      instrumentKey: 'NSE_INDEX|NIFTY 50',
      direction: 'PE', // Selling PE = Bullish Bias
      entryPrice: 100,
      currentPrice: 100,
      unrealizedPnl: 0,
      quantity: 50,
      entryTime: new Date().toISOString(),
      tradeId: 105,
      executionMode: 'paper',
      tradeType: 'selling',
      underlyingSymbol: 'NIFTY 50',
    }

    // Position is Bullish Bias. Breadth < 0.8 is bearish -> Reversal
    const reversedVrd: VrdData = {
      ...dummyVrd,
      advancesDeclines: {
        advances: 10,
        declines: 40,
        ratio: 0.25,
        label: 'Bearish',
      },
    }

    const reversedData: AllSignalData = {
      ...dummyData,
      vrd: reversedVrd,
    }

    const exitCheck = shouldExit(multiLegPos, reversedData, 100, config)
    expect(exitCheck.exit).toBe(true)
    expect(exitCheck.reason).toContain('Breadth turned bearish')
  })
})
