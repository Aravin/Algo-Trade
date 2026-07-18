import type { BrokerAccount } from './types'
import { ACCOUNTS_CHANGED_EVENT } from './types'

const STORAGE_KEY = 'algo-trade:broker-accounts'
const REMOTE_STATE_KEY = 'brokerAccounts'

import { loadRemoteState, saveRemoteState } from '@/lib/clientState'

function readStoredAccounts(): BrokerAccount[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as BrokerAccount[]) : []
}

function saveAccounts(accounts: BrokerAccount[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
}

function syncAccounts(accounts: BrokerAccount[]): void {
  void saveRemoteState(REMOTE_STATE_KEY, accounts).catch(() => {
    // Keep local state as the source of truth when the worker is unavailable.
  })
}

export function getAccounts(): BrokerAccount[] {
  try {
    return readStoredAccounts()
  } catch {
    return []
  }
}

export async function hydrateAccounts(): Promise<void> {
  try {
    const remoteAccounts =
      await loadRemoteState<BrokerAccount[]>(REMOTE_STATE_KEY)
    if (remoteAccounts) {
      saveAccounts(remoteAccounts)
      notify()
      return
    }
  } catch {
    return
  }

  const localAccounts = getAccounts()
  if (localAccounts.length > 0) {
    syncAccounts(localAccounts)
  }
}

function notify() {
  window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT))
}

export function addAccount(account: BrokerAccount): void {
  const accounts = getAccounts()
  accounts.push(account)
  saveAccounts(accounts)
  syncAccounts(accounts)
  notify()
}

export function updateAccount(
  id: string,
  update: Partial<BrokerAccount>,
): void {
  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.id === id)
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...update }
    saveAccounts(accounts)
    syncAccounts(accounts)
    notify()
  }
}

export function removeAccount(id: string): void {
  const accounts = getAccounts().filter((a) => a.id !== id)
  saveAccounts(accounts)
  syncAccounts(accounts)
  notify()
}

export function getAccountConnectionState(
  account: BrokerAccount,
): 'connected' | 'expired' | 'need_auth' {
  if (!account.accessToken) {
    return 'need_auth'
  }

  try {
    const parts = account.accessToken.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1])) as { exp?: number }
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        return 'expired'
      }
    }
  } catch (error) {
    console.error('Failed to parse broker access token:', error)
    return 'expired'
  }

  return 'connected'
}

export function isAccountConnected(account: BrokerAccount): boolean {
  return getAccountConnectionState(account) === 'connected'
}
