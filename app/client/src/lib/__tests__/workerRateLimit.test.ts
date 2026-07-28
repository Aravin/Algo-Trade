import { describe, expect, it, vi } from 'vitest'
import worker from '../../../worker/index'
import type { Env } from '../../../worker/types'

function rateLimitEnv(success: boolean) {
  const limit = vi.fn().mockResolvedValue({ success })
  const testEnv: Partial<Env> = {
    REQUEST_RATE_LIMITER: { limit },
  }
  return {
    env: testEnv as Env,
    limit,
  }
}

describe('Worker request rate limiting', () => {
  it('uses the native binding and returns 429 when the limit is exceeded', async () => {
    const { env, limit } = rateLimitEnv(false)
    const request = new Request('https://example.test/api/market/vix', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer private-token',
        'Content-Type': 'application/json',
        Origin: 'https://algo-trade.com',
      },
    })

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://algo-trade.com',
    )
    expect(limit).toHaveBeenCalledOnce()
    const call = limit.mock.calls[0] as [{ key: string }]
    expect(call[0].key).toMatch(/^authenticated:[\da-f]{64}$/)
    expect(call[0].key).not.toContain('private-token')
  })

  it('does not count browser preflight requests', async () => {
    const { env, limit } = rateLimitEnv(true)
    const request = new Request('https://example.test/api/market/vix', {
      method: 'OPTIONS',
      headers: { Origin: 'https://algo-trade.com' },
    })

    const response = await worker.fetch(request, env)

    expect(response.status).toBe(204)
    expect(limit).not.toHaveBeenCalled()
  })
})
