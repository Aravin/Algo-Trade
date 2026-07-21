import * as jose from 'jose'
import type { Env } from './types'

let _jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null

function getJWKS(domain: string) {
  return (_jwks ??= jose.createRemoteJWKSet(
    new URL(`https://${domain}/.well-known/jwks.json`),
  ))
}

export async function verifyAuth0Token(
  request: Request,
  env: Env,
): Promise<string | null> {
  const domain = env.AUTH0_DOMAIN
  const audience = env.AUTH0_AUDIENCE

  if (!domain || !audience) {
    // If not configured, bypass authentication for local dev
    return 'local-dev-user'
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.substring(7).trim()
  try {
    const JWKS = getJWKS(domain)
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `https://${domain}/`,
      audience: audience,
    })

    return payload.sub ?? null
  } catch (error) {
    console.error('JWT verification failed:', error)
    return null
  }
}
