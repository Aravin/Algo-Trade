/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/lib/types'
import { STORAGE_KEY_STRATEGY_CONFIG } from '@/lib/constants'

const REMOTE_STATE_KEY = 'strategyConfig'

const mockLoadRemoteState = vi.fn()
const mockSaveRemoteState = vi.fn()

vi.mock('@/lib/clientState', () => ({
  loadRemoteState: mockLoadRemoteState,
  saveRemoteState: mockSaveRemoteState,
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockSaveRemoteState.mockResolvedValue(undefined)
  vi.resetModules()
})

describe('getStrategyConfig', () => {
  it('returns DEFAULT_CONFIG when nothing is stored', async () => {
    const { getStrategyConfig } = await import('../strategyConfig')
    expect(getStrategyConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('merges stored partial config with DEFAULT_CONFIG', async () => {
    localStorage.setItem(
      STORAGE_KEY_STRATEGY_CONFIG,
      JSON.stringify({ strongThreshold: 20 }),
    )
    const { getStrategyConfig } = await import('../strategyConfig')
    const config = getStrategyConfig()
    expect(config.strongThreshold).toBe(20)
    expect(config.underlyingMode).toBe(DEFAULT_CONFIG.underlyingMode)
  })

  it('returns DEFAULT_CONFIG when localStorage JSON is malformed', async () => {
    localStorage.setItem(STORAGE_KEY_STRATEGY_CONFIG, '{bad json}')
    const { getStrategyConfig } = await import('../strategyConfig')
    expect(getStrategyConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('returns DEFAULT_CONFIG for null stored value', async () => {
    localStorage.setItem(STORAGE_KEY_STRATEGY_CONFIG, 'null')
    const { getStrategyConfig } = await import('../strategyConfig')
    expect(getStrategyConfig()).toEqual(DEFAULT_CONFIG)
  })
})

describe('saveStrategyConfig', () => {
  it('persists config to localStorage', async () => {
    const { saveStrategyConfig } = await import('../strategyConfig')
    saveStrategyConfig({ ...DEFAULT_CONFIG, strongThreshold: 18 })
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY_STRATEGY_CONFIG)!,
    )
    expect(stored.strongThreshold).toBe(18)
  })

  it('calls saveRemoteState with the config', async () => {
    const { saveStrategyConfig } = await import('../strategyConfig')
    const custom = { ...DEFAULT_CONFIG, strongThreshold: 18 }
    saveStrategyConfig(custom)
    expect(mockSaveRemoteState).toHaveBeenCalledWith(REMOTE_STATE_KEY, custom)
  })

  it('does not throw when saveRemoteState rejects', async () => {
    mockSaveRemoteState.mockRejectedValue(new Error('worker down'))
    const { saveStrategyConfig } = await import('../strategyConfig')
    expect(() => saveStrategyConfig(DEFAULT_CONFIG)).not.toThrow()
  })
})

describe('hydrateStrategyConfig', () => {
  it('writes remote config to localStorage when remote data exists', async () => {
    const remoteConfig = { strongThreshold: 22, moderateThreshold: 12 }
    mockLoadRemoteState.mockResolvedValue(remoteConfig)
    const { hydrateStrategyConfig, getStrategyConfig } =
      await import('../strategyConfig')
    await hydrateStrategyConfig()
    const config = getStrategyConfig()
    expect(config.strongThreshold).toBe(22)
    expect(config.moderateThreshold).toBe(12)
  })

  it('pushes local config to remote when no remote data exists and local config present', async () => {
    mockLoadRemoteState.mockResolvedValue(null)
    localStorage.setItem(
      STORAGE_KEY_STRATEGY_CONFIG,
      JSON.stringify({ strongThreshold: 16 }),
    )
    const { hydrateStrategyConfig } = await import('../strategyConfig')
    await hydrateStrategyConfig()
    expect(mockSaveRemoteState).toHaveBeenCalledWith(
      REMOTE_STATE_KEY,
      expect.objectContaining({ strongThreshold: 16 }),
    )
  })

  it('does nothing when remote fetch throws and no local config exists', async () => {
    mockLoadRemoteState.mockRejectedValue(new Error('network error'))
    const { hydrateStrategyConfig, getStrategyConfig } =
      await import('../strategyConfig')
    await hydrateStrategyConfig()
    expect(getStrategyConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('does not push to remote when remote unavailable and no local config', async () => {
    mockLoadRemoteState.mockResolvedValue(null)
    const { hydrateStrategyConfig } = await import('../strategyConfig')
    await hydrateStrategyConfig()
    expect(mockSaveRemoteState).not.toHaveBeenCalled()
  })
})
