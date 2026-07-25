import { loadRemoteState, saveRemoteState } from '@/lib/clientState'
import type { StrategyConfig } from './types'
import { DEFAULT_CONFIG } from './types'
import {
  STORAGE_KEY_STRATEGY_CONFIG,
  REMOTE_STATE_KEY_STRATEGY_CONFIG,
} from './constants'

const KEY = STORAGE_KEY_STRATEGY_CONFIG
const REMOTE_STATE_KEY = REMOTE_STATE_KEY_STRATEGY_CONFIG

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
