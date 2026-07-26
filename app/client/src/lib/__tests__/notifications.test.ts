/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { STORAGE_KEY_NOTIFICATIONS } from '../constants'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('notify', () => {
  it('adds a notification and persists to localStorage', async () => {
    const { notify } = await import('../notifications')
    notify('Test Title', 'Test Message')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored).toHaveLength(1)
    expect(stored[0].title).toBe('Test Title')
    expect(stored[0].message).toBe('Test Message')
  })

  it('creates notification with correct structure', async () => {
    const { notify } = await import('../notifications')
    notify('Alert', 'Something happened', 'warn')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    const n = stored[0]
    expect(n).toHaveProperty('id')
    expect(n).toHaveProperty('timestamp')
    expect(n.type).toBe('warn')
    expect(n.read).toBe(false)
  })

  it('prepends new notifications to the front of the list', async () => {
    const { notify } = await import('../notifications')
    notify('First', 'First message')
    notify('Second', 'Second message')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored[0].title).toBe('Second')
    expect(stored[1].title).toBe('First')
  })

  it('caps stored notifications at 100', async () => {
    const { notify } = await import('../notifications')
    for (let i = 0; i < 150; i++) {
      notify(`Title ${i}`, `Message ${i}`)
    }
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored.length).toBeLessThanOrEqual(100)
  })

  it('uses default type "info" when not specified', async () => {
    const { notify } = await import('../notifications')
    notify('Default', 'Default type')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored[0].type).toBe('info')
  })

  it('generates unique id for each notification', async () => {
    const { notify } = await import('../notifications')
    notify('A', 'Msg A')
    notify('B', 'Msg B')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored[0].id).not.toBe(stored[1].id)
  })
})

describe('loading notifications from localStorage on init', () => {
  it('loads existing notifications from localStorage on module import', async () => {
    const existing = [
      {
        id: '1',
        title: 'Persisted',
        message: 'Was here before',
        type: 'info' as const,
        timestamp: new Date().toISOString(),
        read: false,
      },
    ]
    localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(existing))
    // Import triggers parseSaved() which reads localStorage
    const { notify } = await import('../notifications')
    notify('New', 'New message')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored).toHaveLength(2)
    expect(stored[1].title).toBe('Persisted')
  })

  it('handles corrupted localStorage JSON gracefully', async () => {
    localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, '{corrupted}')
    const { notify } = await import('../notifications')
    notify('Fine', 'Still works')
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)!)
    expect(stored).toHaveLength(1)
  })
})
