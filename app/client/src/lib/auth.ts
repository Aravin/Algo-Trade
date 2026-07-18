export class AuthService {
  private static tokenGetter: (() => Promise<string | null>) | null = null

  public static registerTokenGetter(
    getter: () => Promise<string | null>,
  ): void {
    AuthService.tokenGetter = getter
  }

  public static async getToken(): Promise<string | null> {
    if (AuthService.tokenGetter) {
      try {
        return await AuthService.tokenGetter()
      } catch (error) {
        console.error('Failed to get Auth0 token:', error)
        return null
      }
    }
    return null
  }
}

// Global fetch interceptor setup
const originalFetch = window.fetch
window.fetch = async function (input, init) {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

  // Only intercept API calls to /api/ on the same origin
  if (
    url.startsWith('/api/') ||
    url.startsWith(window.location.origin + '/api/') ||
    (!url.startsWith('http://') &&
      !url.startsWith('https://') &&
      url.includes('/api/'))
  ) {
    const headers = new Headers(init?.headers ?? {})

    const token = await AuthService.getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    return originalFetch(input, { ...init, headers })
  }

  return originalFetch(input, init)
}
