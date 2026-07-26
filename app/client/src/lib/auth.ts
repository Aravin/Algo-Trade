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

const originalFetch = typeof window !== 'undefined' ? window.fetch : undefined

if (typeof window !== 'undefined') {
  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    const isSameOriginApiCall = (() => {
      if (url.startsWith('/')) return url.startsWith('/api/')
      try {
        const parsedUrl = new URL(url)
        return (
          parsedUrl.origin === window.location.origin &&
          parsedUrl.pathname.startsWith('/api/')
        )
      } catch {
        return false
      }
    })()
    if (!isSameOriginApiCall || !originalFetch)
      return originalFetch ? originalFetch(input, init) : fetch(input, init)

    const headers = new Headers(init?.headers ?? {})
    const token = await AuthService.getToken()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    return originalFetch(input, { ...init, headers })
  }
}
