import { NextRequest } from 'next/server'
import crypto from 'crypto'

export const CSRF_COOKIE_NAME = 'compass_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'
export const CSRF_COOKIE_MAX_AGE = 60 * 60 * 4 // 4 hours

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Constant-time comparison to avoid timing side channels on the cookie/header match.
function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

// Double-submit cookie pattern: the cookie value must match the header value.
// A cross-origin attacker can trigger a request that includes the cookie, but
// can't read the cookie to set the matching custom header (blocked by CORS).
export function verifyCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)
  if (!cookieToken || !headerToken) return false
  return safeEquals(cookieToken, headerToken)
}
