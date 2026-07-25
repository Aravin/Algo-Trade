import { useState, useEffect } from 'react'

import type { NotificationType, AppNotification } from './types'
import { STORAGE_KEY_NOTIFICATIONS } from './constants'

type Listener = (n: AppNotification[]) => void
let notifications: AppNotification[] = []
let listeners: Listener[] = []

function parseSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS)
    if (saved) {
      notifications = JSON.parse(saved) as AppNotification[]
    }
  } catch {
    // ignore
  }
}
parseSaved()

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY_NOTIFICATIONS,
      JSON.stringify(notifications.slice(0, 100)),
    )
  } catch {
    // ignore
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
}

export function notify(
  title: string,
  message: string,
  type: NotificationType = 'info',
) {
  const n: AppNotification = {
    id: Date.now().toString() + Math.random().toString(36).substring(2),
    title,
    message,
    type,
    timestamp: new Date().toISOString(),
    read: false,
  }

  notifications = [n, ...notifications]
  save()
  listeners.forEach((l) => l(notifications))

  // Browser Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body: message })
  }
}

function clearNotifications() {
  notifications = []
  save()
  listeners.forEach((l) => l(notifications))
}

function markAsRead(id: string) {
  notifications = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n,
  )
  save()
  listeners.forEach((l) => l(notifications))
}

function markAllAsRead() {
  notifications = notifications.map((n) => ({ ...n, read: true }))
  save()
  listeners.forEach((l) => l(notifications))
}

export function useNotifications() {
  const [data, setData] = useState<AppNotification[]>(notifications)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(notifications)
    listeners.push(setData)
    return () => {
      listeners = listeners.filter((l) => l !== setData)
    }
  }, [])

  return { notifications: data, markAsRead, markAllAsRead, clearNotifications }
}
