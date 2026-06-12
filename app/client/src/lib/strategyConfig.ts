import type { ExecutionMode } from './paperTrading'
import { loadRemoteState, saveRemoteState } from '@/lib/clientState'

export interface StrategyConfig {
  strongThreshold: number // min score for 'strong' signal
  moderateThreshold: number // min score for 'moderate' signal
  maxProfitPct: number // exit when option gains this %
  maxLossPct: number // exit when option loses this %
  maxTradesPerDay: number
  lastEntryTime: string // 'HH:MM' IST — no new entries after this
  pollingIntervalSec: number
  minConfidence: 'strong' | 'moderate'
  otmSkip: number // how many OTM strikes to skip
  executionMode: ExecutionMode
  tradeType: 'buying' | 'selling' | 'both'
}

export const DEFAULT_CONFIG: StrategyConfig = {
  strongThreshold: 16,
  moderateThreshold: 10,
  maxProfitPct: 10,
  maxLossPct: 5,
  maxTradesPerDay: 3,
  lastEntryTime: '14:30',
  pollingIntervalSec: 60,
  minConfidence: 'moderate',
  otmSkip: 3,
  executionMode: 'paper',
  tradeType: 'buying',
}

const KEY = 'algo-trade:strategy-config'
const REMOTE_STATE_KEY = 'strategyConfig'

function readStoredStrategyConfig(): Partial<StrategyConfig> | null {
  const raw = localStorage.getItem(KEY)
  return raw ? (JSON.parse(raw) as Partial<StrategyConfig>) : null
}

export function getStrategyConfig(): StrategyConfig {
  try {
    return { ...DEFAULT_CONFIG, ...(readStoredStrategyConfig() ?? {}) }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveStrategyConfig(config: StrategyConfig): void {
  localStorage.setItem(KEY, JSON.stringify(config))
  void saveRemoteState(REMOTE_STATE_KEY, config).catch(() => {
    // Fall back to local-only persistence when the worker is unavailable.
  })
}

export async function hydrateStrategyConfig(): Promise<void> {
  try {
    const remoteConfig =
      await loadRemoteState<Partial<StrategyConfig>>(REMOTE_STATE_KEY)
    if (remoteConfig) {
      localStorage.setItem(
        KEY,
        JSON.stringify({ ...DEFAULT_CONFIG, ...remoteConfig }),
      )
      return
    }
  } catch {
    return
  }

  const localConfig = readStoredStrategyConfig()
  if (localConfig) {
    void saveRemoteState(REMOTE_STATE_KEY, {
      ...DEFAULT_CONFIG,
      ...localConfig,
    }).catch(() => {
      // Leave local storage intact if remote persistence is unavailable.
    })
  }
}
