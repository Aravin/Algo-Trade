/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkLog, safeFetch } from '../marketService'

describe('mkLog', () => {
  it('creates a BotLog with correct level, source, and msg', () => {
    const log = mkLog('info', 'test-source', 'hello world')
    expect(log.level).toBe('info')
    expect(log.source).toBe('test-source')
    expect(log.msg).toBe('hello world')
  })

  it('generates an id with timestamp prefix', () => {
    const log = mkLog('error', 'src', 'err')
    expect(log.id).toMatch(/^\d{13,}-[a-z0-9]{4}$/)
  })

  it('sets ts as valid ISO string', () => {
    const log = mkLog('warn', 'src', 'warn')
    expect(() => new Date(log.ts)).not.toThrow()
    expect(new Date(log.ts).toISOString()).toBe(log.ts)
  })

  it('handles all log levels', () => {
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      const log = mkLog(level, 'src', 'msg')
      expect(log.level).toBe(level)
    }
  })

  it('generates unique ids for consecutive calls', () => {
    const a = mkLog('info', 'src', 'a')
    const b = mkLog('info', 'src', 'b')
    expect(a.id).not.toBe(b.id)
  })
})

describe('safeFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns [data, null] on successful fetch', async () => {
    const mockData = { foo: 'bar' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(mockData),
    } as Response)

    const [data, err] = await safeFetch<{ foo: string }>('/test')
    expect(data).toEqual(mockData)
    expect(err).toBeNull()
  })

  it('returns [null, errorMsg] on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({}),
    } as Response)

    const [data, err] = await safeFetch('/test')
    expect(data).toBeNull()
    expect(err).toContain('HTTP 404 Not Found')
  })

  it('includes error detail from response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: 'Invalid token' }),
    } as Response)

    const [data, err] = await safeFetch('/test')
    expect(data).toBeNull()
    expect(err).toContain('Invalid token')
  })

  it('handles error with code field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () => Promise.resolve({ code: 'AUTH_FAILED', error: 'no access' }),
    } as Response)

    const [data, err] = await safeFetch('/test')
    expect(data).toBeNull()
    expect(err).toContain('[AUTH_FAILED]')
    expect(err).toContain('no access')
  })

  it('handles errors array in response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 422,
      statusText: 'Unprocessable',
      json: () =>
        Promise.resolve({
          errors: [{ message: 'Field required' }, { errorCode: 'INVALID' }],
        }),
    } as Response)

    const [data, err] = await safeFetch('/test')
    expect(data).toBeNull()
    expect(err).toContain('Field required')
    expect(err).toContain('INVALID')
  })

  it('returns [null, errorMsg] on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Network connection failed'),
    )

    const [data, err] = await safeFetch('/test')
    expect(data).toBeNull()
    expect(err).toBe('Network connection failed')
  })

  it('returns [null, error] when response body has error field despite 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ error: 'service degraded' }),
    } as Response)

    const [data, err] = await safeFetch('/test')
    expect(data).toBeNull()
    expect(err).toBe('service degraded')
  })

  it('passes init options to fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
    } as Response)

    await safeFetch('/test', {
      method: 'POST',
      headers: { 'X-Custom': 'val' },
      body: JSON.stringify({ key: 'value' }),
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Custom': 'val' }),
      }),
    )
  })
})
