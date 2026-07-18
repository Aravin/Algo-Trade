export const auth0Config = {
  domain: (import.meta.env.VITE_AUTH0_DOMAIN as string) || '',
  clientId: (import.meta.env.VITE_AUTH0_CLIENT_ID as string) || '',
  audience: (import.meta.env.VITE_AUTH0_AUDIENCE as string) || '',
}

export function isAuth0Enabled(): boolean {
  return !!(auth0Config.domain && auth0Config.clientId)
}
