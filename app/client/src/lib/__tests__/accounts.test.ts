/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BrokerAccount } from '@/lib/types'
import { STORAGE_KEY_BROKER_ACCOUNTS } from '@/lib/constants'

const REMOTE_STATE_KEY = 'brokerAccounts'

const mockLoadRemoteState = vi.fn()
const mockSaveRemoteState = vi.fn()

vi.mock('@/lib/clientState', () => ({
  loadRemoteState: mockLoadRemoteState,
  saveRemoteState: mockSaveRemoteState,
}))

const futureExp = Math.floor(Date.now() / 1000) + 3600
const sampleAccount: BrokerAccount = {
  id: 'acc-1',
  label: 'My Upstox',
  broker: 'upstox',
  apiKey: 'key-123',
  accessToken: 'h.' + btoa(JSON.stringify({ exp: futureExp })) + '.s',
  purpose: ['analytics'],
  status: 'connected',
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // Default: remote calls succeed silently
  mockSaveRemoteState.mockResolvedValue(undefined)
  window.dispatchEvent = vi.fn()
  vi.resetModules()
})

describe('getAccounts', () => {
  it('returns empty array when nothing is stored', async () => {
    const { getAccounts } = await import('../accounts')
    expect(getAccounts()).toEqual([])
  })

  it('returns stored accounts', async () => {
    localStorage.setItem(
      STORAGE_KEY_BROKER_ACCOUNTS,
      JSON.stringify([sampleAccount]),
    )
    const { getAccounts } = await import('../accounts')
    expect(getAccounts()).toHaveLength(1)
    expect(getAccounts()[0].id).toBe('acc-1')
  })

  it('returns empty array when JSON is malformed', async () => {
    localStorage.setItem(STORAGE_KEY_BROKER_ACCOUNTS, '{bad}')
    const { getAccounts } = await import('../accounts')
    expect(getAccounts()).toEqual([])
  })
})

describe('addAccount', () => {
  it('adds an account to the list', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    expect(mod.getAccounts()).toHaveLength(1)
    expect(mod.getAccounts()[0].id).toBe('acc-1')
  })

  it('persists to localStorage', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY_BROKER_ACCOUNTS)!,
    )
    expect(stored).toHaveLength(1)
  })

  it('syncs to remote state', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    expect(mockSaveRemoteState).toHaveBeenCalledWith(REMOTE_STATE_KEY, [
      sampleAccount,
    ])
  })

  it('does not throw when remote sync fails', async () => {
    mockSaveRemoteState.mockRejectedValue(new Error('worker down'))
    const mod = await import('../accounts')
    expect(() => mod.addAccount(sampleAccount)).not.toThrow()
  })

  it('dispatches accounts-changed event', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'algo-trade:accounts-changed' }),
    )
  })
})

describe('updateAccount', () => {
  it('updates an existing account', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    mod.updateAccount('acc-1', { label: 'Updated Label' })
    expect(mod.getAccounts()[0].label).toBe('Updated Label')
    expect(mod.getAccounts()[0].id).toBe('acc-1')
  })

  it('does nothing when id does not exist', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    mod.updateAccount('non-existent', { label: 'Nope' })
    expect(mod.getAccounts()).toHaveLength(1)
    expect(mod.getAccounts()[0].label).toBe('My Upstox')
  })

  it('updates in localStorage', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    mod.updateAccount('acc-1', { label: 'Changed' })
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY_BROKER_ACCOUNTS)!,
    )
    expect(stored[0].label).toBe('Changed')
  })
})

describe('removeAccount', () => {
  it('removes an account by id', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    mod.addAccount({ ...sampleAccount, id: 'acc-2' })
    mod.removeAccount('acc-1')
    expect(mod.getAccounts()).toHaveLength(1)
    expect(mod.getAccounts()[0].id).toBe('acc-2')
  })

  it('syncs after removal', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    mod.removeAccount('acc-1')
    expect(mockSaveRemoteState).toHaveBeenCalledWith(REMOTE_STATE_KEY, [])
  })

  it('dispatches event after removal', async () => {
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    mod.removeAccount('acc-1')
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'algo-trade:accounts-changed' }),
    )
  })
})

describe('getAccountConnectionState', () => {
  it('returns need_auth when account has no accessToken', async () => {
    const { getAccountConnectionState } = await import('../accounts')
    const account: BrokerAccount = { ...sampleAccount, accessToken: undefined }
    expect(getAccountConnectionState(account)).toBe('need_auth')
  })

  it('returns connected for a valid unexpired token', async () => {
    const { getAccountConnectionState } = await import('../accounts')
    expect(getAccountConnectionState(sampleAccount)).toBe('connected')
  })

  it('returns expired when token exp is in the past', async () => {
    const { getAccountConnectionState } = await import('../accounts')
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600
    const expiredToken = 'h.' + btoa(JSON.stringify({ exp: oneHourAgo })) + '.s'
    const account: BrokerAccount = {
      ...sampleAccount,
      accessToken: expiredToken,
    }
    expect(getAccountConnectionState(account)).toBe('expired')
  })

  it('returns expired when token payload is malformed (non-JSON in payload)', async () => {
    const { getAccountConnectionState } = await import('../accounts')
    const account: BrokerAccount = {
      ...sampleAccount,
      accessToken: 'header.' + btoa('not-json') + '.sig',
    }
    expect(getAccountConnectionState(account)).toBe('expired')
  })

  it('returns connected when token has no exp field', async () => {
    const { getAccountConnectionState } = await import('../accounts')
    const noExpToken = 'h.' + btoa(JSON.stringify({ sub: 'user' })) + '.s'
    const account: BrokerAccount = {
      ...sampleAccount,
      accessToken: noExpToken,
    }
    expect(getAccountConnectionState(account)).toBe('connected')
  })
})

describe('hydrateAccounts', () => {
  it('loads remote accounts and saves locally when remote data exists', async () => {
    const remote = [sampleAccount]
    mockLoadRemoteState.mockResolvedValue(remote)
    const mod = await import('../accounts')
    await mod.hydrateAccounts()
    expect(mod.getAccounts()).toHaveLength(1)
    expect(mod.getAccounts()[0].id).toBe('acc-1')
  })

  it('pushes local accounts to remote when no remote data exists', async () => {
    mockLoadRemoteState.mockResolvedValue(null)
    const mod = await import('../accounts')
    mod.addAccount(sampleAccount)
    await mod.hydrateAccounts()
    expect(mockSaveRemoteState).toHaveBeenCalledWith(REMOTE_STATE_KEY, [
      sampleAccount,
    ])
  })
})
