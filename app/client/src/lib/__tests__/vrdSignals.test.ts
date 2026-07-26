import { describe, it, expect } from 'vitest'
import { scoreStraddleIV, classifyNews } from '../vrdSignals'
import type { UpstoxNewsItem } from '../types'

describe('scoreStraddleIV', () => {
  it('returns unavailable when percentAboveAvg is null', () => {
    const result = scoreStraddleIV(null)
    expect(result.score).toBe(0)
    expect(result.max).toBe(1)
    expect(result.label).toBe('IV unavailable')
    expect(result.preferBuy).toBe(false)
  })

  it('returns -1 prefer sell when IV is >30% above avg', () => {
    const result = scoreStraddleIV(45)
    expect(result.score).toBe(-1)
    expect(result.preferBuy).toBe(false)
    expect(result.label).toContain('prefer sell')
  })

  it('returns 0 preferBuy false when IV is slightly elevated (0-30%)', () => {
    const result = scoreStraddleIV(15)
    expect(result.score).toBe(0)
    expect(result.preferBuy).toBe(false)
    expect(result.label).toBe('IV slightly elevated')
  })

  it('returns 1 preferBuy true when IV is below avg (negative)', () => {
    const result = scoreStraddleIV(-5)
    expect(result.score).toBe(1)
    expect(result.preferBuy).toBe(true)
    expect(result.label).toBe('IV below avg — buying cheap')
  })

  it('returns 1 preferBuy true when IV is exactly 0 (falls to else)', () => {
    const result = scoreStraddleIV(0)
    expect(result.score).toBe(1)
    expect(result.preferBuy).toBe(true)
  })

  it('returns -1 for IV > 30 (edge case 30.1)', () => {
    const result = scoreStraddleIV(30.1)
    expect(result.score).toBe(-1)
    expect(result.preferBuy).toBe(false)
  })
})

describe('classifyNews', () => {
  const now = Date.now()

  function makeItem(overrides: Partial<UpstoxNewsItem> = {}): UpstoxNewsItem {
    return {
      headline: 'Test Headline',
      summary: 'Test summary content',
      published_timestamp: now,
      ...overrides,
    }
  }

  it('returns empty array for empty input', () => {
    expect(classifyNews([])).toEqual([])
  })

  it('filters out items older than 24 hours', () => {
    const items = [makeItem({ published_timestamp: now - 25 * 60 * 60 * 1000 })]
    expect(classifyNews(items)).toEqual([])
  })

  it('filters out items without published_timestamp', () => {
    const items = [
      makeItem({ published_timestamp: undefined as unknown as number }),
    ]
    expect(classifyNews(items)).toEqual([])
  })

  it('classifies MACRO alert for Fed keyword', () => {
    const items = [
      makeItem({ headline: 'Fed announces interest rate decision' }),
    ]
    const alerts = classifyNews(items)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('MACRO')
    expect(alerts[0].matchedKeywords).toContain('fed')
  })

  it('classifies EARNINGS alert for earnings keyword', () => {
    const items = [makeItem({ headline: 'TCS Q3 earnings beat estimates' })]
    const alerts = classifyNews(items)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].type).toBe('EARNINGS')
    expect(alerts[0].matchedKeywords).toContain('earnings')
  })

  it('assigns HIGH severity for war keyword (not price war or trade war)', () => {
    const items = [makeItem({ headline: 'War escalation feared in region' })]
    const alerts = classifyNews(items)
    expect(alerts[0].severity).toBe('HIGH')
  })

  it('does not flag "price war" as high-severity (still matches war but gets LOW)', () => {
    const items = [makeItem({ headline: 'Price war breaks out in telecom' })]
    const alerts = classifyNews(items)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('LOW')
  })

  it('deduplicates identical headlines', () => {
    const items = [
      makeItem({ headline: 'Fed holds rates steady' }),
      makeItem({ headline: 'Fed holds rates steady' }),
    ]
    const alerts = classifyNews(items)
    expect(alerts).toHaveLength(1)
  })

  it('returns empty for items with no matching keywords', () => {
    const items = [makeItem({ headline: 'Weather forecast for tomorrow' })]
    expect(classifyNews(items)).toEqual([])
  })

  it('assigns MEDIUM severity for earnings match', () => {
    const items = [
      makeItem({ headline: 'Company quarterly results announced' }),
    ]
    const alerts = classifyNews(items)
    expect(alerts[0].severity).toBe('MEDIUM')
  })

  it('assigns MEDIUM severity when exactly 2 keywords match', () => {
    const items = [
      makeItem({
        headline: 'Inflation and budget data released',
        summary: 'Regular economic update',
      }),
    ]
    const alerts = classifyNews(items)
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('MEDIUM')
  })

  it('assigns HIGH severity when 3+ keywords match', () => {
    const items = [
      makeItem({
        headline: 'Fed FOMC rate hike inflation CPI GDP all in focus',
      }),
    ]
    const alerts = classifyNews(items)
    expect(alerts[0].severity).toBe('HIGH')
  })

  it('generates deterministic IDs from timestamp and headline', () => {
    const items = [
      makeItem({
        headline: 'Fed Decision',
        published_timestamp: now,
      }),
    ]
    const alerts = classifyNews(items)
    expect(alerts[0].id).toBe(`${now}-fed-decision`)
  })

  it('handles items with empty headline and summary', () => {
    const items = [makeItem({ headline: '', summary: '' })]
    expect(classifyNews(items)).toEqual([])
  })
})
