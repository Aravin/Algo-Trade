import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ActivePosition } from '@/lib/types'
import { StrategyHeaderBar } from '../strategy-header-bar'

const POSITION: ActivePosition = {
  instrumentKey: 'NSE_FO|ACTIVE',
  direction: 'CE',
  entryPrice: 100,
  currentPrice: 101,
  quantity: 65,
  lotSize: 65,
  entryTime: '2026-07-28T09:30:00.000Z',
  tradeId: 1,
  executionMode: 'paper',
  tradeType: 'buying',
  underlyingSymbol: 'NIFTY 50',
}

describe('StrategyHeaderBar stopped-position warning', () => {
  it('makes paused supervision explicit and labels the recovery action', () => {
    render(
      <StrategyHeaderBar
        state="STOPPED"
        position={POSITION}
        tradesCount={1}
        lastUpdated={null}
        pollingIntervalSec={10}
        start={vi.fn()}
        stop={vi.fn()}
        executionMode="paper"
        paperBalance={100_000}
        token="broker-token"
        activeTab="operations"
        onTabChange={vi.fn()}
        logErrorCount={0}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'EOD and hard-stop exits will not run',
    )
    expect(screen.getByRole('button', { name: 'Resume Bot' })).toBeTruthy()
  })
})
