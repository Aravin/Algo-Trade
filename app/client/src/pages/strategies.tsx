import type { StrategyConfig } from '@/lib/types'
import { useEffect, useState } from 'react'
import { getAccounts } from '@/lib/accounts'
import { useStrategyBot } from '@/hooks/useStrategyBot'
import { getStrategyConfig } from '@/lib/strategyConfig'
import { fetchPaperAccount } from '@/lib/paperTrading'

import { HardStopBanner } from '@/components/dashboard/strategy/hard-stop-banner'
import { MarketSetupPanel } from '@/components/dashboard/strategy/market-setup-panel'
import { GlobalMarketsPanel } from '@/components/dashboard/strategy/global-markets-panel'
import { TradingViewWidget } from '@/components/dashboard/strategy/trading-view-widget'
import { InstitutionalPanel } from '@/components/dashboard/strategy/institutional-panel'
import { BreadthPanel } from '@/components/dashboard/strategy/breadth-panel'
import { IndicatorsPanel } from '@/components/dashboard/strategy/indicators-panel'
import { ScorePanel } from '@/components/dashboard/strategy/score-panel'
import { BotControls } from '@/components/dashboard/strategy/bot-controls'
import { StrategyConfig as StrategyConfigPanel } from '@/components/dashboard/strategy/strategy-config'
import { LogPanel } from '@/components/dashboard/strategy/log-panel'
import { SourceStatusBar } from '@/components/dashboard/strategy/source-status-bar'
import { NewsAlertsPanel } from '@/components/dashboard/strategy/news-alerts-panel'
import { ThresholdOptimizer } from '@/components/dashboard/strategy/threshold-optimizer'
import { saveStrategyConfig } from '@/lib/strategyConfig'

export function StrategiesPage() {
  const token = getAccounts().find((a) => a.accessToken)?.accessToken ?? null
  const [config, setConfig] = useState<StrategyConfig>(getStrategyConfig)
  const [paperBalance, setPaperBalance] = useState<number | null>(null)

  const bot = useStrategyBot(token)

  useEffect(() => {
    if (config.executionMode !== 'paper') return
    let cancelled = false
    void fetchPaperAccount()
      .then((summary) => {
        if (!cancelled) setPaperBalance(summary.account.balance)
      })
      .catch(() => {
        if (!cancelled) setPaperBalance(null)
      })
    return () => {
      cancelled = true
    }
  }, [config.executionMode, bot.lastUpdated])

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Nifty Options Strategy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Macro &amp; institutional signals + 1-min technical indicators +
          Upstox market structure — auto-executes via Upstox
        </p>
        {config.executionMode === 'paper' && paperBalance !== null && (
          <p className="text-xs text-muted-foreground mt-1">
            Paper credit balance: ₹{paperBalance.toFixed(2)}
          </p>
        )}
        {!token && (
          <p className="text-xs text-destructive mt-1">
            No active broker token — add Upstox account first.
          </p>
        )}
      </div>

      {/* Source status */}
      <SourceStatusBar sourceStatus={bot.sourceStatus} />

      {/* Hard stop */}
      {bot.hardStop.blocked && (
        <HardStopBanner reasons={bot.hardStop.reasons} />
      )}

      {/* Market setup */}
      <MarketSetupPanel vrdData={bot.vrdData} />

      {/* TradingView Chart */}
      <TradingViewWidget />

      {/* Global Markets & Indicators */}
      <GlobalMarketsPanel globalIndices={bot.globalIndices} />

      {/* News & Macro Alerts */}
      <NewsAlertsPanel alerts={bot.vrdData?.newsAlerts} />

      {/* Institutional + Breadth */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InstitutionalPanel vrdData={bot.vrdData} />
        <BreadthPanel vrdData={bot.vrdData} />
      </div>

      {/* Technical indicators */}
      <IndicatorsPanel indicators={bot.indicators} />

      {/* Score + Bot Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ScorePanel
            allSignalData={bot.allSignalData}
            finalSignal={bot.finalSignal}
            config={config}
          />
        </div>
        <BotControls
          state={bot.state}
          position={bot.position}
          tradesCount={bot.tradesCount}
          lastUpdated={bot.lastUpdated}
          error={bot.error}
          pollingIntervalSec={config.pollingIntervalSec}
          start={bot.start}
          stop={bot.stop}
          executionMode={config.executionMode}
          paperBalance={paperBalance}
        />
      </div>

      {/* Logs */}
      <LogPanel logs={bot.logs} onClear={bot.clearLogs} />

      {/* Threshold optimizer */}
      <ThresholdOptimizer
        config={config}
        onApply={(values) => {
          const next = { ...config, ...values }
          saveStrategyConfig(next)
          setConfig(next)
        }}
      />

      {/* Config */}
      <StrategyConfigPanel config={config} onSave={setConfig} />
    </div>
  )
}
