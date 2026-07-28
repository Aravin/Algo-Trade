import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyAuth0Token } from '../../../worker/auth'
import worker from '../../../worker/index'
import type { Env } from '../../../worker/types'

describe('verifyAuth0Token configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails closed when Auth0 bindings are missing', async () => {
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const request = new Request('https://example.test/api/paper/account', {
      headers: { Authorization: 'Bearer ignored' },
    })

    const userId = await verifyAuth0Token(request, {} as Env)

    expect(userId).toBeNull()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('auth_configuration_error'),
    )
  })

  it('rejects a missing bearer token when Auth0 is configured', async () => {
    const request = new Request('https://example.test/api/paper/account')
    const env = {
      AUTH0_DOMAIN: 'algo-trade.us.auth0.com',
      AUTH0_AUDIENCE: 'https://algo-trade.us.auth0.com/api/v2/',
    } as Env

    await expect(verifyAuth0Token(request, env)).resolves.toBeNull()
  })

  it('returns 401 from a protected Worker route when bindings are missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const request = new Request('https://example.test/api/paper/account')
    const testEnv: Partial<Env> = {
      REQUEST_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: true }),
      },
    }

    const response = await worker.fetch(request, testEnv as Env)

    expect(response.status).toBe(401)
  })
})
