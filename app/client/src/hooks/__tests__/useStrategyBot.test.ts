import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStrategyBot } from '@/hooks/useStrategyBot'

const LOCAL_STORAGE_PREFIX = 'algo-trade:'

beforeEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('useStrategyBot', () => {
  it('should initialise with IDLE state when no token provided', () => {
    const { result } = renderHook(() => useStrategyBot(null))
    expect(result.current.state).toBe('IDLE')
    expect(result.current.position).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.indicators).toBeNull()
    expect(result.current.tradesCount).toBe(0)
  })

  it('should initialise with IDLE state even with token', () => {
    const { result } = renderHook(() => useStrategyBot('test-token'))
    expect(result.current.state).toBe('IDLE')
  })

  it('should stop the bot and clear state', () => {
    const { result } = renderHook(() => useStrategyBot('test-token'))

    act(() => {
      result.current.stop()
    })

    expect(result.current.state).toBe('IDLE')
    expect(result.current.position).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should persist and load bot state from localStorage', () => {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-state`, 'RUNNING')

    const { result } = renderHook(() => useStrategyBot('test-token'))
    expect(result.current.state).toBe('RUNNING')
  })

  it('should handle corrupted localStorage gracefully', () => {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-state`, '{invalid json')
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}bot-position`, '{broken')

    const { result } = renderHook(() => useStrategyBot('test-token'))
    expect(result.current.state).toBe('IDLE')
    expect(result.current.position).toBeNull()
    expect(result.current.logs).toEqual([])
  })

  it('should clear logs', () => {
    const { result } = renderHook(() => useStrategyBot('test-token'))

    act(() => {
      result.current.clearLogs()
    })

    expect(result.current.logs).toEqual([])
  })

  it('should not crash with empty token on start', () => {
    const { result } = renderHook(() => useStrategyBot(null))

    act(() => {
      result.current.start()
    })

    expect(result.current.state).toBe('IDLE')
  })
})
