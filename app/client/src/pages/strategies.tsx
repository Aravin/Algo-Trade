import type { StrategyConfig } from '@/lib/types'
import { useEffect, useState } from 'react'
import { getAccounts } from '@/lib/accounts'
import { useStrategyBot } from '@/hooks/useStrategyBot'
import { getStrategyConfig, saveStrategyConfig } from '@/lib/strategyConfig'
import { fetchPaperAccount } from '@/lib/paperTrading'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Activity, BarChart3, Settings } from 'lucide-react'

import { StrategyHeaderBar } from '@/components/dashboard/strategy/strategy-header-bar'
import { HardStopBanner } from '@/components/dashboard/strategy/hard-stop-banner'
import { MarketSetupPanel } from '@/components/dashboard/strategy/market-setup-panel'
import { GlobalMarketsPanel } from '@/components/dashboard/strategy/global-markets-panel'
import { SimpleChartWidget } from '@/components/dashboard/strategy/simple-chart-widget'
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
import { DailyBacktestReport } from '@/components/dashboard/strategy/daily-backtest-report'

export function StrategiesPage() {
  const token = getAccounts().find((a) => a.accessToken)?.accessToken ?? null
  const [config, setConfig] = useState<StrategyConfig>(getStrategyConfig)
  const [paperBalance, setPaperBalance] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<string>('operations')

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

  const errorLogsCount = bot.logs.filter((l) => l.level === 'error').length

  return (
    <div className="p-4 space-y-4 max-w-[1600px] mx-auto">
      {/* Sticky Execution Control Header */}
      <StrategyHeaderBar
        state={bot.state}
        position={bot.position}
        tradesCount={bot.tradesCount}
        lastUpdated={bot.lastUpdated}
        pollingIntervalSec={config.pollingIntervalSec}
        start={bot.start}
        stop={bot.stop}
        executionMode={config.executionMode}
        paperBalance={paperBalance}
        token={token}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        logErrorCount={errorLogsCount}
      />

      {/* Data feed status */}
      <SourceStatusBar sourceStatus={bot.sourceStatus} />

      {/* Hard stop alert */}
      {bot.hardStop.blocked && (
        <HardStopBanner reasons={bot.hardStop.reasons} />
      )}

      {/* Main Tabbed Workspaces */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger
            value="operations"
            className="flex items-center gap-1.5 text-xs"
          >
            <Activity size={14} />
            <span>Live Operations</span>
          </TabsTrigger>
          <TabsTrigger
            value="signals"
            className="flex items-center gap-1.5 text-xs"
          >
            <BarChart3 size={14} />
            <span>Market Signals</span>
          </TabsTrigger>
          <TabsTrigger
            value="config"
            className="flex items-center gap-1.5 text-xs"
          >
            <Settings size={14} />
            <span>Config &amp; Tuning</span>
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Live Operations ─────────────────────────────────────────── */}
        <TabsContent
          value="operations"
          className="space-y-4 focus-visible:outline-none"
        >
          {/* Row 1: Bot Controls + Live Logs side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-4">
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
            <div className="lg:col-span-8">
              <LogPanel logs={bot.logs} onClear={bot.clearLogs} />
            </div>
          </div>

          {/* Row 2: Signal Score Breakdown & Market Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-7">
              <ScorePanel
                allSignalData={bot.allSignalData}
                finalSignal={bot.finalSignal}
                config={config}
              />
            </div>
            <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
              <MarketSetupPanel vrdData={bot.vrdData} />
              <SimpleChartWidget candles={bot.candles} />
            </div>
          </div>
        </TabsContent>

        {/* ── TAB 2: Market Signals & Analytics ────────────────────────────── */}
        <TabsContent
          value="signals"
          className="space-y-4 focus-visible:outline-none"
        >
          {/* Market setup & Chart side-by-side (3/4 Overview, 1/4 Chart) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-9 h-full">
              <MarketSetupPanel vrdData={bot.vrdData} />
            </div>
            <div className="lg:col-span-3 h-full">
              <SimpleChartWidget candles={bot.candles} />
            </div>
          </div>

          {/* Technical indicators & Squeeze */}
          <IndicatorsPanel indicators={bot.indicators} />

          {/* Institutional + Breadth */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InstitutionalPanel vrdData={bot.vrdData} />
            <BreadthPanel vrdData={bot.vrdData} />
          </div>

          {/* Global Markets & News */}
          <GlobalMarketsPanel globalIndices={bot.globalIndices} />
          <NewsAlertsPanel alerts={bot.vrdData?.newsAlerts} />
        </TabsContent>

        {/* ── TAB 3: Strategy Config & Tuning ─────────────────────────────── */}
        <TabsContent
          value="config"
          className="space-y-4 focus-visible:outline-none"
        >
          <DailyBacktestReport />
          <StrategyConfigPanel config={config} onSave={setConfig} />
          <ThresholdOptimizer
            config={config}
            onApply={(values) => {
              const next = { ...config, ...values }
              saveStrategyConfig(next)
              setConfig(next)
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
